// description: Mensaje de espera de la burbuja del mentor (B-032.7/U-008.3): qué saludo muestra el chat cuando todavía no hay conversación — el prompt de la sesión de práctica, la bienvenida personal fuera de ella y el genérico como pieza de reserva.
// context: Puro y sin DOM; lo consume MentorChat al componer la burbuja (chatPrompt con las dependencias inyectadas). Determinista: los tres mensajes son fijos, no los compone el LLM (feed informativo, skill piano-mentor-chat-burbuja, principio 4). La conversación real manda: esto solo se ve mientras `reply` es null.

/** El mentor dentro de una sesión de práctica habla de la práctica, no saluda. */
export const SESSION_PROMPT =
  "Listo, te espero en el piano. Pídeme una pista desde el botón, «¿te muestro?» te llega solo si te atascas, y «otra vez» repite la demostración.";

/** Bienvenida personal con el nombre del usuario (U-008.3). */
export function personalWelcome(userName: string): string {
  return (
    `¡Hola ${userName}! Soy tu profesor de piano de PianoMentor AI. ` +
    "Pregúntame lo que quieras sobre práctica, piezas o teoría musical."
  );
}

export interface ChatPromptOptions {
  /** Id de la sesión de práctica abierta; null fuera de la ruta /{id}. */
  sessionId: string | null;
  /** Nombre del usuario autenticado, ya cargado; null sin sesión de navegador. */
  userName: string | null;
  /** true si existe un `chat_id` (hay conversación que continuar en el backend). */
  hasChat: boolean;
  /** Placeholder genérico que llega por prop. */
  exampleMessage: string;
}

/** Qué muestra la burbuja mientras no haya respuesta que enseñar. */
export function chatPrompt(options: ChatPromptOptions): string {
  // Dentro de una sesión el saludo genérico desconecta: la práctica manda.
  if (options.sessionId !== null) return SESSION_PROMPT;
  if (options.userName != null && !options.hasChat) return personalWelcome(options.userName);
  return options.exampleMessage;
}
