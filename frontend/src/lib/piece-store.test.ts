// description: Tests del almacén de la pieza que suena en el piano.
// context: B-027.3; es el canal efímero entre el subidor/Library y el piano.

import { beforeEach, describe, expect, it } from "vitest";

import type { PianoPiece } from "./piece-store";
import { getPianoPiece, publishPianoPiece, subscribePianoPiece } from "./piece-store";

const UPLOAD: PianoPiece = {
  kind: "upload",
  filename: "estudio.mid",
  tempo: 120,
  duration_seconds: 30,
  measures: { count: 8, starts_s: [0, 4], signatures: [[4, 4], [4, 4]], end_s: 30 },
  notes: [{ pitch: 60, start_seconds: 0, duration_seconds: 1, velocity: 80, channel: 0, track: 0 }],
  autoPlay: true,
};

const CATALOG: PianoPiece = {
  kind: "catalog",
  id: "p01",
  title: "Sonata Claro de Luna",
  autoPlay: true,
};

describe("piece-store", () => {
  // El almacén es un singleton: cada test parte del mismo estado.
  beforeEach(() => {
    publishPianoPiece(null);
  });

  it("empieza sin pieza: manda la demo", () => {
    expect(getPianoPiece()).toBeNull();
  });

  it("notifica a los suscriptores cuando llega una pieza subida", () => {
    const seen: (PianoPiece | null)[] = [];
    const unsubscribe = subscribePianoPiece(() => seen.push(getPianoPiece()));

    publishPianoPiece(UPLOAD);
    unsubscribe();

    expect(seen).toEqual([UPLOAD]);
    expect(getPianoPiece()).toEqual(UPLOAD);
  });

  it("también publica una pieza del catálogo elegida en la Library", () => {
    publishPianoPiece(CATALOG);

    expect(getPianoPiece()).toEqual(CATALOG);
  });

  it("vuelve a la demo al publicar null", () => {
    publishPianoPiece(UPLOAD);
    publishPianoPiece(null);

    expect(getPianoPiece()).toBeNull();
  });

  it("no notifica si la pieza publicada es la vigente", () => {
    publishPianoPiece(UPLOAD);
    let calls = 0;
    const unsubscribe = subscribePianoPiece(() => {
      calls += 1;
    });

    publishPianoPiece(UPLOAD);
    unsubscribe();

    expect(calls).toBe(0);
  });

  it("deja de notificar tras darse de baja", () => {
    let calls = 0;
    const unsubscribe = subscribePianoPiece(() => {
      calls += 1;
    });
    unsubscribe();

    publishPianoPiece(UPLOAD);

    expect(calls).toBe(0);
    expect(getPianoPiece()).toEqual(UPLOAD);
  });
});
