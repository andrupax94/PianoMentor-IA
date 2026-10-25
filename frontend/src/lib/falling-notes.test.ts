// description: Tests de la cascada de notas con reloj falso.
// context: Criterio de B-007.3; verifica que la nota llega abajo cuando suena
// y que el factor de tempo escala la caída igual que el sonido.

import { describe, expect, it } from "vitest";

import { fallingNotes } from "./falling-notes";
import { buildSchedule, type ScheduledEvent } from "./playback-schedule";

/** Nota de prueba: empieza en time_s y dura duration_s (ya escalados). */
function note(
  time_s: number,
  duration_s = 1,
  pitch = 60,
  velocity = 90,
  hand?: "left" | "right",
): ScheduledEvent {
  return { time_s, pitch, duration_s, velocity, hand };
}

describe("fallingNotes", () => {
  it("la nota toca el teclado justo cuando la posición llega a su inicio", () => {
    const events = [note(5)];
    // 2 s antes entra por arriba; 1 s antes va por el medio; al llegar, abajo.
    expect(fallingNotes(events, 3)[0].progress).toBeCloseTo(0, 6);
    expect(fallingNotes(events, 4)[0].progress).toBeCloseTo(0.5, 6);
    expect(fallingNotes(events, 5)[0].progress).toBeCloseTo(1, 6);
    expect(fallingNotes(events, 5)[0].remaining_s).toBeCloseTo(0, 6);
  });

  it("la ventana es [inicio, inicio + horizonte]: ni antes ni ya sonando", () => {
    const events = [note(5)];
    expect(fallingNotes(events, 2.99)).toHaveLength(0);
    expect(fallingNotes(events, 3)).toHaveLength(1);
    expect(fallingNotes(events, 5)).toHaveLength(1);
    expect(fallingNotes(events, 5.01)).toHaveLength(0);
  });

  it("en pausa nada se mueve: sin avanzar la posición, la cascada es idéntica", () => {
    const events = [note(5), note(5.5, 0.5, 64)];
    const frame = fallingNotes(events, 4);
    expect(fallingNotes(events, 4)).toEqual(frame);
    expect(fallingNotes(events, 4)).toEqual(frame);
    // No hay reloj propio: solo avanza si avanza la posición del transporte.
    expect(fallingNotes(events, 4.5)[0].progress).toBeGreaterThan(frame[0].progress);
  });

  it("conserva pitch, duración, velocity y da una clave estable", () => {
    const [only] = fallingNotes([note(5, 2, 61, 100)], 4);
    expect(only.pitch).toBe(61);
    expect(only.keyId).toBe("c#4");
    expect(only.duration_s).toBe(2);
    expect(only.velocity).toBe(100);
    expect(only.id).toBe("61@5");
  });

  it("conserva la mano de la que sale el color del bloque (D-002.1)", () => {
    expect(fallingNotes([note(5, 1, 60, 90, "left")], 4)[0].hand).toBe("left");
    expect(fallingNotes([note(5, 1, 64, 90, "right")], 4)[0].hand).toBe("right");
    expect(fallingNotes([note(5)], 4)[0].hand).toBeUndefined();
  });

  it("distingue varias notas a la vez (acorde)", () => {
    const events = [note(5, 1, 60), note(5, 1, 64), note(5, 1, 67)];
    const notes = fallingNotes(events, 4);
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map((n) => n.id)).size).toBe(3);
  });

  it("el factor de tempo escala la caída igual que el sonido", () => {
    const raw = [
      { start_seconds: 10, duration_seconds: 1, pitch: 60, velocity: 90, channel: 0, track: 0 },
    ];
    // factor 1.0: suena en el segundo 10. factor 0.5: suena en el 20 (va a la mitad).
    const realTime = buildSchedule(raw, 1.0);
    const halfTime = buildSchedule(raw, 0.5);
    // Un segundo antes de sonar, en ambos casos la nota va por el mismo punto.
    expect(fallingNotes(realTime, 9)[0].progress).toBeCloseTo(0.5, 6);
    expect(fallingNotes(halfTime, 19)[0].progress).toBeCloseTo(0.5, 6);
  });

  it("devuelve nada si el horizonte no vale", () => {
    expect(fallingNotes([note(5)], 4, 0)).toHaveLength(0);
    expect(fallingNotes([note(5)], 4, Number.NaN)).toHaveLength(0);
  });
});
