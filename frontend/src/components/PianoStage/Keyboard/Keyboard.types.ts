// description: Props del teclado del escenario.
// context: B-007.4; el transporte lo reparte PianoStage porque el NoteFallGrid
// comparte la misma fuente de verdad temporal. Sin vía de inyección: el teclado
// real sustituyó al placeholder y pinta su propio SvgKeyboard. Desde B-032.9 el
// schedule para las sombras lo compone el propio teclado según el modo (el
// audible que suena de verdad), así que ya no viaja por props.

import type { PlaybackHandle } from "../../../lib/usePlayback";

export interface KeyboardProps {
  /** Transporte del escenario: audición del teclado del PC y estado para el resaltado. */
  player: PlaybackHandle;
}
