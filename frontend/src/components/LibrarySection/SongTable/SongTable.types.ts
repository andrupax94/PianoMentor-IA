// description: Props de la tabla de piezas de la Library.
// context: B-027.3/B-027.4; además de seleccionar, cada fila reproduce con el motor del piano
// y las cabeceras ordenan (B-027.4).

import type { PreviewState, Song, SortField, SortState } from "../LibraryPage/LibraryPage.types";

export interface SongTableProps {
  songs: Song[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Estado del preview de la Library (qué suena y qué se está cargando). */
  preview: PreviewState;
  /** Reproduce o pausa la pieza de la fila sin salir de la lista. */
  onPlay: (song: Song) => void;
  /** Orden activo; null = orden del catálogo. */
  sort: SortState | null;
  /** Pulsa una cabecera ordenable: cambia de campo o alterna el sentido. */
  onSort: (field: SortField) => void;
}

/** Columna de la tabla; `field` solo lo tienen las ordenables (las de B-012 no). */
export interface SongColumn {
  key: string;
  label: string;
  field?: SortField;
}

/**
 * Cabeceras en orden. "Mejor puntaje" y "Estado" quedan **sin ordenar** a
 * propósito: sus datos llegan con la evaluación y los estados (B-012/B-014).
 */
export const SONG_COLUMNS: SongColumn[] = [
  { key: "index", label: "#" },
  { key: "song", label: "Canción", field: "title" },
  { key: "composer", label: "Compositor", field: "composer" },
  { key: "difficulty", label: "Dificultad", field: "difficulty" },
  { key: "duration", label: "Duración", field: "duration" },
  { key: "tempo", label: "Tempo", field: "tempo" },
  { key: "score", label: "Mejor puntaje" },
  { key: "status", label: "Estado" },
  { key: "actions", label: "" },
];
