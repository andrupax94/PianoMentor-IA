// description: Props del contenedor del piano completo.
// context: B-007.3/B-012.7/B-032.2; el transporte nace en TransportProvider (layout) y PlaybackArea lo reparte por props, porque la cuadrícula y el teclado son hermanos y comparten la misma posición. `agentHand` tiñe la mano de la IA.

import type { AgentHand } from "../../lib/hand-color";
import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PianoStageProps {
  /** Transporte del escenario: posición, estado y acciones del reproductor. */
  player: PlaybackHandle;
  /** Octavas mostradas en la cuadrícula. */
  octaves?: string[];
  /** Mano que toca la IA durante el acompañamiento (B-012.7); se pinta en otro color. */
  agentHand?: AgentHand | null;
}
