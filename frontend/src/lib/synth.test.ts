// description: Tests de la voz aditiva de reserva (parciales, envolvente y polifonía).
// context: Criterio de B-007.5; con un AudioContext doble, sin DOM. `npm run test`.

import { describe, expect, it } from "vitest";

import { FakeAudioContext, FakeGainNode } from "./audio-doubles";
import { attackS, DEFAULT_PARTIALS, peakGain, releaseS } from "./piano-model";
import { pitchToFrequency } from "./playback-schedule";
import { createPolySynth, MAX_VOICES } from "./synth";

function setup() {
  const ctx = new FakeAudioContext();
  const master = new FakeGainNode();
  const synth = createPolySynth(ctx.asAudioContext(), ctx.asGainNode(master), 0.5);
  return { ctx, master, synth };
}

/** Peso del parcial 2 respecto a la fundamental para una velocity dada. */
function secondPartialWeight(velocity: number): number {
  const { ctx, synth } = setup();
  synth.scheduleNote(60, velocity, 1, 0);
  // gains[0] es el envolvente; gains[1] es el parcial 1 y gains[2] el parcial 2.
  const fundamental = ctx.gains[1].gain.setAtTime[0].value;
  return ctx.gains[2].gain.setAtTime[0].value / fundamental;
}

describe("createPolySynth", () => {
  it("el primer oscilador arranca en la frecuencia de pitchToFrequency", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(60, 80, 1, 0);
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(pitchToFrequency(60), 3);
    expect(ctx.oscillators[0].type).toBe("sine");
  });

  it("cada nota es una suma de parciales y no una onda simple", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(60, 80, 1, 0);
    expect(ctx.oscillators.length).toBe(DEFAULT_PARTIALS);
  });

  it("programa la nota en el instante pedido y la corta al terminar", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(60, 100, 2, 5);
    for (const osc of ctx.oscillators) {
      expect(osc.startedAt[0]).toBe(5);
      expect(osc.stoppedAt[0]).toBeGreaterThan(5 + 2);
    }
  });

  it("los parciales altos se apagan antes que la fundamental", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(48, 90, 4, 0);
    // gains[0] es el envolvente; de ahí en adelante hay un gain por parcial.
    const decayTimes = ctx.gains.slice(1).map((gain) => gain.gain.exponential[0].at);
    expect(decayTimes).toHaveLength(DEFAULT_PARTIALS);
    for (let i = 1; i < decayTimes.length; i += 1) {
      expect(decayTimes[i]).toBeLessThan(decayTimes[i - 1]);
    }
  });

  it("el envolvente ataca rápido y termina en silencio (sin sustain plano)", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(60, 120, 1.5, 0);
    // gains[0] es el envolvente; los siguientes son los parciales.
    const env = ctx.gains[0];
    const up = env.gain.exponential[0];
    const down = env.gain.exponential[1];
    expect(up.value).toBeCloseTo(peakGain(120), 5);
    expect(up.at).toBeCloseTo(attackS(120), 5);
    expect(down.value).toBe(0.0001);
    expect(down.at).toBeCloseTo(Math.max(1.5, 0.35) + releaseS(120), 5);
    expect(down.at).toBeGreaterThan(up.at);
  });

  it("golpear más fuerte deja más peso en los parciales agudos", () => {
    expect(secondPartialWeight(120)).toBeGreaterThan(secondPartialWeight(20));
  });

  it("noteOn sostenido no duplica la voz de la misma tecla", () => {
    const { ctx, synth } = setup();
    synth.noteOn(60, 90);
    synth.noteOn(60, 90);
    expect(ctx.oscillators).toHaveLength(DEFAULT_PARTIALS);
    synth.noteOff(60);
    expect(ctx.oscillators.every((osc) => osc.stoppedAt.length > 0)).toBe(true);
  });

  it("noteOff sin nota suelta no rompe", () => {
    const { synth } = setup();
    expect(() => synth.noteOff(72)).not.toThrow();
  });

  it("silence corta tanto lo programado como lo sostenido", () => {
    const { ctx, synth } = setup();
    synth.scheduleNote(60, 90, 3, 0);
    synth.noteOn(64, 90);
    synth.silence();
    expect(ctx.oscillators.every((osc) => osc.stoppedAt.length > 0)).toBe(true);
    // Y una segunda vez no vuelve a tocar nada.
    const stops = ctx.oscillators.reduce((sum, osc) => sum + osc.stoppedAt.length, 0);
    synth.silence();
    expect(ctx.oscillators.reduce((sum, osc) => sum + osc.stoppedAt.length, 0)).toBe(stops);
  });

  it("al saturar roba la voz más vieja en lugar de recortar todo", () => {
    const { ctx, synth } = setup();
    for (let i = 0; i < MAX_VOICES; i += 1) {
      ctx.currentTime = i;
      synth.scheduleNote(60 + (i % 12), 90, 10, i);
    }
    const before = ctx.oscillators.length;
    ctx.currentTime = MAX_VOICES;
    synth.scheduleNote(72, 90, 10, MAX_VOICES);
    // Se crean parciales nuevos y los de la voz robada quedan cortados.
    expect(ctx.oscillators.length).toBeGreaterThan(before);
    expect(ctx.oscillators.some((osc) => osc.stoppedAt.length > 0)).toBe(true);
  });
});
