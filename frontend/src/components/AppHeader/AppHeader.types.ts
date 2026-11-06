// description: Props del encabezado principal de la aplicación.
// context: B-006.4; cableado real en B-007.

import type { NavSection } from "./MainNav/MainNav.types";

export interface AppHeaderProps {
  /** Inicial del avatar de usuario. */
  userInitial?: string;
  /** Sección activa del nav; Learn por defecto. */
  active?: NavSection;
}
