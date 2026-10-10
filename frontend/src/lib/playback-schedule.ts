// description: Matemática pura de reproducción: schedule de eventos, tempo y pitch.
// context: Núcleo testeable de B-006.2; sin DOM, sin AudioContext, sin React.

import type { PlayableNote } from "./api-client";

/** Un evento programable: instante en segundos de partitura y nota a sonar. */
export interface ScheduledEvent {
  time_s: number;
  pitch: number;
  duration_s: number;
  velocity: number;
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
 * Convierte las notas en eventos ordenados por tiempo, escalados por el factor.
 * Factor 0.5 = todo dura el doble; factor 2.0 = todo dura la mitad.
 * El orden es estable: los empates conservan el orden de entrada.
 */
export function buildSchedule(notes: PlayableNote[], tempoFactor = 1.0): ScheduledEvent[] {
  const factor = clampTempoFactor(tempoFactor);
  return notes
    .map((note) => ({
      time_s: note.start_seconds / factor,
      pitch: note.pitch,
      duration_s: note.duration_seconds / factor,
      velocity: note.velocity,
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
