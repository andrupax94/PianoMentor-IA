// description: Tipos de la Library, reexportados desde la lógica pura (B-027.3).
// context: Los componentes importan de aquí; el modelo vive en src/lib/library.ts.

export type {
  Difficulty,
  DifficultyFilter,
  DurationFilter,
  LibraryFilters,
  Song,
  SongFilter,
  SongStatus,
  SortDirection,
  SortField,
  SortState,
  TempoFilter,
} from "../../../lib/library";

/** Estado del preview propio de la Library, que reutiliza el motor del piano. */
export interface PreviewState {
  /** Pieza cargada en el transporte; null si ninguna. */
  id: string | null;
  /** true mientras suena la pieza cargada. */
  playing: boolean;
  /** Pieza cuya partitura se está pidiendo; null si ninguna. */
  loadingId: string | null;
}
