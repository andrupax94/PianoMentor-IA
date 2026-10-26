// description: Props del chat (exampleMessage y onClose del flotante, D-002.5) y MentorChatTurn para representar una conversación completa.
// context: B-012.8; los tipos de las acciones del agente vienen del cliente API. Solo el AgentDock pasa onClose: sin la prop no se pinta el botón de cierre y el panel del mentor no se entera.

import type { AgentClientAction, AgentToolCall } from "../../../lib/api-client";

export interface MentorChatProps {
  /** Texto inicial de la burbuja, mientras no hay respuesta del agente. */
  exampleMessage?: string;
  /** Cierra el chat flotante que lo hospeda (D-002.5); sin prop no se pinta el botón y el panel del mentor no se entera. */
  onClose?: () => void;
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
