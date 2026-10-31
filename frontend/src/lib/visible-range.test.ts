// description: Tests de resolveVisibleRange (octavas responsive según ancho).
// context: B-007.2; verifica contracción en estrechos, rango base, expansión y techo.

import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, pitchSpan, resolveVisibleRange } from "./visible-range";

describe("resolveVisibleRange", () => {
  it("usa el rango por defecto con ancho inválido", () => {
    expect(resolveVisibleRange(0)).toEqual(DEFAULT_RANGE);
    expect(resolveVisibleRange(-10)).toEqual(DEFAULT_RANGE);
    expect(resolveVisibleRange(Number.NaN)).toEqual(DEFAULT_RANGE);
  });

  it("muestra menos octavas en contenedores estrechos", () => {
    expect(resolveVisibleRange(500)).toEqual({ fromKey: "c3", toKey: "c6" });
  });

  it("mantiene C1–C6 en el ancho base (~1000px del contenedor)", () => {
    expect(resolveVisibleRange(1014)).toEqual({ fromKey: "c1", toKey: "c6" });
    expect(resolveVisibleRange(1150)).toEqual({ fromKey: "c1", toKey: "c6" });
  });

  it("añade octavas al ensanchar el contenedor", () => {
    expect(resolveVisibleRange(1160)).toEqual({ fromKey: "c1", toKey: "c7" });
    expect(resolveVisibleRange(1400)).toEqual({ fromKey: "c1", toKey: "c8" });
  });

  it("llega al piano completo (A0–C8) en el ancho máximo", () => {
    expect(resolveVisibleRange(1610)).toEqual({ fromKey: "a0", toKey: "c8" });
    expect(resolveVisibleRange(4000)).toEqual({ fromKey: "a0", toKey: "c8" });
  });

  it("con span ensancha el rango lo justo para que la pieza quepa (B-032.2)", () => {
    // En estrecho la base es C3–C6; la mano izquierda de `p16` baja a F2.
    expect(resolveVisibleRange(500, { from: 41, to: 79 })).toEqual({
      fromKey: "f2",
      toKey: "c6",
    });
    // En ancho la base ya cubre la pieza: no se toca.
    expect(resolveVisibleRange(1014, { from: 41, to: 79 })).toEqual({
      fromKey: "c1",
      toKey: "c6",
    });
  });

  it("el span también puede estirar el agudo", () => {
    expect(resolveVisibleRange(1014, { from: 21, to: 100 })).toEqual({
      fromKey: "a0",
      toKey: "e7",
    });
  });

  it("sin span se comporta como siempre", () => {
    expect(resolveVisibleRange(1014, null)).toEqual(resolveVisibleRange(1014));
  });
});

describe("pitchSpan", () => {
  it("devuelve los bordes de la partitura", () => {
    expect(pitchSpan([{ pitch: 67 }, { pitch: 41 }, { pitch: 55 }])).toEqual({
      from: 41,
      to: 67,
    });
  });

  it("sin notas (o sin pitches válidos) no hay span", () => {
    expect(pitchSpan([])).toBeNull();
    expect(pitchSpan([{ pitch: Number.NaN }])).toBeNull();
  });
});
