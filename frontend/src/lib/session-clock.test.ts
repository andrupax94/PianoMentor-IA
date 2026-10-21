// description: Tests del reloj del estudiante: ancla en la primera tecla y reset.
// context: Criterio de B-012.1; sin DOM: el reloj recibe el `now` inyectado, así que el tiempo se prueba determinista.

import { describe, expect, it } from "vitest";

import { createSessionClock } from "./session-clock";

describe("createSessionClock", () => {
  it("ancla en la primera tecla: la primera marca es cero", () => {
    let t = 5_000;
    const clock = createSessionClock(() => t);

    expect(clock.elapsedSeconds()).toBe(0);
  });

  it("cuenta en segundos desde el ancla", () => {
    let t = 0;
    const clock = createSessionClock(() => t);
    clock.elapsedSeconds();

    t = 1_500;
    expect(clock.elapsedSeconds()).toBe(1.5);

    t = 4_000;
    expect(clock.elapsedSeconds()).toBe(4);
  });

  it("reset vuelve a anclar en la próxima tecla", () => {
    let t = 0;
    const clock = createSessionClock(() => t);
    clock.elapsedSeconds();
    t = 2_000;

    clock.reset();
    expect(clock.elapsedSeconds()).toBe(0);

    t = 3_250;
    expect(clock.elapsedSeconds()).toBe(1.25);
  });
});
