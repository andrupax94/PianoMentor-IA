// description: Color de relleno de las barras de la cascada según la mano, con un color propio para la mano que toca la IA durante el acompañamiento (B-012.7).
// context: D-002.1/B-012.7; puro y sin DOM. Los tokens viven en globals.css para que la línea .final__line y las barras compartan la misma fuente de verdad.

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
