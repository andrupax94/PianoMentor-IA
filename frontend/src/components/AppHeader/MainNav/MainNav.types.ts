// description: Props de la navegación principal.
// context: B-006.4; solo Learn está activa en el diseño.

export interface MainNavProps {
  /** Sección activa. */
  active?: "learn" | "library" | "progress" | "settings";
}
