// description: Props de la franja superior del área izquierda.
// context: B-006.4; valores de ejemplo del diseño como constantes.

export interface PlayerBarProps {
  /** Título de la pieza. */
  songTitle?: string;
  /** Subtítulo (arreglo). */
  arrangement?: string;
  /** Tempo en BPM (null = desconocido). */
  tempoBpm?: number | null;
  /** Compás actual/total. */
  measure?: string;
  /** Progreso de 0 a 100. */
  progress?: number;
}
