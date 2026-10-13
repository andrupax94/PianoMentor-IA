// description: Ids de teclas sonando y esperadas desde el schedule y la posición.
// context: B-007.2; puro y testeable, sin DOM.

import { pitchToKeyId } from "./pitch";
import type { ScheduledEvent } from "./playback-schedule";

/**
 * Horizonte de anticipación en segundos de partitura. El resaltado "esperada"
 * y la cascada de notas usan el mismo: así la nota llega al teclado justo
 * cuando la tecla se enciende.
 */
export const HORIZON_S = 2.0;

/** Ids de teclas con nota activa en position_s (inicio <= pos < fin), únicos. */
export function soundingKeyIds(events: ScheduledEvent[], position_s: number): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.time_s <= position_s && position_s < event.time_s + event.duration_s) {
      const id = pitchToKeyId(event.pitch);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Ids de notas que empiezan en (position_s, position_s + horizon_s], únicos.
 * Horizonte documentado: 2 segundos de partitura.
 */
export function expectedKeyIds(
  events: ScheduledEvent[],
  position_s: number,
  horizon_s = HORIZON_S,
): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.time_s > position_s && event.time_s <= position_s + horizon_s) {
      const id = pitchToKeyId(event.pitch);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
