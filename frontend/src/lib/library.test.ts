// description: Tests del mapeo catálogo → Library y de la paginación (B-027.3).
// context: Lógica pura sin React; no hay testing-library en el proyecto.

import { describe, expect, it } from "vitest";

import type { PieceCatalogItem } from "./api-client";
import { formatDuration, initialsFromTitle, paginate, toSong, toSongs } from "./library";

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
