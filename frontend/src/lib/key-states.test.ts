// description: Tests de sonando/esperada con schedule falso.
// context: Criterio de B-007.2; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import { expectedKeyIds, soundingKeyIds } from "./key-states";
import type { ScheduledEvent } from "./playback-schedule";

function event(time_s: number, pitch: number, duration_s = 0.5): ScheduledEvent {
  return { time_s, pitch, duration_s, velocity: 80 };
}

const SCORE: ScheduledEvent[] = [
  event(1.0, 60),
  event(1.0, 64),
  event(2.0, 62),
];

describe("soundingKeyIds", () => {
  it("marca las notas activas en la posición, únicas y en orden", () => {
    expect(soundingKeyIds(SCORE, 1.2)).toEqual(["c4", "e4"]);
    expect(soundingKeyIds(SCORE, 0.5)).toEqual([]);
    // En 2.0 la primera ya terminó (1.0 + 0.5): solo suena la segunda.
    expect(soundingKeyIds(SCORE, 2.0)).toEqual(["d4"]);
  });
});

describe("expectedKeyIds", () => {
  it("anticipa las que empiezan tras la posición dentro del horizonte", () => {
    expect(expectedKeyIds(SCORE, 0.0, 2.0)).toEqual(["c4", "e4", "d4"]);
    expect(expectedKeyIds(SCORE, 1.5, 2.0)).toEqual(["d4"]);
    expect(expectedKeyIds(SCORE, 2.0, 2.0)).toEqual([]);
  });
});
