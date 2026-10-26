// description: Posiciones del switch del mentor (MentorMode) y la prop mode.
// context: B-006.4; D-002.3 amplia el union de tres modos a las cuatro manos del switch. Los contratos de comportamiento los decide B-012.

export type MentorMode = "observar" | "izquierda" | "dos" | "derecha";

export interface ModeSelectorProps {
  /** Estado inicial del switch; tras montar, el estado es interno (cosmético, D-002.3). */
  mode?: MentorMode;
}
