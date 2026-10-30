// description: Tests del color de mano de la cascada y del color propio de la mano que toca la IA en el acompañamiento (B-012.7).
// context: D-002.1/B-012.7; verifica el mapeo mano → token y que no se cuele ningún hexadecimal fuera de globals.css.

import { describe, expect, it } from "vitest";

import { AGENT_COLOR, handColor, isAgentNote, HAND_COLORS } from "./hand-color";

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

  it("la mano de la IA se pinta con su propio token", () => {
    expect(AGENT_COLOR).toBe("var(--hand-agent)");
    expect(handColor("left", "left")).toBe(AGENT_COLOR);
    expect(handColor("right", "left")).toBe("var(--hand-right)");
    expect(handColor("left", "both")).toBe(AGENT_COLOR);
    expect(handColor("unknown", "both")).toBe(AGENT_COLOR);
  });
});

describe("isAgentNote", () => {
  it("sin acompañamiento ninguna nota es de la IA", () => {
    expect(isAgentNote("left", null)).toBe(false);
    expect(isAgentNote("left", undefined)).toBe(false);
  });

  it("marca solo la mano que toca la IA", () => {
    expect(isAgentNote("left", "left")).toBe(true);
    expect(isAgentNote("right", "left")).toBe(false);
  });

  it("con las dos manos la IA toca toda la pieza", () => {
    expect(isAgentNote("left", "both")).toBe(true);
    expect(isAgentNote("right", "both")).toBe(true);
    expect(isAgentNote(undefined, "both")).toBe(true);
  });
});
