// description: Props del panel del paso del agente.
// context: B-012.6; el panel pide el siguiente paso a la API y muestra la propuesta ya validada.

export interface AgentStepPanelProps {
  /** Sesión abierta en la portada; null mientras no haya práctica. */
  sessionId: string | null;
}
