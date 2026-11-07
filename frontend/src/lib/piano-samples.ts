// description: Cargador de muestras de piano y sampler que las reproduce (carga simple con progreso, U-004).
// context: B-007.5/U-004; expone el mismo contrato PolySynth que synth.ts, así el transporte de B-006 y el teclado del PC no cambian. Carga simple: todas las muestras de una vez con barra de progreso; si una muestra no está decodificada, suena la voz aditiva de reserva.

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
import type { PolySynth, SilenceOptions } from "./synth";
import { audioTrace, audioTraceStack } from "./audio-trace";

/** Origen por defecto; admite CDN con NEXT_PUBLIC_AUDIO_BASE_URL (ver contingencia en B-007.5). */
export const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_AUDIO_BASE_URL ?? "/audio/piano";

/** Tope de buffers decodificados en memoria; al superarlo se poda lo menos usado. */
export const MAX_DECODED_BUFFERS = 512;

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
  /** Callback de progreso de carga (0..1). */
  onProgress?: (progress: number) => void;
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
  /** Precarga las muestras de los pitches de una pieza para que el primer golpe ya sea de muestra. */
  warmup(pitches: number[]): void;
  /** Carga simple: descarga todas las muestras reportando progreso (U-004). */
  loadAll(): Promise<void>;
  /** Se resuelve cuando el manifiesto está cargado, haya ido bien o no. */
  readonly ready: Promise<void>;
  stats(): PianoSamplerStats;
}

/** Tope de voces simultáneas del sampler: al saturar se roba la más vieja. */
export const MAX_SAMPLED_VOICES = 48;

interface ActiveSampledVoice {
  sources: AudioBufferSourceNode[];
  /** Envoltorio de la nota (fundido de salida y corte). */
  env: GainNode;
  /** Instante de creación, para robar la voz más vieja. */
  bornAt: number;
  /** Pitch que la montó (para las trazas de diagnóstico). */
  pitch: number;
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

  function loadFile(file: SampleFile, onFileProgress?: (p: number) => void): Promise<AudioBuffer | null> {
    const key = keyOf(file.pitch, file.layer, file.tier);
    const already = loading.get(key) ?? decoded.get(key);
    if (already && !(already instanceof Promise)) {
      onFileProgress?.(1);
      return Promise.resolve(already);
    }
    if (already instanceof Promise) return already;

    stats.loading += 1;
    const promise = (async () => {
      try {
        const url = `${baseUrl}/${file.file}`;
        // Cache persistente (U-004): evita re-descargar los MP3 al refrescar.
        let response: Response | null = null;
        try {
          const cache = await caches.open("piano-samples-v1");
          const cached = await cache.match(url);
          if (cached) {
            response = cached;
          } else {
            response = await fetchImpl(url);
            if (response && response.ok) {
              try { void cache.put(url, response.clone()); } catch { /* ignore */ }
            }
          }
        } catch (e) {
          response = await fetchImpl(url);
        }
        if (!response || !response.ok) {
          onFileProgress?.(1);
          return null;
        }
        // Medir bytes descargados para un progreso realista (U-004).
        let buffer: AudioBuffer | null = null;
        const contentLength = Number(response.headers?.get?.("content-length") || "0");
        if (response.body && contentLength > 0) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              onFileProgress?.((loaded / contentLength) * 0.5);
            }
          }
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const data = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            data.set(c, offset);
            offset += c.length;
          }
          onFileProgress?.(0.5);
          buffer = await decode(ctx, data.buffer);
        } else {
          const arrayBuffer = await response.arrayBuffer();
          onFileProgress?.(0.5);
          buffer = await decode(ctx, arrayBuffer);
        }
        if (buffer) {
          decoded.set(key, buffer);
          while (decoded.size > maxDecoded) {
            const oldest = decoded.keys().next();
            if (oldest.done) break;
            decoded.delete(oldest.value);
          }
        }
        onFileProgress?.(1);
        return buffer;
      } catch {
        // Red o decodificacion caida: la voz de reserva cubre esta tecla.
        onFileProgress?.(1);
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
    // Al saturar se roba la voz más vieja, igual que la voz de reserva.
    if (voices.size >= MAX_SAMPLED_VOICES) {
      const oldest = [...voices].reduce((a, b) => (a.bornAt <= b.bornAt ? a : b));
      audioTrace(`robo de la voz más vieja (tope ${MAX_SAMPLED_VOICES}) sobre pitch=${pitch}`);
      stopVoice(oldest, ctx.currentTime, 0.05);
    }
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
        // Sostener notas largas en bucle de la cola evita el corte brusco cuando
        // el buffer termina antes de soltar la tecla (audición y notas sostenidas).
        if (buffer.duration > 1) {
          source.loop = true;
          source.loopStart = Math.max(0, buffer.duration - 0.5);
          source.loopEnd = buffer.duration;
        }
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
      return { voice: { sources: [], env, bornAt: ctx.currentTime, pitch }, usedSamples: false };
    }

    // Si solo está decodificada una de las dos capas, se normaliza para no bajar el volumen.
    const normalise = 1 / totalWeight;
    for (const layer of layers) {
      layer.gain.gain.value = layer.weight * normalise;
      layer.source.start(startAt);
    }
    return { voice: { sources: layers.map((layer) => layer.source), env, bornAt: ctx.currentTime, pitch }, usedSamples: true };
  }

  /** Devuelve true si la nota se hizo con muestra real; false si hay que reservar la voz. */
  function scheduleVoice(pitch: number, velocity: number, startAt: number, duration_s: number): boolean {
    const { voice, usedSamples } = startVoice(pitch, velocity, startAt);
    if (!usedSamples) return false;
    voices.add(voice);
    // La muestra tiene duración finita: si el release cae más allá del final del
    // buffer, el source se corta con gain todavía alto y se oye un "clic"/corte.
    // Se recorta el anillo para que el fade termine antes de que acabe la muestra.
    let bufferDuration = Number.POSITIVE_INFINITY;
    const firstSource = voice.sources[0];
    if (firstSource && firstSource.buffer) bufferDuration = firstSource.buffer.duration;
    // Dejar sonar la muestra casi entera (cola natural del piano) en vez de
    // cortarla en duration + release corto: eso es lo que sonaba "seco".
    const tailS = 1.5;
    const fadeS = Math.max(releaseS(velocity), 0.5);
    const baseRing = Math.max(duration_s, 0.35) + tailS;
    const ringS = Math.min(baseRing, Math.max(0.35, bufferDuration - 0.05));
    const stopAt = startAt + ringS;
    const fadeStart = Math.max(startAt, stopAt - fadeS);
    voice.env.gain.setValueAtTime(1, startAt);
    voice.env.gain.setValueAtTime(1, fadeStart);
    voice.env.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    for (const source of voice.sources) source.stop(stopAt + 0.02);
    return true;
  }

  function stopVoice(voice: ActiveSampledVoice, atTime: number, fadeS: number): void {
    audioTrace(`stopVoice pitch=${voice.pitch} fade=${fadeS}s`);
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
      if (scheduleVoice(pitch, velocity, startAt, duration_s)) {
        stats.sampled += 1;
        return;
      }
      stats.reserved += 1;
      fallback?.scheduleNote(pitch, velocity, duration_s, startAt);
    },
    noteOn(pitch, velocity): void {
      // El ctx.currentTime en la línea deja prueba directa del reloj del
      // dispositivo: si la posición del transporte se congela pero el reloj
      // del ctx avanza, la máquina del diagnóstico está en otra pieza.
      audioTrace(
        `noteOn (audición) pitch=${pitch} velocity=${velocity} ctx=${ctx.currentTime.toFixed(3)}`,
      );
      if (sustained.has(pitch)) {
        audioTraceStack(`noteOn descartado: ${pitch} ya sostenido`);
        return;
      }
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
      audioTrace(`noteOff (audición) pitch=${pitch} ctx=${ctx.currentTime.toFixed(3)}`);
      const voice = sustained.get(pitch);
      sustained.delete(pitch);
      if (voice) stopVoice(voice, ctx.currentTime, 0.4);
      fallback?.noteOff(pitch);
    },
    silence(options?: SilenceOptions): void {
      // Solo este silencio conserva su pila plegable (fue la prueba del corte
      // de sonido): todas las demás trazas van en una sola línea corta.
      audioTraceStack(
        `silence() keepAudition=${options?.keepAudition === true} ` +
          `vocesActivas=${voices.size} sostenidas=[${[...sustained.keys()].join(",")}] ` +
          `ctx.currentTime=${ctx.currentTime.toFixed(3)}`,
      );
      // El congelado del gate (B-032.5) pide respetar la pulsación viva del
      // alumno: su tecla (pressed temprano y aún sostenida) NO se corta.
      const keepAudition = options?.keepAudition === true ? new Set(sustained.values()) : null;
      const now = ctx.currentTime;
      for (const voice of [...voices]) {
        if (keepAudition?.has(voice)) continue;
        stopVoice(voice, now, 0.03);
      }
      if (keepAudition === null) sustained.clear();
      fallback?.silence(options);
    },
    warmup(notePitches: number[]): void {
      void ready.then(() => {
        const wanted = new Set<number>();
        for (const pitch of notePitches) {
          const samplePitch = samplePitchFor(pitch, pitches);
          if (samplePitch !== null) wanted.add(samplePitch);
        }
        for (const samplePitch of wanted) {
          ensureLoaded(samplePitch, "soft");
          ensureLoaded(samplePitch, "hard");
        }
      });
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
    async loadAll(): Promise<void> {
      await ready;
      const wanted = [...(manifest?.files ?? [])];
      const total = wanted.length || 1;
      let completed = 0;
      options.onProgress?.(0);
      // Concurrencia limitada para acelerar la carga (U-004). El progreso se
      // reporta por archivo completado. Si todo esta en cache, termina rapido.
      const CONC = 6;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONC, wanted.length) }, async () => {
        while (cursor < wanted.length) {
          const file = wanted[cursor];
          cursor += 1;
          if (!file) break;
          await loadFile(file);
          completed += 1;
          options.onProgress?.(completed / total);
        }
      });
      await Promise.all(workers);
      if (wanted.length === 0) options.onProgress?.(1);
    },
    get ready(): Promise<void> {
      return ready;
    },
    stats(): PianoSamplerStats {
      return { ...stats, decoded: decoded.size };
    },
  };
}
