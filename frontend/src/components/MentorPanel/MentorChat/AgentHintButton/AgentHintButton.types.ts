// description: Props del botón «Pedir pista al agente».
// context: B-012.6; vive en el chat y solo pide el paso: la propuesta la escribe MentorChat en la burbuja.

export interface AgentHintButtonProps {
  /** Pide el siguiente paso al agente; quien lo monta decide qué hacer con la propuesta. */
  onAsk: () => void;
  /** Deshabilita el chip mientras el chat está ocupado (pensando o escribiendo). */
  disabled?: boolean;
}
