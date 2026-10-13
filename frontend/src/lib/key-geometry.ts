// description: Geometría horizontal del teclado: posición exacta de cada tecla.
// context: B-007.3; el asset es regular (blanca cada 40 u y ancho 38.4 u; negra de
// 24 u centrada en el límite entre dos blancas). SvgKeyboard recorta el viewBox con
// un margen de 8 u, así que las teclas no llegan al borde del contenedor: este
// módulo traduce tecla -> fracción del ancho para alinear la cuadrícula y las notas.
// Si cambia el SVG de diseño, lo comprueba el test de barrido contra el asset.

import { keyIdToPitch } from "./pitch";

/** Margen izquierdo de la primera tecla (A0), en unidades del viewBox. */
const FIRST_KEY_X = 20.8;
/** Separación entre teclas blancas contiguas. */
const WHITE_STEP = 40;
/** Ancho de tecla blanca y de tecla negra. */
const WHITE_WIDTH = 38.4;
const BLACK_WIDTH = 24;
/** Margen que añade SvgKeyboard al recortar el viewBox (VIEWBOX_PADDING). */
const KEY_AREA_PADDING = 8;

/** Pitch del piano más grave (A0) y más agudo (C8). */
export const LOWEST_PITCH = 21;
export const HIGHEST_PITCH = 108;

/** Semitonos negros de una octava (C#, D#, F#, G#, A#). */
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

function isBlackPitch(pitch: number): boolean {
  return BLACK_SEMITONES.has(((pitch % 12) + 12) % 12);
}

/**
 * Teclas blancas por debajo del pitch. Para una blanca es su propio índice (A0 = 0);
 * para una negra es el índice de la blanca inmediatamente encima.
 */
function whiteIndexBelow(pitch: number): number {
  let count = 0;
  for (let p = LOWEST_PITCH; p < pitch; p += 1) {
    if (!isBlackPitch(p)) count += 1;
  }
  return count;
}

/** Centro de la tecla en unidades del viewBox del asset. */
function centerUnits(pitch: number): number {
  const whiteAbove = whiteIndexBelow(pitch);
  if (isBlackPitch(pitch)) {
    // Negra: en el punto medio entre la blanca de abajo y la de arriba.
    return 20 + WHITE_STEP * whiteAbove;
  }
  return FIRST_KEY_X + WHITE_WIDTH / 2 + WHITE_STEP * whiteAbove;
}

/** Ancho de la tecla en unidades del viewBox del asset. */
function widthUnits(pitch: number): number {
  return isBlackPitch(pitch) ? BLACK_WIDTH : WHITE_WIDTH;
}

export interface KeyGeometry {
  /** Centro de la tecla como fracción [0..1] del ancho del contenedor. */
  centerFraction(pitch: number): number;
  /** Ancho de la tecla como fracción [0..1] del ancho del contenedor. */
  widthFraction(pitch: number): number;
  /** Fracción del ancho que ocupan las teclas a cada lado (el resto es margen). */
  insetFraction: number;
  /** Teclas blancas de la ventana visible. */
  whiteKeys: number;
}

/**
 * Geometría de una ventana visible del teclado. El SVG se estira con
 * preserveAspectRatio="none", así que el mapa unidades -> píxel es lineal.
 */
export function createKeyGeometry(fromKey: string, toKey: string): KeyGeometry {
  const fromPitch = keyIdToPitch(fromKey) ?? LOWEST_PITCH;
  const toPitch = keyIdToPitch(toKey) ?? HIGHEST_PITCH;
  const firstWhite = whiteIndexBelow(Math.min(fromPitch, toPitch));
  const lastWhite = whiteIndexBelow(Math.max(fromPitch, toPitch));

  const minUnits = FIRST_KEY_X + WHITE_STEP * firstWhite;
  const maxUnits = FIRST_KEY_X + WHITE_STEP * lastWhite + WHITE_WIDTH;
  const viewWidth = maxUnits - minUnits + KEY_AREA_PADDING * 2;
  const viewX = minUnits - KEY_AREA_PADDING;

  return {
    centerFraction: (pitch) => (centerUnits(pitch) - viewX) / viewWidth,
    widthFraction: (pitch) => widthUnits(pitch) / viewWidth,
    insetFraction: KEY_AREA_PADDING / viewWidth,
    whiteKeys: lastWhite - firstWhite + 1,
  };
}
