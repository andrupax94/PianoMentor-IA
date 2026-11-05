// description: Tipos de las props del subcontenedor de pestañas del mentor.
// context: B-012.8 / UI del mentor. B-032.10 añade visibleTabs: sin sesión solo «Carga pieza» y con sesión solo «Rendimiento» (decisión del usuario).

import type { MentorTabId } from "../../../lib/mentor-tab-events";

export interface MentorTabsProps {
  /** Punto débil que se muestra en la pestaña de rendimiento. */
  weakPoint?: string;
  /** Pestañas visibles; por defecto todas (retrocompatibilidad). */
  visibleTabs?: MentorTabId[];
}
