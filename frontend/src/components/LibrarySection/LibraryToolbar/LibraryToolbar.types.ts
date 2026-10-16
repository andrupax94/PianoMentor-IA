import type { SongFilter } from "../LibraryPage/LibraryPage.types";

export interface LibraryToolbarProps {
  query: string;
  filter: SongFilter;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: SongFilter) => void;
}

export const FILTER_OPTIONS: { value: SongFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "in-progress", label: "En progreso" },
  { value: "mastered", label: "Dominadas" },
];
