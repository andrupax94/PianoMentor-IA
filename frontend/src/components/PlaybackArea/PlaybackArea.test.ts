// description: Tests de coverForPiece: qué portada anuncia la barra según la pieza vigente.
// context: Criterio del arreglo de SongInfo; sin DOM, igual que AgentDock: se prueba la decisión pura (demo, catálogo o subida), con el stub del SVG pesado de turno.

import { describe, expect, it, vi } from "vitest";

// El SVG generado con SVGR pesa ~57 KB y su parse es el foco de un fallo
// intermitente del analizador de imports bajo workers; este test solo
// comprueba la decisión pura de la portada, así que se sustituye por un stub
// (mismo motivo y misma fórmula que component-tree.test.ts).
vi.mock("../PianoStage/Keyboard/SvgKeyboard/PianoVirtual88Pressed", () => ({
  default: () => null,
}));

import type { PianoPiece } from "../../lib/piece-store";
import { coverForPiece } from "./PlaybackArea";

describe("coverForPiece", () => {
  it("sin pieza elegida anuncia la portada de la demo (p17 del catálogo)", () => {
    expect(coverForPiece(null)).toBe("/assets/covers/beethoven.jpg");
  });

  it("una pieza del catálogo lleva su portada a la barra", () => {
    const piece: PianoPiece = {
      kind: "catalog",
      id: "p01",
      title: "Minueto en Sol",
      cover: "/assets/covers/bach.jpg",
      autoPlay: true,
    };

    expect(coverForPiece(piece)).toBe("/assets/covers/bach.jpg");
  });

  it("una pieza del catálogo sin portada en su ficha tampoco lleva ninguna", () => {
    const piece: PianoPiece = {
      kind: "catalog",
      id: "p09",
      title: "Sin retrato",
      cover: null,
    };

    expect(coverForPiece(piece)).toBeNull();
  });

  it("una subida no tiene portada: la barra reserva su glifo", () => {
    const piece: PianoPiece = {
      kind: "upload",
      filename: "estudio.mid",
      tempo: null,
      duration_seconds: null,
      measures: null,
      notes: [],
    };

    expect(coverForPiece(piece)).toBeNull();
  });
});
