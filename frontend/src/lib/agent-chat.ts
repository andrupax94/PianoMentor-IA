// description: Lógica de presentación del chat del agente: tope de caracteres y tamaño dinámico de texto.
// context: B-012.8 bloque C. Puro y testeable, sin DOM; la burbuja lo consume.

/** Tope de caracteres de la respuesta. La altura de la burbuja es fija, así que
 *  un texto largo la desbordaría; el backend también pide brevedad en el prompt. */
export const CHAT_REPLY_MAX_CHARS = 160;

/** Milisegundos entre caracteres durante el efecto de escritura. */
export const CHAT_TYPING_MS = 18;

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
 * Recorta la respuesta al tope de caracteres, añadiendo puntos suspensivos.
 * Es la garantía de layout: aunque el modelo ignore el pedido de brevedad del
 * prompt, la burbuja nunca desborda.
 */
export function clampReply(text: string, max: number = CHAT_REPLY_MAX_CHARS): string {
  const limpio = text.trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
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
