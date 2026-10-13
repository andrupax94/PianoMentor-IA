// description: Hook que mide el contenedor y publica el rango de octavas visible.
// context: B-007.2; usa ResizeObserver para recalcular al redimensionar. El rango se
// publica en el almacén compartido: el SvgKeyboard lo recibe por props y el
// NoteFallGrid se suscribe con useVisibleRange.

import { useEffect, useRef } from "react";

import { resolveVisibleRange } from "./visible-range";
import { publishVisibleRange } from "./visible-range-store";

export function useResponsiveRange<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () => publishVisibleRange(resolveVisibleRange(node.clientWidth));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref };
}
