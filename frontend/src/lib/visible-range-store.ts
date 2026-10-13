// description: Almacén compartido del rango de teclas visible ("evento" del teclado).
// context: B-007.3; el teclado publica su rango al medir/redimensionar y el
// NoteFallGrid se suscribe para recolocar su cuadrícula sin hilo de props.

import { DEFAULT_RANGE } from "./visible-range";
import type { KeyboardRange } from "./visible-range";

let current: KeyboardRange = DEFAULT_RANGE;
const listeners = new Set<() => void>();

/** Rango vigente. La referencia es estable entre publicaciones (para useSyncExternalStore). */
export function getVisibleRange(): KeyboardRange {
  return current;
}

/** Se suscribe a cambios; devuelve la función de baja. */
export function subscribeVisibleRange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica un rango nuevo; no notifica si es idéntico al vigente. */
export function publishVisibleRange(range: KeyboardRange): void {
  if (range.fromKey === current.fromKey && range.toKey === current.toKey) return;
  current = range;
  listeners.forEach((listener) => listener());
}
