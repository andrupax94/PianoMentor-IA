// description: Tests del almacén del estado MIDI (B-035): foto inicial, publicación con aviso, sin aviso si no cambia, reset y derivación desde un MIDIAccess falso.
// context: Criterio de B-035; estado de módulo, cada test parte de resetMidi().

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_MIDI,
  getMidiInputs,
  getMidiState,
  midiStateFromAccess,
  publishMidi,
  resetMidi,
  subscribeMidi,
  syncMidiFromAccess,
  updateMidi,
} from "./midi-store";
import type { MidiAccessLike, MidiInputLike } from "./web-midi";

function fakeAccess(inputs: MidiInputLike[] = []): MidiAccessLike {
  return {
    inputs: {
      forEach(callback) {
        for (const input of inputs) callback(input);
      },
    },
    onstatechange: null,
  };
}

beforeEach(() => {
  resetMidi();
});

describe("midi-store", () => {
  it("arranca con la foto vacía que pinta el servidor", () => {
    expect(getMidiState()).toBe(EMPTY_MIDI);
    expect(EMPTY_MIDI.supported).toBe(false);
    expect(EMPTY_MIDI.permission).toBe("unknown");
    expect(EMPTY_MIDI.inputCount).toBe(0);
    expect(EMPTY_MIDI.firstName).toBeNull();
  });

  it("publica el estado nuevo y avisa a los suscriptores", () => {
    const listener = vi.fn();
    subscribeMidi(listener);

    publishMidi({ supported: true, permission: "granted", inputCount: 1, firstName: "Roland" });

    expect(getMidiState().supported).toBe(true);
    expect(getMidiState().permission).toBe("granted");
    expect(getMidiState().inputCount).toBe(1);
    expect(getMidiState().firstName).toBe("Roland");
    expect(getMidiState().connected).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("no avisa si el estado es idéntico", () => {
    const listener = vi.fn();
    subscribeMidi(listener);
    publishMidi({ supported: true, permission: "granted", inputCount: 1, firstName: "Roland" });

    publishMidi({ supported: true, permission: "granted", inputCount: 1, firstName: "Roland" });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando cambia el número de teclados", () => {
    const listener = vi.fn();
    subscribeMidi(listener);
    publishMidi({ supported: true, permission: "granted", inputCount: 1, firstName: "Roland" });

    publishMidi({ supported: true, permission: "granted", inputCount: 0, firstName: null });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getMidiState().connected).toBe(false);
  });

  it("updateMidi aplica un parche", () => {
    updateMidi({ supported: true });
    expect(getMidiState().supported).toBe(true);
    expect(getMidiState().permission).toBe("unknown");
  });

  it("la baja deja de recibir avisos", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMidi(listener);

    unsubscribe();
    publishMidi({ supported: true, permission: "denied", inputCount: 0, firstName: null });

    expect(listener).not.toHaveBeenCalled();
  });

  it("reset vuelve al estado inicial", () => {
    publishMidi({ supported: true, permission: "granted", inputCount: 1, firstName: "X" });
    resetMidi();
    expect(getMidiState()).toBe(EMPTY_MIDI);
  });

  it("deriva el estado desde un MIDIAccess falso", () => {
    const access = fakeAccess([{ name: "Roland FP-30", onmidimessage: null }, { name: "Arranger", onmidimessage: null }]);
    const state = midiStateFromAccess(access, true, "granted");
    expect(state.inputCount).toBe(2);
    expect(state.firstName).toBe("Roland FP-30");
    expect(state.connected).toBe(true);
    expect(state.supported).toBe(true);
    expect(state.permission).toBe("granted");
  });

  it("sin acceso se marca denegado y sin teclado", () => {
    const state = midiStateFromAccess(null, true, "denied");
    expect(state.inputCount).toBe(0);
    expect(state.firstName).toBeNull();
    expect(state.connected).toBe(false);
    expect(state.permission).toBe("denied");
  });

  it("sin soporte del navegador", () => {
    const state = midiStateFromAccess(null, false, "unknown");
    expect(state.supported).toBe(false);
    expect(state.permission).toBe("unknown");
  });

  it("getMidiInputs extrae los inputs", () => {
    const access = fakeAccess([{ name: "A", onmidimessage: null }]);
    expect(getMidiInputs(access)).toHaveLength(1);
    expect(getMidiInputs(null)).toEqual([]);
  });

  it("syncMidiFromAccess sincroniza el almacén", () => {
    const access = fakeAccess([{ name: "Yamaha", onmidimessage: null }]);
    syncMidiFromAccess(access, true);
    expect(getMidiState().firstName).toBe("Yamaha");
    expect(getMidiState().inputCount).toBe(1);
  });
});