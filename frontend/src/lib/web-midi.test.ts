// description: Tests del adaptador de Web MIDI (B-032.2): traducción de mensajes, note_on con velocity 0, canales, mensajes que no son notas, enganche de teclados y petición de acceso sin soporte o con permiso denegado.
// context: Criterio de B-032.2; sin DOM, con un MIDIAccess falso inyectado.

import { describe, expect, it, vi } from "vitest";

import {
  connectWebMidi,
  parseMidiMessage,
  requestWebMidi,
  type MidiAccessLike,
  type MidiInputLike,
  type MidiMessageLike,
} from "./web-midi";

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

describe("parseMidiMessage", () => {
  it("traduce note_on y note_off de cualquier canal", () => {
    expect(parseMidiMessage([0x90, 60, 80])).toEqual({
      type: "note_on",
      pitch: 60,
      velocity: 80,
    });
    expect(parseMidiMessage([0x9f, 72, 100])).toEqual({
      type: "note_on",
      pitch: 72,
      velocity: 100,
    });
    expect(parseMidiMessage([0x80, 60, 0])).toEqual({
      type: "note_off",
      pitch: 60,
      velocity: 0,
    });
    expect(parseMidiMessage([0x85, 64, 30])).toEqual({
      type: "note_off",
      pitch: 64,
      velocity: 0,
    });
  });

  it("un note_on con velocity 0 es una suelta", () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({
      type: "note_off",
      pitch: 60,
      velocity: 0,
    });
  });

  it("ignora pedal, aftertouch, mensajes de sistema y datos cortos", () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // CC64 (pedal)
    expect(parseMidiMessage([0xd0, 40])).toBeNull(); // aftertouch
    expect(parseMidiMessage([0xf8])).toBeNull(); // reloj MIDI
    expect(parseMidiMessage([0x90, 60])).toBeNull(); // falta velocity
    expect(parseMidiMessage([])).toBeNull();
  });

  it("rechaza pitches y velocities fuera de rango", () => {
    expect(parseMidiMessage([0x90, 200, 80])).toBeNull();
    expect(parseMidiMessage([0x90, 60, 200])).toBeNull();
  });
});

describe("connectWebMidi", () => {
  it("engancha todos los teclados y entrega cada nota con su marca", () => {
    const input: MidiInputLike = { onmidimessage: null };
    const onNote = vi.fn();
    const disconnect = connectWebMidi(fakeAccess([input]), onNote);

    const event: MidiMessageLike = { data: [0x90, 60, 80], timeStamp: 42.5 };
    input.onmidimessage?.(event);
    input.onmidimessage?.({ data: [0x80, 60, 0] });

    expect(onNote.mock.calls).toEqual([
      [{ type: "note_on", pitch: 60, velocity: 80, t_ms: 42.5 }],
      [{ type: "note_off", pitch: 60, velocity: 0 }],
    ]);

    disconnect();
    expect(input.onmidimessage).toBeNull();
  });

  it("vuelve a enganchar cuando cambian los dispositivos", () => {
    const access = fakeAccess();
    const onNote = vi.fn();
    connectWebMidi(access, onNote);

    const late: MidiInputLike = { onmidimessage: null };
    access.inputs.forEach = (callback) => callback(late);
    access.onstatechange?.();

    late.onmidimessage?.({ data: [0x90, 67, 70] });
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it("desconectar quita el aviso de cambio de dispositivos", () => {
    const access = fakeAccess();
    const disconnect = connectWebMidi(access, vi.fn());

    disconnect();

    expect(access.onstatechange).toBeNull();
  });
});

describe("requestWebMidi", () => {
  it("devuelve null si el navegador no soporta Web MIDI", async () => {
    expect(await requestWebMidi({})).toBeNull();
    expect(await requestWebMidi(undefined)).toBeNull();
  });

  it("devuelve el acceso cuando el usuario lo concede", async () => {
    const access = fakeAccess();
    const requestMIDIAccess = vi.fn().mockResolvedValue(access);

    expect(await requestWebMidi({ requestMIDIAccess })).toBe(access);
  });

  it("devuelve null si el usuario deniega el permiso", async () => {
    const requestMIDIAccess = vi.fn().mockRejectedValue(new Error("denied"));

    expect(await requestWebMidi({ requestMIDIAccess })).toBeNull();
  });
});
