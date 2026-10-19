// description: Props de la información de la pieza (portada y título).
// context: B-006.4; el título es obligatorio porque debe nombrar la pieza que suena.

export interface SongInfoProps {
  /** Título de la pieza que suena. */
  title: string;
  /** Subtítulo (arreglo). */
  subtitle?: string;
}
