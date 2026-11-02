// description: Props de la franja de respuestas a la oferta del mentor (B-032.7): el modo («pending»/«repeat»), el flag del tope anti-nag, el flag de respuesta en viaje y las tres respuestas.
// context: B-032.7; la pregunta se escribe en la burbuja, no aquí; los callbacks van al bus offer-choice, no al WS directamente.

export type OfferActionsMode = "pending" | "repeat";

export interface OfferActionsProps {
  /** «pending» pregunta y espera dos respuestas; «repeat» solo ofrece repetir. */
  mode: OfferActionsMode;
  /** true cuando el «Otra vez» de este compás ya se usó (tope anti-nag). */
  repeatUsed?: boolean;
  /** true entre el clic del alumno y el aviso del backend (no doblar respuestas). */
  disabled?: boolean;
  /** Respuestas del alumno; el bus (`offer-choice`) las traduce a sobres WS. */
  onAccept: () => void;
  onDismiss: () => void;
  onRepeat: () => void;
}
