// description: Adapta el catálogo de la API (PieceSummary) al modelo de la Library (B-027.3).
// context: Lógica pura y testeable; los componentes solo pintan el resultado.

import type { PieceCatalogItem } from "./api-client";

/** Dificultad normalizada del diseño; el catálogo la sirve en español. */
export type Difficulty = "beginner" | "intermediate" | "advanced";

/** Estado de estudio de una pieza; sin sesiones evaluadas (B-012) todo es "new". */
export type SongStatus = "new" | "in-progress" | "mastered";

/** Filtro visible de la tabla. */
export type SongFilter = "all" | "in-progress" | "mastered";

/** Una pieza tal como la pinta la Library. */
export interface Song {
  id: string;
  title: string;
  /** Opus o subtítulo; cadena vacía si el catálogo no lo trae. */
  subtitle: string;
  composer: string;
  /** Iniciales de reserva cuando la pieza no tiene portada. */
  initials: string;
  /** Ruta pública de la portada, o null. */
  cover: string | null;
  /** null cuando el catálogo no marca dificultad (subidas). */
  difficulty: Difficulty | null;
  /** Duración ya formateada ("3:10") o "--". */
  duration: string;
  /** Duración en segundos; null cuando el catálogo no la trae. */
  durationSeconds: number | null;
  /** Tempo en BPM redondeado, o null. */
  bpm: number | null;
  /** Mejor puntaje 0-100; null hasta que existan evaluaciones (B-014). */
  bestScore: number | null;
  status: SongStatus;
  /** Precisión rítmica 0-100; null hasta que existan evaluaciones. */
  timing: number | null;
  /** Precisión de notas 0-100; null hasta que existan evaluaciones. */
  notes: number | null;
}

const DIFFICULTY_BY_CATALOG: Record<string, Difficulty> = {
  principiante: "beginner",
  intermedio: "intermediate",
  avanzado: "advanced",
};

/** Iniciales a partir de las dos primeras palabras del título. */
export function initialsFromTitle(title: string): string {
  const words = title.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase());
  return initials.join("") || "?";
}

/** Segundos a "m:ss"; "--" para valores ausentes o no positivos. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Traduce una pieza del catálogo al modelo de la Library. */
export function toSong(item: PieceCatalogItem): Song {
  const title = item.title ?? item.id;
  const difficulty = item.difficulty ? DIFFICULTY_BY_CATALOG[item.difficulty] : undefined;
  return {
    id: item.id,
    title,
    subtitle: item.opus ?? "",
    composer: item.composer ?? "Anónimo",
    initials: initialsFromTitle(title),
    cover: item.cover,
    difficulty: difficulty ?? null,
    duration: formatDuration(item.duration_seconds),
    durationSeconds: item.duration_seconds ?? null,
    bpm: item.tempo === null ? null : Math.round(item.tempo),
    // Los campos de rendimiento llegan con las evaluaciones (B-014).
    bestScore: null,
    status: "new",
    timing: null,
    notes: null,
  };
}

/** Traduce la lista completa del catálogo. */
export function toSongs(items: PieceCatalogItem[]): Song[] {
  return items.map(toSong);
}

/** Una página de la tabla y el total de páginas resultante. */
export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** Trocea `all` en páginas de `pageSize`, recortando la página pedida al rango válido. */
export function paginate<T>(all: T[], page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page)), totalPages);
  const start = (current - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page: current, totalPages };
}

/** Segundos por debajo de los cuales una pieza es "corta" y por encima de los cuales es "larga". */
export const SHORT_MAX_SECONDS = 60;
export const LONG_MIN_SECONDS = 180;
/** BPM por debajo de los cuales el tempo es "lento" y a partir de los cuales es "rápido". */
export const SLOW_MAX_BPM = 80;
export const FAST_MIN_BPM = 140;

/** Filtro de dificultad; `all` lo desactiva. */
export type DifficultyFilter = Difficulty | "all";
/** Filtro de duración por tramos; `all` lo desactiva. */
export type DurationFilter = "all" | "short" | "medium" | "long";
/** Filtro de tempo por tramos; `all` lo desactiva. */
export type TempoFilter = "all" | "slow" | "medium" | "fast";
/** Campo por el que se puede ordenar la tabla (los criterios de B-012 no tienen campo). */
export type SortField = "title" | "composer" | "difficulty" | "duration" | "tempo";
/** Sentido del orden. */
export type SortDirection = "asc" | "desc";
/** Orden activo de la tabla; `null` conserva el orden del catálogo. */
export interface SortState {
  field: SortField;
  direction: SortDirection;
}

/** Estado completo de la vista de la Library: búsqueda, filtros y orden. */
export interface LibraryFilters {
  query: string;
  status: SongFilter;
  difficulty: DifficultyFilter;
  duration: DurationFilter;
  tempo: TempoFilter;
}

/** Vista sin ningún filtro: punto de partida de la Library. */
export const EMPTY_FILTERS: LibraryFilters = {
  query: "",
  status: "all",
  difficulty: "all",
  duration: "all",
  tempo: "all",
};

const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

function inDurationBucket(seconds: number | null, bucket: DurationFilter): boolean {
  if (bucket === "all") return true;
  if (seconds === null) return false;
  if (bucket === "short") return seconds < SHORT_MAX_SECONDS;
  if (bucket === "medium") return seconds >= SHORT_MAX_SECONDS && seconds < LONG_MIN_SECONDS;
  return seconds >= LONG_MIN_SECONDS;
}

function inTempoBucket(bpm: number | null, bucket: TempoFilter): boolean {
  if (bucket === "all") return true;
  if (bpm === null) return false;
  if (bucket === "slow") return bpm < SLOW_MAX_BPM;
  if (bucket === "medium") return bpm >= SLOW_MAX_BPM && bpm < FAST_MIN_BPM;
  return bpm >= FAST_MIN_BPM;
}

function matchesQuery(song: Song, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return song.title.toLowerCase().includes(q) || song.composer.toLowerCase().includes(q);
}

/** ¿La pieza pasa todos los filtros activos? (búsqueda, estado, dificultad, duración y tempo). */
export function matchesFilters(song: Song, filters: LibraryFilters): boolean {
  return (
    (filters.status === "all" || song.status === filters.status) &&
    (filters.difficulty === "all" || song.difficulty === filters.difficulty) &&
    inDurationBucket(song.durationSeconds, filters.duration) &&
    inTempoBucket(song.bpm, filters.tempo) &&
    matchesQuery(song, filters.query)
  );
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

/** Compara números con los huecos (null) al final, en cualquier dirección. */
function compareNullable(one: number | null, other: number | null, direction: 1 | -1): number {
  if (one === null && other === null) return 0;
  if (one === null) return 1;
  if (other === null) return -1;
  return (one - other) * direction;
}

const difficultyRank = (song: Song): number | null =>
  song.difficulty === null ? null : DIFFICULTY_ORDER[song.difficulty];

function compareBy(sort: SortState, a: Song, b: Song): number {
  const dir: 1 | -1 = sort.direction === "asc" ? 1 : -1;
  switch (sort.field) {
    case "title":
      return compareText(a.title, b.title) * dir;
    case "composer":
      // El compositor manda; los empates se deshacen por título ascendente.
      return compareText(a.composer, b.composer) * dir || compareText(a.title, b.title);
    case "difficulty":
      return (
        compareNullable(difficultyRank(a), difficultyRank(b), dir) || compareText(a.title, b.title)
      );
    case "duration":
      return (
        compareNullable(a.durationSeconds, b.durationSeconds, dir) || compareText(a.title, b.title)
      );
    case "tempo":
      return compareNullable(a.bpm, b.bpm, dir) || compareText(a.title, b.title);
  }
}

/** Devuelve una copia ordenada de `songs`; `null` no toca el orden del catálogo. */
export function sortSongs(songs: Song[], sort: SortState | null): Song[] {
  const sorted = [...songs];
  if (sort) {
    sorted.sort((a, b) => compareBy(sort, a, b));
  }
  return sorted;
}

/**
 * Orden resultante de pulsar la cabecera de una columna: la primera vez ordena
 * descendente y, si ya era la columna activa, alterna el sentido.
 */
export function toggleSort(current: SortState | null, field: SortField): SortState {
  if (current && current.field === field) {
    return { field, direction: current.direction === "desc" ? "asc" : "desc" };
  }
  return { field, direction: "desc" };
}

