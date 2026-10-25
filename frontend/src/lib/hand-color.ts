// description: Color de relleno de las barras de la cascada según la mano.
// context: D-002.1; puro y sin DOM. Los tokens viven en globals.css para que la
// línea .final__line y las barras compartan la misma fuente de verdad.

import type { NoteHand } from "./api-client";

/** Tokens de `:root` (globals.css); la cascada solo consume `var(...)`. */
export const HAND_COLORS = {
  left: "var(--hand-left)",
  right: "var(--hand-right)",
  unknown: "var(--hand-unknown)",
} as const;

/**
 * Color de una nota según su mano. Sin mano (o con lo que mande el backend en
 * el futuro) se pinta con la reserva: lo que no tiene información no cambia de
 * aspecto, que era el verde de siempre.
 */
export function handColor(hand: NoteHand | undefined): string {
  if (hand === "left") return HAND_COLORS.left;
  if (hand === "right") return HAND_COLORS.right;
  return HAND_COLORS.unknown;
}
