// description: Tests del almacén del modo espera (B-033.2): default activado, avisos solo al cambiar y reset del estado de módulo.
// context: B-033.2; puro y sin DOM, como los demás tests de almacenes.

import { describe, expect, it, vi } from "vitest";

import {
  getWaitModeSnapshot,
  resetWaitMode,
  setWaitModeEnabled,
  subscribeWaitMode,
} from "./wait-mode-store";

describe("wait-mode-store", () => {
  it("nace activado (el modo espera es lo habitual)", () => {
    expect(getWaitModeSnapshot()).toEqual({ enabled: true });
  });

  it("cambia y avisa solo cuando cambia", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWaitMode(listener);

    setWaitModeEnabled(false);
    expect(getWaitModeSnapshot()).toEqual({ enabled: false });
    expect(listener).toHaveBeenCalledTimes(1);

    setWaitModeEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);

    setWaitModeEnabled(true);
    expect(getWaitModeSnapshot()).toEqual({ enabled: true });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    resetWaitMode();
    expect(getWaitModeSnapshot()).toEqual({ enabled: true });
  });
});
