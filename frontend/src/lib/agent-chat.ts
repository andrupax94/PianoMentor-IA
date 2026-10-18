// description: Lógica de presentación del chat del agente: tope de caracteres y tamaño dinámico de texto.
// context: B-012.8 bloque C. Puro y testeable, sin DOM; la burbuja lo consume.

/** Milisegundos entre cada paso del efecto de escritura. */
export const CHAT_TYPING_MS = 16;

/** Duración máxima del efecto de escritura, sea cual sea la longitud.
 *  La burbuja ya no recorta la respuesta (la altura la fija el CSS y el
 *  desbordamiento hace scroll), así que una respuesta larga se revela entera
 *  pero en bloques, para no convertir la espera en un paseo de segundos. */
export const CHAT_TYPING_MAX_MS = 2600;

/** Tres tamaños de letra: mensajes cortos en grande, largos en pequeño. */
export type ChatFontSize = "sm" | "md" | "lg";

/** Longitud a partir de la cual la respuesta baja de tamaño. */
const MEDIUM_MAX_CHARS = 45;
const LARGE_MAX_CHARS = 120;

/**
 * Elige el tamaño de letra según la longitud del texto: corto en grande,
 * mediano en normal y largo en pequeño, para que la burbuja no cambie de alto.
 */
export function chatFontSize(text: string): ChatFontSize {
  const length = text.trim().length;
  if (length <= MEDIUM_MAX_CHARS) return "lg";
  if (length <= LARGE_MAX_CHARS) return "md";
  return "sm";
}

/**
 * Caracteres a revelar en cada paso del efecto de escritura, para que la
 * revelación dure lo mismo sea corta o larga la respuesta. Una respuesta breve
 * se revela carácter a carácter (efecto de máquina de escribir); una larga, en
 * bloques. Nunca devuelve 0 ni un número mayor que el propio largo.
 */
export function typingStep(textLength: number, maxMs: number = CHAT_TYPING_MAX_MS): number {
  if (textLength <= 0) return 1;
  const maxSteps = Math.max(1, Math.round(maxMs / CHAT_TYPING_MS));
  return Math.min(textLength, Math.max(1, Math.ceil(textLength / maxSteps)));
}

/**
 * Devuelve los primeros `visibleChars` caracteres del texto, para el efecto de
 * escritura. Nunca devuelve más que el texto completo ni un índice negativo.
 */
export function typedSlice(text: string, visibleChars: number): string {
  if (visibleChars <= 0) return "";
  return text.slice(0, Math.min(visibleChars, text.length));
}

/** true mientras quede texto por revelar en el efecto de escritura. */
export function isTyping(text: string, visibleChars: number): boolean {
  return visibleChars < text.length;
}
