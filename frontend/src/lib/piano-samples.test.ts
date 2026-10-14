// description: Tests del cargador perezoso y del sampler de muestras de piano.
// context: Criterio de B-007.5; con dobles de WebAudio y fetch, sin red. `npm run test`.

import { describe, expect, it } from "vitest";

import { FakeAudioContext, FakeGainNode, fakeFetch } from "./audio-doubles";
import type { PianoManifest } from "./piano-model";
import { createPianoSampler, type PianoSamplerOptions } from "./piano-samples";
import type { PolySynth } from "./synth";

/**
 * Manifiesto de prueba: C4 y F#4 (dentro de la ventana visible C1–C6) y C7 (fuera,
 * que por eso prefiere la calidad ligera). Cada fichero tiene un tamaño propio:
 * el doble de fetch lo usa como duración, y eso permite saber qué archivo sonó.
 */
const MANIFEST: PianoManifest = {
  source: "banco de prueba",
  license: "CC BY 3.0",
  files: [
    { pitch: 60, layer: "soft", tier: "hq", file: "c4-soft-hq.mp3", duration_s: 3 },
    { pitch: 60, layer: "hard", tier: "hq", file: "c4-hard-hq.mp3", duration_s: 3 },
    { pitch: 60, layer: "soft", tier: "lq", file: "c4-soft-lq.mp3", duration_s: 2.5 },
    { pitch: 60, layer: "hard", tier: "lq", file: "c4-hard-lq.mp3", duration_s: 2.5 },
    { pitch: 63, layer: "soft", tier: "hq", file: "f#4-soft-hq.mp3", duration_s: 3 },
    { pitch: 63, layer: "hard", tier: "hq", file: "f#4-hard-hq.mp3", duration_s: 3 },
    { pitch: 96, layer: "soft", tier: "hq", file: "c7-soft-hq.mp3", duration_s: 2.5 },
    { pitch: 96, layer: "hard", tier: "hq", file: "c7-hard-hq.mp3", duration_s: 2.5 },
    { pitch: 96, layer: "soft", tier: "lq", file: "c7-soft-lq.mp3", duration_s: 2.5 },
    { pitch: 96, layer: "hard", tier: "lq", file: "c7-hard-lq.mp3", duration_s: 2.5 },
  ],
};

/** Duración (s) que devolverá la decodificación de cada fichero. */
const BYTES: Record<string, number> = {
  "c4-soft-hq.mp3": 1001,
  "c4-hard-hq.mp3": 1002,
  "c4-soft-lq.mp3": 1003,
  "c4-hard-lq.mp3": 1004,
  "f#4-soft-hq.mp3": 1005,
  "f#4-hard-hq.mp3": 1006,
  "c7-soft-hq.mp3": 1007,
  "c7-hard-hq.mp3": 1008,
  "c7-soft-lq.mp3": 1009,
  "c7-hard-lq.mp3": 1010,
};

const BASE = "/audio/piano";

function routes(): Record<string, unknown> {
  const map: Record<string, unknown> = { [`${BASE}/manifest.json`]: MANIFEST };
  for (const file of MANIFEST.files) {
    map[`${BASE}/${file.file}`] = { bytes: BYTES[file.file] };
  }
  return map;
}

async function setup(extra: Partial<PianoSamplerOptions> = {}, serve = routes()) {
  const ctx = new FakeAudioContext();
  const master = new FakeGainNode();
  const calls = { scheduled: [] as number[], on: [] as number[], off: [] as number[], silenced: 0 };
  const fallback: PolySynth = {
    scheduleNote: (pitch) => void calls.scheduled.push(pitch),
    noteOn: (pitch) => void calls.on.push(pitch),
    noteOff: (pitch) => void calls.off.push(pitch),
    silence: () => {
      calls.silenced += 1;
    },
  };
  const { fetchImpl, requested } = fakeFetch(serve);
  const sampler = createPianoSampler(ctx.asAudioContext(), ctx.asGainNode(master), {
    fetchImpl,
    fallback,
    ...extra,
  });
  await sampler.ready;
  return { ctx, master, calls, sampler, requested };
}

/** Peso de la capa de cada fuente, en el mismo orden en que se crearon. */
function layerWeights(ctx: FakeAudioContext): number[] {
  return ctx.bufferSources.map((source) => {
    const layerGain = source.connectedTo[0] as FakeGainNode;
    return layerGain.gain.value;
  });
}

describe("createPianoSampler · manifiesto", () => {
  it("carga el manifiesto y lo indexa", async () => {
    const { sampler } = await setup();
    expect(sampler.stats().files).toBe(MANIFEST.files.length);
  });

  it("si el manifiesto falla, la voz de reserva se queda sola sin romper", async () => {
    const { ctx, calls, sampler } = await setup({}, {});
    expect(sampler.stats().files).toBe(0);
    sampler.scheduleNote(60, 90, 1, 0);
    expect(calls.scheduled).toEqual([60]);
    expect(ctx.bufferSources).toHaveLength(0);
    expect(sampler.stats().reserved).toBe(1);
  });
});

describe("createPianoSampler · reproducción", () => {
  it("con la muestra cargada suena la muestra y la reserva no interviene", async () => {
    const { ctx, calls, sampler } = await setup();
    await sampler.preload("hq");
    sampler.scheduleNote(60, 90, 1, 0);
    // Velocity 90: cruce de las dos capas.
    expect(ctx.bufferSources).toHaveLength(2);
    expect(calls.scheduled).toHaveLength(0);
    expect(sampler.stats().sampled).toBe(1);
    expect(sampler.stats().reserved).toBe(0);
  });

  it("semitona la muestra vecina para tocar la tecla pedida", async () => {
    const { ctx, sampler } = await setup();
    await sampler.preload("hq");
    sampler.scheduleNote(61, 20, 1, 0); // 61 está a un semitono de la muestra C4
    expect(ctx.bufferSources[0].detune.value).toBe(100);
    sampler.scheduleNote(62, 20, 1, 0); // 62 queda más cerca de F#4 (63)
    expect(ctx.bufferSources[1].detune.value).toBe(-100);
  });

  it("prefiere la calidad alta dentro de la ventana visible y la ligera fuera", async () => {
    const { ctx, sampler } = await setup();
    await sampler.preload("hq");
    await sampler.preload("lq");
    sampler.scheduleNote(60, 20, 1, 0); // C4, dentro de C1–C6
    expect(ctx.bufferSources[0].buffer?.duration).toBeCloseTo(1.001, 3);
    sampler.scheduleNote(96, 20, 1, 0); // C7, fuera
    expect(ctx.bufferSources[1].buffer?.duration).toBeCloseTo(1.009, 3);
  });

  it("mezcla las dos capas con potencia constante", async () => {
    const { ctx, sampler } = await setup();
    await sampler.preload("hq");
    sampler.scheduleNote(60, 70, 1, 0);
    const weights = layerWeights(ctx);
    expect(weights).toHaveLength(2);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(weights[0]).toBeCloseTo(weights[1], 5);
  });

  it("si solo hay una capa cargada, normaliza en vez de bajar el volumen", async () => {
    // Solo la capa dura de C4: la suave no está en el manifiesto.
    const soloDura = MANIFEST.files.filter((file) => file.pitch === 60 && file.layer === "hard");
    const serve: Record<string, unknown> = {
      [`${BASE}/manifest.json`]: { ...MANIFEST, files: soloDura },
    };
    for (const file of soloDura) serve[`${BASE}/${file.file}`] = { bytes: BYTES[file.file] };
    const { ctx, sampler } = await setup({}, serve);
    await sampler.preload("hq");
    sampler.scheduleNote(60, 70, 1, 0);
    expect(ctx.bufferSources).toHaveLength(1);
    expect(layerWeights(ctx)[0]).toBeCloseTo(1, 5);
  });

  it("si la muestra aún no está, suena la reserva y pide la muestra para la próxima", async () => {
    const { calls, sampler, requested } = await setup();
    sampler.scheduleNote(63, 90, 1, 0);
    expect(calls.scheduled).toEqual([63]);
    expect(requested).toContain(`${BASE}/f#4-soft-hq.mp3`);
    expect(requested).toContain(`${BASE}/f#4-hard-hq.mp3`);
    // Deja que terminen las descargas y la siguiente nota ya es de muestra.
    await new Promise((resolve) => setTimeout(resolve, 5));
    sampler.scheduleNote(63, 90, 1, 0);
    expect(calls.scheduled).toEqual([63]);
    expect(sampler.stats().sampled).toBe(1);
  });

  it("silence corta las fuentes de muestra y avisa a la reserva", async () => {
    const { ctx, calls, sampler } = await setup();
    await sampler.preload("hq");
    sampler.scheduleNote(60, 90, 1, 0);
    sampler.silence();
    expect(ctx.bufferSources.every((source) => source.stoppedAt.length > 0)).toBe(true);
    expect(calls.silenced).toBe(1);
  });

  it("noteOn sostenido no duplica la voz y noteOff la corta", async () => {
    const { ctx, calls, sampler } = await setup();
    await sampler.preload("hq");
    sampler.noteOn(60, 90);
    sampler.noteOn(60, 90);
    expect(ctx.bufferSources).toHaveLength(2);
    sampler.noteOff(60);
    expect(ctx.bufferSources.every((source) => source.stoppedAt.length > 0)).toBe(true);
    expect(calls.off).toEqual([60]);
  });
});

describe("createPianoSampler · carga", () => {
  it("preload pide solo los ficheros de su calidad", async () => {
    const { sampler, requested } = await setup();
    await sampler.preload("lq");
    expect(requested).toContain(`${BASE}/c4-soft-lq.mp3`);
    expect(requested).not.toContain(`${BASE}/c4-soft-hq.mp3`);
    expect(sampler.stats().decoded).toBe(4);
  });

  it("no pide dos veces la misma muestra", async () => {
    const { sampler, requested } = await setup();
    await sampler.preload("hq");
    const firsts = requested.filter((url) => url === `${BASE}/c4-soft-hq.mp3`);
    expect(firsts).toHaveLength(1);
  });

  it("poda los buffers menos usados cuando se pasa del tope", async () => {
    const { sampler } = await setup({ maxDecoded: 2 });
    await sampler.preload("hq");
    expect(sampler.stats().decoded).toBe(2);
  });

  it("una descarga caída no rompe la precarga", async () => {
    const serve = routes();
    delete serve[`${BASE}/c4-soft-hq.mp3`];
    const { sampler } = await setup({}, serve);
    await expect(sampler.preload("hq")).resolves.toBeUndefined();
    expect(sampler.stats().decoded).toBe(5);
  });
});
