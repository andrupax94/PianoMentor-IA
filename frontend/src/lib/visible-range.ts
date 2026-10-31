// description: Rango de octavas visibles (fromKey/toKey) según el ancho del contenedor.
// context: B-007.2; al ensanchar el contenedor se añaden octavas para que cada tecla blanca no supere MAX_WHITE_KEY_PX y deje de verse estirada. Puro y testeable.

import { MAX_PITCH, MIN_PITCH } from "./pc-keyboard";
import { countWhiteKeys, keyIdToPitch, pitchToKeyId } from "./pitch";

export interface KeyboardRange {
  fromKey: string;
  toKey: string;
}

/** Rango de pitches (MIDI) que hay que dejar ver; lo calcula `pitchSpan`. */
export interface PitchSpan {
  from: number;
  to: number;
}

/** Ancho máximo (px) de una tecla blanca antes de añadir otra octava. */
export const MAX_WHITE_KEY_PX = 32;

/** Rango por defecto, coherente con el diseño (C1–C6). */
export const DEFAULT_RANGE: KeyboardRange = { fromKey: "c1", toKey: "c6" };

/** Escalera de menor a mayor; la primera que quepa define el rango. */
const LADDER: KeyboardRange[] = [
  { fromKey: "c3", toKey: "c6" },
  { fromKey: "c2", toKey: "c6" },
  { fromKey: "c1", toKey: "c6" },
  { fromKey: "c1", toKey: "c7" },
  { fromKey: "c1", toKey: "c8" },
  { fromKey: "a0", toKey: "c8" },
];

/**
 * Dado el ancho disponible (px) del contenedor del teclado, devuelve el rango de
 * octavas a mostrar. Elige el rango más estrecho cuya tecla blanca no rebase
 * MAX_WHITE_KEY_PX; con anchos enormes cae al piano completo (A0–C8).
 *
 * Con `span` (B-032.2) el rango se ensancha lo justo para que ninguna nota de
 * la pieza quede fuera: en práctica las teclas blancas pueden quedar más
 * estrechas que MAX_WHITE_KEY_PX, pero la cascada pinta la pieza entera.
 */
export function resolveVisibleRange(
  widthPx: number,
  span?: PitchSpan | null,
): KeyboardRange {
  const base = pickRange(widthPx);
  if (!span) return base;

  const from = Math.max(MIN_PITCH, Math.min(span.from, span.to));
  const to = Math.min(MAX_PITCH, Math.max(span.from, span.to));
  const baseFrom = keyIdToPitch(base.fromKey) ?? from;
  const baseTo = keyIdToPitch(base.toKey) ?? to;

  return {
    fromKey: pitchToKeyId(Math.min(baseFrom, from)),
    toKey: pitchToKeyId(Math.max(baseTo, to)),
  };
}

/** Rango de la escalera para el ancho dado, sin mirar la pieza. */
function pickRange(widthPx: number): KeyboardRange {
  if (!Number.isFinite(widthPx) || widthPx <= 0) {
    return DEFAULT_RANGE;
  }
  for (const candidate of LADDER) {
    const whiteKeys = countWhiteKeys(candidate.fromKey, candidate.toKey);
    if (widthPx / whiteKeys <= MAX_WHITE_KEY_PX) {
      return { fromKey: candidate.fromKey, toKey: candidate.toKey };
    }
  }
  return { fromKey: "a0", toKey: "c8" };
}

/**
 * Span de pitches de una lista de notas (la partitura cargada), o null si no
 * hay ninguna. Lo usa el teclado para no recortar notas al pintar la cascada.
 */
export function pitchSpan(notes: readonly { pitch: number }[]): PitchSpan | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const note of notes) {
    if (!Number.isFinite(note.pitch)) continue;
    from = Math.min(from, note.pitch);
    to = Math.max(to, note.pitch);
  }
  if (from > to) return null;
  return { from, to };
}
