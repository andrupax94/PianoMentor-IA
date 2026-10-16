// description: Props de la navegación principal.
// context: B-006.4; desde B-027.3 Learn y Library navegan de verdad.

/** Secciones del nav principal; Progress y Settings aún no tienen pantalla. */
export type NavSection = "learn" | "library" | "progress" | "settings";

export interface MainNavProps {
  /** Sección activa. */
  active?: NavSection;
}
