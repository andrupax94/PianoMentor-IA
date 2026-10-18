"use client";
// description: Chat real del agente: burbuja con escritura progresiva, tamaño dinámico y envío con Enter.
// context: B-012.8 bloque C; el backend propone funciones y valida, el navegador solo muestra la respuesta.

import { useCallback, useEffect, useRef, useState } from "react";

import { CHAT_TYPING_MS, chatFontSize, clampReply, typedSlice } from "../../../lib/agent-chat";
import { sendAgentMessage } from "../../../lib/api-client";
import styles from "./MentorChat.module.css";
import type { MentorChatProps } from "./MentorChat.types";

/** `chat_id` persistente: la memoria de la conversación sobrevive a una recarga. */
const CHAT_ID_STORAGE_KEY = "pianomentor.chat_id";

/** Texto del cursor parpadeante mientras la respuesta se escribe. */
const TYPING_CURSOR = "▍";

/** Mapa del tamaño calculado a la clase CSS real del módulo. */
const FONT_CLASS = {
  lg: styles.fontLg,
  md: styles.fontMd,
  sm: styles.fontSm,
} as const;

function readStoredChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAT_ID_STORAGE_KEY);
  } catch {
    // Almacenamiento bloqueado (modo privado): la memoria solo dura esta pestaña.
    return null;
  }
}

function storeChatId(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAT_ID_STORAGE_KEY, chatId);
  } catch {
    // Sin almacenamiento persistente no hay nada que hacer; no es un error fatal.
  }
}

export function MentorChat({
  exampleMessage = "Aquí hablará tu profesor de piano IA.",
}: MentorChatProps) {
  const [input, setInput] = useState("");
  /** Respuesta completa del agente, ya recortada al tope de la burbuja. */
  const [reply, setReply] = useState<string | null>(null);
  /** Caracteres ya revelados por el efecto de escritura. */
  const [visibleChars, setVisibleChars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);

  // Recupera el chat_id al montar, para continuar la conversación anterior.
  useEffect(() => {
    chatIdRef.current = readStoredChatId();
  }, []);

  // Efecto de escritura: revela la respuesta carácter a carácter, como en las
  // interfaces de IA actuales. Se reinicia solo al llegar una respuesta nueva.
  useEffect(() => {
    if (reply === null) return;
    setVisibleChars(0);
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += 1;
      setVisibleChars(shown);
      if (shown >= reply.length) {
        window.clearInterval(timer);
      }
    }, CHAT_TYPING_MS);
    return () => window.clearInterval(timer);
  }, [reply]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setBusy(true);
    setError(null);

    try {
      const respuesta = await sendAgentMessage({
        message,
        chat_id: chatIdRef.current,
        context: typeof window === "undefined" ? null : { page: window.location.pathname },
      });
      chatIdRef.current = respuesta.chat_id;
      storeChatId(respuesta.chat_id);
      setReply(clampReply(respuesta.reply));
    } catch (err) {
      const detalle = err instanceof Error ? err.message : "No se pudo enviar el mensaje.";
      setError(detalle);
      setReply("No he podido contactar con el profesor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [busy, input]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      // Enter envía; no debe dejar saltos de línea ni recargar nada.
      event.preventDefault();
      void send();
    },
    [send],
  );

  // El tamaño se decide sobre la respuesta completa (no sobre lo ya revelado)
  // para que no salte de tamaño mientras se escribe.
  const shown = reply ?? exampleMessage;
  const visible = reply === null ? exampleMessage : typedSlice(reply, visibleChars);
  const typing = reply !== null && visibleChars < reply.length;

  return (
    <section className={styles.chat} aria-label="Chat del mentor">
      <div className={styles.heading}>
        <span className={styles.avatar} aria-hidden="true" />
        <div>
          <strong>PianoMentor Chat</strong>
          <p>Tu Profesor de piano IA</p>
        </div>
      </div>

      <p
        className={`${styles.bubble} ${FONT_CLASS[chatFontSize(shown)]}`}
        aria-live="polite"
        aria-busy={busy || typing}
      >
        {busy && reply === null ? "Pensando…" : visible}
        {typing && <span className={styles.cursor}>{TYPING_CURSOR}</span>}
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <input
        className={styles.input}
        type="text"
        placeholder="Habla con PianoMentor…"
        aria-label="Habla con PianoMentor"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
      />
    </section>
  );
}
