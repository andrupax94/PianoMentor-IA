// description: Tests del almacén de la pieza subida a mano.
// context: B-027.3; es el canal efímero entre el subidor y el piano.

import { beforeEach, describe, expect, it } from "vitest";

import type { UploadedPiece } from "./piece-store";
import { getUploadedPiece, publishUploadedPiece, subscribeUploadedPiece } from "./piece-store";

const PIECE: UploadedPiece = {
  filename: "estudio.mid",
  tempo: 120,
  duration_seconds: 30,
  measures: { count: 8, starts_s: [0, 4], signatures: [[4, 4], [4, 4]], end_s: 30 },
  notes: [{ pitch: 60, start_seconds: 0, duration_seconds: 1, velocity: 80, channel: 0, track: 0 }],
};

describe("piece-store", () => {
  // El almacén es un singleton: cada test parte del mismo estado.
  beforeEach(() => {
    publishUploadedPiece(null);
  });

  it("empieza sin pieza: manda la demo", () => {
    expect(getUploadedPiece()).toBeNull();
  });

  it("notifica a los suscriptores cuando llega una pieza", () => {
    const seen: (UploadedPiece | null)[] = [];
    const unsubscribe = subscribeUploadedPiece(() => seen.push(getUploadedPiece()));

    publishUploadedPiece(PIECE);
    unsubscribe();

    expect(seen).toEqual([PIECE]);
    expect(getUploadedPiece()).toEqual(PIECE);
  });

  it("vuelve a la demo al publicar null", () => {
    publishUploadedPiece(PIECE);
    publishUploadedPiece(null);

    expect(getUploadedPiece()).toBeNull();
  });

  it("no notifica si la pieza publicada es la vigente", () => {
    publishUploadedPiece(PIECE);
    let calls = 0;
    const unsubscribe = subscribeUploadedPiece(() => {
      calls += 1;
    });

    publishUploadedPiece(PIECE);
    unsubscribe();

    expect(calls).toBe(0);
  });

  it("deja de notificar tras darse de baja", () => {
    let calls = 0;
    const unsubscribe = subscribeUploadedPiece(() => {
      calls += 1;
    });
    unsubscribe();

    publishUploadedPiece(PIECE);

    expect(calls).toBe(0);
    expect(getUploadedPiece()).toEqual(PIECE);
  });
});
