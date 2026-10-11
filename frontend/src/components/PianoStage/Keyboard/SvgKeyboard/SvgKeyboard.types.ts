// description: Props del teclado SVG con ventana visible y resaltado.
// context: B-007.1 ventana; B-007.2 estados sonando/esperada/tocada.

export interface SvgKeyboardProps {
  /** Id de tecla inicial visible (por defecto C1 del diseño). */
  fromKey?: string;
  /** Id de tecla final visible (por defecto C6 del diseño). */
  toKey?: string;
  /** Ids con aspecto pressed (sonando o tocadas). */
  activeIds?: string[];
  /** Ids con acento de nota esperada. */
  expectedIds?: string[];
  /** Mapa id de tecla → letra del PC a mostrar sobre la tecla. */
  labels?: Record<string, string>;
}
