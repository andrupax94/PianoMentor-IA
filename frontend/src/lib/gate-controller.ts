// description: Controlador de gates del modo espera (B-032.5): suscrito al puerto de entrada, decide hit/miss/wrong/timeout y emite el mensaje `practice` por WebSocket. La reanudación del motor la pide mediante `onHit`. Con B-033.9 los gates que el transporte deja atrás SIN congelar (el bot toca con el modo espera auto-apagado, o el paso por anticipado fuera de ventana) TAMBIÉN emiten su señal — hit `anticipated` si sus teclas fueron pulsadas en la ventana razonable, miss si nadie las pulsó — para que el informe capture la ejecución completa y no dependa de la carrera de la ventana de 400 ms.
// context: Sin DOM ni React; vive en PracticeBridge. El transporte expone el gate actual y el estado waiting; este módulo solo mide y emite.

import type { Gate, GateHand, GateOutcome } from "./practice-gate";
import {
  CHORD_TOLERANCE_S,
  EARLY_HIT_WINDOW_MS,
  EARLY_HIT_WINDOW_S,
  gateSatisfied,
  gateWrong,
  strikeFor,
  waitTimeoutMs,
} from "./practice-gate";
import type { PlaybackSnapshot } from "./playback-engine";
import { subscribeNoteInput, type NoteInputEvent } from "./note-input";
import { audioTrace } from "./audio-trace";

/** Evento de práctica que manda el front al backend (B-032.5). */
export interface PracticeEvent {
  gate: string;
  measure: number | null;
  outcome: GateOutcome;
  wait_ms: number;
  hand: GateHand;
  /**
   * B-033.9: el gate se consumió SIN congelar (pasó por anticipado o el
   * transporte lo dejó atrás con el modo espera auto-apagado). Solo va a
   * `true` en los hits decididos por paso; un hit resuelto en espera no lo
   * lleva y un miss no necesita flag.
   */
  anticipated?: boolean;
}

/**
 * Margen para dar por PASADO un gate en reproducción (B-033.9): si el motor
 * fuera a congelar, lo hace en el tick que sigue al cruce (decenas de ms);
 * pasado este margen sin congelación, el gate pasó de verdad. Debe quedar por
 * debajo del hueco típico entre gates (~0.5 s) para no confundir vecinos.
 */
const PASO_MARGEN_S = 0.25;

/**
 * Cuánto TARDE puede contar una pulsación para un gate pasado (B-033.9): el
 * robot/alumno pisa la nota un pelín después de su instante y sigue siendo
 * su nota. Más allá (la siguiente unidad) ya es otra cosa.
 */
const PASO_TARDE_S = 0.2;

/** Dependencias inyectadas para poder probar sin WebSocket ni DOM. */
export interface GateControllerDeps {
  /** Lee el snapshot actual del motor. */
  getSnapshot: () => PlaybackSnapshot;
  /** Suscripción al puerto de entrada de notas. */
  subscribeNoteInput: typeof subscribeNoteInput;
  /** Envía el evento de práctica al backend. */
  sendPracticeEvent: (event: PracticeEvent) => void;
  /** Reloj en milisegundos para medir el timeout. */
  clockMs: () => number;
  /** Se llama cuando el gate se satisface; quien escucha reanuda el motor. */
  onHit: () => void;
  /**
   * B-032.8 ajuste (2026-11-07, petición del usuario): gate satisfecho por
   * ANTICIPACIÓN — las teclas ya estaban pulsadas antes de que la cascada
   * llegara. La antelación es un error de timing (para el agente/evaluación),
   * no un motivo de espera: el transporte no se congela, el audio sigue.
   */
  onEarlyHit?: (gate: Gate) => void;
  /** B-032.8: se llama con una tecla errónea; el transporte pega la cascada a la línea. */
  onWrong?: () => void;
  /** Opciones iniciales. */
  options: GateControllerOptions;
}

export interface GateControllerOptions {
  enabled: boolean;
  hand: GateHand;
}

const POLL_INTERVAL_MS = 100;

/**
 * Controlador de gates: mantiene las teclas pulsadas, detecta hit/wrong/timeout
 * y emite la señal al backend. No toca el reloj del transporte.
 */
export interface GateController {
  start(): void;
  stop(): void;
  setOptions(options: Partial<GateControllerOptions>): void;
}

/** Crea un controlador de gates con las dependencias inyectadas. */
export function createGateController(deps: GateControllerDeps): GateController {
  let { getSnapshot, subscribeNoteInput: subscribeInput, sendPracticeEvent, clockMs, onHit, options } =
    deps;
  const onWrong = deps.onWrong ?? ((): void => {});
  const onEarlyHit = deps.onEarlyHit ?? ((): void => {});
  let unsubscribeNotes: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Teclas pulsadas con su instante: la marca de tiempo decide qué pulsaciones
   * cuentan en el gate en espera (2026-11-07, petición del usuario): una tecla
   * pulsada ANTES de congelar el transporte (anticipación del alumno) no
   * resuelve el gate al entrar en espera — mataba el margen del rebote (el
   * 60 % quedaba en 0 %, resolvía de golpe). Vale la pulsación hecha durante
   * la espera; re-pulsar cuenta (refresh de `pressedAt`).
   */
  const pressedAt = new Map<number, number>();
  /**
   * B-033.9: historial reciente de pulsaciones (pitch + muro) para decidir el
   * paso de un gate sin congelación — `pressedAt` solo sabe lo que está
   * pulsado AHORA, y al pasar el gate la nota ya pudo soltarse.
   */
  const pulsacionesRecientes: Array<{ pitch: number; wallMs: number }> = [];
  /** Gates ya emitidos por las vías sin congelación (anticipado o paso). */
  const emitidosSinEspera = new Set<string>();
  /** Gates venideros vistos por el sondeo y aún no alcanzados (B-033.9). */
  let colaPendientes: Gate[] = [];
  /** Última posición vista en reproducción: detecta saltos (seek) y limpia la cola. */
  let ultimaPosition_s: number | null = null;
  let lastGateId: string | null = null;
  let waitingSinceMs: number | null = null;
  let lastOutcome: GateOutcome | null = null;

  const clear = () => {
    pressedAt.clear();
    pulsacionesRecientes.length = 0;
    emitidosSinEspera.clear();
    colaPendientes = [];
    ultimaPosition_s = null;
    lastGateId = null;
    waitingSinceMs = null;
    lastOutcome = null;
  };

  const onNoteOn = ({ pitch }: NoteInputEvent) => {
    const wallMs = clockMs();
    pressedAt.set(pitch, wallMs);
    pulsacionesRecientes.push({ pitch, wallMs });
    if (pulsacionesRecientes.length > 256) pulsacionesRecientes.shift();
    checkGate();
  };

  const onNoteOff = ({ pitch }: NoteInputEvent) => {
    pressedAt.delete(pitch);
  };

  const sendOutcome = (gate: Gate, outcome: GateOutcome, anticipated = false) => {
    // No repetir el mismo outcome para el mismo gate.
    if (lastOutcome === outcome && lastGateId === gate.id) return;
    lastOutcome = outcome;
    lastGateId = gate.id;
    sendPracticeEvent({
      gate: gate.id,
      measure: gate.measure,
      outcome,
      wait_ms: waitingSinceMs === null ? 0 : Math.max(0, Math.round(clockMs() - waitingSinceMs)),
      hand: options.hand,
      ...(anticipated ? { anticipated: true } : {}),
    });
  };

  const checkGate = () => {
    if (!options.enabled) return;
    const snapshot = getSnapshot();

    // Anticipación (ajuste 2026-11-07, petición del usuario): mientras suena,
    // si las teclas del gate venidero YA están pulsadas dentro de la ventana
    // temprana, el gate se consume SIN congelar — la antelación es timing que
    // apunta el agente/evaluación, no espera. El motor la oye por onEarlyHit.
    if (snapshot.status === "playing" && snapshot.upcomingGate) {
      const upcoming = snapshot.upcomingGate;
      const remaining_s = upcoming.time_s - snapshot.position_s;
      const held = [...pressedAt.keys()];
      if (
        remaining_s >= 0 &&
        remaining_s <= EARLY_HIT_WINDOW_S &&
        gateSatisfied(upcoming, held) &&
        // Ya consumido (dedup): ni el sondeo ni otra pulsación repiten el
        // anticipado para el mismo gate.
        !(lastOutcome === "hit" && lastGateId === upcoming.id)
      ) {
        audioTrace(
          `gate ${upcoming.id}: ANTICIPADO (faltaban ${remaining_s.toFixed(3)} s), ` +
            `teclas=[${held.join(",")}] — el transporte pasa sin congelar`,
        );
        sendOutcome(upcoming, "hit", true);
        emitidosSinEspera.add(upcoming.id);
        colaPendientes = colaPendientes.filter((gate) => gate.id !== upcoming.id);
        onEarlyHit(upcoming);
        return;
      }
    }

    if (snapshot.status !== "waiting" || !snapshot.currentGate) return;
    const gate = snapshot.currentGate;

    if (waitingSinceMs === null) {
      waitingSinceMs = clockMs();
    }
    const waitStartMs: number = waitingSinceMs;

    // Cuentan las pulsaciones recientes: hechas durante esta espera o dentro
    // de la ventana de anticipación inmediatamente anterior — así un acorde
    // anticipado a medias se completa sin volver a pulsar todo (una pulsación
    // correcta es válida aunque sea temprana). Las viejas (de antes de la
    // ventana) no resuelven nada: el margen del rebote se muestra completo.
    const pressedInWait = [...pressedAt.entries()]
      .filter(([, at]) => at >= waitStartMs - EARLY_HIT_WINDOW_MS)
      .map(([pitch]) => pitch);

    const timeoutMs = waitTimeoutMs({ tempoBpm: snapshot.tempo_bpm });
    const elapsedMs = clockMs() - waitingSinceMs;
    const timedOut = elapsedMs >= timeoutMs;

    const outcome = strikeFor(gate, pressedInWait, timedOut);
    // Trazas de diagnóstico del margen (?traceAudio, petición del chat de
    // ChatGPT): qué tenía pulsado el alumno, correctamente y cuándo, y qué
    // decidió el controlador — separa el corte de audio del rebote perdido.
    audioTrace(
      `gate ${gate.id}: outcome=${outcome} pressedInWait=[${pressedInWait.join(",")}] ` +
        `heldAll=[${[...pressedAt.entries()].map(([p, t]) => `${p}@${t}`).join(",")}] ` +
        `waitingSinceMs=${waitingSinceMs} timedOut=${timedOut}`,
    );
    // B-032.8: onWrong solo en la transición. El sondeo repite el outcome cada
    // 100 ms; si el callback saliera siempre, el desvanecimiento del rebote se
    // reiniciaba sin parar y la cascada se quedaba pasada de la línea.
    const repeatOfSameGate = lastOutcome === outcome && lastGateId === gate.id;

    if (outcome === "hit") {
      sendOutcome(gate, "hit");
      onHit();
      return;
    }

    if (outcome === "wrong") {
      sendOutcome(gate, "wrong");
      if (!repeatOfSameGate) onWrong();
      return;
    }

    if (outcome === "timeout") {
      sendOutcome(gate, "timeout");
      // El motor sigue esperando: B-032.6 decidirá qué hacer.
      return;
    }
  };

  /**
   * Instante de PARTITURA aproximado de una pulsación (B-033.9): la posición
   * actual menos lo que el transporte avanzó desde el muro de la pulsación.
   * `tempoFactor` convierte segundos de partitura a muro.
   */
  const scoreTimeDe = (
    wallMs: number,
    position_s: number,
    tempoFactor: number,
    nowMs: number,
  ): number => position_s - ((nowMs - wallMs) * tempoFactor) / 1000;

  /**
   * Outcome de un gate que pasó SIN congelarse (B-033.9): hit `anticipated`
   * si todas sus teclas fueron pulsadas dentro de la ventana razonable (un
   * pelín antes por anticipación, un pelín tarde por el paso), miss si nadie
   * las pulsó. El timing fino lo mide la evaluación, no este flag.
   */
  const decidirPaso = (gate: Gate, snapshot: PlaybackSnapshot): GateOutcome => {
    const nowMs = clockMs();
    const enVentana = pulsacionesRecientes
      .map((pulso) => ({
        pitch: pulso.pitch,
        score: scoreTimeDe(pulso.wallMs, snapshot.position_s, snapshot.tempoFactor, nowMs),
      }))
      .filter(
        (pulso) =>
          pulso.score >= gate.time_s - EARLY_HIT_WINDOW_S &&
          pulso.score <= gate.time_s + PASO_TARDE_S,
      )
      .map((pulso) => pulso.pitch);
    return gateSatisfied(gate, enVentana) ? "hit" : "miss";
  };

  /**
   * Emite las señales de los gates que el transporte dejó atrás (B-033.9).
   * `hasta_s` es la posición desde la que un gate cuenta como alcanzado: en
   * reproducción lleva margen (el motor congela en su tick, no al instante);
   * al parar la pieza, todo gate alcanzado emite tal cual.
   */
  const drenarPasados = (snapshot: PlaybackSnapshot, hasta_s: number) => {
    while (
      colaPendientes.length > 0 &&
      colaPendientes[0].time_s < hasta_s &&
      !emitidosSinEspera.has(colaPendientes[0].id)
    ) {
      const gate = colaPendientes.shift()!;
      const outcome = decidirPaso(gate, snapshot);
      audioTrace(
        `gate ${gate.id}: PASO sin congelar → ${outcome} (pos ${snapshot.position_s.toFixed(3)})`,
      );
      emitidosSinEspera.add(gate.id);
      sendOutcome(gate, outcome, outcome === "hit");
    }
    // Los ya emitidos por la otra vía salen de la cola sin repetir señal.
    while (colaPendientes.length > 0 && emitidosSinEspera.has(colaPendientes[0].id)) {
      colaPendientes.shift();
    }
  };

  const poll = () => {
    const snapshot = getSnapshot();
    if (snapshot.status === "playing" && options.enabled) {
      // B-033.9: captura de gates sin congelación. Un salto grande de
      // posición es un seek: la cola queda obsoleta y se descarta.
      waitingSinceMs = null; // el transporte no está esperando: wait_ms de paso = 0
      if (
        ultimaPosition_s !== null &&
        Math.abs(snapshot.position_s - ultimaPosition_s) > 2
      ) {
        colaPendientes = [];
      }
      ultimaPosition_s = snapshot.position_s;

      const upcoming = snapshot.upcomingGate;
      if (
        upcoming &&
        !emitidosSinEspera.has(upcoming.id) &&
        !colaPendientes.some((gate) => gate.id === upcoming.id)
      ) {
        colaPendientes.push(upcoming);
      }
      // En reproducción el margen cubre el tick del motor: pasado él sin
      // congelación, el gate pasó de verdad.
      drenarPasados(snapshot, snapshot.position_s - PASO_MARGEN_S + CHORD_TOLERANCE_S);
      return;
    }
    if (snapshot.status !== "waiting") {
      // Parada natural de la pieza: los gates alcanzados y no emitidos
      // cierran su señal aquí (la cola entera si la posición los alcanzó).
      if (snapshot.status === "stopped" && options.enabled) {
        drenarPasados(snapshot, snapshot.position_s + CHORD_TOLERANCE_S);
      }
      waitingSinceMs = null;
      colaPendientes = [];
      ultimaPosition_s = null;
      return;
    }
    // Congelados: el gate lo resuelve la vía de espera; la cola de paso sobra.
    colaPendientes = [];
    ultimaPosition_s = null;
    if (snapshot.currentGate && snapshot.currentGate.id !== lastGateId) {
      // Cambió el gate: resetear el seguimiento.
      lastGateId = snapshot.currentGate.id;
      waitingSinceMs = clockMs();
      lastOutcome = null;
    }
    checkGate();
  };

  return {
    start() {
      if (unsubscribeNotes !== null) return;
      unsubscribeNotes = subscribeInput({ onNoteOn, onNoteOff });
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    },
    stop() {
      unsubscribeNotes?.();
      unsubscribeNotes = null;
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      clear();
    },
    setOptions(next) {
      options = { ...options, ...next };
      if (!options.enabled) {
        waitingSinceMs = null;
        lastGateId = null;
        lastOutcome = null;
      }
    },
  };
}
