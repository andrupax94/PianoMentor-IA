// description: Mapa tecla del PC → pitch MIDI (por e.code, independiente del layout).
// context: B-007.2; puro y testeable. Distribución estilo GarageBand "Musical Typing": blancas en la fila del home (A S D F G H J K L ;), negras arriba (W E T Y U O P), Z/X y flechas cambian de octava.

import { pitchToKeyId } from "./pitch";
import type { NoteHand, PlayableNote } from "./api-client";

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

/* ------------------------------------------------------------------ */
/* Distribución partida para dos manos (B-032.2)                        */
/* ------------------------------------------------------------------ */

/** Rango de pitches que usa una mano en la pieza, bordes incluidos. */
export interface HandPitchRange {
  from: number;
  to: number;
}

/** Manos de la pieza, tal y como las devuelve `handRanges`. */
export interface HandRanges {
  left: HandPitchRange | null;
  right: HandPitchRange | null;
}

/**
 * Una tecla física de la distribución partida: su `e.code`, el semitono que
 * toca dentro de la ventana de su mano y la letra que se pinta en el piano.
 */
interface SplitKey {
  code: string;
  offset: number;
  label: string;
}

/**
 * Fila inferior: mano izquierda. Blancas en Z X C V B N M , . / y negras en
 * S D G H J L ;, la misma forma que la fila del home pero una octava abajo.
 */
const SPLIT_LOWER_ROW: readonly SplitKey[] = [
  { code: "KeyZ", offset: 0, label: "Z" },
  { code: "KeyS", offset: 1, label: "S" },
  { code: "KeyX", offset: 2, label: "X" },
  { code: "KeyD", offset: 3, label: "D" },
  { code: "KeyC", offset: 4, label: "C" },
  { code: "KeyV", offset: 5, label: "V" },
  { code: "KeyG", offset: 6, label: "G" },
  { code: "KeyB", offset: 7, label: "B" },
  { code: "KeyH", offset: 8, label: "H" },
  { code: "KeyN", offset: 9, label: "N" },
  { code: "KeyJ", offset: 10, label: "J" },
  { code: "KeyM", offset: 11, label: "M" },
  { code: "Comma", offset: 12, label: "," },
  { code: "KeyL", offset: 13, label: "L" },
  { code: "Period", offset: 14, label: "." },
  { code: "Semicolon", offset: 15, label: ";" },
  { code: "Slash", offset: 16, label: "/" },
];

/**
 * Fila superior: mano derecha. Blancas en Q W E R T Y U I O P y negras en la
 * fila de números (2 3 5 6 7 9 0), como un piano de dos octavas.
 */
const SPLIT_UPPER_ROW: readonly SplitKey[] = [
  { code: "KeyQ", offset: 0, label: "Q" },
  { code: "Digit2", offset: 1, label: "2" },
  { code: "KeyW", offset: 2, label: "W" },
  { code: "Digit3", offset: 3, label: "3" },
  { code: "KeyE", offset: 4, label: "E" },
  { code: "KeyR", offset: 5, label: "R" },
  { code: "Digit5", offset: 6, label: "5" },
  { code: "KeyT", offset: 7, label: "T" },
  { code: "Digit6", offset: 8, label: "6" },
  { code: "KeyY", offset: 9, label: "Y" },
  { code: "Digit7", offset: 10, label: "7" },
  { code: "KeyU", offset: 11, label: "U" },
  { code: "KeyI", offset: 12, label: "I" },
  { code: "Digit9", offset: 13, label: "9" },
  { code: "KeyO", offset: 14, label: "O" },
  { code: "Digit0", offset: 15, label: "0" },
  { code: "KeyP", offset: 16, label: "P" },
];

/** Teclas que mueven la ventana de la distribución partida (B-032.2). */
export const SPLIT_OCTAVE_DOWN_CODES = ["BracketLeft"] as const;
export const SPLIT_OCTAVE_UP_CODES = ["BracketRight"] as const;

/** Semitonos que cubre cada ventana: 0…16, dos octavas y una tercera mayor. */
export const SPLIT_WINDOW_SEMITONES = 16;

/** Desplazamientos de octava permitidos en la distribución partida. */
export const MIN_SPLIT_SHIFT = -3;
export const MAX_SPLIT_SHIFT = 3;

/** Reparto listo para el adaptador del teclado y para pintar el piano. */
export interface PcKeyLayout {
  /** `e.code` → pitch MIDI de la ventana de su mano. */
  bindings: Record<string, number>;
  /** Id de tecla del piano → letra del PC que la toca. */
  labels: Record<string, string>;
  /** Octavas desplazadas con `[` y `]`. */
  shift: number;
}

/** Recorta el desplazamiento de la distribución partida. */
export function clampSplitShift(shift: number): number {
  if (!Number.isFinite(shift)) return 0;
  return Math.min(MAX_SPLIT_SHIFT, Math.max(MIN_SPLIT_SHIFT, Math.round(shift)));
}

/**
 * Base de una ventana: empieza en la nota más grave de la mano y se recorta
 * para que las 17 teclas caigan dentro del piano. No se alinea a Do a
 * propósito: con `p16` la izquierda va de F2 a G3 y alinear a Do dejaría
 * fuera el Sol.
 *
 * Si una mano ocupa más de 17 semitonos no cabe entera: se cubre desde su
 * nota más grave y el resto queda a un `]` de distancia. Es un límite del
 * teclado del PC, no de la pieza.
 */
function windowBase(range: HandPitchRange, semitoneShift: number): number {
  const lowest = Math.min(range.from, range.to);
  const desired = lowest + semitoneShift;
  return Math.min(Math.max(desired, MIN_PITCH), MAX_PITCH - SPLIT_WINDOW_SEMITONES);
}

/** Rango de pitches de cada mano a partir de las notas de la pieza. */
export function handRanges(notes: readonly PlayableNote[]): HandRanges {
  const ranges: HandRanges = { left: null, right: null };
  for (const note of notes) {
    const hand: NoteHand | undefined = note.hand;
    if (hand !== "left" && hand !== "right") continue;
    if (!Number.isFinite(note.pitch)) continue;
    const current = ranges[hand];
    ranges[hand] =
      current === null
        ? { from: note.pitch, to: note.pitch }
        : { from: Math.min(current.from, note.pitch), to: Math.max(current.to, note.pitch) };
  }
  return ranges;
}

/**
 * Distribución partida de dos manos (B-032.2): una ventana por mano ajustada a
 * su rango real en la pieza, con la izquierda en la fila inferior y la derecha
 * en la superior. Devuelve null si falta alguna mano: entonces manda el mapa
 * clásico de una sola ventana.
 */
export function splitLayoutFor(
  left: HandPitchRange | null,
  right: HandPitchRange | null,
  octaveShift = 0,
): PcKeyLayout | null {
  if (!left || !right) return null;
  const shift = clampSplitShift(octaveShift);
  const semitones = shift * 12;
  const bindings: Record<string, number> = {};
  const labels: Record<string, string> = {};

  const place = (row: readonly SplitKey[], range: HandPitchRange) => {
    const base = windowBase(range, semitones);
    for (const key of row) {
      const pitch = base + key.offset;
      if (pitch < MIN_PITCH || pitch > MAX_PITCH) continue;
      bindings[key.code] = pitch;
      labels[pitchToKeyId(pitch)] = key.label;
    }
  };

  place(SPLIT_LOWER_ROW, left);
  place(SPLIT_UPPER_ROW, right);

  return { bindings, labels, shift };
}
