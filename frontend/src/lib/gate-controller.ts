// description: Controlador de gates del modo espera (B-032.5): suscrito al puerto de entrada, decide hit/miss/wrong/timeout y emite el mensaje `practice` por WebSocket. La reanudación del motor la pide mediante `onHit`.
// context: Sin DOM ni React; vive en PracticeBridge. El transporte expone el gate actual y el estado waiting; este módulo solo mide y emite.

import type { Gate, GateHand, GateOutcome } from "./practice-gate";
import {
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
}

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
  let lastGateId: string | null = null;
  let waitingSinceMs: number | null = null;
  let lastOutcome: GateOutcome | null = null;

  const clear = () => {
    pressedAt.clear();
    lastGateId = null;
    waitingSinceMs = null;
    lastOutcome = null;
  };

  const onNoteOn = ({ pitch }: NoteInputEvent) => {
    pressedAt.set(pitch, clockMs());
    checkGate();
  };

  const onNoteOff = ({ pitch }: NoteInputEvent) => {
    pressedAt.delete(pitch);
  };

  const sendOutcome = (gate: Gate, outcome: GateOutcome) => {
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
        sendOutcome(upcoming, "hit");
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

  const poll = () => {
    const snapshot = getSnapshot();
    if (snapshot.status !== "waiting") {
      waitingSinceMs = null;
      return;
    }
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
