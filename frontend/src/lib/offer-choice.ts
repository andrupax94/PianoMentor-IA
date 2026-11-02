// description: Canal de la respuesta del alumno a la oferta del mentor (B-032.7): publishOfferChoice (aceptar, rechazar o repetir) con contador monotónico y subscribeOfferChoice.
// context: Es un evento, no un estado: solo lo escucha PracticeBridge, único dueño del WebSocket. La burbuja del chat publica lo que el alumno pulsa y el puente lo traduce a los sobres WS; así el chat nunca toca el transporte ni el canal directamente.

/** La decisión que el alumno acaba de tomar sobre la oferta del mentor. */
export type OfferChoice = "accept" | "dismiss" | "repeat";

export interface OfferChoiceMessage {
  choice: OfferChoice;
  seq: number;
}

type OfferChoiceListener = (message: OfferChoiceMessage) => void;

const listeners = new Set<OfferChoiceListener>();
let seq = 0;

/** Suscribirse a las decisiones del alumno; devuelve la baja. */
export function subscribeOfferChoice(listener: OfferChoiceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publica la decisión del alumno. Es un evento, no un estado: no se guarda el
 * último, así que quien no esté escuchando (el puente aún no montado) la
 * pierde: una oferta sin sesión detrás no se puede contestar.
 */
export function publishOfferChoice(choice: OfferChoice): void {
  seq += 1;
  const payload: OfferChoiceMessage = { choice, seq };
  // Copia: un listener puede darse de baja a sí mismo durante la iteración.
  for (const listener of [...listeners]) {
    listener(payload);
  }
}
