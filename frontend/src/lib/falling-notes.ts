// description: Notas visibles en la cascada y su progreso de caída.
// context: B-007.3; puro y sin DOM. La velocidad no es un temporizador propio:
// deriva de la posición del transporte, así que pausar congela y el factor de
// tempo escala la caída igual que el sonido.

import { HORIZON_S } from "./key-states";
import { pitchToKeyId } from "./pitch";
import type { ScheduledEvent } from "./playback-schedule";

/** Una nota cayendo hacia el teclado. */
export interface FallingNote {
  /** Clave estable para React y para el pooling del DOM (misma nota, distinto tiempo). */
  id: string;
  pitch: number;
  keyId: string;
  /** Segundos que le quedan hasta tocar el teclado. */
  remaining_s: number;
  /** Duración de la nota en segundos de partitura ya escalados. */
  duration_s: number;
  /** Progreso 0 (entra por arriba) → 1 (llega al teclado). */
  progress: number;
  velocity: number;
}

/**
 * Notas que empiezan en [position_s, position_s + horizon_s] y su progreso.
 * En position_s == time_s el progreso es 1: ese es el fotograma en que la nota
 * toca el teclado, el mismo en que la tecla se enciende (mismo horizonte).
 */
export function fallingNotes(
  events: ScheduledEvent[],
  position_s: number,
  horizon_s = HORIZON_S,
): FallingNote[] {
  if (!Number.isFinite(horizon_s) || horizon_s <= 0) return [];
  const notes: FallingNote[] = [];
  for (const event of events) {
    const remaining_s = event.time_s - position_s;
    // Fuera de la ventana: aún no aparece, o ya está sonando (la pinta el teclado).
    if (remaining_s < 0 || remaining_s > horizon_s) continue;
    notes.push({
      id: `${event.pitch}@${event.time_s}`,
      pitch: event.pitch,
      keyId: pitchToKeyId(event.pitch),
      remaining_s,
      duration_s: event.duration_s,
      progress: 1 - remaining_s / horizon_s,
      velocity: event.velocity,
    });
  }
  return notes;
}
