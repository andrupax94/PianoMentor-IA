// description: Tests del rebote visual del gate (B-032.8): sobresalto 40 % de la duración recortado a [150, 500] ms, avance lineal hasta el margen, rebobinado cuadrático ease-out de 150 ms, líneas quietas después; hit y tecla errónea solo desvanecen el offset (150 ms), sin tocar el transporte.
// context: Módulo puro sin DOM; el motor y la controladora de gates lo consumen. En waiting el schedule corre 1 s escalado por cada s de reloj, así que el sobresalto avanza a la misma velocidad que venía la barra.
import { describe, expect, it } from "vitest";

import {
  decayOffset_s,
  GATE_OVERSHOOT_MAX_S,
  GATE_OVERSHOOT_MIN_S,
  GATE_OVERSHOOT_RATIO,
  GATE_REWIND_S,
  gateOvershoot_s,
  waitingGateOffset_s,
} from "./gate-display";

describe("gateOvershoot_s", () => {
  it("es el 40 % de la duración de la nota", () => {
    expect(gateOvershoot_s(1.0)).toBeCloseTo(0.4, 12);
    expect(gateOvershoot_s(2.0)).toBeCloseTo(GATE_OVERSHOOT_MAX_S, 12); // 0,8 > recorte
  });

  it("queda recortado a [150 ms, 500 ms]", () => {
    // Corchea a 120 BPM (0,25 s): el 40 % da 100 ms → recortado al mínimo.
    expect(gateOvershoot_s(0.25)).toBeCloseTo(GATE_OVERSHOOT_MIN_S, 12);
    const forTolerance = 0.4; // 40 % = 160 ms → dentro del rango
    expect(gateOvershoot_s(forTolerance)).toBeGreaterThan(GATE_OVERSHOOT_MIN_S);
    expect(gateOvershoot_s(4.0)).toBeCloseTo(GATE_OVERSHOOT_MAX_S, 12);
    expect(GATE_OVERSHOOT_RATIO).toBe(0.4);
    expect(GATE_REWIND_S).toBeCloseTo(0.15, 12);
  });

  it("sin duración conocida no hay sobresalto", () => {
    expect(gateOvershoot_s(0)).toBeCloseTo(GATE_OVERSHOOT_MIN_S, 12);
    expect(waitingGateOffset_s(10, 0)).toBe(0);
  });
});

describe("waitingGateOffset_s", () => {
  const overshoot = 0.25;

  it("avanza lineal hasta el margen (la misma velocidad que venía la barra)", () => {
    expect(waitingGateOffset_s(0, overshoot)).toBeCloseTo(0, 12);
    expect(waitingGateOffset_s(0.1, overshoot)).toBeCloseTo(0.1, 12);
    expect(waitingGateOffset_s(0.2, overshoot)).toBeCloseTo(0.2, 12);
    expect(waitingGateOffset_s(0.249, overshoot)).toBeCloseTo(0.249, 12);
  });

  it("rebobina con easing cuadrático hasta la línea en 150 ms", () => {
    // Justo al final del sobresalto: en la cima, aún sin retroceder.
    expect(waitingGateOffset_s(0.25, overshoot)).toBeCloseTo(0.25, 12);
    // Cuadrado recorre el 75 % del camino en la mitad del rebobinado.
    const half = waitingGateOffset_s(0.25 + GATE_REWIND_S / 2, overshoot);
    expect(half).toBeCloseTo(overshoot * 0.25, 9);
    // Y al acabar el rebobinado queda en la línea.
    expect(waitingGateOffset_s(0.25 + GATE_REWIND_S, overshoot)).toBeCloseTo(0, 12);
  });

  it("después del rebobinado queda quieta en el punto de pulsación", () => {
    expect(waitingGateOffset_s(1.5, overshoot)).toBe(0);
    expect(waitingGateOffset_s(30, overshoot)).toBe(0);
  });

  it("sin sobresalto (gate sin duración) siempre en la línea", () => {
    expect(waitingGateOffset_s(0.5, 0)).toBe(0);
    expect(waitingGateOffset_s(5, 0)).toBe(0);
  });
});

describe("decayOffset_s", () => {
  it("desvanece en línea recta hasta 0 en 150 ms", () => {
    expect(decayOffset_s(0.2, 0)).toBeCloseTo(0.2, 12);
    expect(decayOffset_s(0.2, 0.075)).toBeCloseTo(0.1, 9);
    expect(decayOffset_s(0.2, 0.15)).toBe(0);
    expect(decayOffset_s(0.2, 1)).toBe(0);
  });

  it("duración 0 (o offset 0) lo borra al momento", () => {
    expect(decayOffset_s(0.2, 0.001, 0)).toBe(0);
    expect(decayOffset_s(0, 0.001)).toBe(0);
  });
});
