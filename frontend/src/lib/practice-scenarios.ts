// description: Runner de escenarios de práctica sintéticos (B-033.1): un pianista robot de desarrollo que, en cada gate en espera, emite pulsaciones REALES por el puerto de entrada de notas con la fuente `debug`: del puerto salen el audio, la evaluación del gate y el envío WS, así que el macro recorre el pipeline completo, sin mocks.
// context: Módulo puro, sin DOM ni React (los integrantes B-032 deciden qué es una pulsación; aquí solo se lee el snapshot del transporte). Las dependencias se inyectan como en gate-controller para probarlo con reloj falso; el montaje dev-only vive en PracticeBridge y bajo `NODE_ENV === "production"` ni se importa.

import type { Gate } from "./practice-gate";
import { waitTimeoutMs } from "./practice-gate";
import type { PlaybackSnapshot } from "./playback-engine";
import { audioTrace } from "./audio-trace";

/** Escenarios disponibles (el nombre también manda en B-033.2). */
export type ScenarioId =
  | "perfecta"
  | "siempre_tarde"
  | "siempre_equivocada"
  | "nunca_press"
  | "acorde_incompleto"
  | "mezcla"
  | "teclas_rapidas";

/** Identificadores válidos, en orden de menú (lo consume el selector dev). */
export const SCENARIO_IDS: readonly ScenarioId[] = [
  "perfecta",
  "siempre_tarde",
  "siempre_equivocada",
  "nunca_press",
  "acorde_incompleto",
  "mezcla",
  "teclas_rapidas",
];

/** Guard de parseo defensivo de la petición (qué llega por el evento dev). */
export function isScenarioId(value: string): value is ScenarioId {
  return SCENARIO_IDS.includes(value as ScenarioId);
}

/** Dependencias inyectadas: sin puerto ni reloj reales, sin acoplarse a DOM. */
export interface PracticeScenarioDeps {
  /** Lee el snapshot del transporte (mismo canal que el gate-controller). */
  getSnapshot: () => PlaybackSnapshot;
  /** Envia una pulsación al puerto de notas (emite note_on con su fuente). */
  submitNoteOn: (event: { pitch: number; velocity: number }) => void;
  /** Envia una suelta al puerto de notas (emite note_off al sistema). */
  submitNoteOff: (event: { pitch: number }) => void;
  /** Reloj en milisegundos, falso en tests. */
  clockMs: () => number;
  /** Puerta efectiva del control: false mientras la IA tiene el control. */
  canEmit: () => boolean;
  /** Intervalo del sondeo en ms (por defecto 100, como el gate-controller). */
  pollIntervalMs?: number;
}

/** Opciones del runner: la semilla es lo que hace reproducible a `mezcla`. */
export interface PracticeScenarioOptions {
  /** Semilla para `mezcla`; cualquier valor determinista por reset. */
  seed?: number;
}

/** Runner que el montaje arranca y para; no transforma el transporte. */
export interface PracticeScenarioRunner {
  readonly scenario: ScenarioId;
  start(): void;
  stop(): void;
}

/** Velocidad obligada del robot: una pulsación humana, no un forte. */
const VELOCITY = 80;

/**
 * Duración de la tecla — política natural (B-033.1 con petición del usuario):
 * la nota se sostiene lo que dura en la partitura (con un hueco de seguridad
 * al final para que la tecla soltada no caiga dentro del gate siguiente). El
 * gesto rápido del robot v1 (mitad del gate, recortado) queda como escenario
 * aparte «Teclas rápidas» para comparar el sonido mismo.
 *
 * El tope alto (8 s) deja sin efecto el recorte para notas largas: blancas y
 * redondas a tempo bajo superan holgadamente el antiguo límite de 1,5 s.
 */
const HOLD_GAP_MS = 120;
const HOLD_MIN_MS = 60;
const HOLD_MAX_MS = 8000;

/** Política rápida del escenario teclas_rapidas: mitad del gate antes de soltar. */
const FAST_FRACTION = 0.5;
const FAST_MIN_MS = 80;
const FAST_MAX_MS = 400;

/** Retraso con el que el robot pulsa la tecla equivocada/la parte del acorde. */
const WRONG_DELAY_MS = 150;
/** Reserva extra sobre el margen para el escenario siempre_tarde. */
const LATE_EXTRA_MS = 150;

/** Proporciones del escenario mezcla: hit 50 %, tarde 30 %, equivocada 20 % (los tres fallos del flujo real). */
const MIX_HIT_MAX = 0.5;
const MIX_LATE_MAX = 0.8;

/**
 * Plan de acción para un gate concreto: nace de la combinación del
 * escenario y el propio gate (su id), así que el mismo gate pide
 * siempre el mismo gesto y una semilla hace reproducible a `mezcla`.
 */
interface GatePlan {
  /** Qué teclas pulsar: el conjunto esperado, una parte o una equivocada. */
  pitches: number[];
  /** Retraso antes de pulsar (0 = nada más aparecer el gate). */
  pressAtMs: number;
  /** Duración de la pulsación (o null en los que no pulsan nada). */
  holdMs: number | null;
}

/**
 * Hash determinista sobre texto (FNV-1a): mismo gate id + semilla dan
 * siempre el mismo número; lo usamos en `mezcla` para elegir el gesto.
 * En lugar de mantener un PRNG con estado, cada gate decide por sí mismo:
 * reiniciar la pieza con la misma semilla repite las señales exactas, sin
 * depender del orden ni del reloj.
 */
function hash01(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  const text = parts.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

/**
 * Tecla equivocada para el escenario: adyacente a la primera del gate
 * (un fallo creíble), con soluciones alternativas si ninguna adyacente
 * sirve. Nunca en el conjunto esperado.
 */
function wrongPitchFor(gate: Gate): number {
  const low = gate.pitches[0];
  const candidates = [low - 1, low + 1, 44];
  for (const candidate of candidates) {
    if (candidate >= 0 && candidate <= 127 && !gate.pitches.includes(candidate)) return candidate;
  }
  return 51;
}

/** Cuánto se aguanta una tecla según su política: tiempo real o gesto rápido. */
function holdMsFor(gate: Gate, fast: boolean): number {
  const raw = gate.duration_s * 1000;
  if (fast) {
    return Math.min(FAST_MAX_MS, Math.max(FAST_MIN_MS, raw * FAST_FRACTION));
  }
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, raw - HOLD_GAP_MS));
}

/** El gesto del robot en este gate, según el escenario. */
function planFor(
  scenario: ScenarioId,
  gate: Gate,
  seed: number,
  snapshot: PlaybackSnapshot,
): GatePlan {
  // Solo «Teclas rápidas» mantiene el gesto atajo del v1; el resto sostiene
  // la nota por su duración escrita (petición del usuario, 2026-11-06).
  const fast = scenario === "teclas_rapidas";
  const holdMs = holdMsFor(gate, fast);

  switch (scenario) {
    case "perfecta":
      return { pitches: [...gate.pitches], pressAtMs: 0, holdMs };
    case "teclas_rapidas":
      return { pitches: [...gate.pitches], pressAtMs: 0, holdMs };
    case "siempre_tarde": {
      // Espera todo el margen (dos pulsos al tempo del snapshot) y acierta
      // después: el strike `timeout` ya se contó, el hit tardío rescata.
      const timeoutMs = waitTimeoutMs({ tempoBpm: snapshot.tempo_bpm });
      return { pitches: [...gate.pitches], pressAtMs: timeoutMs + LATE_EXTRA_MS, holdMs };
    }
    case "siempre_equivocada":
      return { pitches: [wrongPitchFor(gate)], pressAtMs: WRONG_DELAY_MS, holdMs };
    case "nunca_press":
      return { pitches: [], pressAtMs: 0, holdMs: null };
    case "acorde_incompleto":
      // Solo la primera nota: con un acorde no satisface el gate; con una
      // sola nota actúa como acierto (no hay acorde que mordiscar).
      return { pitches: [gate.pitches[0]], pressAtMs: 0, holdMs };
    case "mezcla": {
      const draw = hash01(gate.id, seed);
      if (draw < MIX_HIT_MAX) return { pitches: [...gate.pitches], pressAtMs: 0, holdMs };
      if (draw < MIX_LATE_MAX) {
        const timeoutMs = waitTimeoutMs({ tempoBpm: snapshot.tempo_bpm });
        return { pitches: [...gate.pitches], pressAtMs: timeoutMs + LATE_EXTRA_MS, holdMs };
      }
      return { pitches: [wrongPitchFor(gate)], pressAtMs: WRONG_DELAY_MS, holdMs };
    }
  }
}

/** Crea el runner; polling del snapshot como el gate-controller. */
export function createPracticeScenarioRunner(
  scenario: ScenarioId,
  deps: PracticeScenarioDeps,
  options: PracticeScenarioOptions = {},
): PracticeScenarioRunner {
  const seed = options.seed ?? 1;
  const pollIntervalMs = deps.pollIntervalMs ?? 100;
  const { submitNoteOn, submitNoteOff, clockMs, canEmit } = deps;

  /**
   * Tolerancia del pulso tardío (2026-11-07, gates sin pulso en el log): el
   * muro del golpe se agenda con el reloj del sondeo y la posición del motor
   * avanza con el suyo — en el disparo la posición puede caer unos ms PASADA
   * la hora del gate, y `nextGate` la descarta con 5 ms de margen
   * (CHORD_TOLERANCE_S). A esa carrera el pulso se pierde por completo. Con
   * esta tolerancia el golpe sale igual, ligero tarde («pasaban X s»): roza
   * el instante y siempre suena — nunca otra nota ausente.
   */
  const PRESS_LATE_TOLERANCE_S = 0.25;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Vigilancia del reloj del motor (2026-11-07, notas fantasma del 4.5 y del
   * 18.875): la posición del transporte corre con el reloj del AudioContext
   * y el dispositivo puede detener su reloj ~0.4–0.5 s (glitch de audio).
   * Congelada la posición, los golpes agendados disparan contra ella —
   * acordes en la hora equivocada, teclas descartadas «ya sostenido» y
   * acordes inaudibles. La traza solo CUENTA el paro; no cambia el pulso.
   */
  let watchPos: number | null = null;
  let watchWallMs = 0;
  let watchStallSinceMs: number | null = null;
  /**
   * Golpe programado (2026-11-07, diagnóstico de timings): al adoptar el gate
   * se agenda el pulso con `setTimeout` al instante de pared del gate
   * (remaining_seconds / tempoFactor), y NO en el sondeo en que se adopta —
   * el log mostraba pulsos 100–400 ms ANTES del gate porque el pulso salía
   * justo al soltar la nota anterior, no en el instante escrito. La suelta se
   * mide contra el muro real del golpe.
   */
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressDeadlineMs: number | null = null;
  /** Si hay golpe agendado por disparar (por gate). */
  let pressExpected = false;
  let lastGateId: string | null = null;
  let plan: GatePlan | null = null;
  /** Instante de partitura del gate agendado (referencia del pulso tardío). */
  let planGateTimeS = 0;
  /**
   * Sostenes independientes por gate (2026-11-07): cada golpe agenda su
   * propia suelta a muro+hold — los sostenes superpuestos no se cortan
   * entre sí y la adopción del gate siguiente NO espera manos libres (el
   * robot tiene diez dedos). Los sostenes largos ya no tapan el gate
   * siguiente ni hacen perder notas.
   */
  interface PendingRelease {
    gateId: string;
    pitch: number;
    atMs: number;
  }
  let pendingReleases: PendingRelease[] = [];

  /**
   * Suletas ya vencidas, ahora (2026-11-07, la cortada de la gracetilla
   * final): el sondeo las procesa, pero un golpe por temporizador puede
   * dispararse ENTRE el vencimiento de una suleta y el sondeo que la
   * ejecuta — y entonces el noteOn ve la tecla del gate anterior aún
   * bajada (`noteOn descartado: X ya sostenido`) y su inmediato noteOff
   * MATA la nota recién pulsada (el 69 final de gate-21.9427 murió tras
   * el suelta del gate-21.8750). El apretón limpia sus vencidas antes.
   */
  const flushDueReleases = () => {
    if (pendingReleases.length === 0) return;
    const vencidas = pendingReleases.filter((pending) => clockMs() >= pending.atMs);
    if (vencidas.length === 0) return;
    // Suletas por tecla (nota repetida sobre sostén): la traza se agrupa
    // por gate con todo lo que suelta a la vez, una línea como las de antes.
    const porGate = new Map<string, number[]>();
    for (const pending of vencidas) {
      const pitches = porGate.get(pending.gateId) ?? [];
      pitches.push(pending.pitch);
      porGate.set(pending.gateId, pitches);
    }
    for (const [gateId, pitches] of porGate) {
      audioTrace(`robot suelta gate=${gateId} pitch=[${pitches.join(",")}]`);
      for (const pitch of pitches) submitNoteOff({ pitch });
    }
    pendingReleases = pendingReleases.filter((pending) => clockMs() < pending.atMs);
  };

  /** Cancela el golpe agendado (adopción nueva, stop, reset). */
  const clearPress = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  /** Suelta inmediata de todo lo haya sostenido (stop/reset). */
  const releaseAllPending = () => {
    for (const pending of pendingReleases) {
      submitNoteOff({ pitch: pending.pitch });
    }
    pendingReleases = [];
  };

  /**
   * Las teclas re-pulsadas por el golpe con una suleta vieja aún pendiente
   * (2026-11-07, nota repetida sobre un sostén largo — la pieza nueva del
   * usuario las llena): no se puede re-pulsar una tecla que sigue
   * aguantada — si el noteOn sale con la tecla baja, el sampler lo
   * descarta («ya sostenido») y la suleta vieja se come la nota recién
   * nacida: omisión audible y sistemática. La vieja suelta muere YA.
   */
  const releaseOverlappedPitches = () => {
    if (plan === null || plan.pitches.length === 0) return;
    const pressing = new Set(plan.pitches);
    const afectadas = pendingReleases.filter((pending) => pressing.has(pending.pitch));
    if (afectadas.length === 0) return;
    const porGate = new Map<string, number[]>();
    for (const pending of afectadas) {
      const pitches = porGate.get(pending.gateId) ?? [];
      pitches.push(pending.pitch);
      porGate.set(pending.gateId, pitches);
    }
    for (const [gateId, pitches] of porGate) {
      audioTrace(`robot suelta (por el golpe) gate=${gateId} pitch=[${pitches.join(",")}]`);
    }
    pendingReleases = pendingReleases.filter((pending) => {
      if (!pressing.has(pending.pitch)) return true;
      submitNoteOff({ pitch: pending.pitch });
      return false;
    });
  };

  /**
   * El golpe agendado: pulsa las teclas del plan y fija el muro real del
   * golpe (la suleta se mide desde aquí, no desde la adopción). En flujo
   * admite hasta PRESS_LATE_TOLERANCE_S de retraso (carrera de relojes);
   * cualquier desenlace que no pulse deja su rastro — nunca más un
   * aborto en silencio, que era la nota perdida sin explicación.
   */
  const firePress = () => {
    pressTimer = null;
    if (!pressExpected || plan === null || plan.pitches.length === 0 || plan.holdMs === null) return;
    if (!canEmit()) {
      // Pendiente: el apócope del sondeo lo pulsa cuando el puerto reabra.
      audioTrace(`robot pulso (puerta cerrada, queda pendiente) gate=${lastGateId}`);
      return;
    }
    const snapshot = deps.getSnapshot();
    const gateNow =
      snapshot.status === "waiting"
        ? snapshot.currentGate ?? null
        : snapshot.status === "playing"
          ? snapshot.upcomingGate ?? null
          : null;
    // ¿Sigue siendo el gate al que apunta el golpe? En espera el gate está
    // congelado: identidad estricta. En flujo, si el disparo aterrizó unos ms
    // pasado el instante (carrera de relojes, ver PRESS_LATE_TOLERANCE_S),
    // el gate ya no asoma en upcomingGate y el golpe sale DE TODOS MODOS.
    let target: string | null = lastGateId;
    let tardeS = 0;
    if (snapshot.status === "waiting" && gateNow?.id === lastGateId) {
      target = lastGateId;
    } else if (snapshot.status === "playing") {
      tardeS = snapshot.position_s - planGateTimeS;
      target =
        gateNow?.id === lastGateId || (tardeS >= 0 && tardeS <= PRESS_LATE_TOLERANCE_S)
          ? lastGateId
          : null;
    } else {
      target = null;
    }
    if (target === null) {
      pressExpected = false;
      pressDeadlineMs = null;
      audioTrace(
        `robot pulso cancelado gate=${lastGateId} gateAhora=${gateNow?.id ?? "—"} ` +
          `pos=${snapshot.position_s.toFixed(3)} planTime_s=${planGateTimeS.toFixed(3)}`,
      );
      return;
    }
    pressExpected = false;
    pressDeadlineMs = clockMs();
    const aviso = tardeS > 0.0005 ? ` (pasaban ${tardeS.toFixed(3)} s)` : "";
    // Antes de apretar: las teclas re-pulsadas sueltan ya su sostén viejo
    // (re-ataque audible, articulación correcta — nota repetida) y pasan
    // sus suletas ya vencidas que el sondeo no llegó a procesar.
    releaseOverlappedPitches();
    flushDueReleases();
    audioTrace(
      `robot pulso${aviso} gate=${lastGateId} pitch=[${plan.pitches.join(",")}] ` +
        `pos=${snapshot.position_s.toFixed(3)}`,
    );
    for (const pitch of plan.pitches) submitNoteOn({ pitch, velocity: VELOCITY });
    for (const pitch of plan.pitches) {
      pendingReleases.push({
        gateId: lastGateId ?? "?",
        pitch,
        atMs: pressDeadlineMs + plan.holdMs,
      });
    }
  };

  const resetGate = () => {
    releaseAllPending();
    clearPress();
    pressExpected = false;
    pressDeadlineMs = null;
    lastGateId = null;
    plan = null;
  };

  const poll = () => {
    const snapshot = deps.getSnapshot();

    // Vigilancia del reloj: en playing lag posición debe avanzar ~dt·tempoFactor
    // entre sondeos; si avanza menos de la mitad, el AudioContext se paró.
    if (snapshot.status === "playing") {
      const nowMs = clockMs();
      if (watchPos === null) {
        watchPos = snapshot.position_s;
        watchWallMs = nowMs;
        watchStallSinceMs = null;
      } else {
        const expectedS = ((nowMs - watchWallMs) / 1000) * snapshot.tempoFactor;
        const deficitS = expectedS - (snapshot.position_s - watchPos);
        if (expectedS > 0.02 && deficitS > 0.05) {
          if (watchStallSinceMs === null) {
            watchStallSinceMs = watchWallMs;
            audioTrace(
              `motor reloj DETENIDO (pos=${snapshot.position_s.toFixed(3)} estática ` +
                `${Math.round(nowMs - watchWallMs)} ms, adeudo=${deficitS.toFixed(3)} s)`,
            );
          }
        } else {
          if (watchStallSinceMs !== null) {
            audioTrace(
              `motor reloj reanudado tras ~${Math.round(nowMs - watchStallSinceMs)} ms ` +
                `(pos=${snapshot.position_s.toFixed(3)})`,
            );
            watchStallSinceMs = null;
          }
          watchPos = snapshot.position_s;
          watchWallMs = nowMs;
        }
      }
    } else {
      watchPos = null;
      watchStallSinceMs = null;
    }

    // 0) Las suletas van por gate y por reloj: cada sostén se suelta cuando
    // toca (muro del golpe + hold escrito), al margen del modo — el rescate
    // del gate, el pause o el cambio de pieza no corta la duración.
    flushDueReleases();

    // Gate activo por vía: en espera, el actual (congelado); en flujo (modo
    // espera apagado, petición del usuario 2026-11-07), el venidero según la
    // posición — sin la espera el transporte nunca se congela y el antiguo
    // poll no pulsaba nunca. Fuera de reproduce/espera no se programa nada.
    const waitingGate = snapshot.status === "waiting" ? snapshot.currentGate ?? null : null;
    const flowGate =
      waitingGate === null && snapshot.status === "playing" ? snapshot.upcomingGate ?? null : null;
    const gate = waitingGate ?? flowGate;

    // 1) Suspensión durante la IA: misma referencia de control que el puerto
    // usa para su puerta. El robot no arranca gestos nuevos; las suletas de
    // los sostenes siguen su curso aunque el puerto esté cerrado.
    if (!canEmit()) return;

    // 2) Apócope ANTES de la adopción: si el golpe del gate actual ya cumplió
    // su muro (temporizador no disparado o sondeo lo pilló tarde), sale
    // aquí — ligero tarde pero sonando — en vez de quedar aplastado por el
    // clearPress de la adopción siguiente (gates sin pulso, 2026-11-07).
    if (pressExpected && pressDeadlineMs !== null && clockMs() >= pressDeadlineMs) {
      firePress();
    }

    // 3) Gate nuevo a la vista (en espera o en camino): se adopta SIEMPRE —
    // aunque haya sostenes en marcha (sus suletas ya están agendadas) — y se
    // agenda el golpe a su muro.
    if (gate !== null && gate.id !== lastGateId) {
      // El golpe pendiente que el clearPress aplastaría: si el gate agendado
      // está pegado a la posición —vencido por el reloj, o la adopción le
      // llega antes— sale aquí, no desaparece en silencio (2026-11-07: los
      // «plan→plan sin pulso» del log eran esto y la carrera de abajo).
      if (
        pressExpected &&
        pressDeadlineMs !== null &&
        snapshot.status === "playing" &&
        plan !== null &&
        plan.pitches.length > 0 &&
        plan.holdMs !== null
      ) {
        const diffS = snapshot.position_s - planGateTimeS;
        if (diffS >= -PRESS_LATE_TOLERANCE_S) {
          firePress();
        } else {
          audioTrace(
            `robot golpe abandonado gate=${lastGateId} pos=${snapshot.position_s.toFixed(3)} ` +
              `planTime_s=${planGateTimeS.toFixed(3)}`,
          );
        }
      }
      clearPress();
      pressExpected = false;
      pressDeadlineMs = null;
      lastGateId = gate.id;
      plan = planFor(scenario, gate, seed, snapshot);
      planGateTimeS = gate.time_s;
      // Trazas del robot (?traceAudio, diagnóstico de timings): qué gate, qué
      // plan y a qué distancia score del gate estaba la posición al adoptarlo.
      audioTrace(
        `robot plan gate=${gate.id} time_s=${gate.time_s.toFixed(3)} pos=${snapshot.position_s.toFixed(3)} ` +
          `pressAtMs=${plan.pressAtMs} holdMs=${plan.holdMs ?? "—"}`,
      );
      if (plan.pitches.length === 0 || plan.holdMs === null) {
        audioTrace(`robot sin plan gate=${gate.id} (sin pitches o sin hold)`);
        return;
      }
      // Agenda del golpe: en flujo cae en el INSTANTE DEL GATE (muro = gate −
      // posición, convertido a reloj por el tempoFactor); en espera, en su
      // `pressAtMs` de siempre (el gate ya está congelado en su línea).
      const delayMs =
        snapshot.status === "playing"
          ? Math.max(0, ((gate.time_s - snapshot.position_s) / snapshot.tempoFactor) * 1000) +
            plan.pressAtMs
          : plan.pressAtMs;
      pressDeadlineMs = clockMs() + delayMs;
      pressExpected = true;
      audioTrace(
        `robot agenda gate=${gate.id} delayMs=${Math.round(delayMs)} ` +
          `pressDeadlineMs=${Math.round(pressDeadlineMs)}`,
      );
      pressTimer = setTimeout(firePress, delayMs);
    }

    // Apócope de cola: un gate adoptado con delay 0 no debe esperar al
    // siguiente sondeo (vitest no dispara el timeout agendado dentro del
    // mismo avance); pressExpected impide el disparo doble.
    if (pressExpected && pressDeadlineMs !== null && clockMs() >= pressDeadlineMs) {
      firePress();
    }
  };
  return {
    scenario,
    start() {
      if (pollTimer !== null) return;
      resetGate();
      pollTimer = setInterval(poll, pollIntervalMs);
    },
    stop() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      clearPress();
      resetGate();
    },
  };
}
