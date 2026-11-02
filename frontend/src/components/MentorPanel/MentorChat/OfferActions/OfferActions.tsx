// description: Franja de respuestas a la oferta del mentor dentro de la burbuja del chat (B-032.7/ADR 0008): en «pending» «Sigo yo» + «Sí, muéstralo», en «repeat» solo el «Otra vez» de una demo ya ejecutada. La pregunta va en el texto de la burbuja; aquí solo hay píldoras.
// context: B-032.7; reutiliza AgentHintButton como píldora principal (etiqueta e icono configurables) y una píldora secundaria propia para lo callado. Todo va a lo ancho de la burbuja, en una sola línea: si el espacio no da, baja el font-size o se pierde el icono (container query), nunca crece hacia abajo.

import { AgentHintButton } from "../AgentHintButton/AgentHintButton";
import styles from "./OfferActions.module.css";
import type { OfferActionsProps } from "./OfferActions.types";

export function OfferActions({
  mode,
  repeatUsed = false,
  disabled = false,
  onAccept,
  onDismiss,
  onRepeat,
}: OfferActionsProps) {
  return (
    <span className={styles.actions} data-testid="offer-actions">
      <span className={styles.row}>
        {mode === "pending" ? (
          <>
            <button
              className={styles.dismissPill}
              type="button"
              onClick={onDismiss}
              disabled={disabled}
            >
              Sigo yo
            </button>
            <AgentHintButton label="Sí, muéstralo" onAsk={onAccept} disabled={disabled} />
          </>
        ) : (
          <AgentHintButton
            label="Otra vez"
            onAsk={onRepeat}
            disabled={disabled || repeatUsed}
          />
        )}
      </span>
    </span>
  );
}
