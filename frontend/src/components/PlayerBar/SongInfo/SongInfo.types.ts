// description: Props de la información de la pieza (portada y título).
// context: B-006.4; el título es obligatorio porque debe nombrar la pieza que suena.

export interface SongInfoProps {
  /** Título de la pieza que suena. */
  title: string;
  /** Portada pública de esa pieza; null u omitida → glifo de reserva. */
  cover?: string | null;
  /** Subtítulo: el AUTOR de la pieza; null u omitido → no se pinta la línea. */
  subtitle?: string | null;
}
