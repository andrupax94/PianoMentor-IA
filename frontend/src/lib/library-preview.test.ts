// description: Tests de la decisión del preview de la Library.
// context: B-027.3; lógica pura, sin React ni audio.

import { describe, expect, it } from "vitest";

import { previewStep } from "./library-preview";

describe("previewStep", () => {
  it("arranca cuando no hay ninguna pieza cargada", () => {
    expect(previewStep(null, "p01", "stopped")).toBe("start");
  });

  it("arranca cuando la fila pulsada es otra pieza", () => {
    expect(previewStep("p01", "p02", "playing")).toBe("start");
  });

  it("pausa la pieza que está sonando", () => {
    expect(previewStep("p01", "p01", "playing")).toBe("pause");
  });

  it("reanuda la que quedó en pausa", () => {
    expect(previewStep("p01", "p01", "paused")).toBe("resume");
  });

  it("vuelve a empezar la que ya terminó", () => {
    expect(previewStep("p01", "p01", "stopped")).toBe("start");
  });
});
