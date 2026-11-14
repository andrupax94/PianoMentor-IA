// description: Chip píldora del chat para acciones hacia el agente: por defecto «Pedir pista al agente» (B-012.6) y, desde B-032.7, reutilizado para las respuestas a la oferta del mentor («Sí, muéstralo», «Otra vez») cambiando la etiqueta y el icono. Desde B-033.8 es MULTIMODO: en «informe» muestra «Ver informe de la práctica» con inform.svg y se destaca — más grande y oro desde el primer momento; el hospedador calcula el modo y la acción.
// context: B-012.6/B-032.7/B-033.8; la propuesta la escribe MentorChat en la burbuja y la posición la pone el hospedador: el chip no se sitúa a sí mismo. La píldora solo pinta etiqueta, icono según el modo y su clase destacada.

import styles from "./AgentHintButton.module.css";
import type { AgentHintButtonProps } from "./AgentHintButton.types";

export function AgentHintButton({
  label,
  icon,
  onAsk,
  disabled = false,
  modo = "pista",
}: AgentHintButtonProps) {
  const isInforme = modo === "informe";
  const resolvedLabel = label ?? (isInforme ? "Ver informe de la práctica" : "Pedir pista al agente");
  const resolvedIcon = icon ?? true;
  return (
    <button
      className={isInforme ? `${styles.chip} ${styles.chipInforme}` : styles.chip}
      type="button"
      onClick={onAsk}
      disabled={disabled}
      aria-busy={disabled}
    >
      {resolvedIcon &&
        (isInforme ? (
          <span className={styles.informIcon} aria-hidden="true" />
        ) : (
          <span className={styles.stars} aria-hidden="true" />
        ))}
      {resolvedLabel}
    </button>
  );
}
