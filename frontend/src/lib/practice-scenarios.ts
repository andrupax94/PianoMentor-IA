// description: Runner de escenarios de práctica sintéticos (B-033.1): un pianista robot de desarrollo que, en cada gate en espera, emite pulsaciones REALES por el puerto de entrada de notas con la fuente `debug`: del puerto salen el audio, la evaluación del gate y el envío WS, así que el macro recorre el pipeline completo, sin mocks.
// context: Módulo puro, sin DOM ni React (los integrantes B-032 deciden qué es una pulsación; aquí solo se lee el snapshot del transporte). Las dependencias se inyectan como en gate-controller para probarlo con reloj falso; el montaje dev-only vive en PracticeBridge y bajo `NODE_ENV === "production"` ni se importa.

import type { Gate } from "./practice-gate";
import { waitTimeoutMs } from "./practice-gate";
import type { PlaybackSnapshot } from "./playback-engine";

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
 */
const HOLD_GAP_MS = 120;
const HOLD_MIN_MS = 60;
const HOLD_MAX_MS = 1500;

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

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastGateId: string | null = null;
  let gateStartMs = 0;
  let plan: GatePlan | null = null;
  /** Teclas del plan que están sonando ahora mismo (para soltarlas limpias). */
  let heldPitches: number[] | null = null;
  /** Un gesto por gate: tras soltar, el sondeo no vuelve a pulsar. */
  let gestureDone = false;

  const releaseHeld = () => {
    if (!heldPitches) return;
    for (const pitch of heldPitches) submitNoteOff({ pitch });
    heldPitches = null;
  };

  const resetGate = () => {
    releaseHeld();
    lastGateId = null;
    plan = null;
    gestureDone = false;
  };

  const poll = () => {
    const snapshot = deps.getSnapshot();
    if (snapshot.status !== "waiting" || !snapshot.currentGate) {
      resetGate();
      return;
    }
    // Suspensión durante la IA: misma referencia de control que el puerto
    // usa para su puerta. El robot se calla; al devolverse el control,
    // continúa donde el transporte esté, sin darle vueltas al reloj.
    if (!canEmit()) return;

    const gate = snapshot.currentGate;
    if (gate.id !== lastGateId) {
      releaseHeld();
      lastGateId = gate.id;
      gateStartMs = clockMs();
      plan = planFor(scenario, gate, seed, snapshot);
      heldPitches = null;
      gestureDone = false;
    }
    if (!plan || plan.holdMs === null || plan.pitches.length === 0) return;

    const elapsedMs = clockMs() - gateStartMs;
    if (heldPitches === null) {
      if (!gestureDone && elapsedMs >= plan.pressAtMs) {
        for (const pitch of plan.pitches) submitNoteOn({ pitch, velocity: VELOCITY });
        heldPitches = plan.pitches;
      }
      return;
    }
    if (elapsedMs >= plan.pressAtMs + plan.holdMs) {
      releaseHeld();
      gestureDone = true;
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
      resetGate();
    },
  };
}
