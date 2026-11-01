// description: Tests del modo de práctica (B-032.4): reparto del modo (qué se atenúa, qué se evalúa y si el transporte calla), mano que suena, notas audibles por modo y mano evaluada.
// context: Criterio de B-032.4; se ejecutan con `npm run test` (Vitest) sin DOM.
import { describe, expect, it } from "vitest";

import type { PlayableNote } from "./api-client";
import {
  audibleHand,
  audibleNotes,
  dimmedHand,
  evaluatedHand,
  practiceModePlan,
  PRACTICE_MODE_LABELS,
  PRACTICE_MODES,
} from "./practice-mode";

function note(pitch: number, hand?: "left" | "right" | "unknown"): PlayableNote {
  return {
    pitch,
    start_seconds: 0,
    duration_seconds: 1,
    velocity: 80,
    channel: 0,
    track: 0,
    hand,
  };
}

const SCORE: PlayableNote[] = [
  note(48, "left"),
  note(60, "right"),
  note(64, "right"),
  note(72, "unknown"),
];

describe("práctica: modo observe", () => {
  it("no atenúa nada, no evalúa nada y no calla el transporte", () => {
    expect(practiceModePlan("observe", "both")).toEqual({
      dimmedHand: null,
      evaluatedHand: null,
      silentTransport: false,
    });
  });

  it("suena la pieza entera", () => {
    expect(audibleNotes(SCORE, "observe", "both")).toEqual(SCORE);
  });
});

describe("práctica: modo one_hand", () => {
  it("atenúa y evalúa la mano del alumno, y el transporte no calla", () => {
    expect(practiceModePlan("one_hand", "right")).toEqual({
      dimmedHand: "right",
      evaluatedHand: "right",
      silentTransport: false,
    });
  });

  it("suena solo la mano contraria a la del alumno", () => {
    expect(audibleHand("one_hand", "right")).toBe("left");
    expect(audibleHand("one_hand", "left")).toBe("right");
    const audible = audibleNotes(SCORE, "one_hand", "right");
    expect(audible.map((n) => n.pitch)).toEqual([48, 72]);
  });

  it("sin mano conocida del alumno, manda la derecha", () => {
    expect(dimmedHand("one_hand", null)).toBe("right");
    expect(evaluatedHand("one_hand", undefined)).toBe("right");
  });
});

describe("práctica: modo both_hands", () => {
  it("no atenúa nada, evalúa todo y calla el transporte", () => {
    expect(practiceModePlan("both_hands", "right")).toEqual({
      dimmedHand: null,
      evaluatedHand: "both",
      silentTransport: true,
    });
  });

  it("no suena ninguna nota del transporte", () => {
    expect(audibleNotes(SCORE, "both_hands", "both")).toEqual([]);
  });
});

describe("práctica: etiquetas y modos", () => {
  it("los tres modos tienen etiqueta en español", () => {
    expect(PRACTICE_MODES).toEqual(["observe", "one_hand", "both_hands"]);
    expect(PRACTICE_MODE_LABELS.observe).toBe("Observar");
    expect(PRACTICE_MODE_LABELS.one_hand).toBe("Una mano");
    expect(PRACTICE_MODE_LABELS.both_hands).toBe("Dos manos");
  });
});
