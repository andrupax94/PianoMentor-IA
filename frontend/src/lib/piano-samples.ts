// description: Cargador perezoso de muestras de piano y sampler que las reproduce.
// context: B-007.5; expone el mismo contrato PolySynth que synth.ts, así el transporte de
// B-006 y el teclado del PC no cambian. Si una muestra aún no está decodificada, suena la
// voz aditiva de reserva: la app nunca queda muda ni vuelve al timbre viejo.

import {
  clampDetune,
  detuneCents,
  layerMix,
  manifestPitches,
  releaseS,
  samplePitchFor,
  tierForPitch,
  type PianoManifest,
  type SampleFile,
  type SampleLayer,
  type SampleTier,
} from "./piano-model";
import type { PolySynth } from "./synth";

/** Origen por defecto; admite CDN con NEXT_PUBLIC_AUDIO_BASE_URL (ver contingencia en B-007.5). */
export const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_AUDIO_BASE_URL ?? "/audio/piano";

/** Tope de buffers decodificados en memoria; al superarlo se poda lo menos usado. */
export const MAX_DECODED_BUFFERS = 48;

/** Descargas concurrentes al precargar una capa. */
const PRELOAD_CONCURRENCY = 4;

export interface PianoSamplerOptions {
  /** Carpeta donde viven los MP3 y el manifiesto. */
  baseUrl?: string;
  /** Voz que suena mientras no hay muestra decodificada (y si el manifiesto falla). */
  fallback?: PolySynth;
  /** Inyección para tests. */
  fetchImpl?: typeof fetch;
  /** Tope de buffers decodificados; por defecto MAX_DECODED_BUFFERS. */
  maxDecoded?: number;
}

export interface PianoSamplerStats {
  /** Ficheros que declara el manifiesto. */
  files: number;
  /** Buffers decodificados residentes en memoria. */
  decoded: number;
  /** Descargas o decodificaciones en curso. */
  loading: number;
  /** Notas resueltas con muestra real. */
  sampled: number;
  /** Notas resueltas con la voz de reserva. */
  reserved: number;
}

export interface PianoSampler extends PolySynth {
  /** Precarga en segundo plano una calidad (hq = ventana visible, lq = resto del teclado). */
  preload(tier: SampleTier): Promise<void>;
  /** Se resuelve cuando el manifiesto está cargado, haya ido bien o no. */
  readonly ready: Promise<void>;
  stats(): PianoSamplerStats;
}

interface ActiveSampledVoice {
  sources: AudioBufferSourceNode[];
  /** Envoltorio de la nota (fundido de salida y corte). */
  env: GainNode;
}

/** `decodeAudioData` en formato promesa, con recambio para navegantes antiguos. */
function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolvePromise, rejectPromise) => {
    const maybe = ctx.decodeAudioData(data, resolvePromise, rejectPromise) as unknown;
    if (maybe && typeof (maybe as Promise<AudioBuffer>).then === "function") {
      (maybe as Promise<AudioBuffer>).then(resolvePromise, rejectPromise);
    }
  });
}

export function createPianoSampler(
  ctx: AudioContext,
  master: GainNode,
  options: PianoSamplerOptions = {},
): PianoSampler {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const maxDecoded = options.maxDecoded ?? MAX_DECODED_BUFFERS;
  const fallback = options.fallback;

  /** Buffers residentes, en orden de uso (Map respeta la inserción: sirve de poda LRU). */
  const decoded = new Map<string, AudioBuffer>();
  /** Descargas en curso, para no pedir dos veces la misma muestra. */
  const loading = new Map<string, Promise<AudioBuffer | null>>();
  const voices = new Set<ActiveSampledVoice>();
  const sustained = new Map<number, ActiveSampledVoice>();

  let manifest: PianoManifest | null = null;
  let pitches: number[] = [];
  const stats: PianoSamplerStats = { files: 0, decoded: 0, loading: 0, sampled: 0, reserved: 0 };

  const keyOf = (pitch: number, layer: SampleLayer, tier: SampleTier) => `${pitch}-${layer}-${tier}`;

  function index(): Map<string, SampleFile> {
    const map = new Map<string, SampleFile>();
    for (const file of manifest?.files ?? []) map.set(keyOf(file.pitch, file.layer, file.tier), file);
    return map;
  }

  let files = index();

  /** Buffer de una tecla muestreada: prima la calidad de su rango y cae a la otra. */
  function bufferFor(samplePitch: number, layer: SampleLayer): AudioBuffer | null {
    const preferred = tierForPitch(samplePitch);
    const tiers: SampleTier[] =
      preferred === "hq" ? ["hq", "lq"] : ["lq", "hq"];
    for (const tier of tiers) {
      const buffer = decoded.get(keyOf(samplePitch, layer, tier));
      if (buffer) {
        // Reinsertar para que la poda LRU tire de lo que de verdad se usa.
        decoded.delete(keyOf(samplePitch, layer, tier));
        decoded.set(keyOf(samplePitch, layer, tier), buffer);
        return buffer;
      }
    }
    return null;
  }

  function loadFile(file: SampleFile): Promise<AudioBuffer | null> {
    const key = keyOf(file.pitch, file.layer, file.tier);
    const already = loading.get(key) ?? decoded.get(key);
    if (already && !(already instanceof Promise)) return Promise.resolve(already);
    if (already instanceof Promise) return already;

    stats.loading += 1;
    const promise = (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/${file.file}`);
        if (!response.ok) return null;
        const buffer = await decode(ctx, await response.arrayBuffer());
        decoded.set(key, buffer);
        while (decoded.size > maxDecoded) {
          const oldest = decoded.keys().next();
          if (oldest.done) break;
          decoded.delete(oldest.value);
        }
        return buffer;
      } catch {
        // Red o decodificación caída: la voz de reserva cubre esta tecla.
        return null;
      } finally {
        stats.loading -= 1;
        loading.delete(key);
      }
    })();
    loading.set(key, promise);
    return promise;
  }

  /**
   * Pide al cargar la capa que traiga esta muestra si aún no la hemos pedido.
   * La siguiente nota de esa tecla ya suena con sample; así el sampler se va
   * completando solo mientras toca, sin esperar a acabar la precarga entera.
   */
  function ensureLoaded(samplePitch: number, layer: SampleLayer): void {
    const preferred = tierForPitch(samplePitch);
    const tiers: SampleTier[] = preferred === "hq" ? ["hq", "lq"] : ["lq", "hq"];
    for (const tier of tiers) {
      const file = files.get(keyOf(samplePitch, layer, tier));
      if (file) {
        void loadFile(file);
        return;
      }
    }
  }

  function startVoice(
    pitch: number,
    velocity: number,
    startAt: number,
  ): { voice: ActiveSampledVoice; usedSamples: boolean } {
    const samplePitch = samplePitchFor(pitch, pitches);
    const mix = layerMix(velocity);
    const env = ctx.createGain();
    env.connect(master);

    const layers: { source: AudioBufferSourceNode; gain: GainNode; weight: number }[] = [];
    let totalWeight = 0;
    if (samplePitch !== null) {
      const cents = clampDetune(detuneCents(pitch, samplePitch));
      for (const layer of ["soft", "hard"] as const) {
        const weight = layer === "soft" ? mix.soft : mix.hard;
        if (weight <= 0.001) continue;
        const buffer = bufferFor(samplePitch, layer);
        // Pedirla aunque no esté decodificada: así la próxima nota ya la usa.
        ensureLoaded(samplePitch, layer);
        if (!buffer) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        // Semitonar la muestra vecina: es lo que permite cubrir las 88 teclas con 30 grabs.
        source.detune.value = cents;
        const layerGain = ctx.createGain();
        layerGain.gain.value = weight;
        source.connect(layerGain);
        layerGain.connect(env);
        layers.push({ source, gain: layerGain, weight });
        totalWeight += weight;
      }
    }

    if (layers.length === 0 || totalWeight <= 0) {
      env.disconnect();
      return { voice: { sources: [], env }, usedSamples: false };
    }

    // Si solo está decodificada una de las dos capas, se normaliza para no bajar el volumen.
    const normalise = 1 / totalWeight;
    for (const layer of layers) {
      layer.gain.gain.value = layer.weight * normalise;
      layer.source.start(startAt);
    }
    return { voice: { sources: layers.map((layer) => layer.source), env }, usedSamples: true };
  }

  /** Devuelve true si la nota se hizo con muestra real; false si hay que reservar la voz. */
  function scheduleVoice(pitch: number, velocity: number, startAt: number, ringS: number): boolean {
    const { voice, usedSamples } = startVoice(pitch, velocity, startAt);
    if (!usedSamples) return false;
    voices.add(voice);
    const stopAt = startAt + ringS;
    voice.env.gain.setValueAtTime(1, startAt);
    voice.env.gain.setValueAtTime(1, Math.max(startAt, stopAt - releaseS(velocity)));
    voice.env.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    for (const source of voice.sources) source.stop(stopAt + 0.02);
    return true;
  }

  function stopVoice(voice: ActiveSampledVoice, atTime: number, fadeS: number): void {
    const stopAt = Math.max(atTime, ctx.currentTime);
    try {
      voice.env.gain.cancelScheduledValues(stopAt);
      voice.env.gain.setValueAtTime(Math.max(voice.env.gain.value, 0.0001), stopAt);
      voice.env.gain.exponentialRampToValueAtTime(0.0001, stopAt + fadeS);
      for (const source of voice.sources) source.stop(stopAt + fadeS + 0.02);
    } catch {
      // Un buffer ya terminado no debe romper la pausa.
    }
    voices.delete(voice);
  }

  const ready = (async () => {
    try {
      const response = await fetchImpl(`${baseUrl}/manifest.json`);
      if (!response.ok) throw new Error(`manifiesto HTTP ${response.status}`);
      manifest = (await response.json()) as PianoManifest;
      files = index();
      pitches = manifestPitches(manifest);
      stats.files = manifest.files.length;
    } catch {
      // Sin muestras la voz de reserva se queda sola; la app sigue sonando.
      manifest = null;
      files = index();
      pitches = [];
    }
  })();

  return {
    scheduleNote(pitch, velocity, duration_s, atTime_s): void {
      const startAt = Math.max(atTime_s, ctx.currentTime);
      if (!manifest) {
        stats.reserved += 1;
        fallback?.scheduleNote(pitch, velocity, duration_s, startAt);
        return;
      }
      const ringS = Math.max(duration_s, 0.35) + releaseS(velocity);
      if (scheduleVoice(pitch, velocity, startAt, ringS)) {
        stats.sampled += 1;
        return;
      }
      stats.reserved += 1;
      fallback?.scheduleNote(pitch, velocity, duration_s, startAt);
    },
    noteOn(pitch, velocity): void {
      if (sustained.has(pitch)) return;
      if (!manifest) {
        stats.reserved += 1;
        fallback?.noteOn(pitch, velocity);
        return;
      }
      const { voice, usedSamples } = startVoice(pitch, velocity, ctx.currentTime);
      if (!usedSamples) {
        stats.reserved += 1;
        fallback?.noteOn(pitch, velocity);
        return;
      }
      stats.sampled += 1;
      voices.add(voice);
      sustained.set(pitch, voice);
    },
    noteOff(pitch): void {
      const voice = sustained.get(pitch);
      sustained.delete(pitch);
      if (voice) stopVoice(voice, ctx.currentTime, releaseS(96));
      fallback?.noteOff(pitch);
    },
    silence(): void {
      const now = ctx.currentTime;
      for (const voice of [...voices]) stopVoice(voice, now, 0.03);
      sustained.clear();
      fallback?.silence();
    },
    async preload(tier): Promise<void> {
      await ready;
      const wanted = (manifest?.files ?? []).filter((file) => file.tier === tier);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(PRELOAD_CONCURRENCY, wanted.length) }, async () => {
        while (cursor < wanted.length) {
          const file = wanted[cursor];
          cursor += 1;
          if (!file) break;
          await loadFile(file);
        }
      });
      await Promise.all(workers);
    },
    get ready(): Promise<void> {
      return ready;
    },
    stats(): PianoSamplerStats {
      return { ...stats, decoded: decoded.size };
    },
  };
}
