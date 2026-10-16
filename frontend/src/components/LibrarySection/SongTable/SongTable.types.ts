// description: Props de la tabla de piezas de la Library.
// context: B-027.3; además de seleccionar, cada fila reproduce con el motor del piano.

import type { PreviewState, Song } from "../LibraryPage/LibraryPage.types";

export interface SongTableProps {
  songs: Song[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Estado del preview de la Library (qué suena y qué se está cargando). */
  preview: PreviewState;
  /** Reproduce o pausa la pieza de la fila sin salir de la lista. */
  onPlay: (song: Song) => void;
}
