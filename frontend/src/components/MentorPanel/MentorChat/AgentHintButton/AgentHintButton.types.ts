// description: Props del chip píldora de acciones del chat: etiqueta e icono configurables para reutilizarlo en la pista del agente (B-012.6) y en las respuestas a la oferta del mentor (B-032.7).
// context: B-012.6/B-032.7; la posición la fija el hospedador, no el chip.

export interface AgentHintButtonProps {
  /**
   * Texto de la píldora; por defecto, «Pedir pista al agente». En la oferta
   * del mentor (B-032.7) cambia a «Sí, muéstralo» o «Otra vez».
   */
  label?: string;
  /** Oculta la estrella cuando el espacio no da (sin escalar hacia abajo). */
  icon?: boolean;
  /** Acción al pulsar; quien lo monta decide qué hacer. */
  onAsk: () => void;
  /** Deshabilita el chip mientras el chat está ocupado o la respuesta viajó. */
  disabled?: boolean;
}
