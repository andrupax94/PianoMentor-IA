// description: Chat real del agente (B-012.8 bloque C): burbuja con la respuesta completa, escritura progresiva por bloques (rápida en largas), tamaño de letra dinámico según la longitud, estado «Pensando…», error visible y envío con Enter. Recupera y persiste el chat_id en localStorage para continuar la conversación y ejecuta la orden que el backend devuelve en client_action a través de executeClientAction (reproducir publica en piece-store y navega al piano, las órdenes de transporte viajan por agent-commands y abrir_practica crea sesión y navega a ella). Desde B-012.6, con sesión abierta, enseña el chip «Pedir pista al agente» (AgentHintButton), escribe la propuesta validada en la propia burbuja y guarda su procedencia en session-store para el diagnóstico del estado de sesión.
// context: B-012.8; el backend propone funciones y valida, el navegador ejecuta. La respuesta no se recorta: la burbuja es de altura fija y hace scroll cuando el texto no cabe, así que el usuario puede leerla entera. La animación de escritura usa typingStep para no alargarse ~25 s en respuestas de ~1400 caracteres. Usa useRouter de Next para navegar tras ejecutar la orden; un fallo de la orden se enseña sin borrar la respuesta. La pista del agente reutiliza ese mismo mecanismo de escritura y su traducción vive en lib/agent-hint.ts.

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import {
  CHAT_TYPING_MS,
  chatFontSize,
  runChatTurn,
  typedSlice,
  typingStep,
} from "../../../lib/agent-chat";
import { hintMessage } from "../../../lib/agent-hint";
import {
  executeClientAction,
  publishAgentCommand,
  fetchPieceInfo,
} from "../../../lib/agent-commands";
import {
  ApiError,
  createSession,
  runAgentStep,
  sendAgentMessage,
} from "../../../lib/api-client";
import { publishPianoPiece } from "../../../lib/piece-store";
import { getSessionSnapshot, subscribeSession, updateSession } from "../../../lib/session-store";
import { AgentHintButton } from "./AgentHintButton/AgentHintButton";
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
  onClose,
}: MentorChatProps) {
  const router = useRouter();
  /** Sesión abierta en la portada: el chip de pista solo existe con práctica. */
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
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
            resolvePiece: fetchPieceInfo,
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

  /**
   * Pide un paso al agente (B-012.6) y lo escribe en la propia burbuja como
   * mensaje para el alumno. El texto anterior se limpia antes de pedirlo para
   * que la burbuja muestre «Pensando…» mientras el backend decide.
   */
  const askHint = useCallback(async () => {
    const sessionId = session.sessionId;
    if (sessionId === null || busy) return;
    setBusy(true);
    setError(null);
    // Limpia la respuesta para que la burbuja muestre «Pensando…»; la
    // procedencia anterior se queda hasta que llegue la nueva.
    setReply(null);
    try {
      const step = await runAgentStep(sessionId);
      // La procedencia es diagnóstico del estado de sesión (fuera de producción).
      updateSession({ lastStep: { provider: step.provider, used_fallback: step.used_fallback } });
      setReply(hintMessage(step));
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "No se pudo pedir la pista del agente. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, session.sessionId]);

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
        {/* Solo el chat flotante llega con onClose y lo enseña (D-002.5). */}
        {onClose && (
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Cerrar chat"
            onClick={onClose}
          >
            <span className={styles.closeIcon} aria-hidden="true" />
          </button>
        )}
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
      {/* Solo con práctica abierta: sin sesión no hay estado que observar. */}
      {session.sessionId !== null && (
        <AgentHintButton onAsk={() => void askHint()} disabled={busy} />
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
