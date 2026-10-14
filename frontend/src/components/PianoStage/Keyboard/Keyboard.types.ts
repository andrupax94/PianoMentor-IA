// description: Props del teclado del escenario.
// context: B-007.4; el transporte lo reparte PianoStage porque el NoteFallGrid
// comparte la misma fuente de verdad temporal. Sin vía de inyección: el teclado
// real sustituyó al placeholder y pinta su propio SvgKeyboard.

import type { ScheduledEvent } from "../../../lib/playback-schedule";
import type { PlaybackHandle } from "../../../lib/usePlayback";

export interface KeyboardProps {
  /** Transporte del escenario: audición del teclado del PC y estado para el resaltado. */
  player: PlaybackHandle;
  /** Notas reproducibles ya escaladas por el factor de tempo. */
  schedule: ScheduledEvent[];
}
