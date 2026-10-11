// description: Hook que devuelve el rango de octavas (fromKey/toKey) según el ancho del contenedor.
// context: B-007.2; usa ResizeObserver para recalcular al redimensionar. El SvgKeyboard
// ya recalcula la deformación de las letras cuando cambian fromKey/toKey.

import { useEffect, useRef, useState } from "react";

import { DEFAULT_RANGE, resolveVisibleRange } from "./visible-range";

export function useResponsiveRange<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [range, setRange] = useState(DEFAULT_RANGE);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () => setRange(resolveVisibleRange(node.clientWidth));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, fromKey: range.fromKey, toKey: range.toKey };
}
