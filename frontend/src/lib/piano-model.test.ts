// description: Tests del modelo de piano: selección de muestras, capas y voz de reserva.
// context: Criterio de B-007.5; matemática pura, sin WebAudio. Se ejecuta con `npm run test`.

import { describe, expect, it } from "vitest";

import {
  attackS,
  clampDetune,
  clampVelocity,
  DEFAULT_PARTIALS,
  detuneCents,
  filesForTier,
  HARD_VELOCITY,
  layerMix,
  manifestPitches,
  MAX_DETUNE_CENTS,
  partialAmps,
  partialDecayS,
  partialFreqs,
  peakGain,
  releaseS,
  samplePitchFor,
  SOFT_VELOCITY,
  tierForPitch,
  type PianoManifest,
} from "./piano-model";

/** Rejilla real de un banco muestreado en terceras menores (C, D#, F#, A). */
const GRID = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60];

/** Rejilla completa A0–C8 del banco (terceras menores desde la A0). */
const FULL_GRID = Array.from({ length: 30 }, (_, index) => 21 + index * 3);

const MANIFEST: PianoManifest = {
  source: "Salamander Grand Piano",
  license: "CC BY 3.0",
  files: [
    { pitch: 60, layer: "soft", tier: "hq", file: "C4-soft-hq.mp3", duration_s: 3 },
    { pitch: 60, layer: "hard", tier: "hq", file: "C4-hard-hq.mp3", duration_s: 3 },
    { pitch: 24, layer: "soft", tier: "hq", file: "C1-soft-hq.mp3", duration_s: 4 },
    { pitch: 21, layer: "hard", tier: "lq", file: "A0-hard-lq.mp3", duration_s: 2 },
  ],
};

describe("clampVelocity", () => {
  it("recorta al rango MIDI y redondea", () => {
    expect(clampVelocity(0)).toBe(1);
    expect(clampVelocity(128)).toBe(127);
    expect(clampVelocity(80.6)).toBe(81);
  });

  it("lo no numérico cae a una velocity media", () => {
    expect(clampVelocity(Number.NaN)).toBe(64);
    expect(clampVelocity(Number.POSITIVE_INFINITY)).toBe(64);
    expect(clampVelocity(Number.NEGATIVE_INFINITY)).toBe(64);
  });
});

describe("manifiesto y elección de muestra", () => {
  it("lista los pitches muestreados ordenados y sin repetidos", () => {
    expect(manifestPitches(MANIFEST)).toEqual([21, 24, 60]);
  });

  it("elige la tecla muestreada más cercana", () => {
    expect(samplePitchFor(60, GRID)).toBe(60);
    expect(samplePitchFor(61, GRID)).toBe(60);
    expect(samplePitchFor(58, GRID)).toBe(57);
    expect(samplePitchFor(21, GRID)).toBe(21);
    // Por encima del último muestreo, la nota usa la muestra más aguda.
    expect(samplePitchFor(108, GRID)).toBe(60);
  });

  it("en empate de distancia gana la muestra inferior", () => {
    // 62 está a 2 semitonos de 60 y de 64: gana 60.
    expect(samplePitchFor(62, [60, 64])).toBe(60);
  });

  it("devuelve null sin muestras disponibles", () => {
    expect(samplePitchFor(60, [])).toBeNull();
  });

  it("la muestrea en terceras menores no desvina más de 2 semitonos", () => {
    for (const pitch of [21, 24, 61, 84, 108]) {
      const nearest = samplePitchFor(pitch, FULL_GRID);
      expect(nearest).not.toBeNull();
      expect(Math.abs(detuneCents(pitch, nearest as number))).toBeLessThanOrEqual(150);
    }
  });
});

describe("detune", () => {
  it("calcula el semitonaje en céntimos con signo", () => {
    expect(detuneCents(62, 60)).toBe(200);
    expect(detuneCents(58, 60)).toBe(-200);
    expect(detuneCents(60, 60)).toBe(0);
  });

  it("recorta al máximo tolerable y tolera basura", () => {
    expect(clampDetune(500)).toBe(MAX_DETUNE_CENTS);
    expect(clampDetune(-500)).toBe(-MAX_DETUNE_CENTS);
    expect(clampDetune(Number.NaN)).toBe(0);
  });
});

describe("layerMix", () => {
  it("bajo la capa grave solo suena esa capa", () => {
    expect(layerMix(SOFT_VELOCITY)).toEqual({ soft: 1, hard: 0 });
    expect(layerMix(10)).toEqual({ soft: 1, hard: 0 });
  });

  it("por encima de la capa fuerte solo suena esa capa", () => {
    expect(layerMix(HARD_VELOCITY)).toEqual({ soft: 0, hard: 1 });
    expect(layerMix(127)).toEqual({ soft: 0, hard: 1 });
  });

  it("en el cruce mantiene la potencia (sin dip de volumen)", () => {
    const middle = layerMix((SOFT_VELOCITY + HARD_VELOCITY) / 2);
    expect(middle.soft).toBeCloseTo(middle.hard, 5);
    expect(middle.soft ** 2 + middle.hard ** 2).toBeCloseTo(1, 5);
  });

  it("más velocity = más capa fuerte (más brillo)", () => {
    let previous = -1;
    for (let velocity = SOFT_VELOCITY; velocity <= HARD_VELOCITY; velocity += 5) {
      const { hard } = layerMix(velocity);
      expect(hard).toBeGreaterThanOrEqual(previous);
      previous = hard;
    }
  });
});

describe("tierForPitch", () => {
  it("la ventana visible va en calidad normal", () => {
    expect(tierForPitch(24)).toBe("hq"); // C1
    expect(tierForPitch(60)).toBe("hq"); // C4
    expect(tierForPitch(84)).toBe("hq"); // C6
  });

  it("lo que no se ve va en calidad ligera", () => {
    expect(tierForPitch(21)).toBe("lq"); // A0
    expect(tierForPitch(85)).toBe("lq"); // C#6
    expect(tierForPitch(108)).toBe("lq"); // C8
  });

  it("un rango ilegible cae a calidad ligera en lugar de romper", () => {
    expect(tierForPitch(60, { fromKey: "zz", toKey: "c6" })).toBe("lq");
  });
});

describe("filesForTier", () => {
  it("separa los ficheros por calidad", () => {
    expect(filesForTier(MANIFEST, "hq").map((file) => file.file)).toEqual([
      "C4-soft-hq.mp3",
      "C4-hard-hq.mp3",
      "C1-soft-hq.mp3",
    ]);
    expect(filesForTier(MANIFEST, "lq")).toHaveLength(1);
  });
});

describe("voz aditiva de reserva", () => {
  it("el primer parcial es la fundamental y crece con el índice", () => {
    const freqs = partialFreqs(440);
    expect(freqs).toHaveLength(DEFAULT_PARTIALS);
    expect(freqs[0]).toBeCloseTo(440, 0);
    for (let i = 1; i < freqs.length; i += 1) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });

  it("la inarmonicidad desafina un poco los parciales altos", () => {
    const freqs = partialFreqs(440);
    expect(freqs[1]).toBeGreaterThan(880);
    expect(freqs[3]).toBeGreaterThan(1320);
  });

  it("recorta los parciales que pasan del Nyquist", () => {
    expect(partialFreqs(20000).length).toBeLessThan(DEFAULT_PARTIALS);
    expect(partialFreqs(Number.NaN)).toEqual([]);
  });

  it("los pesos suman 1 y decrecen", () => {
    const amps = partialAmps(80);
    expect(amps.reduce((sum, amp) => sum + amp, 0)).toBeCloseTo(1, 5);
    for (let i = 1; i < amps.length; i += 1) {
      expect(amps[i]).toBeLessThan(amps[i - 1]);
    }
  });

  it("golpear más fuerte deja más brillo (más peso en los parciales altos)", () => {
    const soft = partialAmps(20);
    const hard = partialAmps(120);
    expect(hard[1]).toBeGreaterThan(soft[1]);
    expect(hard[3]).toBeGreaterThan(soft[3]);
  });

  it("los graves suenan más que los agudos", () => {
    expect(partialDecayS(55, 1)).toBeGreaterThan(partialDecayS(880, 1));
  });

  it("dentro de una nota los parciales altos se apagan antes", () => {
    const decay = partialDecayS(261.63, 1);
    expect(partialDecayS(261.63, 4)).toBeLessThan(decay);
  });

  it("el ataque es corto y más lento a medida que baja la velocity", () => {
    expect(attackS(127)).toBeCloseTo(0.004, 5);
    expect(attackS(1)).toBeLessThanOrEqual(0.008);
    expect(attackS(20)).toBeGreaterThan(attackS(110));
  });

  it("el release amortigua sin cortar de golpe", () => {
    expect(releaseS(127)).toBeCloseTo(0.1, 5);
    expect(releaseS(10)).toBeGreaterThan(releaseS(127));
    expect(releaseS(10)).toBeLessThan(0.3);
  });

  it("la ganancia de pico crece con la velocity y no satura sola", () => {
    expect(peakGain(127)).toBeLessThanOrEqual(0.45);
    expect(peakGain(20)).toBeLessThan(peakGain(110));
    expect(peakGain(Number.NaN)).toBeGreaterThan(0);
  });
});
