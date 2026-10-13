// description: Rango de octavas visibles (fromKey/toKey) según el ancho del contenedor.
// context: B-007.2; al ensanchar el contenedor se añaden octavas para que cada tecla
// blanca no supere MAX_WHITE_KEY_PX y deje de verse estirada. Puro y testeable.

import { countWhiteKeys } from "./pitch";

export interface KeyboardRange {
  fromKey: string;
  toKey: string;
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
 */
export function resolveVisibleRange(widthPx: number): KeyboardRange {
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
