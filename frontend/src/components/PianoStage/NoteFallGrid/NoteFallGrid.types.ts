// description: Props de la cuadrícula de notas cayendo.
// context: B-007.3/B-012.7; el transporte lo reparte PianoStage con el teclado. Las
// líneas se derivan del rango compartido (useVisibleRange), no de props; `agentHand`
// marca la mano que toca la IA en el acompañamiento.

import type { AgentHand } from "../../../lib/hand-color";
import type { PlaybackStatus } from "../../../lib/playback-engine";
import type { ScheduledEvent } from "../../../lib/playback-schedule";

export interface NoteFallGridProps {
  /** Etiquetas de octava en los laterales (marcador visual de B-006.4). */
  octaves?: string[];
  /** Notas reproducibles ya escaladas por el factor de tempo. */
  schedule?: ScheduledEvent[];
  /** Estado del transporte: la cascada solo se anima mientras suena. */
  status?: PlaybackStatus;
  /** Horizonte de caída en segundos; por defecto el mismo que el resaltado. */
  horizon_s?: number;
  /** Posición viva del transporte; se lee en cada frame, no es un valor de React. */
  getPosition?: () => number;
  /** Mano que toca la IA en el acompañamiento (B-012.7); se pinta con otro color. */
  agentHand?: AgentHand | null;
}
