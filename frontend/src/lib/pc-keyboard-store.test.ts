// description: Tests del almacén visible del teclado del PC (B-032.2): foto inicial, publicación con aviso y sin aviso si no cambia nada.
// context: Criterio de B-032.2; es estado de módulo, así que cada test parte de resetPcKeyboard().

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_PC_KEYBOARD,
  getPcKeyboardState,
  publishPcKeyboard,
  resetPcKeyboard,
  subscribePcKeyboard,
} from "./pc-keyboard-store";

beforeEach(() => {
  resetPcKeyboard();
});

describe("pc-keyboard-store", () => {
  it("arranca con la misma foto que pinta el servidor", () => {
    expect(getPcKeyboardState()).toBe(EMPTY_PC_KEYBOARD);
    expect(EMPTY_PC_KEYBOARD.split).toBe(false);
  });

  it("publica el estado nuevo y avisa a los suscriptores", () => {
    const listener = vi.fn();
    subscribePcKeyboard(listener);

    const next = { octave: 3, labels: { c3: "A" }, split: true };
    publishPcKeyboard(next);

    expect(getPcKeyboardState()).toBe(next);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("no avisa si el estado es idéntico", () => {
    const listener = vi.fn();
    subscribePcKeyboard(listener);
    const labels = { c4: "A" };
    publishPcKeyboard({ octave: 4, labels, split: false });

    publishPcKeyboard({ octave: 4, labels, split: false });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando cambia la distribución partida", () => {
    const listener = vi.fn();
    subscribePcKeyboard(listener);
    const labels = { c4: "A" };

    publishPcKeyboard({ octave: 4, labels, split: false });
    publishPcKeyboard({ octave: 4, labels, split: true });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("la baja deja de recibir avisos", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePcKeyboard(listener);

    unsubscribe();
    publishPcKeyboard({ octave: 5, labels: {}, split: false });

    expect(listener).not.toHaveBeenCalled();
  });
});
