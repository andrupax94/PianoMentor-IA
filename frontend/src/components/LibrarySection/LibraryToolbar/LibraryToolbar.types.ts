import type {
  DifficultyFilter,
  DurationFilter,
  LibraryFilters,
  SongFilter,
  SortState,
  TempoFilter,
} from "../LibraryPage/LibraryPage.types";

export interface LibraryToolbarProps {
  /** Búsqueda y filtros activos de la tabla. */
  filters: LibraryFilters;
  /** Orden activo; null = orden del catálogo. */
  sort: SortState | null;
  /** Aplica un cambio parcial sobre los filtros (sin tocar el resto). */
  onFiltersChange: (patch: Partial<LibraryFilters>) => void;
  /** Cambia el orden; null lo devuelve al del catálogo. */
  onSortChange: (value: SortState | null) => void;
}

export const STATUS_OPTIONS: { value: SongFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "in-progress", label: "En progreso" },
  { value: "mastered", label: "Dominadas" },
];

export const DIFFICULTY_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: "all", label: "Dificultad: todas" },
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];

export const DURATION_OPTIONS: { value: DurationFilter; label: string }[] = [
  { value: "all", label: "Duración: todas" },
  { value: "short", label: "Corta (< 1 min)" },
  { value: "medium", label: "Media (1–3 min)" },
  { value: "long", label: "Larga (≥ 3 min)" },
];

export const TEMPO_OPTIONS: { value: TempoFilter; label: string }[] = [
  { value: "all", label: "Tempo: todos" },
  { value: "slow", label: "Lento (< 80 BPM)" },
  { value: "medium", label: "Medio (80–140 BPM)" },
  { value: "fast", label: "Rápido (≥ 140 BPM)" },
];

/** Opción del desplegable de orden: valor de cadena para el `<select>` y el orden real. */
export interface SortOption {
  value: string;
  label: string;
  sort: SortState | null;
}

/** Las flechas ↑/↓ son las mismas que pinta la cabecera de la tabla. */
export const SORT_OPTIONS: SortOption[] = [
  { value: "default", label: "Orden: catálogo", sort: null },
  { value: "title:asc", label: "Título ↑", sort: { field: "title", direction: "asc" } },
  { value: "title:desc", label: "Título ↓", sort: { field: "title", direction: "desc" } },
  { value: "composer:asc", label: "Compositor ↑", sort: { field: "composer", direction: "asc" } },
  { value: "composer:desc", label: "Compositor ↓", sort: { field: "composer", direction: "desc" } },
  {
    value: "difficulty:asc",
    label: "Dificultad ↑",
    sort: { field: "difficulty", direction: "asc" },
  },
  {
    value: "difficulty:desc",
    label: "Dificultad ↓",
    sort: { field: "difficulty", direction: "desc" },
  },
  { value: "duration:asc", label: "Duración ↑", sort: { field: "duration", direction: "asc" } },
  { value: "duration:desc", label: "Duración ↓", sort: { field: "duration", direction: "desc" } },
  { value: "tempo:asc", label: "Tempo ↑", sort: { field: "tempo", direction: "asc" } },
  { value: "tempo:desc", label: "Tempo ↓", sort: { field: "tempo", direction: "desc" } },
];

/** Clave del desplegable que corresponde a un orden (o "default" si no hay). */
export function sortOptionValue(sort: SortState | null): string {
  return sort ? `${sort.field}:${sort.direction}` : "default";
}
