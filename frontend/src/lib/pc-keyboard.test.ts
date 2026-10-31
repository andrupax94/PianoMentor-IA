// description: Tests del mapa tecla del PC → pitch (independencia de layout y octavas).
// context: Criterio de B-007.2; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import {
  AUDITION_VELOCITY,
  clampOctave,
  clampSplitShift,
  DEFAULT_OCTAVE,
  handRanges,
  MAX_SPLIT_SHIFT,
  MIN_SPLIT_SHIFT,
  OCTAVE_DOWN_CODES,
  OCTAVE_UP_CODES,
  pcCodeToPitch,
  pcKeyLabels,
  shiftOctave,
  splitLayoutFor,
} from "./pc-keyboard";
import type { PlayableNote } from "./api-client";

describe("pcCodeToPitch", () => {
  it("mapea la distribución GarageBand sobre la octava base", () => {
    // Fila blanca (home): A S D F G H J K L ;
    expect(pcCodeToPitch("KeyA", 4)).toBe(60); // C4
    expect(pcCodeToPitch("KeyS", 4)).toBe(62); // D4
    expect(pcCodeToPitch("KeyD", 4)).toBe(64); // E4
    expect(pcCodeToPitch("KeyF", 4)).toBe(65); // F4
    expect(pcCodeToPitch("KeyG", 4)).toBe(67); // G4
    expect(pcCodeToPitch("KeyH", 4)).toBe(69); // A4
    expect(pcCodeToPitch("KeyJ", 4)).toBe(71); // B4
    expect(pcCodeToPitch("KeyK", 4)).toBe(72); // C5
    expect(pcCodeToPitch("KeyL", 4)).toBe(74); // D5
    expect(pcCodeToPitch("Semicolon", 4)).toBe(76); // E5
    // Fila negra (arriba): W E T Y U O P
    expect(pcCodeToPitch("KeyW", 4)).toBe(61); // C#4
    expect(pcCodeToPitch("KeyE", 4)).toBe(63); // D#4
    expect(pcCodeToPitch("KeyT", 4)).toBe(66); // F#4
    expect(pcCodeToPitch("KeyY", 4)).toBe(68); // G#4
    expect(pcCodeToPitch("KeyU", 4)).toBe(70); // A#4
    expect(pcCodeToPitch("KeyO", 4)).toBe(73); // C#5
    expect(pcCodeToPitch("KeyP", 4)).toBe(75); // D#5
  });

  it("usa e.code: no depende del layout del teclado", () => {
    // En un layout español la tecla física KeyA puede escribir otro carácter;
    // el code es estable y el mapeo no cambia.
    expect(pcCodeToPitch("KeyA", 4)).toBe(pcCodeToPitch("KeyA", 4));
    expect(pcCodeToPitch("Enter", 4)).toBeNull();
    expect(pcCodeToPitch("", 4)).toBeNull();
  });

  it("devuelve null fuera del rango del piano", () => {
    // Octava 8: A = C8 = 108 (válido); W = C#8 = 109 (fuera).
    expect(pcCodeToPitch("KeyA", 8)).toBe(108);
    expect(pcCodeToPitch("KeyW", 8)).toBeNull();
    // Octava 0: A = C0 = 12, por debajo del A0 (21); H = A0 = 21 (válido).
    expect(pcCodeToPitch("KeyA", 0)).toBeNull();
    expect(pcCodeToPitch("KeyH", 0)).toBe(21);
  });

  it("recorta octavas inválidas", () => {
    expect(clampOctave(99)).toBe(8);
    expect(clampOctave(-3)).toBe(0);
    expect(clampOctave(Number.NaN)).toBe(DEFAULT_OCTAVE);
    expect(shiftOctave(4, 1)).toBe(5);
    expect(shiftOctave(8, 1)).toBe(8);
    expect(shiftOctave(0, -1)).toBe(0);
    expect(AUDITION_VELOCITY).toBe(80);
  });

  it("Z/X y flechas cambian de octava", () => {
    expect(OCTAVE_DOWN_CODES).toContain("KeyZ");
    expect(OCTAVE_DOWN_CODES).toContain("ArrowLeft");
    expect(OCTAVE_UP_CODES).toContain("KeyX");
    expect(OCTAVE_UP_CODES).toContain("ArrowRight");
  });
});

describe("pcKeyLabels", () => {
  it("etiqueta cada tecla mapeada con su letra de PC", () => {
    const labels = pcKeyLabels(4);
    expect(labels.c4).toBe("A");
    expect(labels["c#4"]).toBe("W");
    expect(labels.d4).toBe("S");
    expect(labels.b4).toBe("J");
    expect(labels.c5).toBe("K");
    expect(labels.e5).toBe(";");
    // Solo el rango mapeado (17 teclas) tiene etiqueta.
    expect(Object.keys(labels)).toHaveLength(17);
  });

  it("sigue a la octava activa", () => {
    const labels = pcKeyLabels(3);
    expect(labels.c3).toBe("A");
    expect(labels.e4).toBe(";");
    expect(labels.c4).toBe("K");
  });
});

describe("handRanges", () => {
  function note(pitch: number, hand?: "left" | "right"): PlayableNote {
    return {
      pitch,
      start_seconds: 0,
      duration_seconds: 0.5,
      velocity: 80,
      channel: 0,
      track: 1,
      hand,
    };
  }

  it("calcula el rango de cada mano con los bordes incluidos", () => {
    expect(handRanges([note(41, "left"), note(55, "left"), note(48, "left")])).toEqual({
      left: { from: 41, to: 55 },
      right: null,
    });
  });

  it("separa izquierda y derecha y descarta notas sin mano", () => {
    const ranges = handRanges([
      note(67, "right"),
      note(79, "right"),
      note(60),
      note(45, "left"),
    ]);

    expect(ranges).toEqual({
      left: { from: 45, to: 45 },
      right: { from: 67, to: 79 },
    });
  });

  it("devuelve null por mano cuando la pieza no la trae", () => {
    expect(handRanges([note(60), note(64)])).toEqual({ left: null, right: null });
  });
});

describe("splitLayoutFor", () => {
  // Rangos de `p16`: izquierda F2–G3 (41–55), derecha G4–G5 (67–79).
  const left = { from: 41, to: 55 };
  const right = { from: 67, to: 79 };

  it("parte el teclado en dos ventanas alineadas a la nota más grave de cada mano", () => {
    const layout = splitLayoutFor(left, right);

    expect(layout).not.toBeNull();
    // Fila inferior = izquierda desde F2; fila superior = derecha desde G4.
    expect(layout?.bindings.KeyZ).toBe(41);
    expect(layout?.bindings.Slash).toBe(57);
    expect(layout?.bindings.KeyQ).toBe(67);
    expect(layout?.bindings.KeyP).toBe(83);
  });

  it("rotula el piano con la letra física que toca cada tecla", () => {
    const labels = splitLayoutFor(left, right)?.labels ?? {};

    expect(labels.f2).toBe("Z");
    expect(labels.c3).toBe("B");
    expect(labels.g4).toBe("Q");
    expect(labels.b5).toBe("P");
  });

  it("las dos manos no comparten ninguna tecla física", () => {
    const layout = splitLayoutFor(left, right);
    const codes = Object.keys(layout?.bindings ?? {});

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(34);
  });

  it("sin las dos manos no hay distribución partida", () => {
    expect(splitLayoutFor(left, null)).toBeNull();
    expect(splitLayoutFor(null, right)).toBeNull();
    expect(splitLayoutFor(null, null)).toBeNull();
  });

  it("`[` y `]` desplazan las dos ventanas por octavas, con tope", () => {
    const up = splitLayoutFor(left, right, 1);
    expect(up?.shift).toBe(1);
    expect(up?.bindings.KeyZ).toBe(53);
    expect(up?.bindings.KeyQ).toBe(79);

    expect(splitLayoutFor(left, right, 99)?.shift).toBe(MAX_SPLIT_SHIFT);
    expect(splitLayoutFor(left, right, -99)?.shift).toBe(MIN_SPLIT_SHIFT);
    expect(clampSplitShift(Number.NaN)).toBe(0);
  });

  it("no deja teclas fuera del piano", () => {
    const layout = splitLayoutFor({ from: 0, to: 5 }, { from: 120, to: 127 }, 0);

    for (const pitch of Object.values(layout?.bindings ?? {})) {
      expect(pitch).toBeGreaterThanOrEqual(21);
      expect(pitch).toBeLessThanOrEqual(108);
    }
  });
});
