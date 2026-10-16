// description: Props de la franja superior del área izquierda.
// context: B-007.3/B-008.3; el transporte llega por props y expone la rejilla de
// compases. El título sigue siendo marcador hasta B-012 (sesión con pieza elegida).

import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PlayerBarProps {
  /** Transporte del escenario: controles, posición, tempo, rejilla y estado. */
  player: PlaybackHandle;
  /** Título de la pieza. */
  songTitle?: string;
  /** Subtítulo (arreglo). */
  arrangement?: string;
}
