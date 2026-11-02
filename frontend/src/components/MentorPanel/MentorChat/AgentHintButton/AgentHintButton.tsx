// description: Chip píldora del chat para acciones hacia el agente: por defecto «Pedir pista al agente» (B-012.6) y, desde B-032.7, reutilizado para las respuestas a la oferta del mentor («Sí, muéstralo», «Otra vez») cambiando la etiqueta y el icono.
// context: B-012.6/B-032.7; la propuesta la escribe MentorChat en la burbuja y la posición la pone el hospedador: el chip no se sitúa a sí mismo. La píldora solo pinta etiqueta y estrella.

import styles from "./AgentHintButton.module.css";
import type { AgentHintButtonProps } from "./AgentHintButton.types";

export function AgentHintButton({
  label = "Pedir pista al agente",
  icon = true,
  onAsk,
  disabled = false,
}: AgentHintButtonProps) {
  return (
    <button
      className={styles.chip}
      type="button"
      onClick={onAsk}
      disabled={disabled}
      aria-busy={disabled}
    >
      {icon && <span className={styles.stars} aria-hidden="true" />}
      {label}
    </button>
  );
}
