// description: Modelo de piano puro: muestreo por capas de velocity y voz aditiva de reserva.
// context: B-007.5; matemática sin WebAudio, sin DOM y sin red, para que el timbre sea
// testeable y determinista. La carga y la reproducción viven en piano-samples.ts y synth.ts.

import { keyIdToPitch } from "./pitch";
import { DEFAULT_RANGE, type KeyboardRange } from "./visible-range";

/** Capa de velocity de una muestra grabada (el banco graba una grave y otra fuerte). */
export type SampleLayer = "soft" | "hard";

/** Calidad de un fichero: HQ para la ventana visible, LQ para el resto del teclado. */
export type SampleTier = "hq" | "lq";

/** Fichero de muestra trascodificado, tal y como aparece en el manifiesto. */
export interface SampleFile {
  /** Pitch MIDI de la tecla muestreada (no de la nota que la usa). */
  pitch: number;
  layer: SampleLayer;
  tier: SampleTier;
  /** Ruta relativa al directorio de muestras. */
  file: string;
  duration_s: number;
}

/** Manifiesto versionado que consume el cargador de muestras. */
export interface PianoManifest {
  /** Procedencia del banco (atribución en THIRD_PARTY_NOTICES.md). */
  source: string;
  license: string;
  files: SampleFile[];
}

/** Velocity representativa de cada capa grabada; la fija el script de descarga. */
export const SOFT_VELOCITY = 40;
export const HARD_VELOCITY = 100;

/** Desvío máximo aceptable al semitonar una muestra (2 semitonos). */
export const MAX_DETUNE_CENTS = 200;

/** Parciales de la voz aditiva de reserva y límite acústico. */
export const DEFAULT_PARTIALS = 8;
export const INHARMONICITY = 0.0005;
export const NYQUIST_HZ = 22050;

/** Recorta una velocity al rango MIDI; lo no numérico cae a un valor medio. */
export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 64;
  return Math.min(127, Math.max(1, Math.round(velocity)));
}

/** Pitches muestreados del manifiesto, ordenados y sin repetidos. */
export function manifestPitches(manifest: PianoManifest): number[] {
  const pitches = new Set<number>();
  for (const file of manifest.files) pitches.add(file.pitch);
  return [...pitches].sort((a, b) => a - b);
}

/**
 * Tecla muestreada más cercana a un pitch; en empate gana la inferior.
 * Devuelve null si no hay ninguna muestra disponible.
 */
export function samplePitchFor(pitch: number, available: readonly number[]): number | null {
  if (available.length === 0) return null;
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of available) {
    const distance = Math.abs(candidate - pitch);
    if (distance < bestDistance || (distance === bestDistance && best !== null && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Desvío en céntimos necesario para tocar `pitch` con la muestra `samplePitch`. */
export function detuneCents(pitch: number, samplePitch: number): number {
  return (pitch - samplePitch) * 100;
}

/** Recorta un desvío al máximo tolerable por el oído (2 semitonos). */
export function clampDetune(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.min(MAX_DETUNE_CENTS, Math.max(-MAX_DETUNE_CENTS, cents));
}

/**
 * Mezcla de las dos capas grabadas para una velocity, con cruce de igual potencia
 * (constancia de volumen en el cruce). Más fuerte = más capa `f` = más brillo.
 */
export function layerMix(velocity: number): { soft: number; hard: number } {
  const v = clampVelocity(velocity);
  if (v <= SOFT_VELOCITY) return { soft: 1, hard: 0 };
  if (v >= HARD_VELOCITY) return { soft: 0, hard: 1 };
  const t = (v - SOFT_VELOCITY) / (HARD_VELOCITY - SOFT_VELOCITY);
  return { soft: Math.cos((t * Math.PI) / 2), hard: Math.sin((t * Math.PI) / 2) };
}

/**
 * Calidad que toca a un pitch: HQ dentro de la ventana visible (por defecto C1–C6,
 * el rango por defecto del teclado) y LQ fuera, que es donde solo hace falta cubrir.
 */
export function tierForPitch(pitch: number, range: KeyboardRange = DEFAULT_RANGE): SampleTier {
  const from = keyIdToPitch(range.fromKey);
  const to = keyIdToPitch(range.toKey);
  if (from === null || to === null) return "lq";
  const lowest = Math.min(from, to);
  const highest = Math.max(from, to);
  return pitch >= lowest && pitch <= highest ? "hq" : "lq";
}

/** Ficheros de una calidad concreta (para precargar por capas). */
export function filesForTier(manifest: PianoManifest, tier: SampleTier): SampleFile[] {
  return manifest.files.filter((file) => file.tier === tier);
}

/**
 * Frecuencia de cada parcial de la voz de reserva, con la inarmonicidad propia de
 * una cuerda tensada (f_h = f0·h·√(1 + B·h²)). Los parciales por encima del
 * Nyquist se descartan: un piano real también los pierde.
 */
export function partialFreqs(
  f0: number,
  count = DEFAULT_PARTIALS,
  inharmonicity = INHARMONICITY,
  nyquist = NYQUIST_HZ,
): number[] {
  if (!Number.isFinite(f0) || f0 <= 0 || count <= 0) return [];
  const freqs: number[] = [];
  for (let h = 1; h <= count; h += 1) {
    // La fundamental se deja exacta: un piano se afina al fundamental, la
    // inarmonicidad solo desafina los parciales superiores.
    const freq = h === 1 ? f0 : f0 * h * Math.sqrt(1 + inharmonicity * h * h);
    if (freq >= nyquist) break;
    freqs.push(freq);
  }
  return freqs;
}

/**
 * Peso de cada parcial normalizado (la suma vale 1): lejos de 1/h^p con p
 * decreciente al subir la velocity, que es lo que hace que un golpe fuerte
 * suene más brillante que uno suave.
 */
export function partialAmps(velocity: number, count = DEFAULT_PARTIALS): number[] {
  if (count <= 0) return [];
  const v = clampVelocity(velocity);
  const exponent = 1.2 + 1.2 * (1 - v / 127);
  const amps: number[] = [];
  let total = 0;
  for (let h = 1; h <= count; h += 1) {
    const amp = 1 / Math.pow(h, exponent);
    amps.push(amp);
    total += amp;
  }
  return amps.map((amp) => amp / total);
}

/**
 * Tiempo de caída (segundos hasta −60 dB) de un parcial: los graves suenan más
 * que los agudos y, dentro de una nota, los parciales altos se apagan antes.
 */
export function partialDecayS(f0: number, partialIndex: number): number {
  if (!Number.isFinite(f0) || f0 <= 0) return 0.05;
  const base = Math.min(8, Math.max(0.5, 2.2 * Math.pow(440 / f0, 0.35)));
  const index = Math.max(1, Math.round(partialIndex));
  return Math.max(0.05, base / Math.pow(index, 0.7));
}

/** Ataque en segundos: rápido, y un poco más lento a medida que baja la velocity. */
export function attackS(velocity: number): number {
  return 0.004 + 0.004 * (1 - clampVelocity(velocity) / 127);
}

/** Cola de release en segundos: lo justo para que suene amortiguado y no cortado. */
export function releaseS(velocity: number): number {
  return 0.1 + 0.12 * (1 - clampVelocity(velocity) / 127);
}

/** Ganancia de pico de la voz de reserva (las sumas de parciales ya vienen normalizadas). */
export function peakGain(velocity: number): number {
  const v = clampVelocity(velocity);
  return 0.45 * Math.pow(v / 127, 1.1);
}
