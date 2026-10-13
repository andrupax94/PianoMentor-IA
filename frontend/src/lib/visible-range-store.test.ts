// description: Tests del almacén compartido del rango visible.
// context: B-007.3; es el "evento" que dispara el teclado y escucha el NoteFallGrid.

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_RANGE } from "./visible-range";
import type { KeyboardRange } from "./visible-range";
import {
  getVisibleRange,
  publishVisibleRange,
  subscribeVisibleRange,
} from "./visible-range-store";

describe("visible-range-store", () => {
  // El almacén es un singleton: cada test parte del mismo estado.
  beforeEach(() => {
    publishVisibleRange(DEFAULT_RANGE);
  });

  it("empieza en el rango por defecto", () => {
    expect(getVisibleRange()).toEqual(DEFAULT_RANGE);
  });

  it("notifica a los suscriptores cuando cambia el rango", () => {
    const seen: KeyboardRange[] = [];
    const unsubscribe = subscribeVisibleRange(() => seen.push(getVisibleRange()));

    publishVisibleRange({ fromKey: "c3", toKey: "c6" });
    unsubscribe();

    expect(seen).toEqual([{ fromKey: "c3", toKey: "c6" }]);
    expect(getVisibleRange()).toEqual({ fromKey: "c3", toKey: "c6" });
  });

  it("no notifica si el rango publicado es el vigente", () => {
    publishVisibleRange({ fromKey: "c2", toKey: "c6" });
    let calls = 0;
    const unsubscribe = subscribeVisibleRange(() => {
      calls += 1;
    });

    publishVisibleRange({ fromKey: "c2", toKey: "c6" });
    unsubscribe();

    expect(calls).toBe(0);
  });

  it("deja de notificar tras darse de baja", () => {
    let calls = 0;
    const unsubscribe = subscribeVisibleRange(() => {
      calls += 1;
    });
    unsubscribe();

    publishVisibleRange({ fromKey: "c1", toKey: "c8" });

    expect(calls).toBe(0);
    expect(getVisibleRange()).toEqual({ fromKey: "c1", toKey: "c8" });
  });
});
