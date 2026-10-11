// description: Mapa tecla del PC → pitch MIDI (por e.code, independiente del layout).
// context: B-007.2; puro y testeable. Distribución estilo GarageBand "Musical Typing":
// blancas en la fila del home (A S D F G H J K L ;), negras arriba (W E T Y U O P),
// Z/X y flechas cambian de octava.

import { pitchToKeyId } from "./pitch";

// Desplazamiento en semitonos sobre la base para cada e.code.
// Fila blanca (offsets pares del acorde mayor) y fila negra entre ellas.
const CODE_TO_OFFSET: Record<string, number> = {
  KeyA: 0, // C
  KeyW: 1, // C#
  KeyS: 2, // D
  KeyE: 3, // D#
  KeyD: 4, // E
  KeyF: 5, // F
  KeyT: 6, // F#
  KeyG: 7, // G
  KeyY: 8, // G#
  KeyH: 9, // A
  KeyU: 10, // A#
  KeyJ: 11, // B
  KeyK: 12, // C (octava siguiente)
  KeyO: 13, // C#
  KeyL: 14, // D
  KeyP: 15, // D#
  Semicolon: 16, // E
};

/** Letra a mostrar sobre la tecla del piano para cada e.code. */
const CODE_TO_LABEL: Record<string, string> = {
  KeyA: "A",
  KeyW: "W",
  KeyS: "S",
  KeyE: "E",
  KeyD: "D",
  KeyF: "F",
  KeyT: "T",
  KeyG: "G",
  KeyY: "Y",
  KeyH: "H",
  KeyU: "U",
  KeyJ: "J",
  KeyK: "K",
  KeyO: "O",
  KeyL: "L",
  KeyP: "P",
  Semicolon: ";",
};

export const OCTAVE_DOWN_CODES = ["KeyZ", "ArrowLeft"] as const;
export const OCTAVE_UP_CODES = ["KeyX", "ArrowRight"] as const;

/** @deprecated Usar OCTAVE_DOWN_CODES; se mantiene por si hay importadores. */
export const ARROW_OCTAVE_DOWN = "ArrowLeft";
/** @deprecated Usar OCTAVE_UP_CODES; se mantiene por si hay importadores. */
export const ARROW_OCTAVE_UP = "ArrowRight";

/** Octava base por defecto (A = C4 = do central). */
export const DEFAULT_OCTAVE = 4;
export const MIN_OCTAVE = 0;
export const MAX_OCTAVE = 8;

/** Rango MIDI del piano (A0–C8). */
export const MIN_PITCH = 21;
export const MAX_PITCH = 108;

/** Velocity fija de audición (sin sensibilidad en el teclado del PC). */
export const AUDITION_VELOCITY = 80;

/** Recorta la octava base al rango válido. */
export function clampOctave(octave: number): number {
  if (!Number.isFinite(octave)) return DEFAULT_OCTAVE;
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(octave)));
}

/** Mueve la octava en delta, recortada al rango válido. */
export function shiftOctave(octave: number, delta: number): number {
  return clampOctave(octave + delta);
}

/**
 * e.code → pitch MIDI con la octava base, o null si la tecla no mapea
 * o el pitch cae fuera del piano (ej. octava 8 + fila superior).
 */
export function pcCodeToPitch(code: string, baseOctave: number): number | null {
  const offset = CODE_TO_OFFSET[code];
  if (offset === undefined) return null;
  const pitch = (clampOctave(baseOctave) + 1) * 12 + offset;
  if (pitch < MIN_PITCH || pitch > MAX_PITCH) return null;
  return pitch;
}

/**
 * Mapa id de tecla del piano → letra del PC para la octava base dados
 * (ej. octave 4 → { c4: "A", c#4: "W", …, e5: ";" }). Fuera del rango no
 * se incluye la entrada.
 */
export function pcKeyLabels(baseOctave: number): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [code, offset] of Object.entries(CODE_TO_OFFSET)) {
    const pitch = (clampOctave(baseOctave) + 1) * 12 + offset;
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) continue;
    labels[pitchToKeyId(pitch)] = CODE_TO_LABEL[code];
  }
  return labels;
}
