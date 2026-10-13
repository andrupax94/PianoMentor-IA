// description: Hook suscrito al rango de teclas visible compartido.
// context: B-007.3; useSyncExternalStore es seguro con SSR: en el servidor se pinta
// el rango por defecto y tras la hidratación llega el rango medido.

import { useSyncExternalStore } from "react";

import { DEFAULT_RANGE } from "./visible-range";
import { getVisibleRange, subscribeVisibleRange } from "./visible-range-store";

/** Siempre el mismo objeto: evita desajuste de hidratación. */
const SERVER_RANGE = DEFAULT_RANGE;

export function useVisibleRange() {
  return useSyncExternalStore(subscribeVisibleRange, getVisibleRange, () => SERVER_RANGE);
}
