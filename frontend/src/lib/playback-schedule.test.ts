// description: Tests de la matemática de reproducción: escala por factor, orden estable, ventana, pitch, recortes y tempoFactorFor (BPM pedido → factor, rango 0.5–2.0, sin base válida → tiempo real).
// context: Criterio de B-006.2; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import {
  buildSchedule,
  clampPosition,
  clampTempoFactor,
  eventsInWindow,
  MAX_TEMPO_FACTOR,
  MIN_TEMPO_FACTOR,
  musicalPosition,
  pitchToFrequency,
  tempoFactorFor,
} from "./playback-schedule";
import type { PlayableNote } from "./api-client";

function note(overrides: Partial<PlayableNote> = {}): PlayableNote {
  return {
    pitch: 60,
    start_seconds: 1.0,
    duration_seconds: 0.5,
    velocity: 80,
    channel: 0,
    track: 1,
    ...overrides,
  };
}

describe("buildSchedule", () => {
  it("ordena por tiempo manteniendo el orden de entrada en empates", () => {
    const events = buildSchedule([
      note({ pitch: 64, start_seconds: 2.0 }),
      note({ pitch: 60, start_seconds: 1.0 }),
      note({ pitch: 62, start_seconds: 1.0 }),
    ]);

    expect(events.map((event) => event.time_s)).toEqual([1.0, 1.0, 2.0]);
    expect(events.map((event) => event.pitch)).toEqual([60, 62, 64]);
  });

  it("con factor 0.5 todo dura el doble y con 2.0 la mitad", () => {
    const slow = buildSchedule([note({ start_seconds: 4.0, duration_seconds: 2.0 })], 0.5);
    expect(slow[0].time_s).toBe(8.0);
    expect(slow[0].duration_s).toBe(4.0);

    const fast = buildSchedule([note({ start_seconds: 4.0, duration_seconds: 2.0 })], 2.0);
    expect(fast[0].time_s).toBe(2.0);
    expect(fast[0].duration_s).toBe(1.0);
  });

  it("recorta el factor al rango válido", () => {
    expect(buildSchedule([note({ start_seconds: 2.0 })], 0.1)[0].time_s).toBe(
      2.0 / MIN_TEMPO_FACTOR,
    );
    expect(buildSchedule([note({ start_seconds: 2.0 })], 99)[0].time_s).toBe(
      2.0 / MAX_TEMPO_FACTOR,
    );
    expect(buildSchedule([note({ start_seconds: 2.0 })], Number.NaN)[0].time_s).toBe(2.0);
  });

  it("propaga la mano de cada nota y la deja sin definir si no venía (D-002.1)", () => {
    const events = buildSchedule([
      note({ pitch: 48, hand: "left" }),
      note({ pitch: 72, hand: "right" }),
      note(),
    ]);

    expect(events.map((event) => event.hand)).toEqual(["left", "right", undefined]);
  });
});

describe("eventsInWindow", () => {
  it("excluye el borde inferior e incluye el superior", () => {
    const events = buildSchedule([
      note({ start_seconds: 1.0 }),
      note({ start_seconds: 2.0 }),
      note({ start_seconds: 3.0 }),
    ]);

    expect(eventsInWindow(events, 1.0, 2.0).map((event) => event.time_s)).toEqual([2.0]);
    expect(eventsInWindow(events, 0.0, 3.0)).toHaveLength(3);
    expect(eventsInWindow(events, 3.0, 9.0)).toHaveLength(0);
  });
});

describe("pitchToFrequency", () => {
  it("convierte pitches MIDI a Hz (69 = La 440)", () => {
    expect(pitchToFrequency(69)).toBe(440);
    expect(pitchToFrequency(81)).toBeCloseTo(880, 5);
    expect(pitchToFrequency(60)).toBeCloseTo(261.626, 2);
  });
});

describe("clampPosition", () => {
  it("recorta al rango [0, duration_s]", () => {
    expect(clampPosition(-3, 10)).toBe(0);
    expect(clampPosition(99, 10)).toBe(10);
    expect(clampPosition(4, 10)).toBe(4);
    expect(clampPosition(Number.NaN, 10)).toBe(0);
    expect(clampPosition(5, 0)).toBe(0);
  });

  it("recorta el factor con la misma regla que el schedule", () => {
    expect(clampTempoFactor(0.1)).toBe(MIN_TEMPO_FACTOR);
    expect(clampTempoFactor(99)).toBe(MAX_TEMPO_FACTOR);
    expect(clampTempoFactor(Number.NaN)).toBe(1.0);
  });
});

describe("musicalPosition", () => {
  it("deshace el escalado del tempo: la posición vuelve a tiempo de partitura (B-032.2)", () => {
    // A 0.5 el motor tarda el doble: 2 s de transporte son 1 s de partitura.
    expect(musicalPosition(2, 0.5)).toBe(1);
    // A 2.0 va al doble: 1 s de transporte son 2 s de partitura.
    expect(musicalPosition(1, 2.0)).toBe(2);
    expect(musicalPosition(3.5, 1.0)).toBe(3.5);
  });

  it("recorta factor y posición como el resto del motor", () => {
    expect(musicalPosition(2, 0.1)).toBe(2 * MIN_TEMPO_FACTOR);
    expect(musicalPosition(2, 99)).toBe(2 * MAX_TEMPO_FACTOR);
    expect(musicalPosition(2, Number.NaN)).toBe(2);
    expect(musicalPosition(-5, 1)).toBe(0);
  });
});

describe("tempoFactorFor", () => {
  it("convierte el BPM pedido en el factor multiplicativo del motor", () => {
    expect(tempoFactorFor(60, 120)).toBe(0.5);
    expect(tempoFactorFor(240, 120)).toBe(2.0);
    expect(tempoFactorFor(120, 120)).toBe(1.0);
    // Relativo, no absoluto: un mismo BPM pedido da factores distintos
    // según el tempo base de la pieza.
    expect(tempoFactorFor(90, 120)).toBeCloseTo(0.75, 5);
    expect(tempoFactorFor(90, 180)).toBeCloseTo(0.5, 5);
  });

  it("recorta al rango 0.5–2.0 lo que pase de largo", () => {
    expect(tempoFactorFor(30, 120)).toBe(MIN_TEMPO_FACTOR);
    expect(tempoFactorFor(500, 120)).toBe(MAX_TEMPO_FACTOR);
  });

  it("sin tempo base válido vuelve a tiempo real", () => {
    expect(tempoFactorFor(120, null)).toBe(1.0);
    expect(tempoFactorFor(120, 0)).toBe(1.0);
    expect(tempoFactorFor(120, Number.NaN)).toBe(1.0);
    expect(tempoFactorFor(Number.NaN, 120)).toBe(1.0);
  });
});
