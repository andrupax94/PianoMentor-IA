// description: Tests del mapa tecla del PC → pitch (independencia de layout y octavas).
// context: Criterio de B-007.2; se ejecutan con `npm run test` (Vitest).

import { describe, expect, it } from "vitest";

import {
  AUDITION_VELOCITY,
  clampOctave,
  DEFAULT_OCTAVE,
  OCTAVE_DOWN_CODES,
  OCTAVE_UP_CODES,
  pcCodeToPitch,
  pcKeyLabels,
  shiftOctave,
} from "./pc-keyboard";

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
