// description: Color de relleno de las barras de la cascada según la mano, con un color propio para la mano que toca la IA durante el acompañamiento (B-012.7) y la atenuación de la mano que no se practica (B-032.4).
// context: D-002.1/B-012.7/B-032.4; puro y sin DOM. Los tokens viven en globals.css para que la línea .final__line y las barras compartan la misma fuente de verdad.

import type { NoteHand } from "./api-client";

/** Tokens de `:root` (globals.css); la cascada solo consume `var(...)`. */
export const HAND_COLORS = {
  left: "var(--hand-left)",
  right: "var(--hand-right)",
  unknown: "var(--hand-unknown)",
} as const;

/** Color de la parte que toca la IA en el acompañamiento (B-012.7). */
export const AGENT_COLOR = "var(--hand-agent)";

/** Mano que toca la IA: una de las dos o la pieza entera. */
export type AgentHand = "left" | "right" | "both";

/**
 * Color de una nota según su mano. Sin mano (o con lo que mande el backend en
 * el futuro) se pinta con la reserva: lo que no tiene información no cambia de
 * aspecto, que era el verde de siempre. Con `agentHand`, la parte de la IA se
 * pinta con el color del acompañamiento para distinguirla de la del estudiante.
 */
export function handColor(hand: NoteHand | undefined, agentHand?: AgentHand | null): string {
  if (isAgentNote(hand, agentHand)) return AGENT_COLOR;
  if (hand === "left") return HAND_COLORS.left;
  if (hand === "right") return HAND_COLORS.right;
  return HAND_COLORS.unknown;
}

/**
 * Opacidad de una nota de la cascada (B-032.4): la mano que no se practica se
 * atenúa (no se borra), así que el alumno sigue viendo la pieza entera.
 * La mano de la IA conserva su color y su opacidad (B-012.7).
 */
export function handOpacity(
  hand: NoteHand | undefined,
  agentHand?: AgentHand | null,
  dimmedHand?: "left" | "right" | null,
): number {
  if (dimmedHand && !isAgentNote(hand, agentHand) && hand === dimmedHand) {
    return DIMMED_OPACITY;
  }
  return FULL_OPACITY;
}

/** Opacidad de una nota normal. */
export const FULL_OPACITY = 1;

/** Opacidad de la mano que no se practica (B-032.4): se atenúa, no desaparece. */
export const DIMMED_OPACITY = 0.28;

/**
 * ¿Esta nota la toca la IA? Durante el acompañamiento (B-012.7) la mano que
 * manda el backend se pinta con su color; `both` significa que la IA toca todo.
 */
export function isAgentNote(
  hand: NoteHand | undefined,
  agentHand?: AgentHand | null,
): boolean {
  if (!agentHand) return false;
  return agentHand === "both" || hand === agentHand;
}
