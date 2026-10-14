// description: Voz aditiva de reserva (parciales con inarmonicidad) compartida por transporte y audición.
// context: B-007.5; suena mientras no hay muestra decodificada y si una muestra falla, para que el
// piano nunca quede mudo. La matemática vive en piano-model.ts; aquí solo el cableado WebAudio.

import {
  attackS,
  partialAmps,
  partialDecayS,
  partialFreqs,
  peakGain,
  releaseS,
} from "./piano-model";
import { pitchToFrequency } from "./playback-schedule";

export interface PolySynth {
  /** Programa una nota con duración (transporte). */
  scheduleNote(pitch: number, velocity: number, duration_s: number, atTime_s: number): void;
  /** Empieza una nota sostenida (audición por teclado). */
  noteOn(pitch: number, velocity: number): void;
  /** Suelta una nota sostenida. */
  noteOff(pitch: number): void;
  /** Silencia todo lo que suene, programado o sostenido. */
  silence(): void;
}

/** Tope de voces simultáneas de la reserva: al saturar se corta la más vieja. */
export const MAX_VOICES = 24;

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
}

interface ActiveVoice {
  partials: Partial[];
  /** Envoltorio de la nota completa (ataque y liberación). */
  env: GainNode;
  /** Instante de creación, para robar la voz más vieja. */
  bornAt: number;
  released: boolean;
}

/**
 * Construye la voz de reserva: una suma de senos (fundamental + armónicos con
 * inarmonicidad) donde cada parcial se apaga a su ritmo, y un envolvente
 * percusivo sin sustain real, porque un piano de verdad no sostiene: decae.
 */
export function createPolySynth(
  ctx: AudioContext,
  master: GainNode,
  peakBase = 0.5,
): PolySynth {
  const voices = new Set<ActiveVoice>();
  /** Voces sostenidas por pitch (audición del teclado del PC). */
  const sustained = new Map<number, ActiveVoice>();

  function stopVoice(voice: ActiveVoice, atTime: number, fadeS: number): void {
    if (voice.released) return;
    voice.released = true;
    const stopAt = Math.max(atTime, ctx.currentTime);
    try {
      voice.env.gain.cancelScheduledValues(stopAt);
      voice.env.gain.setValueAtTime(Math.max(voice.env.gain.value, 0.0001), stopAt);
      voice.env.gain.exponentialRampToValueAtTime(0.0001, stopAt + fadeS);
      for (const partial of voice.partials) partial.osc.stop(stopAt + fadeS + 0.02);
    } catch {
      // Un oscilador ya detenido no debe romper la pausa.
    }
    voices.delete(voice);
  }

  function startVoice(pitch: number, velocity: number, atTime: number): ActiveVoice {
    // Al saturar se roba la voz más vieja: mejor perder una cola que recortar todo.
    if (voices.size >= MAX_VOICES) {
      const oldest = [...voices].reduce((a, b) => (a.bornAt <= b.bornAt ? a : b));
      stopVoice(oldest, ctx.currentTime, 0.05);
    }

    const env = ctx.createGain();
    env.connect(master);

    const freqs = partialFreqs(pitchToFrequency(pitch));
    const amps = partialAmps(velocity, freqs.length);
    const partials: Partial[] = freqs.map((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const weight = Math.max(amps[index] * peakGain(velocity), 0.0001);
      // Cada parcial arranca ya con su peso y decae a su ritmo: los agudos mueren antes.
      gain.gain.setValueAtTime(weight, atTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, atTime + partialDecayS(pitchToFrequency(pitch), index + 1));
      osc.connect(gain);
      gain.connect(env);
      return { osc, gain };
    });

    const voice: ActiveVoice = { partials, env, bornAt: ctx.currentTime, released: false };
    voices.add(voice);
    return voice;
  }

  return {
    scheduleNote(pitch, velocity, duration_s, atTime_s): void {
      const startAt = Math.max(atTime_s, ctx.currentTime);
      const voice = startVoice(pitch, velocity, startAt);
      const ring = Math.max(duration_s, 0.35) + releaseS(velocity);
      voice.env.gain.setValueAtTime(0.0001, startAt);
      voice.env.gain.exponentialRampToValueAtTime(Math.max(peakGain(velocity), 0.0011), startAt + attackS(velocity));
      voice.env.gain.exponentialRampToValueAtTime(0.0001, startAt + ring);
      for (const partial of voice.partials) {
        partial.osc.start(startAt);
        partial.osc.stop(startAt + ring + 0.05);
      }
    },
    noteOn(pitch, velocity): void {
      if (sustained.has(pitch)) return;
      const startAt = ctx.currentTime;
      const voice = startVoice(pitch, velocity, startAt);
      voice.env.gain.setValueAtTime(0.0001, startAt);
      voice.env.gain.exponentialRampToValueAtTime(Math.max(peakGain(velocity), 0.0011), startAt + attackS(velocity));
      for (const partial of voice.partials) {
        partial.osc.start(startAt);
        // Sin nota cortada: los parciales siguen su decaimiento natural hasta soltar.
        partial.osc.stop(startAt + partialDecayS(pitchToFrequency(pitch), 1) + 0.1);
      }
      sustained.set(pitch, voice);
    },
    noteOff(pitch): void {
      const voice = sustained.get(pitch);
      if (!voice) return;
      sustained.delete(pitch);
      stopVoice(voice, ctx.currentTime, releaseS(96));
    },
    silence(): void {
      const now = ctx.currentTime;
      for (const voice of [...voices]) stopVoice(voice, now, 0.05);
      sustained.clear();
    },
  };
}
