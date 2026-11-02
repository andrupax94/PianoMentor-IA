// description: Props de la tarjeta de la oferta de demostración del mentor (B-032.7): el modo («pending»/«repeat»), el texto del mentor, el flag del tope anti-nag y las tres respuestas.
// context: B-032.7; los callbacks van al bus offer-choice, no al WS directamente.

export type OfferCardMode = "pending" | "repeat";

export interface OfferCardProps {
  /** «pending» pregunta y espera dos respuestas; «repeat» solo ofrece repetir. */
  mode: OfferCardMode;
  /** Texto del mentor, ya escrito para el alumno (`offerMessage` o fijo). */
  question: string;
  /** true cuando el «Otra vez» de este compás ya se usó (tope anti-nag). */
  repeatUsed?: boolean;
  /** Respuestas del alumno; el bus (`offer-choice`) las traduce a sobres WS. */
  onAccept: () => void;
  onDismiss: () => void;
  onRepeat: () => void;
}
