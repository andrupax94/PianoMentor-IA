// description: Lógica pura de la oferta de demostración (B-032.7/ADR 0008): la oferta pendiente del sobre agent_action (isPendingOffer), el compás ofertado (offerMeasure), la pregunta determinista del mentor (offerMessage), la ventana que se ejecutaría al aceptar (offerDemoWindow), la etiqueta del mini cuadro (offerLabel) y la frase fija del «Otra vez» (repeatOfferMessage).
// context: Puro y sin DOM; MentorChat decide qué se muestra en la burbuja y SessionStatus usa solo la etiqueta. La propuesta ya decidió el backend (la oferta llega por el WS con los parámetros guardados); aquí solo se traduce y se lee.

import type { AgentActionMessage } from "./websocket-client";

/** True si el último sobre del agente es la oferta sin contestar. */
export function isPendingOffer(action: AgentActionMessage | null | undefined): boolean {
  return action?.action === "offer_demo";
}

/** El compás (o la pieza) que el mentor ofrece demostrar; null si no puede calcularse. */
export function offerMeasure(action: AgentActionMessage | null | undefined): number | null {
  if (!isPendingOffer(action) || !action) return null;
  const { from_measure: from, to_measure: to } = action;
  if (typeof from !== "number" || !Number.isFinite(from)) return null;
  if (typeof to === "number" && Number.isFinite(to) && to !== from) return null;
  return from;
}

/**
 * La pregunta del mentor: una señal → una frase (feed determinista, B-032.10).
 * En pantalla los compases son 1-based, como en el resto de la interfaz.
 */
export function offerMessage(action: AgentActionMessage | null | undefined): string {
  const measure = offerMeasure(action);
  if (measure !== null) return `¿Te muestro el compás ${measure + 1}?`;
  if (action?.from_measure !== undefined || action?.to_measure !== undefined) {
    return "¿Te muestro estos compases?";
  }
  return "¿Te muestro la pieza?";
}

/**
 * La ventana de la demo que se ejecutaría si el alumno dice «Sí»: los mismos
 * parámetros que guardó el backend al ofrecer, para no recalcular nada.
 */
export function offerDemoWindow(action: AgentActionMessage | null | undefined): {
  from_measure: number | undefined;
  to_measure: number | undefined;
  tempo_factor: number | undefined;
} {
  return {
    from_measure: action?.from_measure,
    to_measure: action?.to_measure,
    tempo_factor: action?.tempo_factor,
  };
}

/** Etiqueta del mini cuadro mientras la oferta está sin contestar. */
export function offerLabel(action: AgentActionMessage | null | undefined): string {
  const measure = offerMeasure(action);
  if (measure !== null) return `El mentor pregunta si te muestra el compás ${measure + 1}`;
  return "El mentor pregunta si te muestra cómo se toca";
}

/**
 * La pregunta de repetición («Otra vez»): es la única frase del mentor que no
 * viene del backend — la demo ya pasó y repepetirla es cosa del chat.
 */
export const repeatOfferMessage = "¿Repetimos la demostración?";
