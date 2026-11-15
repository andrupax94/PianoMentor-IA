// description: Props del componente Feedback (modal de envío de comentarios).
// context: Abierto/cerrado lo controla quien lo invoque (ahora el footer minimizado).

export interface FeedbackProps {
  /** Abierto/cerrado del modal. */
  open: boolean;
  /** Callback al cerrar. */
  onClose: () => void;
}
