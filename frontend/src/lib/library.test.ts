// description: Tests del mapeo catálogo → Library y de la paginación (B-027.3).
// context: Lógica pura sin React; no hay testing-library en el proyecto.

import { describe, expect, it } from "vitest";

import type { PieceCatalogItem } from "./api-client";
import {
  EMPTY_FILTERS,
  formatDuration,
  initialsFromTitle,
  matchesFilters,
  paginate,
  sortSongs,
  toSong,
  toSongs,
  type LibraryFilters,
  type Song,
} from "./library";

const CORPUS_PIECE: PieceCatalogItem = {
  id: "p01",
  title: "Minuet in G major",
  composer: "Johann Sebastian Bach",
  opus: "BWV Anh. 114",
  difficulty: "principiante",
  license: "Public Domain",
  cover: "/assets/covers/bach.jpg",
  source: "corpus",
  duration_seconds: 41.1,
  tempo: 120.4,
  notes_count: 204,
  tracks: 3,
};

const UPLOAD_PIECE: PieceCatalogItem = {
  id: "abc123",
  title: null,
  composer: null,
  opus: null,
  difficulty: null,
  license: null,
  cover: null,
  source: "upload",
  duration_seconds: null,
  tempo: null,
  notes_count: null,
  tracks: 1,
};

describe("formatDuration", () => {
  it("formatea segundos como m:ss y redondea", () => {
    expect(formatDuration(41.1)).toBe("0:41");
    expect(formatDuration(140)).toBe("2:20");
    expect(formatDuration(59.6)).toBe("1:00");
  });

  it("devuelve -- para ausentes o no positivos", () => {
    expect(formatDuration(null)).toBe("--");
    expect(formatDuration(0)).toBe("--");
    expect(formatDuration(-3)).toBe("--");
  });
});

describe("initialsFromTitle", () => {
  it("usa las dos primeras palabras con contenido", () => {
    expect(initialsFromTitle("Minuet in G major")).toBe("MI");
    expect(initialsFromTitle("Prelude")).toBe("P");
  });

  it("cae a ? sin palabras válidas", () => {
    expect(initialsFromTitle("   ")).toBe("?");
  });
});

describe("toSong", () => {
  it("mapea una pieza del corpus con su portada y dificultad", () => {
    const song = toSong(CORPUS_PIECE);

    expect(song.id).toBe("p01");
    expect(song.title).toBe("Minuet in G major");
    expect(song.subtitle).toBe("BWV Anh. 114");
    expect(song.composer).toBe("Johann Sebastian Bach");
    expect(song.cover).toBe("/assets/covers/bach.jpg");
    expect(song.difficulty).toBe("beginner");
    expect(song.duration).toBe("0:41");
    expect(song.durationSeconds).toBe(41.1);
    expect(song.bpm).toBe(120);
  });

  it("deja el rendimiento pendiente hasta que haya evaluaciones", () => {
    const song = toSong(CORPUS_PIECE);

    expect(song.status).toBe("new");
    expect(song.bestScore).toBeNull();
    expect(song.timing).toBeNull();
    expect(song.notes).toBeNull();
  });

  it("resuelve una subida sin metadatos", () => {
    const song = toSong(UPLOAD_PIECE);

    expect(song.title).toBe("abc123");
    expect(song.composer).toBe("Anónimo");
    expect(song.cover).toBeNull();
    expect(song.difficulty).toBeNull();
    expect(song.duration).toBe("--");
    expect(song.durationSeconds).toBeNull();
    expect(song.bpm).toBeNull();
  });

  it("toSongs conserva el orden del catálogo", () => {
    const songs = toSongs([CORPUS_PIECE, UPLOAD_PIECE]);

    expect(songs.map((song) => song.id)).toEqual(["p01", "abc123"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 16 }, (_, index) => index + 1);

  it("trocea en páginas del tamaño pedido", () => {
    const first = paginate(items, 1, 10);
    const second = paginate(items, 2, 10);

    expect(first.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.totalPages).toBe(2);
    expect(second.items).toEqual([11, 12, 13, 14, 15, 16]);
  });

  it("recorta páginas fuera de rango y nunca baja de una", () => {
    expect(paginate(items, 9, 10).page).toBe(2);
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate([], 3, 10)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});

/** Pieza mínima para probar filtros y orden sin pasar por el catálogo. */
function song(partial: Partial<Song>): Song {
  return {
    id: "x",
    title: "Pieza",
    subtitle: "",
    composer: "Anónimo",
    initials: "P",
    cover: null,
    difficulty: null,
    duration: "--",
    durationSeconds: null,
    bpm: null,
    bestScore: null,
    status: "new",
    timing: null,
    notes: null,
    ...partial,
  };
}

/** Filtros con los que se quiera, partiendo de "sin filtros". */
function withFilters(patch: Partial<LibraryFilters>): LibraryFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

describe("matchesFilters", () => {
  const bach = song({
    id: "p01",
    title: "Minuet in G major",
    composer: "Johann Sebastian Bach",
    difficulty: "beginner",
    durationSeconds: 41.1,
    bpm: 140,
  });

  it("deja pasar todo con los filtros vacíos", () => {
    expect(matchesFilters(bach, EMPTY_FILTERS)).toBe(true);
  });

  it("busca por título y compositor sin distinguir mayúsculas", () => {
    expect(matchesFilters(bach, withFilters({ query: "minuet" }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ query: "BACH" }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ query: "  minuet " }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ query: "chopin" }))).toBe(false);
  });

  it("filtra por dificultad", () => {
    expect(matchesFilters(bach, withFilters({ difficulty: "beginner" }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ difficulty: "advanced" }))).toBe(false);
  });

  it("reparte la duración en corta, media y larga", () => {
    expect(matchesFilters(bach, withFilters({ duration: "short" }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ duration: "medium" }))).toBe(false);

    const medium = song({ durationSeconds: 120 });
    expect(matchesFilters(medium, withFilters({ duration: "medium" }))).toBe(true);
    expect(matchesFilters(medium, withFilters({ duration: "short" }))).toBe(false);

    const long = song({ durationSeconds: 240 });
    expect(matchesFilters(long, withFilters({ duration: "long" }))).toBe(true);
    expect(matchesFilters(long, withFilters({ duration: "medium" }))).toBe(false);
  });

  it("reparte el tempo en lento, medio y rápido", () => {
    expect(matchesFilters(bach, withFilters({ tempo: "fast" }))).toBe(true);
    expect(matchesFilters(bach, withFilters({ tempo: "slow" }))).toBe(false);
    expect(matchesFilters(song({ bpm: 60 }), withFilters({ tempo: "slow" }))).toBe(true);
    expect(matchesFilters(song({ bpm: 100 }), withFilters({ tempo: "medium" }))).toBe(true);
  });

  it("excluye de los tramos las piezas sin duración o sin tempo", () => {
    const unknown = song({ durationSeconds: null, bpm: null });

    expect(matchesFilters(unknown, withFilters({ duration: "short" }))).toBe(false);
    expect(matchesFilters(unknown, withFilters({ tempo: "slow" }))).toBe(false);
    // Sin filtrar, sí pasa.
    expect(matchesFilters(unknown, EMPTY_FILTERS)).toBe(true);
  });

  it("combina estado, dificultad y búsqueda", () => {
    const mastered = song({ status: "mastered", difficulty: "advanced", title: "Nocturno" });

    expect(
      matchesFilters(mastered, withFilters({ status: "mastered", difficulty: "advanced" })),
    ).toBe(true);
    expect(
      matchesFilters(mastered, withFilters({ status: "in-progress", difficulty: "advanced" })),
    ).toBe(false);
    expect(matchesFilters(mastered, withFilters({ query: "noctur" }))).toBe(true);
  });
});

describe("sortSongs", () => {
  const zeta = song({
    id: "a",
    title: "Zeta",
    composer: "Bach",
    difficulty: "advanced",
    durationSeconds: 300,
  });
  const alfa = song({
    id: "b",
    title: "Alfa",
    composer: "Chopin",
    difficulty: "beginner",
    durationSeconds: 60,
  });
  const media = song({ id: "c", title: "Media", composer: "Bach", difficulty: null });

  it("no toca el orden del catálogo en default", () => {
    expect(sortSongs([zeta, alfa, media], "default").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("ordena por título", () => {
    expect(sortSongs([zeta, alfa, media], "title").map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("ordena por compositor y desempata por título", () => {
    expect(sortSongs([zeta, alfa, media], "composer").map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("ordena por dificultad dejando los huecos al final", () => {
    expect(sortSongs([zeta, alfa, media], "difficulty").map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("ordena por duración en las dos direcciones, con los huecos al final", () => {
    expect(sortSongs([zeta, alfa, media], "duration-asc").map((s) => s.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortSongs([zeta, alfa, media], "duration-desc").map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("no muta la lista original", () => {
    const songs = [zeta, alfa, media];

    sortSongs(songs, "title");

    expect(songs.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
