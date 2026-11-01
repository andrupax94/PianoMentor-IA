// description: Tests del gate-controller: hit, wrong, timeout y deduplicación de señales.
// context: B-032.5; puro y sin DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGateController, type PracticeEvent } from "./gate-controller";
import {
  emitNoteOff,
  emitNoteOn,
  resetNoteInput,
  subscribeNoteInput,
} from "./note-input";
import type { PlaybackSnapshot } from "./playback-engine";

function snapshot(
  overrides: Partial<PlaybackSnapshot> = {},
): PlaybackSnapshot {
  return {
    status: "waiting",
    position_s: 1.0,
    tempoFactor: 1.0,
    duration_s: 10,
    tempo_bpm: 120,
    effective_bpm: 120,
    currentGate: {
      id: "gate-1.0000",
      time_s: 1.0,
      pitches: [60],
      hands: ["left"],
      measure: 0,
    },
    prerollRemaining_s: null,
    waitingSince_wall_s: null,
    ...overrides,
  };
}

const WAITING_SNAPSHOT = snapshot();
const PLAYING_SNAPSHOT = snapshot({ status: "playing", currentGate: null });

describe("gate-controller", () => {
  let events: PracticeEvent[] = [];
  let hits = 0;
  let current: PlaybackSnapshot = WAITING_SNAPSHOT;

  beforeEach(() => {
    events = [];
    hits = 0;
    current = WAITING_SNAPSHOT;
    resetNoteInput();
  });

  afterEach(() => {
    resetNoteInput();
  });

  function makeController() {
    return createGateController({
      getSnapshot: () => current,
      subscribeNoteInput,
      sendPracticeEvent: (event) => events.push(event),
      clockMs: () => 1000,
      onHit: () => {
        hits += 1;
      },
      options: { enabled: true, hand: "left" },
    });
  }

  it("emite hit y reanuda cuando se toca la nota esperada", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      gate: "gate-1.0000",
      outcome: "hit",
      hand: "left",
    });
    expect(hits).toBe(1);

    controller.stop();
  });

  it("emite wrong al tocar una tecla equivocada", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 61, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("wrong");
    expect(hits).toBe(0);

    controller.stop();
  });

  it("no emite nada mientras el transporte no espera", () => {
    current = PLAYING_SNAPSHOT;
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 60, velocity: 80, source: "pc" });

    expect(events).toHaveLength(0);

    controller.stop();
  });

  it("no duplica el mismo outcome para el mismo gate", () => {
    const controller = makeController();
    controller.start();

    emitNoteOn({ pitch: 61, velocity: 80, source: "pc" });
    emitNoteOn({ pitch: 62, velocity: 80, source: "pc" });

    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("wrong");

    controller.stop();
  });
});
