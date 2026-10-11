"use client";
// description: Teclado SVG con ventana visible y resaltado sonando/esperada/tocada.
// context: B-007.1 dibuja y recorta; B-007.2 pinta estados. PianoVirtual88Pressed se genera con SVGR: no editar ese fichero.

import { useEffect, useRef, useState } from "react";

import { isKeyInRange } from "../../../../lib/pitch";
import PianoSvg from "./PianoVirtual88Pressed";
import styles from "./SvgKeyboard.module.css";
import type { SvgKeyboardProps } from "./SvgKeyboard.types";

export const DEFAULT_FROM_KEY = "c1";
export const DEFAULT_TO_KEY = "c6";

/** Acento de nota esperada (igual que --accent global). */
export const EXPECTED_FILL = "#62e6c7";

/** Acento de nota tocada/sonando (azul del diseño). */
export const PRESSED_FILL = "#3b82f6";

/** Margen al recortar el viewBox a la ventana visible (unidades SVG). */
const VIEWBOX_PADDING = 8;

/** Sufijos de gradiente del SVG generado (el prefijo lo aporta SVGR). */
const GRAD_SUFFIX_WHITE = "piano_virtual_88_pressed_svg__";
const GRAD_SUFFIX_BLACK = "piano_virtual_88_pressed_svg__";

/**
 * El SVG de diseño trae 4 teclas de ejemplo (c4, e4, g4, a#4) dibujadas como
 * pulsadas: gradiente "pressed" + tinte azul. Al montar se normalizan al
 * aspecto de tecla normal para que el resaltado dinámico parta de reposo.
 */
const DESIGN_PRESSED_MAP: Record<string, string> = {
  [`url(#${GRAD_SUFFIX_WHITE}c)`]: `url(#${GRAD_SUFFIX_WHITE}a)`,
  [`url(#${GRAD_SUFFIX_WHITE}d)`]: `url(#${GRAD_SUFFIX_WHITE}b)`,
  [`url(#${GRAD_SUFFIX_BLACK}A)`]: `url(#${GRAD_SUFFIX_BLACK}e)`,
};

function normalizeDesignKeys(root: SVGSVGElement): void {
  root
    .querySelectorAll<SVGGElement>("g.piano_virtual_88_pressed_svg__pressed")
    .forEach((group) => {
      group.querySelectorAll("rect").forEach((rect) => {
        const fill = rect.getAttribute("fill");
        const normalized = fill ? DESIGN_PRESSED_MAP[fill] : null;
        if (normalized) {
          rect.setAttribute("fill", normalized);
        } else if (fill === PRESSED_FILL) {
          // Tinte azul de ejemplo: se oculta; el dinámico lo añade el overlay.
          rect.style.display = "none";
        }
      });
      group.classList.remove("piano_virtual_88_pressed_svg__pressed");
    });
}

/**
 * Overlay propio por tecla (rectángulo con la geometría de la primera tecla).
 * Así el resaltado no depende de los ids de gradiente del SVG generado.
 */
function ensureOverlay(group: SVGGElement): SVGRectElement {
  const existing = group.querySelector<SVGRectElement>("rect[data-pm-state]");
  if (existing) return existing;
  const base = group.querySelector("rect");
  const overlay = group.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  overlay.setAttribute("data-pm-state", "");
  overlay.setAttribute("rx", "3");
  if (base) {
    for (const attr of ["x", "y", "width", "height"]) {
      const value = base.getAttribute(attr);
      if (value !== null) overlay.setAttribute(attr, value);
    }
  }
  group.appendChild(overlay);
  return overlay;
}

/**
 * Letra del PC sobre la tecla (negra sobre blancas, blanca sobre negras).
 * Se coloca al pie de la tecla, donde no tapa el resaltado.
 */
function ensureLabel(group: SVGGElement, id: string, letter: string): SVGTextElement {
  const existing = group.querySelector<SVGTextElement>("text[data-pm-label]");
  const text = existing ?? group.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  if (!existing) {
    text.setAttribute("data-pm-label", "");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("pointer-events", "none");
    group.appendChild(text);
  }
  const isBlack = id.includes("#");
  const base = group.querySelector("rect");
  if (base) {
    const x = Number(base.getAttribute("x") ?? 0);
    const width = Number(base.getAttribute("width") ?? 0);
    const y = Number(base.getAttribute("y") ?? 0);
    const height = Number(base.getAttribute("height") ?? 0);
    // Anclaje: centro horizontal; vertical algo por encima del pie de la tecla.
    text.setAttribute("x", String(x + width / 2));
    text.setAttribute("y", String(y + height - (isBlack ? 10 : 16)));
  }
  text.setAttribute("fill", isBlack ? "#ffffff" : "#111111");
  text.textContent = letter;
  return text;
}

export function SvgKeyboard({
  fromKey = DEFAULT_FROM_KEY,
  toKey = DEFAULT_TO_KEY,
  activeIds = [],
  expectedIds = [],
  labels = {},
}: SvgKeyboardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const normalizedRef = useRef(false);
  // Fuerza repintado al redimensionar (la deformación de las letras cambia).
  const [tick, setTick] = useState(0);
  // Claves estables para no repintar en cada render del padre.
  const activeKey = activeIds.join(",");
  const expectedKey = expectedIds.join(",");
  const labelsKey = Object.entries(labels)
    .map(([id, letter]) => `${id}:${letter}`)
    .join(",");

  // El SVG se estira (preserveAspectRatio none); al cambiar el tamaño de la
  // ventana la deformación varía, así que se recalcula el tamaño de letra.
  useEffect(() => {
    const root = svgRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => setTick((t) => t + 1));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = svgRef.current;
    if (!root) return;
    if (!normalizedRef.current) {
      normalizeDesignKeys(root);
      normalizedRef.current = true;
    }
    const active = new Set(activeIds);
    const expected = new Set(expectedIds);
    // Caja que engloba solo las teclas visibles, para recortar el viewBox.
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    root.querySelectorAll("g[data-key-id]").forEach((node) => {
      const id = node.getAttribute("data-key-id") ?? "";
      const visible = isKeyInRange(id, fromKey, toKey);
      const group = node as SVGGElement;
      group.style.display = visible ? "" : "none";
      if (visible) {
        const box = group.getBBox();
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }
      const overlay = ensureOverlay(group);
      if (active.has(id)) {
        overlay.setAttribute("fill", PRESSED_FILL);
        overlay.setAttribute("opacity", "0.32");
        overlay.style.display = "";
      } else if (expected.has(id)) {
        overlay.setAttribute("fill", EXPECTED_FILL);
        overlay.setAttribute("opacity", "0.55");
        overlay.style.display = "";
      } else {
        overlay.style.display = "none";
      }
    });

    if (minX > maxX || minY > maxY) return;

    const vbX = minX - VIEWBOX_PADDING;
    const vbY = minY - VIEWBOX_PADDING;
    const vbW = maxX - minX + VIEWBOX_PADDING * 2;
    const vbH = maxY - minY + VIEWBOX_PADDING * 2;
    root.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);

    // Escala real usuario→píxel en cada eje (el SVG se estira, no conserva
    // proporción). Con ella se dimensiona la letra y se corrige su deformación.
    const pxW = root.clientWidth;
    const pxH = root.clientHeight;
    const scaleX = pxW > 0 ? pxW / vbW : 1;
    const scaleY = pxH > 0 ? pxH / vbH : 1;
    const fixX = scaleY / scaleX; // factor inverso para no deformar la letra

    root.querySelectorAll("g[data-key-id]").forEach((node) => {
      const id = node.getAttribute("data-key-id") ?? "";
      const letter = labels[id];
      const group = node as SVGGElement;
      const label = group.querySelector<SVGTextElement>("text[data-pm-label]");
      if (!letter || !isKeyInRange(id, fromKey, toKey)) {
        if (label) label.style.display = "none";
        return;
      }
      const text = ensureLabel(group, id, letter);
      text.style.display = "";
      // Tamaño de letra en píxeles reales (se traduce a unidades de usuario).
      const targetPx = id.includes("#") ? 11 : 14;
      text.setAttribute("font-size", String(targetPx / scaleY));
      const tx = Number(text.getAttribute("x") ?? 0);
      const ty = Number(text.getAttribute("y") ?? 0);
      // Anula el estirado horizontal manteniendo el anclaje (x,y).
      text.setAttribute(
        "transform",
        `translate(${tx} ${ty}) scale(${fixX} 1) translate(${-tx} ${-ty})`,
      );
    });
    // Se lee activeIds/expectedIds/labels vía claves estables para limitar repintados;
    // tick cambia al redimensionar (recalcula la deformación de las letras).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, activeKey, expectedKey, labelsKey, tick]);

  return (
    <div className={styles.frame}>
      <PianoSvg
        ref={svgRef}
        className={styles.svg}
        preserveAspectRatio="none"
        role="img"
        aria-label="Teclado"
      />
    </div>
  );
}
