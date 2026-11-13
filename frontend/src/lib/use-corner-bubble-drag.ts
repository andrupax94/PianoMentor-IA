"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Corner = "tl" | "tr" | "bl" | "br";

export interface CornerBubbleDragOptions {
  /** Estado abierto/maximizado de la burbuja (cambia el umbral de long-press). */
  open: boolean;
  /** Clave base de localStorage; se sufija con el userId cuando exista. */
  storageKey: string;
  /** Identificador del usuario para persistir por usuario (opcional). */
  userId?: string | null;
  /** Margen desde los bordes de la ventana (px). */
  margin?: number;
  /** Umbral de long-press cerrada (ms). @default 100 */
  closedThresholdMs?: number;
  /** Umbral de long-press abierta (ms). @default 500 */
  openThresholdMs?: number;
}

export interface CornerBubbleDragResult {
  corner: Corner;
  dragging: boolean;
  /** true solo si el click llega justo tras soltar un drag (hay que ignorarlo). */
  consumeClickIfJustDragged: () => boolean;
  style: React.CSSProperties;
  ref: (el: HTMLDivElement | null) => void;
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  };
}

const INTERACTIVE_SELECTOR =
  "input, textarea, select, a, [data-no-drag]";

export function snapCorner(x: number, y: number, vw: number, vh: number): Corner {
  const left = x < vw / 2;
  const top = y < vh / 2;
  if (top && left) return "tl";
  if (top && !left) return "tr";
  if (!top && left) return "bl";
  return "br";
}

export function cornerPosition(
  corner: Corner,
  width: number,
  height: number,
  vw: number,
  vh: number,
  margin: number,
): { x: number; y: number } {
  switch (corner) {
    case "tl":
      return { x: margin, y: margin };
    case "tr":
      return { x: vw - width - margin, y: margin };
    case "bl":
      return { x: margin, y: vh - height - margin };
    case "br":
    default:
      return { x: vw - width - margin, y: vh - height - margin };
  }
}

export function useCornerBubbleDrag(
  options: CornerBubbleDragOptions,
): CornerBubbleDragResult {
  const {
    open,
    storageKey,
    userId,
    margin = 16,
    closedThresholdMs = 100,
    openThresholdMs = 500,
  } = options;

  const scopedKey = userId ? `${storageKey}:${userId}` : storageKey;

  const [corner, setCorner] = useState<Corner>(() => {
    if (typeof window === "undefined") return "br";
    const stored = window.localStorage.getItem(scopedKey);
    if (stored === "tl" || stored === "tr" || stored === "bl" || stored === "br") {
      return stored;
    }
    return "br";
  });

  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastDragEndRef = useRef(0);

  /**
   * El click que el navegador emite al soltar un drag no debe abrir la burbuja:
   * se ignora solo si llega justo después del drop (ventana de 300 ms).
   */
  const consumeClickIfJustDragged = useCallback(() => {
    const justDragged = performance.now() - lastDragEndRef.current < 300;
    if (justDragged) lastDragEndRef.current = 0;
    return justDragged;
  }, []);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setNode(el);
  }, []);
  const startRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Persistir la esquina por usuario.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(scopedKey, corner);
  }, [corner, scopedKey]);

  // Posición: inicial, al cambiar esquina/estado, al redimensionar la ventana
  // y al crecer/encoger el propio panel (ResizeObserver), p. ej. al abrir la
  // pestaña de depuración o el menú «LLM»: se reancla a la esquina sin drag.
  useEffect(() => {
    if (!node) return;
    const timers: number[] = [];
    const rafs: number[] = [];
    const measure = () => {
      if (dragging) return;
      const rect = node.getBoundingClientRect();
      const next = cornerPosition(corner, rect.width, rect.height, window.innerWidth, window.innerHeight, margin);
      setPos(next);
    };
    /** Doble rAF: mide cuando el layout del cambio ya se ha asentado. */
    const reposition = () => {
      rafs.forEach((id) => cancelAnimationFrame(id));
      rafs.length = 0;
      rafs.push(
        requestAnimationFrame(() => {
          rafs.push(requestAnimationFrame(measure));
        }),
      );
      // Corrige crecimientos tardíos del panel (scrollbars, contenido async).
      timers.push(window.setTimeout(measure, 320));
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(node);
    window.addEventListener("resize", reposition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      rafs.forEach((id) => cancelAnimationFrame(id));
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [node, corner, dragging, margin, open]);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as Element | null;
      if (target && target.closest(INTERACTIVE_SELECTOR)) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;

      const el = node;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      pointerIdRef.current = event.pointerId;

      const threshold = open ? openThresholdMs : closedThresholdMs;
      timerRef.current = window.setTimeout(() => {
        const s = startRef.current;
        if (!s) return;
        setDragging(true);
        try {
          el.setPointerCapture(pointerIdRef.current as number);
        } catch {
          /* noop */
        }
      }, threshold);
    },
    [node, open, openThresholdMs, closedThresholdMs],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const s = startRef.current;
      if (!s) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;

      if (!dragging) {
        if (Math.hypot(dx, dy) > 8) {
          s.moved = true;
          cancelTimer();
          startRef.current = null;
        }
        return;
      }

      setPos({ x: s.left + dx, y: s.top + dy });
    },
    [dragging, cancelTimer],
  );

  const finishDrag = useCallback(() => {
    if (!dragging) {
      cancelTimer();
      startRef.current = null;
      return;
    }
    const el = node;
    if (el && pos) {
      const rect = el.getBoundingClientRect();
      const cx = pos.x + rect.width / 2;
      const cy = pos.y + rect.height / 2;
      const next = snapCorner(cx, cy, window.innerWidth, window.innerHeight);
      setCorner(next);
    }
    lastDragEndRef.current = performance.now();
    setDragging(false);
    startRef.current = null;
  }, [dragging, pos, node, cancelTimer]);

  const onPointerUp = useCallback(
    (_event: React.PointerEvent<HTMLDivElement>) => {
      finishDrag();
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (_event: React.PointerEvent<HTMLDivElement>) => {
      finishDrag();
    },
    [finishDrag],
  );

  const style: React.CSSProperties = {
    position: "fixed",
    left: pos ? `${pos.x}px` : undefined,
    top: pos ? `${pos.y}px` : undefined,
    right: "auto",
    bottom: "auto",
    touchAction: dragging ? "none" : "manipulation",
    userSelect: dragging ? "none" : undefined,
    transform: dragging ? "scale(1.2)" : "none",
    // En drag el left/top es instantáneo (sigue al puntero) pero el scale entra suave;
    // fuera del drag la transición anima el snap a esquina y la vuelta de escala.
    transition: dragging
      ? "transform 200ms ease"
      : "left 260ms ease, top 260ms ease, transform 260ms ease",
    zIndex: 40,
    willChange: dragging ? "transform, left, top" : undefined,
  };

  return {
    corner,
    dragging,
    consumeClickIfJustDragged,
    style,
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}