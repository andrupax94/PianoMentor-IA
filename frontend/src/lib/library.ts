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
