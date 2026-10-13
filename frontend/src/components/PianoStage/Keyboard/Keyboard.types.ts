// description: Props del teclado del escenario.
// context: B-007.3; el transporte lo reparte PianoStage porque el NoteFallGrid
// comparte la misma fuente de verdad temporal. B-007.4 decide si children sigue
// como vía de inyección.

import type { ReactNode } from "react";

import type { ScheduledEvent } from "../../../lib/playback-schedule";
import type { PlaybackHandle } from "../../../lib/usePlayback";

export interface KeyboardProps {
  /** Transporte del escenario: audición del teclado del PC y estado para el resaltado. */
  player: PlaybackHandle;
  /** Notas reproducibles ya escaladas por el factor de tempo. */
  schedule: ScheduledEvent[];
  /** Contenido a mostrar en lugar del teclado (inyección puntual). */
  children?: ReactNode;
}
