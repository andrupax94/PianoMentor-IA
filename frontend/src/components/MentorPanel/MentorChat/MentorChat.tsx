"use client";
// description: Chat real del agente: burbuja con escritura progresiva, tamaño dinámico y envío con Enter.
// context: B-012.8 bloque C; el backend propone funciones y valida, el navegador ejecuta la orden
// devuelta en client_action (reproducir, pausar, abrir práctica) a través de agent-commands.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CHAT_TYPING_MS,
  chatFontSize,
  runChatTurn,
  typedSlice,
  typingStep,
} from "../../../lib/agent-chat";
import {
  executeClientAction,
  publishAgentCommand,
  fetchPieceTitle,
} from "../../../lib/agent-commands";
import { createSession, sendAgentMessage } from "../../../lib/api-client";
import { publishPianoPiece } from "../../../lib/piece-store";
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
  exampleMessage = "Hola En que puedo Ayudarte?",
}: MentorChatProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  /** Respuesta completa del agente, sin recortar: la altura la fija el CSS. */
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

  // Efecto de escritura: revela la respuesta como en las interfaces de IA
  // actuales. En respuestas largas avanza en bloques para que la revelación
  // complete no se alargue en exceso; en cortas, carácter a carácter. Se
  // reinicia solo al llegar una respuesta nueva.
  useEffect(() => {
    if (reply === null) return;
    setVisibleChars(0);
    const step = typingStep(reply.length);
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += step;
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

    // La orden del agente se ejecuta aquí y no en el backend: reproducir publica
    // en el almacén y navega al piano, y la práctica crea sesión y navega a ella.
    const outcome = await runChatTurn(
      {
        message,
        chatId: chatIdRef.current,
        context: typeof window === "undefined" ? null : { page: window.location.pathname },
      },
      {
        send: sendAgentMessage,
        executeAction: (action) =>
          executeClientAction(action, {
            publishPiece: publishPianoPiece,
            publishCommand: publishAgentCommand,
            createPracticeSession: createSession,
            navigate: (path) => {
              void router.push(path);
            },
            resolveTitle: fetchPieceTitle,
          }),
      },
    );

    if (outcome.chatId !== null) {
      chatIdRef.current = outcome.chatId;
      storeChatId(outcome.chatId);
    }
    setReply(outcome.reply);
    setError(outcome.error);
    setBusy(false);
  }, [busy, input, router]);

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
        <div className={styles.chat__title}>
          <strong>PianoMentor <span>Chat</span></strong>
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
      <div className={styles.input__container}>
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
      </div>
    </section>
  );
}
