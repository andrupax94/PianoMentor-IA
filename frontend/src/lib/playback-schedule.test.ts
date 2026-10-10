// description: Tests de la matemática pura de reproducción (schedule, tempo, pitch).
// context: Criterio de B-006.2; sin DOM ni AudioContext.

import { describe, expect, it } from "vitest";

import {
  buildSchedule,
  clampPosition,
  clampTempoFactor,
  eventsInWindow,
  MAX_TEMPO_FACTOR,
  MIN_TEMPO_FACTOR,
  pitchToFrequency,
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
