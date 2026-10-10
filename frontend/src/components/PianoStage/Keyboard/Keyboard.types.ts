// description: Props del teclado (envoltorio temporal del existente).
// context: B-006.4; B-007 construye aquí el teclado C1–C6 real.

import type { ReactNode } from "react";

export interface KeyboardProps {
  /** Contenido a mostrar en lugar del teclado temporal. */
  children?: ReactNode;
}
