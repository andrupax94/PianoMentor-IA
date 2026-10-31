// description: Compás actual a partir de la rejilla y la posición del transporte.
// context: B-008.3; puro y sin DOM. La posición va escalada por el factor de tempo, así que se compara contra los inicios originales multiplicando por el factor: el mismo criterio que buildSchedule y la cascada de notas.

import type { PieceMeasures } from "./api-client";
import { musicalPosition } from "./playback-schedule";

/**
 * Índice 0-based del compás que contiene `position_s`, o `null` sin rejilla.
 *
 * `position_s` va en segundos de partitura ya escalados por el factor (misma
 * línea temporal que el audio y la cascada): un borde de compás se cruza cuando
 * `position_s * factor` alcanza el inicio original del compás. En un borde exacto
 * devuelve el compás que empieza ahí, como `MeasureGrid.measure_at` en el backend.
 */
export function measureIndexAt(
  measures: PieceMeasures | null | undefined,
  tempoFactor: number,
  position_s: number,
): number | null {
  const starts = measures?.starts_s;
  if (!starts || starts.length === 0) return null;
  const target = musicalPosition(position_s, tempoFactor);
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(Math.max(lo - 1, 0), starts.length - 1);
}

/** Etiqueta del compás actual (1-based) sobre el total, o "–" si falta el dato. */
export function formatMeasure(
  measure: number | null | undefined,
  count: number | null | undefined,
): string {
  if (measure === null || measure === undefined) return "–";
  if (count === null || count === undefined) return "–";
  return `${measure}/${count}`;
}

/** Firma "numerador/denominador", o "–" si falta. */
export function formatSignature(
  signature: readonly [number, number] | null | undefined,
): string {
  if (!signature) return "–";
  return `${signature[0]}/${signature[1]}`;
}
