// description: Matemática pura de reproducción (B-006.2): schedule ordenado con factor de tempo, ventana de eventos, pitch a Hz, recortes y tempoFactorFor, que convierte el BPM que pide el usuario en el factor multiplicativo (B-006.5).
// context: Sin DOM ni AudioContext; testeable con números, la ejecuta el motor de transporte. El factor es una razón sobre el tempo base, así que el cambio de velocidad es relativo y respeta los cambios de tempo internos de la pieza.

import type { NoteHand, PlayableNote } from "./api-client";

/** Un evento programable: instante en segundos de partitura y nota a sonar. */
export interface ScheduledEvent {
  time_s: number;
  pitch: number;
  duration_s: number;
  velocity: number;
  /** Mano de la pista (B-009.3); solo llega si la partitura se pidió con `with_hands`. */
  hand?: NoteHand;
}

/** Límites del factor de tempo (mitad de velocidad… doble velocidad). */
export const MIN_TEMPO_FACTOR = 0.5;
export const MAX_TEMPO_FACTOR = 2.0;

/** Recorta el factor al rango válido; lo no numérico equivale a tiempo real. */
export function clampTempoFactor(factor: number): number {
  if (!Number.isFinite(factor)) return 1.0;
  return Math.min(MAX_TEMPO_FACTOR, Math.max(MIN_TEMPO_FACTOR, factor));
}

/**
 * Factor que hace sonar el tempo base de la pieza a `target_bpm` (B-006.5):
 * el usuario pide un BPM y aquí se convierte en el factor multiplicativo que
 * ya entiende el motor. Como es una razón sobre el tempo base, el cambio es
 * relativo: la pieza conserva sus propios cambios de tempo por dentro.
 * Base desconocida, cero o valores no numéricos → tiempo real (1.0); el
 * resultado siempre pasa por `clampTempoFactor`.
 */
export function tempoFactorFor(target_bpm: number, base_bpm: number | null): number {
  if (base_bpm === null || !Number.isFinite(base_bpm) || base_bpm <= 0) return 1.0;
  if (!Number.isFinite(target_bpm)) return 1.0;
  return clampTempoFactor(target_bpm / base_bpm);
}

/**
 * Convierte las notas en eventos ordenados por tiempo, escalados por el factor.
 * Factor 0.5 = todo dura el doble; factor 2.0 = todo dura la mitad.
 * El orden es estable: los empates conservan el orden de entrada.
 * La mano viaja con la nota para que la cascada sepa de qué color pintarla (D-002.1).
 */
export function buildSchedule(notes: PlayableNote[], tempoFactor = 1.0): ScheduledEvent[] {
  const factor = clampTempoFactor(tempoFactor);
  return notes
    .map((note) => ({
      time_s: note.start_seconds / factor,
      pitch: note.pitch,
      duration_s: note.duration_seconds / factor,
      velocity: note.velocity,
      hand: note.hand,
    }))
    .sort((a, b) => a.time_s - b.time_s);
}

/** Eventos con inicio en (from_s, upto_s]: lo ya sonado no se reprograma. */
export function eventsInWindow(
  events: ScheduledEvent[],
  from_s: number,
  upto_s: number,
): ScheduledEvent[] {
  return events.filter((event) => event.time_s > from_s && event.time_s <= upto_s);
}

/** Frecuencia en Hz de un pitch MIDI (69 = La 440). */
export function pitchToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/** Recorta una posición al rango [0, duration_s]. */
export function clampPosition(position_s: number, duration_s: number): number {
  if (!Number.isFinite(position_s)) return 0;
  return Math.min(Math.max(position_s, 0), Math.max(duration_s, 0));
}
