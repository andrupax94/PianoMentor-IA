// description: Props de la franja superior del área izquierda.
// context: B-007.3/B-008.3; el transporte llega por props y expone la rejilla de
// compases. El título es obligatorio: lo decide PlaybackArea según la pieza cargada.

import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PlayerBarProps {
  /** Transporte del escenario: controles, posición, tempo, rejilla y estado. */
  player: PlaybackHandle;
  /** Título de la pieza que suena (la demo o la elegida). */
  songTitle: string;
  /** Subtítulo (arreglo). */
  arrangement?: string;
}
