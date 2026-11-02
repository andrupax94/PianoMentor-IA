// description: Mensaje de espera de la burbuja del mentor (U-008.3): con un usuario activo el chat saluda por su nombre en lugar del mensaje de bienvenida genérico.
// context: Puro y sin DOM; lo consume MentorChat al componer la burbuja (chatPrompt con las dependencias inyectadas). Determinista: los dos mensajes son fijos, no los compone el LLM (feedback informativo, skill piano-mentor-chat-burbuja, principio 4). La conversación real manda: esto solo se ve mientras `reply` es null.

/** Bienvenida personal con el nombre del usuario activo (U-008.3). */
export function personalWelcome(userName: string): string {
  return (
    `¡Hola ${userName}! Soy tu profesor de piano de PianoMentor AI. ` +
    "Pregúntame lo que quieras sobre práctica, piezas o teoría musical."
  );
}

export interface ChatPromptOptions {
  /** Nombre del usuario autenticado, ya cargado; null sin sesión de usuario. */
  userName: string | null;
  /** Placeholder genérico que llega por prop. */
  exampleMessage: string;
}

/** Qué muestra la burbuja mientras no haya respuesta que enseñar. */
export function chatPrompt(options: ChatPromptOptions): string {
  if (options.userName != null) return personalWelcome(options.userName);
  return options.exampleMessage;
}
