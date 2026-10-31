// description: Hook que mide el contenedor y publica el rango de octavas visible, ensanchado si hace falta para cubrir la pieza (B-032.2).
// context: B-007.2; usa ResizeObserver para recalcular al redimensionar. El rango se publica en el almacén compartido: el SvgKeyboard lo recibe por props y el NoteFallGrid se suscribe con useVisibleRange.

import { useEffect, useRef } from "react";

import { resolveVisibleRange, type PitchSpan } from "./visible-range";
import { publishVisibleRange } from "./visible-range-store";

export function useResponsiveRange<T extends HTMLElement>(span?: PitchSpan | null) {
  const ref = useRef<T | null>(null);
  // El span es un objeto nuevo en cada render; se compara por sus bordes.
  const from = span?.from ?? null;
  const to = span?.to ?? null;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const currentSpan = from === null || to === null ? null : { from, to };
    const apply = () => publishVisibleRange(resolveVisibleRange(node.clientWidth, currentSpan));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [from, to]);

  return { ref };
}
