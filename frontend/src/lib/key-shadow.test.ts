// description: Tests de la sombra interna direccional de la tecla pulsada.
// context: Criterio de D-002.4; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import { keyShadow, shadowGradientId } from "./key-shadow";

describe("keyShadow", () => {
  it("las teclas de la izquierda reciben la sombra por su derecha", () => {
    expect(keyShadow(0).side).toBe("right");
    expect(keyShadow(0.2).side).toBe("right");
    expect(keyShadow(0.49).side).toBe("right");
  });

  it("las de la derecha la reciben por su izquierda (hacia el centro)", () => {
    expect(keyShadow(1).side).toBe("left");
    expect(keyShadow(0.8).side).toBe("left");
    expect(keyShadow(0.5).side).toBe("left");
  });

  it("en el centro apenas se nota y en los extremos es máxima", () => {
    expect(keyShadow(0.5).level).toBe(1);
    expect(keyShadow(0).level).toBe(3);
    expect(keyShadow(1).level).toBe(3);
    expect(keyShadow(0.9).level).toBe(3);
  });

  it("la fuerza crece al alejarse del centro", () => {
    const levels = [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => keyShadow(t).level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
    expect(levels[levels.length - 1]).toBe(3);
  });

  it("recorta valores fuera de [0,1] y los no numéricos", () => {
    expect(keyShadow(-5)).toEqual(keyShadow(0));
    expect(keyShadow(9)).toEqual(keyShadow(1));
    expect(keyShadow(Number.NaN)).toEqual(keyShadow(0.5));
  });
});

describe("shadowGradientId", () => {
  it("mapea el lado y el nivel al gradiente fijo correspondiente", () => {
    expect(shadowGradientId({ side: "left", level: 1 })).toBe("pm-shadow-l1");
    expect(shadowGradientId({ side: "right", level: 3 })).toBe("pm-shadow-r3");
  });
});
