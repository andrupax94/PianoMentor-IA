// description: Tests de resolveVisibleRange (octavas responsive según ancho).
// context: B-007.2; verifica contracción en estrechos, rango base, expansión y techo.

import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, resolveVisibleRange } from "./visible-range";

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
});
