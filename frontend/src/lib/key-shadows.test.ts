// description: Tests de las sombras de teclas del reproductor (B-032.9): el schedule de iluminación es el audible del modo (observe entero, una mano la contraria, dos manos nada) y solo está activo mientras el transporte suena (playing).
// context: Módulo puro sin DOM; la tecla del alumno se hunde solo por su entrada (el puerto de nota, playedIds), nunca por el schedule.
import { describe, expect, it } from "vitest";

import type { PlayableNote } from "./api-client";
import { shadowsActive, shadowScheduleFor } from "./key-shadows";
import { soundingKeyIds } from "./key-states";
import { pitchToKeyId } from "./pitch";

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

const SCORE: PlayableNote[] = [
  note({ pitch: 60, track: 1, hand: "left" }), // mano izquierda
  note({ pitch: 67, track: 2, hand: "right" }), // mano derecha
];

const tempoFactor = 1.0;

describe("shadowScheduleFor", () => {
  it("en observar ilumina la pieza entera (las dos manos)", () => {
    const schedule = shadowScheduleFor(SCORE, "observe", "right", tempoFactor);
    expect(schedule).toHaveLength(2);
    expect(pitchToKeyId(schedule[0].pitch)).toBe("c4");
    expect(pitchToKeyId(schedule[1].pitch)).toBe("g4");
  });

  it("en una mano ilumina solo la mano contraria (y las notas sin mano)", () => {
    const schedule = shadowScheduleFor(SCORE, "one_hand", "right", tempoFactor);
    expect(schedule).toHaveLength(1);
    expect(pitchToKeyId(schedule[0].pitch)).toBe("c4"); // la IA toca la izquierda
  });

  it("en dos manos el transporte no ilumina nada", () => {
    expect(shadowScheduleFor(SCORE, "both_hands", "right", tempoFactor)).toHaveLength(0);
  });
});

describe("shadowsActive", () => {
  const schedule = shadowScheduleFor(SCORE, "one_hand", "right", tempoFactor);

  it("solo suena de verdad en playing", () => {
    expect(shadowsActive("playing")).toBe(true);
    expect(shadowsActive("waiting")).toBe(false);
    expect(shadowsActive("preroll")).toBe(false);
    expect(shadowsActive("paused")).toBe(false);
    expect(shadowsActive("stopped")).toBe(false);
  });

  it("un gate congelado (waiting) no marca sombras aunque la posición esté en la nota", () => {
    // En waiting el transporte está callado: la regla de B-032.9 es que la
    // tecla no se hunde por el schedule aunque su ventana cubra la posición.
    expect(shadowsActive("waiting")).toBe(false);
    expect(soundingKeyIds(schedule, 1.0).length).toBeGreaterThan(0);
  });
});
