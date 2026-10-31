// description: Tests del puerto único de entrada de notas (B-032.2): normalización, suscripción, puerta que corta solo note_on y aviso a quien suena al cerrarse.
// context: Criterio de B-032.2; es estado de módulo, así que cada test parte de resetNoteInput().

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  emitNoteOff,
  emitNoteOn,
  isNoteInputEnabled,
  resetNoteInput,
  setNoteInputEnabled,
  subscribeNoteInput,
  subscribeNoteInputGate,
} from "./note-input";

beforeEach(() => {
  resetNoteInput();
});

afterEach(() => {
  resetNoteInput();
});

describe("note-input", () => {
  it("entrega la pulsación normalizada a todos los suscriptores", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeNoteInput({ onNoteOn: first });
    subscribeNoteInput({ onNoteOn: second });

    emitNoteOn({ pitch: 60.4, velocity: 80.6, source: "pc" });

    expect(first).toHaveBeenCalledWith({ pitch: 60, velocity: 81, source: "pc" });
    expect(second).toHaveBeenCalledWith({ pitch: 60, velocity: 81, source: "pc" });
  });

  it("recorta velocity y descarta pitches fuera de MIDI", () => {
    const onNoteOn = vi.fn();
    subscribeNoteInput({ onNoteOn });

    emitNoteOn({ pitch: 60, velocity: 400, source: "screen" });
    emitNoteOn({ pitch: -1, velocity: 80, source: "pc" });
    emitNoteOn({ pitch: 128, velocity: 80, source: "pc" });
    emitNoteOn({ pitch: Number.NaN, velocity: 80, source: "pc" });

    expect(onNoteOn).toHaveBeenCalledTimes(1);
    expect(onNoteOn).toHaveBeenCalledWith({ pitch: 60, velocity: 127, source: "screen" });
  });

  it("conserva la marca del hardware cuando llega", () => {
    const onNoteOn = vi.fn();
    subscribeNoteInput({ onNoteOn });

    emitNoteOn({ pitch: 64, velocity: 90, t_ms: 1234.5, source: "midi" });

    expect(onNoteOn).toHaveBeenCalledWith({
      pitch: 64,
      velocity: 90,
      t_ms: 1234.5,
      source: "midi",
    });
  });

  it("la baja deja de recibir eventos", () => {
    const onNoteOn = vi.fn();
    const unsubscribe = subscribeNoteInput({ onNoteOn });

    unsubscribe();
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it("la puerta corta las pulsaciones pero deja pasar las sueltas", () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    subscribeNoteInput({ onNoteOn, onNoteOff });

    setNoteInputEnabled(false);
    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });
    emitNoteOff({ pitch: 60, velocity: 80, source: "pc" });

    expect(onNoteOn).not.toHaveBeenCalled();
    // Soltar siempre pasa: si no, la tecla quedaría colgada al volver el control.
    expect(onNoteOff).toHaveBeenCalledWith({ pitch: 60, velocity: 0, source: "pc" });
  });

  it("la puerta avisa solo cuando cambia", () => {
    const listener = vi.fn();
    subscribeNoteInputGate(listener);

    setNoteInputEnabled(false);
    setNoteInputEnabled(false);
    setNoteInputEnabled(true);

    expect(listener.mock.calls).toEqual([[false], [true]]);
    expect(isNoteInputEnabled()).toBe(true);
  });

  it("resetNoteInput vuelve a abrir la puerta", () => {
    setNoteInputEnabled(false);

    resetNoteInput();

    expect(isNoteInputEnabled()).toBe(true);
  });
});
