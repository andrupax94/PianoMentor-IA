// description: Props del contenedor del piano completo.
// context: B-007.3; el transporte nace en PlaybackArea y llega por props, porque la
// cuadrícula y el teclado son hermanos y comparten la misma posición.

import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PianoStageProps {
  /** Transporte del escenario: posición, estado y acciones del reproductor. */
  player: PlaybackHandle;
  /** Octavas mostradas en la cuadrícula. */
  octaves?: string[];
}
