/**
 * Props del informe de práctica del chat (B-033.3).
 */
export interface PracticeReportProps {
  /**
   * Sesión abierta cuyo informe se pide. `null` (sin sesión) muestra el
   * aviso «No hay sesión activa», como la pestaña Depurar (petición del
   * usuario en B-033.2).
   */
  sessionId: string | null;
}
