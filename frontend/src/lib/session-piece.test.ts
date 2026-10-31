// description: Tests de la pieza de la sesión (B-032.1): publicación al practicar, pieza que representa a la sesión, comparación por id, reconciliación idempotente (no recarga la partitura si ya está), cambio de pieza y no duplicar publicación si dos mensajes de estado coinciden.
// context: Criterio de B-032.1; se ejecutan con `npm run test` (Vitest) sin DOM, contra el almacén real de piece-store (se vacía después de cada test).

import { afterEach, describe, expect, it, vi } from "vitest";

import { getPianoPiece, publishPianoPiece, subscribePianoPiece } from "./piece-store";
import {
  isPieceOfSession,
  pieceForSession,
  publishPracticePiece,
  syncSessionPiece,
  type SessionPieceResolver,
} from "./session-piece";

afterEach(() => {
  // `null` es la forma documentada de volver a la demo: deja el almacén limpio.
  publishPianoPiece(null);
});

/** Resolvedor controlado a mano: la promesa se resuelve cuando el test quiere. */
function deferredResolver(): {
  resolve: SessionPieceResolver;
  settle: (info: { title: string; cover: string | null }) => void;
} {
  let settle!: (info: { title: string; cover: string | null }) => void;
  const promise = new Promise<{ title: string; cover: string | null }>((done) => {
    settle = done;
  });
  return { resolve: () => promise, settle };
}

describe("pieceForSession", () => {
  it("publica la pieza del catálogo cargada y parada", () => {
    expect(pieceForSession("p16", { title: "Pieza de práctica", cover: "/c.jpg" })).toEqual({
      kind: "catalog",
      id: "p16",
      title: "Pieza de práctica",
      cover: "/c.jpg",
      autoPlay: false,
    });
  });
});

describe("isPieceOfSession", () => {
  it("compara por id y tipo, no por referencia", () => {
    const piece = pieceForSession("p16", { title: "Pieza de práctica", cover: null });

    expect(isPieceOfSession(piece, "p16")).toBe(true);
    expect(isPieceOfSession({ ...piece }, "p16")).toBe(true);
    expect(isPieceOfSession(piece, "p17")).toBe(false);
    expect(isPieceOfSession(null, "p16")).toBe(false);
  });

  it("una partitura subida a mano no representa a la sesión", () => {
    expect(
      isPieceOfSession(
        {
          kind: "upload",
          filename: "mia.mid",
          tempo: 120,
          duration_seconds: 10,
          measures: null,
          notes: [],
        },
        "p16",
      ),
    ).toBe(false);
  });
});

describe("publishPracticePiece", () => {
  it("manda la pieza de la Library al piano sin arrancarla", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePianoPiece(listener);

    publishPracticePiece({ id: "p16", title: "Pieza de práctica", cover: "/c.jpg" });

    expect(getPianoPiece()).toEqual({
      kind: "catalog",
      id: "p16",
      title: "Pieza de práctica",
      cover: "/c.jpg",
      autoPlay: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("syncSessionPiece", () => {
  it("publica la pieza de la sesión con el título y la portada resueltos", async () => {
    const resolve = vi.fn(async () => ({ title: "Pieza de práctica", cover: "/c.jpg" }));

    const published = await syncSessionPiece("p16", resolve);

    expect(published).toBe(true);
    expect(resolve).toHaveBeenCalledWith("p16");
    expect(getPianoPiece()).toEqual({
      kind: "catalog",
      id: "p16",
      title: "Pieza de práctica",
      cover: "/c.jpg",
      autoPlay: false,
    });
  });

  it("no consulta ni republica si el almacén ya tiene la pieza de la sesión", async () => {
    const already = pieceForSession("p16", { title: "Pieza de práctica", cover: null });
    publishPianoPiece(already);
    const resolve = vi.fn(async () => ({ title: "Otro título", cover: null }));

    const published = await syncSessionPiece("p16", resolve);

    expect(published).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    // La misma referencia: PlaybackArea no recarga la partitura.
    expect(getPianoPiece()).toBe(already);
  });

  it("reemplaza otra pieza (la demo o la última elegida) por la de la sesión", async () => {
    publishPianoPiece(pieceForSession("p17", { title: "Sinfonía n.º 5", cover: null }));

    const published = await syncSessionPiece("p16", async () => ({
      title: "Pieza de práctica",
      cover: null,
    }));

    expect(published).toBe(true);
    expect(getPianoPiece()).toMatchObject({ id: "p16", autoPlay: false });
  });

  it("no publica dos veces si el almacén se llena mientras se resuelve el título", async () => {
    const { resolve, settle } = deferredResolver();
    const listener = vi.fn();
    const unsubscribe = subscribePianoPiece(listener);

    const pending = syncSessionPiece("p16", resolve);
    // Llega otro mensaje de estado y resuelve antes: la pieza ya está puesta.
    const winner = pieceForSession("p16", { title: "Pieza de práctica", cover: null });
    publishPianoPiece(winner);
    settle({ title: "Pieza de práctica", cover: null });

    await expect(pending).resolves.toBe(false);
    expect(getPianoPiece()).toBe(winner);
    // Solo avisó la publicación del test, no una segunda desde la reconciliación.
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
