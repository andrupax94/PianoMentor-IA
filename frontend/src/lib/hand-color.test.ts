// description: Tests del color de mano de la cascada.
// context: D-002.1; verifica el mapeo mano → token y que no se cuele ningún
// hexadecimal fuera de globals.css.

import { describe, expect, it } from "vitest";

import { handColor, HAND_COLORS } from "./hand-color";

describe("handColor", () => {
  it("tiñe la mano izquierda y la derecha con su token", () => {
    expect(handColor("left")).toBe("var(--hand-left)");
    expect(handColor("right")).toBe("var(--hand-right)");
  });

  it("sin mano o desconocida cae en la reserva", () => {
    expect(handColor(undefined)).toBe("var(--hand-unknown)");
    expect(handColor("unknown")).toBe("var(--hand-unknown)");
  });

  it("los tres tokens son var() de --hand-*: el color vive en globals.css", () => {
    for (const color of Object.values(HAND_COLORS)) {
      expect(color).toMatch(/^var\(--hand-(left|right|unknown)\)$/);
    }
  });
});
