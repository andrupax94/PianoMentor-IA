// description: Teclado SVG con ventana visible y resaltado de la tecla pulsada.
// context: B-007.1 dibuja y recorta; B-007.2 pinta el estado de la tecla pulsada; D-002.4 lo hunde (base oscura + sombra interna direccional) y retira el aviso de nota próxima. PianoVirtual88Pressed se genera con SVGR: no editar ese fichero.

"use client";

import { useEffect, useRef, useState } from "react";

import { keyShadow, shadowGradientId } from "../../../../lib/key-shadow";
import { isKeyInRange } from "../../../../lib/pitch";
import PianoSvg from "./PianoVirtual88Pressed";
import styles from "./SvgKeyboard.module.css";
import type { SvgKeyboardProps } from "./SvgKeyboard.types";

export const DEFAULT_FROM_KEY = "c1";
export const DEFAULT_TO_KEY = "c6";

/** Tinte azul de ejemplo del SVG de diseño: se oculta al normalizar. */
export const PRESSED_FILL = "#3b82f6";

/** Margen al recortar el viewBox a la ventana visible (unidades SVG). */
const VIEWBOX_PADDING = 8;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Color con el que se hunde la tecla pulsada (más oscuro que la tecla en reposo). */
const SUNK_BASE = "#0b1220";

/** Opacidad de esa base en las teclas blancas: se ven claramente más oscuras. */
const SUNK_OPACITY_WHITE = 0.55;

/**
 * Y en las negras, atenuada: ya son oscuras, así que la base solo las apaga un
 * punto y el hundimiento lo comunica la sombra direccional.
 */
const SUNK_OPACITY_BLACK = 0.4;

/** Alfa de la sombra por nivel (1 suave → 3 máxima); lo lleva el gradiente. */
const SHADOW_ALPHA: Record<1 | 2 | 3, number> = { 1: 0.22, 2: 0.4, 3: 0.62 };

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
 * Seis gradientes fijos de sombra (3 niveles × 2 lados), insertados una sola vez
 * en un `<defs>` propio. Van con `gradientUnits` por defecto (objectBoundingBox),
 * así que cada uno se mapea a la caja de su tecla y sobrevive al estirado del
 * `preserveAspectRatio="none"`.
 *
 * `l*` = sombra entrando por la izquierda (teclas de la derecha, hacia el centro);
 * `r*` = por la derecha (teclas de la izquierda). El nivel fija el alfa en el borde.
 */
function ensureShadowDefs(root: SVGSVGElement): void {
  if (root.querySelector("defs[data-pm-shadows]")) return;
  const doc = root.ownerDocument;
  const defs = doc.createElementNS(SVG_NS, "defs");
  defs.setAttribute("data-pm-shadows", "");
  (["left", "right"] as const).forEach((side) => {
    ([1, 2, 3] as const).forEach((level) => {
      const gradient = doc.createElementNS(SVG_NS, "linearGradient");
      gradient.setAttribute("id", shadowGradientId({ side, level }));
      // El offset 0 cae en el borde por el que entra la sombra.
      gradient.setAttribute("x1", side === "left" ? "0" : "1");
      gradient.setAttribute("x2", side === "left" ? "1" : "0");
      const alpha = SHADOW_ALPHA[level];
      [
        { offset: "0", opacity: alpha },
        { offset: "0.45", opacity: alpha * 0.5 },
        { offset: "1", opacity: 0 },
      ].forEach((stop) => {
        const node = doc.createElementNS(SVG_NS, "stop");
        node.setAttribute("offset", stop.offset);
        node.setAttribute("stop-color", "#000000");
        node.setAttribute("stop-opacity", String(stop.opacity));
        gradient.appendChild(node);
      });
      defs.appendChild(gradient);
    });
  });
  root.appendChild(defs);
}

/**
 * Capa propia por tecla (rectángulo con la geometría de la primera tecla de
 * diseño): `base` es el color oscuro del hundimiento y `shade` la sombra
 * direccional. Se insertan antes de la etiqueta para no tapar la letra del PC.
 */
function ensureLayer(group: SVGGElement, layer: "base" | "shade"): SVGRectElement {
  const existing = group.querySelector<SVGRectElement>(`rect[data-pm-${layer}]`);
  if (existing) return existing;
  const geometry = group.querySelector<SVGRectElement>(
    "rect:not([data-pm-base]):not([data-pm-shade])",
  );
  const rect = group.ownerDocument.createElementNS(SVG_NS, "rect");
  rect.setAttribute(`data-pm-${layer}`, "");
  rect.setAttribute("rx", "3");
  if (geometry) {
    for (const attr of ["x", "y", "width", "height"]) {
      const value = geometry.getAttribute(attr);
      if (value !== null) rect.setAttribute(attr, value);
    }
  }
  const label = group.querySelector<SVGTextElement>("text[data-pm-label]");
  if (label) group.insertBefore(rect, label);
  else group.appendChild(rect);
  return rect;
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
  labels = {},
}: SvgKeyboardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const normalizedRef = useRef(false);
  // Fuerza repintado al redimensionar (la deformación de las letras cambia).
  const [tick, setTick] = useState(0);
  // Claves estables para no repintar en cada render del padre.
  const activeKey = activeIds.join(",");
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
      ensureShadowDefs(root);
      normalizedRef.current = true;
    }
    const active = new Set(activeIds);
    // 1) Visibilidad y caja de las teclas visibles. La dirección de la sombra
    //    depende del centro de la ventana, así que esto va antes de pintar.
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

    // 2) Pintado de las teclas pulsadas: base oscura + la sombra que toca en su
    //    posición dentro de la ventana (hacia el centro y más fuerte en los extremos).
    const span = maxX - minX;
    root.querySelectorAll("g[data-key-id]").forEach((node) => {
      const id = node.getAttribute("data-key-id") ?? "";
      const group = node as SVGGElement;
      const base = ensureLayer(group, "base");
      const shade = ensureLayer(group, "shade");
      if (!active.has(id)) {
        base.style.display = "none";
        shade.style.display = "none";
        return;
      }
      const x = Number(base.getAttribute("x") ?? 0);
      const width = Number(base.getAttribute("width") ?? 0);
      const t = span > 0 ? (x + width / 2 - minX) / span : 0.5;
      const isBlack = id.includes("#");
      base.setAttribute("fill", SUNK_BASE);
      base.setAttribute("opacity", String(isBlack ? SUNK_OPACITY_BLACK : SUNK_OPACITY_WHITE));
      base.style.display = "";
      shade.setAttribute("fill", `url(#${shadowGradientId(keyShadow(t))})`);
      shade.style.display = "";
    });

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
    // Se lee activeIds/labels vía claves estables para limitar repintados;
    // tick cambia al redimensionar (recalcula la deformación de las letras).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, activeKey, labelsKey, tick]);

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
