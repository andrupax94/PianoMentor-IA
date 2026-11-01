// description: Props de la franja superior del área izquierda.
// context: B-007.3/B-008.3; el transporte llega por props y expone la rejilla de
// compases. El título es obligatorio: lo decide PlaybackArea según la pieza cargada.

import type { PracticeMode, StudentHand } from "../../lib/api-client";
import type { PlaybackHandle } from "../../lib/usePlayback";

export interface PlayerBarProps {
  /** Transporte del escenario: controles, posición, tempo, rejilla y estado. */
  player: PlaybackHandle;
  /** Título de la pieza que suena (la demo o la elegida). */
  songTitle: string;
  /** Portada pública de esa misma pieza; null → SongInfo dibuja su glifo. */
  songCover: string | null;
  /** Subtítulo (arreglo). */
  arrangement?: string;
  /**
   * Modo de práctica vigente (B-032.4); null = sin sesión, y entonces el
   * selector no se pinta.
   */
  practiceMode?: PracticeMode | null;
  /** Mano que practica el alumno (B-032.4). */
  studentHand?: StudentHand;
  /** true si el agente tiene el piano: el selector queda suspendido. */
  practiceSuspended?: boolean;
  /** Publica el cambio de modo o de mano (B-032.4). */
  onPracticeModeChange?: (change: { mode: PracticeMode; hand: StudentHand }) => void;
}
