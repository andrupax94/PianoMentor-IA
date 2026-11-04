// description: Gates de modo espera (B-032.5): agrupa el schedule en unidades esperadas (nota o acorde), filtra por mano, decide si la pulsación satisface el gate, si es una tecla equivocada y cuánto se espera antes de contar un strike.
// context: Sin DOM ni React; testeable con números. El motor lo consulta para saber cuándo congelarse y el gate-controller decide hit/miss/wrong/timeout.

import type { NoteHand, PlayableNote } from "./api-client";
import type { ScheduledEvent } from "./playback-schedule";

/** Mano sobre la que se filtran los gates. */
export type GateHand = "left" | "right" | "both";

/** Resultado de evaluar una interacción con un gate. */
export type GateOutcome = "hit" | "miss" | "wrong" | "timeout";

/** Una unidad esperada: nota sola o acorde simultáneo. */
export interface Gate {
  /** Identificador estable para deduplicar señales en el backend. */
  id: string;
  /** Tiempo en segundos de partitura ya escalados (misma línea temporal que el schedule). */
  time_s: number;
  /**
   * Duración escalada de la unidad (la más larga del acorde). Dimensiona el
   * margen visual del gate en la cascada (B-032.8).
   */
  duration_s: number;
  /** Pitches MIDI que deben sonar para satisfacer el gate. */
  pitches: number[];
  /** Manos presentes en el gate (puede cruzarse en un acorde). */
  hands: NoteHand[];
  /** Compás al que pertenece el gate, si se conoce. */
  measure: number | null;
}

/** Opciones del margen de espera. */
export interface WaitTimeoutOptions {
  /** Tempo base de la pieza en BPM. */
  tempoBpm?: number | null;
  /** Pulsos que se aguantan antes de contar strike (por defecto 2). */
  beats?: number;
  /** Mínimo en milisegundos. */
  minMs?: number;
  /** Máximo en milisegundos. */
  maxMs?: number;
}

/** Dos eventos con menos de esta diferencia de tiempo pertenecen al mismo gate (acorde). */
export const CHORD_TOLERANCE_S = 0.005;

/** GateHand incluye las notas sin mano asignada: sin saber de qué mano son, no se pueden ignorar. */
function handMatches(eventHand: NoteHand | undefined, wanted: GateHand): boolean {
  if (wanted === "both") return true;
  if (eventHand === undefined || eventHand === "unknown") return true;
  return eventHand === wanted;
}

/**
 * Agrupa un schedule en gates, filtrando por mano y respetando la tolerancia
 * de acordes. El orden es el del schedule; los pitches de cada gate salen
 * ordenados de grave a agudo.
 */
export function gatesForSchedule(schedule: readonly ScheduledEvent[], hand: GateHand): Gate[] {
  const filtered = schedule.filter((event) => handMatches(event.hand, hand));
  if (filtered.length === 0) return [];

  const sorted = [...filtered].sort((a, b) => a.time_s - b.time_s);
  const gates: Gate[] = [];
  let current: { time_s: number; duration_s: number; pitches: number[]; hands: NoteHand[] } | null = null;

  const addHand = (hands: NoteHand[], handValue: NoteHand) => {
    if (!hands.includes(handValue)) hands.push(handValue);
  };

  for (const event of sorted) {
    const eventHand: NoteHand = event.hand ?? "unknown";
    if (current === null || event.time_s - current.time_s > CHORD_TOLERANCE_S) {
      if (current !== null) {
        gates.push({
          id: gateId(current.time_s),
          time_s: current.time_s,
          duration_s: current.duration_s,
          pitches: [...current.pitches].sort((a, b) => a - b),
          hands: current.hands,
          measure: null,
        });
      }
      current = {
        time_s: event.time_s,
        duration_s: Math.max(0, event.duration_s),
        pitches: [event.pitch],
        hands: [eventHand],
      };
    } else {
      // El acorde entera dura hasta que su nota más larga termina.
      current.duration_s = Math.max(current.duration_s, Math.max(0, event.duration_s));
      if (!current.pitches.includes(event.pitch)) {
        current.pitches.push(event.pitch);
      }
      addHand(current.hands, eventHand);
    }
  }

  if (current !== null) {
    gates.push({
      id: gateId(current.time_s),
      time_s: current.time_s,
      duration_s: current.duration_s,
      pitches: [...current.pitches].sort((a, b) => a - b),
      hands: current.hands,
      measure: null,
    });
  }

  return gates;
}

function gateId(time_s: number): string {
  return `gate-${time_s.toFixed(4)}`;
}

/**
 * Primer gate del schedule que aún puede tocarse desde `position_s`.
 *
 * B-032.8: antes devolvía "estrictamente después de la posición" — un gate
 * cuyo `time_s` coincidía con el arranque de la pieza (o al que un tick lento
 * pisaba por pocos ms) quedaba marcado como pasado y el motor saltaba a la
 * nota siguiente sin dejar tocar la primera. Ahora cuenta como alcanzable
 * mientras no lo hayamos cruzado por más de `CHORD_TOLERANCE_S`; el motor
 * evita repetir los ya tocados con su propio recuento.
 */
export function gateAt(
  schedule: readonly ScheduledEvent[],
  position_s: number,
  hand: GateHand,
): Gate | null {
  const gates = gatesForSchedule(schedule, hand);
  for (const gate of gates) {
    if (gate.time_s >= position_s - CHORD_TOLERANCE_S) return gate;
  }
  return null;
}

/** True si todas las notas esperadas están pulsadas. */
export function gateSatisfied(gate: Gate, pressed: Iterable<number>): boolean {
  const set = new Set(pressed);
  return gate.pitches.every((pitch) => set.has(pitch));
}

/**
 * True si el alumno ha pulsado una tecla que no forma parte del gate.
 * Una nota correcta adicional a las esperadas también cuenta como wrong
 * (el alumno no debe tocar de más).
 */
export function gateWrong(gate: Gate, pressed: Iterable<number>): boolean {
  const expected = new Set(gate.pitches);
  for (const pitch of pressed) {
    if (!expected.has(pitch)) return true;
  }
  return false;
}

/**
 * Margen de espera antes de contar un strike.
 *
 * - Con tempo conocido: `beats` pulsos (2 por defecto).
 * - Sin tempo: el mínimo configurado.
 *
 * El resultado siempre queda entre `minMs` y `maxMs`.
 */
export function waitTimeoutMs(options: WaitTimeoutOptions = {}): number {
  const beats = options.beats ?? 2;
  const minMs = options.minMs ?? 500;
  const maxMs = options.maxMs ?? 4000;

  const tempoBpm = options.tempoBpm;
  if (typeof tempoBpm === "number" && Number.isFinite(tempoBpm) && tempoBpm > 0) {
    const ms = (beats * 60_000) / tempoBpm;
    return Math.min(maxMs, Math.max(minMs, ms));
  }
  return minMs;
}

/**
 * Decide el outcome de una interacción con el gate.
 *
 * - `hit` si todas las notas esperadas están pulsadas: incluso con el margen
 *   agotado, el acierto tardío rescata el gate y reanuda el transporte (el
 *   timeout ya se contó como strike cuando venció; dejar bloqueado el gate
 *   para siempre colgaba la sesión si el usuario revisitaba la tecla tarde).
 * - `timeout` en cuanto el margen se agota sin acierto (lo consume B-032.6).
 * - `wrong` si hay alguna tecla de más o distinta.
 * - `miss` en cualquier otro caso (todavía no se ha tocado lo esperado).
 */
export function strikeFor(
  gate: Gate,
  pressed: Iterable<number>,
  timedOut: boolean,
): GateOutcome {
  if (gateSatisfied(gate, pressed)) return "hit";
  if (timedOut) return "timeout";
  if (gateWrong(gate, pressed)) return "wrong";
  return "miss";
}

/** Asigna el compás a cada gate a partir de la rejilla de compases. */
export function assignMeasure(
  gates: readonly Gate[],
  measureStarts: readonly number[],
): Gate[] {
  if (measureStarts.length === 0) return gates.map((gate) => ({ ...gate }));
  return gates.map((gate) => ({
    ...gate,
    measure: measureIndexAt(gate.time_s, measureStarts),
  }));
}

function measureIndexAt(time_s: number, starts: readonly number[]): number {
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= time_s) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(Math.max(lo - 1, 0), starts.length - 1);
}

/** Duración mínima de preroll: por defecto dos segundos o un compás, lo que sea menor. */
export function defaultPreroll_s(tempoBpm: number | null | undefined, measureSeconds = 2): number {
  const fallback = 2;
  if (typeof tempoBpm !== "number" || !Number.isFinite(tempoBpm) || tempoBpm <= 0) {
    return fallback;
  }
  const oneBeat_s = 60 / tempoBpm;
  return Math.min(fallback, measureSeconds * oneBeat_s);
}

/** Lista de pitches de una nota o acorde como texto legible (para tests y logs). */
export function gatePitches(gate: Gate): string {
  return gate.pitches.join(",");
}
