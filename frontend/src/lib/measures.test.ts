// description: Tests del compás actual con reloj falso: borde, pausa y factor de tempo.
// context: Criterio de B-008.3; la posición la produce PlaybackEngine, sin DOM.

import { describe, expect, it } from "vitest";

import type { PieceMeasures, PlayableNote } from "./api-client";
import { formatMeasure, formatSignature, measureIndexAt } from "./measures";
import { PlaybackEngine } from "./playback-engine";

const GRID: PieceMeasures = {
  count: 4,
  starts_s: [0, 2, 4, 6],
  signatures: [
    [4, 4],
    [4, 4],
    [3, 4],
    [3, 4],
  ],
  end_s: 8,
};

const SCORE: PlayableNote[] = [
  { pitch: 60, start_seconds: 0, duration_seconds: 1, velocity: 80, channel: 0, track: 1 },
  { pitch: 62, start_seconds: 7, duration_seconds: 1, velocity: 80, channel: 0, track: 1 },
];

/** Motor con reloj falso al que se le pide el compás actual de su posición viva. */
function makeEngine() {
  let now = 0;
  const engine = new PlaybackEngine(
    { now: () => now },
    { scheduleNote: () => undefined, silence: () => undefined },
  );
  engine.load(SCORE, { duration_s: 8 });
  return {
    engine,
    advance: (dt: number) => {
      now += dt;
    },
    index: () =>
      measureIndexAt(GRID, engine.snapshot().tempoFactor, engine.snapshot().position_s),
  };
}

describe("measureIndexAt", () => {
  it("sin rejilla devuelve null", () => {
    expect(measureIndexAt(null, 1, 5)).toBeNull();
    expect(measureIndexAt({ ...GRID, starts_s: [] }, 1, 5)).toBeNull();
  });

  it("cruza el borde de compás al avanzar con el reloj", () => {
    const h = makeEngine();
    h.engine.play();
    expect(h.index()).toBe(0);

    h.advance(1.5);
    expect(h.index()).toBe(0);

    h.advance(0.5); // posición 2.0: borde exacto → compás que empieza ahí
    expect(h.index()).toBe(1);

    h.advance(2.0); // posición 4.0
    expect(h.index()).toBe(2);

    h.advance(2.0); // posición 6.0
    expect(h.index()).toBe(3);
  });

  it("en pausa el compás no avanza", () => {
    const h = makeEngine();
    h.engine.play();
    h.advance(1.0);
    h.engine.tick();
    const frozen = h.index();
    h.engine.pause();

    h.advance(5);
    h.engine.tick();
    expect(h.index()).toBe(frozen);
  });

  it("con factor de tempo avanza en coherencia con el audio", () => {
    const h = makeEngine();
    h.engine.load(SCORE, { duration_s: 8, tempoFactor: 2 });
    h.engine.play();
    // La posición avanza al doble; el compás cruza cuando el audio cruza el compás.
    h.advance(1.0);
    h.engine.tick();
    expect(h.index()).toBe(2);
    h.advance(1.0);
    h.engine.tick();
    expect(h.index()).toBe(3);
  });

  it("fuera de la rejilla se recorta a los extremos", () => {
    expect(measureIndexAt(GRID, 1, 999)).toBe(3);
    expect(measureIndexAt(GRID, 1, -5)).toBe(0);
  });
});

describe("formato de compás y firma", () => {
  it("compás actual/total y firma legibles", () => {
    expect(formatMeasure(3, 32)).toBe("3/32");
    expect(formatSignature([4, 4])).toBe("4/4");
    expect(formatSignature([3, 4])).toBe("3/4");
  });

  it("sin datos muestra indicador vacío", () => {
    expect(formatMeasure(null, 32)).toBe("–");
    expect(formatMeasure(3, null)).toBe("–");
    expect(formatMeasure(undefined, undefined)).toBe("–");
    expect(formatSignature(null)).toBe("–");
    expect(formatSignature(undefined)).toBe("–");
  });
});
