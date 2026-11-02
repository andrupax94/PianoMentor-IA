// description: Tarjeta de la oferta de demostración dentro de la burbuja del chat (B-032.7/ADR 0008): el modo «pending» pregunta con dos respuestas («Sí, muéstralo» y «Sigo yo») y el modo «repeat» solo ofrece el «Otra vez» de una demo ya ejecutada.
// context: B-032.7; la calidad pedagógica empieza por el consentimiento: la decisión es del alumno y el backend solo propone. Los textos llegan ya escritos (agent-offer, deterministas); aquí solo se pintan y se llaman los callbacks que publica offer-choice. El tope anti-nag deshabilita «Otra vez» cuando ya se usó.

import styles from "./OfferCard.module.css";
import type { OfferCardProps } from "./OfferCard.types";

export function OfferCard({ mode, question, repeatUsed = false, onAccept, onDismiss, onRepeat }: OfferCardProps) {
  return (
    <div className={styles.offer} data-testid="offer-card">
      <p className={styles.question}>{question}</p>
      {mode === "pending" ? (
        <span className={styles.actions}>
          <button className={styles.offerAccept} type="button" onClick={onAccept}>
            Sí, muéstralo
          </button>
          <button className={styles.offerDismiss} type="button" onClick={onDismiss}>
            Sigo yo
          </button>
        </span>
      ) : (
        <span className={styles.actions}>
          <button
            className={styles.offerRepeat}
            type="button"
            onClick={onRepeat}
            disabled={repeatUsed}
          >
            Otra vez
          </button>
        </span>
      )}
    </div>
  );
}
