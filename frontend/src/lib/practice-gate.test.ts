// description: Tests de practice-gate.ts: agrupación en acordes, filtrado por mano, satisfacción, tecla equivocada y timeout.
// context: B-032.5; puro y sin DOM.

import { describe, expect, it } from "vitest";

import {
  CHORD_TOLERANCE_S,
  assignMeasure,
  defaultPreroll_s,
  gateAt,
  gateSatisfied,
  gateWrong,
  gatesForSchedule,
  strikeFor,
  waitTimeoutMs,
} from "./practice-gate";
import type { ScheduledEvent } from "./playback-schedule";

function event(
  time_s: number,
  pitch: number,
  hand: "left" | "right" | "unknown" | undefined = undefined,
): ScheduledEvent {
  return {
    time_s,
    pitch,
    duration_s: 0.5,
    velocity: 80,
    hand,
  };
}

describe("practice-gate", () => {
  it("agrupa notas simultáneas en un solo gate", () => {
    const schedule: ScheduledEvent[] = [
      event(1.0, 60),
      event(1.0 + CHORD_TOLERANCE_S / 2, 64),
      event(2.0, 62),
    ];
    const gates = gatesForSchedule(schedule, "both");
    expect(gates).toHaveLength(2);
    expect(gates[0].pitches).toEqual([60, 64]);
    expect(gates[1].pitches).toEqual([62]);
  });

  it("filtra por mano e incluye las notas sin mano", () => {
    const schedule: ScheduledEvent[] = [
      event(1.0, 60, "left"),
      event(1.0, 64, "right"),
      event(2.0, 67, undefined),
      event(3.0, 72, "right"),
    ];
    const left = gatesForSchedule(schedule, "left");
    expect(left).toHaveLength(2);
    expect(left[0].pitches).toEqual([60]);
    expect(left[1].pitches).toEqual([67]);

    const right = gatesForSchedule(schedule, "right");
    expect(right).toHaveLength(3);
    expect(right.map((g) => g.pitches)).toEqual([[64], [67], [72]]);
  });

  it("gateAt devuelve el siguiente gate", () => {
    const schedule: ScheduledEvent[] = [
      event(1.0, 60),
      event(2.0, 62),
      event(3.0, 64),
    ];
    expect(gateAt(schedule, 0.5, "both")?.time_s).toBe(1.0);
    expect(gateAt(schedule, 1.0, "both")?.time_s).toBe(2.0);
    expect(gateAt(schedule, 2.5, "both")?.time_s).toBe(3.0);
    expect(gateAt(schedule, 3.5, "both")).toBeNull();
  });

  it("detecta un gate satisfecho", () => {
    const gate = { id: "g1", time_s: 1.0, duration_s: 0.5, pitches: [60, 64], hands: ["left" as const], measure: 0 };
    expect(gateSatisfied(gate, [60, 64])).toBe(true);
    expect(gateSatisfied(gate, [60])).toBe(false);
    expect(gateSatisfied(gate, [60, 64, 67])).toBe(true);
  });

  it("detecta tecla equivocada", () => {
    const gate = { id: "g1", time_s: 1.0, duration_s: 0.5, pitches: [60], hands: ["left" as const], measure: 0 };
    expect(gateWrong(gate, [61])).toBe(true);
    expect(gateWrong(gate, [60])).toBe(false);
    expect(gateWrong(gate, [])).toBe(false);
  });

  it("strikeFor prioriza timeout, luego hit, luego wrong, luego miss", () => {
    const gate = { id: "g1", time_s: 1.0, duration_s: 0.5, pitches: [60], hands: ["left" as const], measure: 0 };
    expect(strikeFor(gate, [60], true)).toBe("timeout");
    expect(strikeFor(gate, [60], false)).toBe("hit");
    expect(strikeFor(gate, [61], false)).toBe("wrong");
    expect(strikeFor(gate, [], false)).toBe("miss");
  });

  it("waitTimeoutMs usa el tempo cuando existe", () => {
    expect(waitTimeoutMs({ tempoBpm: 120, beats: 2 })).toBe(1000);
    expect(waitTimeoutMs({ tempoBpm: 120, beats: 2, minMs: 2500 })).toBe(2500);
    expect(waitTimeoutMs({ tempoBpm: 120, beats: 2, maxMs: 500 })).toBe(500);
  });

  it("waitTimeoutMs cae al mínimo sin tempo", () => {
    expect(waitTimeoutMs({})).toBe(500);
  });

  it("assignMeasure asigna el compás correcto", () => {
    const gates = [
      { id: "g0", time_s: 0.5, duration_s: 0.5, pitches: [60], hands: ["left" as const], measure: null },
      { id: "g1", time_s: 2.5, duration_s: 0.5, pitches: [62], hands: ["left" as const], measure: null },
    ];
    const withMeasure = assignMeasure(gates, [0, 2, 4]);
    expect(withMeasure[0].measure).toBe(0);
    expect(withMeasure[1].measure).toBe(1);
  });

  it("defaultPreroll_s usa un compás cuando es menor que 2 s", () => {
    // 4/4 a 120 BPM: un compás (4 pulsos) = 2 s, igual al fallback.
    expect(defaultPreroll_s(120, 4)).toBe(2);
    // 4/4 a 60 BPM: un compás = 4 s, así que usa el fallback 2 s.
    expect(defaultPreroll_s(60, 4)).toBe(2);
    // Rápida: 4/4 a 240 BPM: un compás = 1 s.
    expect(defaultPreroll_s(240, 4)).toBe(1);
  });
});
