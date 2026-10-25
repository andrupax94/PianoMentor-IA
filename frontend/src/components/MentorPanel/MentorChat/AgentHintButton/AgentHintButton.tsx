// description: Chip «Pedir pista al agente» que pide un paso al agente cuando hay sesión abierta.
// context: B-012.6; sustituye al antiguo panel de la columna de sesión y su respuesta se muestra en la burbuja del chat.

import styles from "./AgentHintButton.module.css";
import type { AgentHintButtonProps } from "./AgentHintButton.types";

export function AgentHintButton({ onAsk, disabled = false }: AgentHintButtonProps) {
  return (
    <button
      className={styles.chip}
      type="button"
      onClick={onAsk}
      disabled={disabled}
      aria-busy={disabled}
    >
      Pedir pista al agente
    </button>
  );
}
