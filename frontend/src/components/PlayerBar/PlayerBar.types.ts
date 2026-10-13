// description: Props de la franja superior del área izquierda.
// context: B-007.3; el transporte llega por props (B-006.4 lo dejó pendiente: "el
// transporte se enchufa en B-007"). El título y el compás siguen siendo marcadores:
// los rellena B-008 (compases) y B-012 (sesión con pieza elegida).

import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PlayerBarProps {
  /** Transporte del escenario: controles, posición, tempo y estado. */
  player: PlaybackHandle;
  /** Título de la pieza. */
  songTitle?: string;
  /** Subtítulo (arreglo). */
  arrangement?: string;
  /** Compás actual/total. */
  measure?: string;
}
