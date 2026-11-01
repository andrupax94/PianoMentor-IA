// description: Props del selector de modo de práctica (observar / una mano / dos manos).
// context: B-032.4; el selector se alimenta del session-store y avisa del cambio a quien lo publica en el backend. Solo aparece con sesión activa.
import type { PracticeMode, StudentHand } from "../../../lib/api-client";

export interface PracticeModeSelectorProps {
  /** Modo vigente; null mientras la sesión no ha dicho nada. */
  mode: PracticeMode | null;
  /** Mano que practica el alumno; solo tiene sentido en `one_hand`. */
  hand: StudentHand;
  /** true si el agente tiene el piano: el modo queda suspendido (visible). */
  suspended?: boolean;
  /** Publica el cambio de modo (el PracticeBridge lo manda al backend). */
  onChange: (change: { mode: PracticeMode; hand: StudentHand }) => void;
}
