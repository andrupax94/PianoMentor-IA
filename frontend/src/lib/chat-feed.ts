// description: Feed informativo del chat (B-032.10): las líneas deterministas que cuentan lo que hace el alumno en la página («Reproduciendo…», «Te llevo al piano para practicar X»), con buffer corto y anti-duplicados, y los textos fijos de cada señal (misma señal → misma frase).
// context: Es la otra voz del chat (skill piano-mentor-chat-burbuja): no es conversación — no entra en el historial que manda al LLM, no borra una respuesta real y no activa la animación de escritura. El backend nunca envía texto para el feed: el front se autoinforma de su propia acción (SongDetailPanel abre la práctica, PlayerBar toca el transporte, el selector pide el modo y PracticeBridge cierra la sesión). Vive solo en memoria: una recarga lo limpia, igual que session-store.

/** Cuántas líneas se recuerdan: corto a propósito para no volverse un log. */
export const MAX_FEED_LINES = 5;

/** Una línea del feed, con id monotónico para las keys del render. */
export interface ChatFeedLine {
  id: number;
  text: string;
}

const lines: ChatFeedLine[] = [];
let nextId = 1;
let snapshot: readonly ChatFeedLine[] = lines;
const listeners = new Set<() => void>();

/** Fotografía vigente; ref estable hasta que `inform` añade de verdad. */
export function getChatFeedSnapshot(): readonly ChatFeedLine[] {
  return snapshot;
}

/** Suscribirse a los cambios del feed; devuelve la baja. */
export function subscribeChatFeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publica una línea del feed. Anti-ruido: si el alumno dispara la misma
 * señal dos veces seguidas (dos pausas, un doble clic de modo), la segunda
 * no repite la frase. La conversación nunca toca este canal.
 */
export function inform(text: string): void {
  if (lines.length > 0 && lines[lines.length - 1].text === text) return;
  const line: ChatFeedLine = { id: nextId, text };
  nextId += 1;
  lines.push(line);
  if (lines.length > MAX_FEED_LINES) lines.splice(0, lines.length - MAX_FEED_LINES);
  snapshot = [...lines];
  for (const listener of [...listeners]) listener();
}

/** Vacia el feed; cada corrida de pruebas arranca sin herencia. */
export function clearChatFeed(): void {
  if (lines.length === 0) return;
  lines.length = 0;
  snapshot = lines;
  for (const listener of [...listeners]) listener();
}

/* -------------------------------------------------------------------------- */
/*  Textos deterministas del aula: primera persona del mentor, segunda del     */
/*  alumno, sin siglas técnicas ni estado del sistema (en el panel).           */
/* -------------------------------------------------------------------------- */

/** Apertura de una práctica desde la Library. */
export function practiceOpeningText(title: string): string {
  return `Te llevo al piano para practicar ${title}`;
}

/** El transporte arranca por el gesto del alumno. */
export function playingText(title: string): string {
  return `Reproduciendo ${title}`;
}

/** El transporte se detiene a mitad de la pieza. */
export function pausedText(): string {
  return "Pausado";
}

/** El transporte vuelve al inicio por el botón de parar. */
export function stoppedText(): string {
  return "Parado: te espero donde quieras";
}

/** La práctica se cierra (PracticeBridge al desmontar). */
export function sessionClosedText(): string {
  return "Cerramos esta práctica: aquí te espero para la siguiente";
}

/** Cambio de modo del selector: qué suena y qué practica el alumno. */
export function modeText(mode: "observe" | "one_hand" | "both_hands", hand: "left" | "right"): string {
  if (mode === "observe") return "Observa cómo suena: el piano toca solo";
  if (mode === "one_hand") {
    return hand === "left"
      ? "Suena la mano derecha, tú practicas la izquierda: te espero en la primera nota"
      : "Suena la mano izquierda, tú practicas la derecha: te espero en la primera nota";
  }
  return "El piano calla: las dos manos son tuyas";
}
