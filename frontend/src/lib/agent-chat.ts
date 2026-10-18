// description: Lógica del chat del agente: un turno completo (envío, respuesta y orden) y la
// presentación de la burbuja (tamaño dinámico y escritura progresiva).
// context: B-012.8 bloque C. Puro y testeable, sin DOM: las dependencias de red y de navegador
// (enviar el mensaje, ejecutar la orden) llegan inyectadas, y la burbuja lo consume tal cual.

import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResponse,
  AgentClientAction,
} from "./api-client";

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

/** Lo que el navegador necesita para completar un turno; en los tests se sustituye por fakes. */
export interface ChatTurnDeps {
  /** Habla con el backend. */
  send: (payload: AgentChatRequest) => Promise<AgentChatResponse>;
  /** Ejecuta la orden devuelta en `client_action`; false si no había nada que hacer. */
  executeAction: (action: AgentClientAction) => Promise<boolean>;
}

/** Un turno del chat, ya con el contexto de la página que lo pidió. */
export interface ChatTurnInput {
  message: string;
  /** `chat_id` del turno anterior; null en el primero. */
  chatId: string | null;
  /** Dónde estaba el usuario al escribir; el transporte no viaja, solo la página. */
  context: AgentChatContext | null;
}

/** Lo que la burbuja necesita pintar tras un turno. */
export interface ChatTurnOutcome {
  /** `chat_id` a guardar para el siguiente turno; null si el envío falló. */
  chatId: string | null;
  /** Texto para la burbuja, sea la respuesta real o el aviso de fallo. */
  reply: string;
  /** true si el backend devolvió una orden y el navegador la ejecutó. */
  actionTaken: boolean;
  /** Motivo de un fallo de red o de la orden; null si el turno salió limpio. */
  error: string | null;
}

/** Lo que la burbuja enseña cuando el backend no contesta. */
export const CHAT_FALLBACK_REPLY =
  "No he podido contactar con el profesor. Inténtalo de nuevo.";

/**
 * Ejecuta un turno completo: manda el mensaje, y si el backend devuelve una
 * orden del navegador (lista blanca ya validada allí), la ejecuta.
 * Un fallo de la orden no borra la respuesta: la respuesta ya es buena, se
 * cuenta aparte.
 */
export async function runChatTurn(
  input: ChatTurnInput,
  deps: ChatTurnDeps,
): Promise<ChatTurnOutcome> {
  let response: AgentChatResponse;
  try {
    response = await deps.send({
      message: input.message,
      chat_id: input.chatId,
      context: input.context,
    });
  } catch (failure) {
    return {
      chatId: null,
      reply: CHAT_FALLBACK_REPLY,
      actionTaken: false,
      error: failureMessage(failure, "No se pudo enviar el mensaje."),
    };
  }

  const { reply, chat_id: chatId, client_action: action } = response;

  if (action === null) {
    return { chatId, reply, actionTaken: false, error: null };
  }

  try {
    const actionTaken = await deps.executeAction(action);
    return { chatId, reply, actionTaken, error: null };
  } catch (failure) {
    return {
      chatId,
      reply,
      actionTaken: false,
      error: failureMessage(failure, "No se pudo ejecutar la orden propuesta."),
    };
  }
}

/** Mensaje humano de un fallo: el que venga del ApiError o uno genérico. */
function failureMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message.length > 0 ? failure.message : fallback;
}
