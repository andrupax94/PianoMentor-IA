import type {
  DifficultyFilter,
  DurationFilter,
  LibraryFilters,
  SongFilter,
  SortKey,
  TempoFilter,
} from "../LibraryPage/LibraryPage.types";

export interface LibraryToolbarProps {
  /** Búsqueda y filtros activos de la tabla. */
  filters: LibraryFilters;
  /** Orden actual de la lista. */
  sort: SortKey;
  /** Aplica un cambio parcial sobre los filtros (sin tocar el resto). */
  onFiltersChange: (patch: Partial<LibraryFilters>) => void;
  /** Cambia el orden de la lista. */
  onSortChange: (value: SortKey) => void;
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

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Orden: catálogo" },
  { value: "title", label: "Título (A–Z)" },
  { value: "composer", label: "Compositor (A–Z)" },
  { value: "difficulty", label: "Dificultad" },
  { value: "duration-asc", label: "Duración (menor)" },
  { value: "duration-desc", label: "Duración (mayor)" },
];
