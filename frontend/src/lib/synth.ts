// description: Sintetizador polifónico WebAudio compartido (transporte + audición).
// context: B-007.2; PlaybackEngine lo usa como voz y el teclado del PC para sonar teclas.

import { pitchToFrequency } from "./playback-schedule";

export interface PolySynth {
  /** Programa una nota con duración (transporte). */
  scheduleNote(pitch: number, velocity: number, duration_s: number, atTime_s: number): void;
  /** Empieza una nota sostenida (audición por teclado). */
  noteOn(pitch: number, velocity: number): void;
  /** Suelta una nota sostenida. */
  noteOff(pitch: number): void;
  /** Silencia todo. */
  silence(): void;
}

interface ActiveNodes {
  osc: OscillatorNode;
  gain: GainNode;
}

function attack(
  ctx: AudioContext,
  gain: GainNode,
  peak: number,
  startAt: number,
): void {
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0011), startAt + 0.01);
}

export function createPolySynth(
  ctx: AudioContext,
  master: GainNode,
  peakBase = 0.5,
): PolySynth {
  const sustained = new Map<number, ActiveNodes>();

  function startVoice(pitch: number, velocity: number): ActiveNodes {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = pitchToFrequency(pitch);
    osc.connect(gain);
    gain.connect(master);
    return { osc, gain };
  }

  function release(nodes: ActiveNodes): void {
    const now = ctx.currentTime;
    try {
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setTargetAtTime(0.0001, now, 0.015);
      nodes.osc.stop(now + 0.1);
    } catch {
      // Un oscilador ya detenido no debe romper la pausa.
    }
  }

  return {
    scheduleNote(pitch, velocity, duration_s, atTime_s): void {
      const startAt = Math.max(atTime_s, ctx.currentTime);
      const sounding = Math.max(duration_s, 0.05);
      const voice = startVoice(pitch, velocity);
      const peak = peakBase * (velocity / 127);
      attack(ctx, voice.gain, peak, startAt);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, startAt + sounding);
      voice.osc.start(startAt);
      voice.osc.stop(startAt + sounding + 0.05);
    },
    noteOn(pitch, velocity): void {
      if (sustained.has(pitch)) return;
      const voice = startVoice(pitch, velocity);
      attack(ctx, voice.gain, peakBase * (velocity / 127), ctx.currentTime);
      voice.osc.start();
      sustained.set(pitch, voice);
    },
    noteOff(pitch): void {
      const voice = sustained.get(pitch);
      if (!voice) return;
      sustained.delete(pitch);
      release(voice);
    },
    silence(): void {
      for (const voice of sustained.values()) release(voice);
      sustained.clear();
    },
  };
}
