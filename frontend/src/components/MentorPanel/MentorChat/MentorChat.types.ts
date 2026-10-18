// description: Props y tipos del chat del mentor.
// context: B-012.8; el chat pasa de armazón estático (B-006.4) a conversación real con el agente.

import type { AgentClientAction, AgentToolCall } from "../../../lib/api-client";

export interface MentorChatProps {
  /** Texto inicial de la burbuja, mientras no hay respuesta del agente. */
  exampleMessage?: string;
}

/** Una conversación completa, útil para tests y para el guion de la demo. */
export interface MentorChatTurn {
  /** Mensaje que escribió el estudiante. */
  user: string;
  /** Respuesta natural del agente, ya recortada al tope de la burbuja. */
  reply: string;
  /** Orden que el navegador debe ejecutar, si la hubo. */
  clientAction?: AgentClientAction | null;
  /** Funciones que el modelo quiso invocar, incluidas las rechazadas. */
  usedTools?: AgentToolCall[];
}
