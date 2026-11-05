// description: Chat real del agente (B-012.8 bloque C): burbuja con la respuesta completa, escritura progresiva por bloques (rápida en largas), tamaño de letra dinámico según la longitud, estado «Pensando…», error visible y envío con Enter. Recupera y persiste el chat_id en localStorage para continuar la conversación y ejecuta la orden que el backend devuelve en client_action a través de executeClientAction (reproducir publica en piece-store y navega al piano, las órdenes de transporte viajan por agent-commands y abrir_practica crea sesión y navega a ella). Desde B-012.6, con sesión abierta, enseña el chip «Pedir pista al agente» (AgentHintButton), escribe la propuesta validada en la propia burbuja y guarda su procedencia en session-store para el diagnóstico del estado de sesión. Con B-032.7 la oferta del mentor se escribe EN la burbuja («¿Te muestro el compás 3?», «¿Repetimos la demostración?») y sus respuestas viven en la franja OfferActions con píldoras del estilo del chip, publicando la decisión en offer-choice; el mensaje de espera sale de chat-prompt (bienvenida con nombre o genérico). B-032.10 añade el feed informativo (chat-feed): las líneas «hito de la práctica» (reproducir, pausar, parar, cambio de modo, práctica abierta/cerrada) se pintan DENTRO de la burbuja con .informantLine, apiladas (máx 3, FIFO), con la misma máquina de escribir de la conversación sobre la línea nueva, sin borrar respuestas y sin entrar en el historial del LLM; el chip de pista se vuelve translúcido cuando el texto es muy largo y recupera la opacidad al hover.
// context: B-012.8; el backend propone funciones y valida, el navegador ejecuta. La respuesta no se recorta: la burbuja es de altura fija y hace scroll cuando el texto no cabe, así que el usuario puede leerla entera. La animación de escritura usa typingStep para no alargarse ~25 s en respuestas de ~1400 caracteres. Usa useRouter de Next para navegar tras ejecutar la orden; un fallo de la orden se enseña sin borrar la respuesta. La pista del agente reutiliza ese mismo mecanismo de escritura y su traducción vive en lib/agent-hint.ts. La oferta del mentor vive del último agentAction del almacén y de un estado local mínimo (repeticiones), sin tocar el WS. El nombre del usuario es estado, no ref: el mensaje de espera lo lee en el render.

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
import { isPendingOffer, offerMessage, repeatOfferMessage } from "../../../lib/agent-offer";
import { publishPianoPiece } from "../../../lib/piece-store";
import { publishOfferChoice } from "../../../lib/offer-choice";
import {
  getChatFeedSnapshot,
  subscribeChatFeed,
} from "../../../lib/chat-feed";
import { chatPrompt } from "../../../lib/chat-prompt";
import { getSessionSnapshot, subscribeSession, updateSession } from "../../../lib/session-store";
import { AgentHintButton } from "./AgentHintButton/AgentHintButton";
import { OfferActions } from "./OfferActions/OfferActions";
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
  const tokenRef = useRef<string | null>(null);
  /**
   * Nombre del usuario autenticado (U-008.3). Estado y no ref: el mensaje de
   * espera de la burbuja lo lee en el render (`chatPrompt`), y la sesión de
   * navegador puede llegar después del primer pintado.
   */
  const [userName, setUserName] = useState<string | null>(null);
  /**
   * B-032.10: el feed informativo (hito de la página → línea determinista).
   * Canal separado de la conversación: no activa tecleo ni borra respuestas.
   * Se muestra DENTRO de la burbuja (pila de hasta 3 mensajes cortos), pero
   * cede siempre ante la conversación y ante la pregunta de la oferta.
   */
  const feed = useSyncExternalStore(subscribeChatFeed, getChatFeedSnapshot, getChatFeedSnapshot);
  /**
   * B-032.10: la línea nueva del feed se revela con la misma máquina de
   * escribir de la burbuja (typingStep): las anteriores quedan enteras. El
   * efecto rebota con el id de la última línea y SIEMPRE arranca de cero
   * dentro del cuerpo, igual que el efecto de la respuesta: así un re-run de
   * StrictMode no lo deja clavado a mitad (causa del primer mensaje en blanco
   * tras recargar: el guard con ref saltaba el reinicio que el cleanup limpió).
   */
  const [feedVisibleChars, setFeedVisibleChars] = useState(0);
  const lastFeedLine = feed.length > 0 ? feed[feed.length - 1] : null;
  const lastFeedLineId = lastFeedLine?.id ?? 0;

  useEffect(() => {
    const last = lastFeedLine;
    if (last === null) return;
    setFeedVisibleChars(0);
    const step = typingStep(last.text.length);
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += step;
      setFeedVisibleChars(shown);
      if (shown >= last.text.length) window.clearInterval(timer);
    }, CHAT_TYPING_MS);
    return () => window.clearInterval(timer);
    // El efecto solo rebota con la llegada de una línea nueva; el texto de esa
    // línea se lee por clausura a propósito (una línea no cambia de texto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFeedLineId]);

  /**
   * B-032.7: la oferta del mentor. La visibilidad sale del último sobre del
   * WebSocket (`agentAction`): una oferta nueva la escribe, una demo la
   * calla y el `return_control` de una demo aceptada por el alumno abre el
   * «Otra vez». El flag de aceptación sobrevive a ese ciclo en un ref.
   */
  const [repeatAvailable, setRepeatAvailable] = useState(false);
  const [repeatUsed, setRepeatUsed] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  /** true entre el clic del alumno y el aviso del backend, para no doblar respuestas. */
  const [answered, setAnswered] = useState(false);
  const acceptedRef = useRef(false);

  useEffect(() => {
    const action = session.agentAction;
    if (!action) return;

    if (action.action === "offer_demo") {
      // Oferta nueva (o de otro compás): la repetición se apaga.
      acceptedRef.current = false;
      setRepeatAvailable(false);
      setRepeatUsed(false);
      setAnswered(false);
      return;
    }
    // Cualquier otro aviso limpia el «ya respondí»: si el clic no produjo
    // efecto (canal caído) los botones vuelven a estar disponibles.
    setAnswered(false);
    if (action.action === "demonstrate") {
      setDemoPlaying(true);
      return;
    }
    setDemoPlaying(false);
    if (action.action === "return_control" && acceptedRef.current) {
      // La demo que el alumno pidió acaba de devolver el control: «Otra vez».
      setRepeatAvailable(true);
    }
  }, [session.agentAction]);

  // Recupera el chat_id al montar, para continuar la conversación anterior.
  useEffect(() => {
    chatIdRef.current = readStoredChatId();
  }, []);

  // Obtiene la sesión de navegador (U-008.3): el token para enviar y el nombre
  // para la bienvenida. La bienvenida NO se guarda en `reply` (estado de la
  // conversación): es un mensaje de espera derivado en el render con
  // `chatPrompt`, así no entra a medias en la sesión de práctica ni compite
  // con las respuestas reales.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.status === 200 ? response.json() : null))
      .then((raw: { user?: { name?: string | null } | null; accessToken?: string | null } | null) => {
        if (!active) return;
        tokenRef.current = raw?.accessToken ?? null;
        setUserName(raw?.user?.name ?? null);
      })
      .catch(() => {
        // Sin sesión de navegador: el chat se queda con su genérico.
      });

    return () => {
      active = false;
    };
  }, [reply]);

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
        send: (payload) => sendAgentMessage(payload, tokenRef.current ?? undefined),
        executeAction: (action) =>
          executeClientAction(action, {
            publishPiece: publishPianoPiece,
            publishCommand: publishAgentCommand,
            createPracticeSession: createSession,
            navigate: (path) => {
              void router.push(path);
            },
            resolvePiece: fetchPieceInfo,
            // B-032.7: «otra vez», «muéstralo» y «sigo yo» conversados viajan
            // por el bus de la oferta, igual que las píldoras de la burbuja.
            chooseOffer: publishOfferChoice,
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

  /** «Sí, muéstralo»: la demo se ejecuta con los parámetros guardados del backend. */
  const acceptOffer = useCallback(() => {
    acceptedRef.current = true;
    setAnswered(true);
    publishOfferChoice("accept");
  }, []);

  /** «Sigo yo»: la oferta se cierra y ese compás deja de ofrecerse. */
  const dismissOffer = useCallback(() => {
    acceptedRef.current = false;
    setAnswered(true);
    publishOfferChoice("dismiss");
  }, []);

  /** «Otra vez»: repite la última demo ejecutada; el backend acota el tope. */
  const repeatDemo = useCallback(() => {
    setAnswered(true);
    setRepeatUsed(true);
    publishOfferChoice("repeat");
  }, []);

  // El tamaño se decide sobre la respuesta completa (no sobre lo ya revelado)
  // para que no salte de tamaño mientras se escribe.
  /**
   * B-032.7: la pregunta del mentor se escribe EN la burbuja (no en una caja
   * aparte): «¿Te muestro el compás 3?» sin contestar, «¿Repetimos la
   * demostración?» tras una demo aceptada. La conversación manda: si hay
   * respuesta (o el turno está pensando), el texto de la oferta se aparta,
   * pero las píldoras de respuesta siguen disponibles. Durante una demo, calla.
   */
  const offerPending =
    session.sessionId !== null &&
    !demoPlaying &&
    isPendingOffer(session.agentAction) &&
    !answered;
  const offerRepeating =
    session.sessionId !== null && !demoPlaying && repeatAvailable && !answered;
  /**
   * La pregunta solo ocupa la burbuja cuando no hay conversación que mostrar:
   * «hola» y sus respuestas nunca se pierden por una oferta (skill
   * piano-mentor-chat-burbuja, principio 1).
   */
  const offerQuestion =
    reply !== null
      ? null
      : offerPending
        ? offerMessage(session.agentAction)
        : offerRepeating
          ? repeatOfferMessage
          : null;

  /**
   * El mensaje de espera (U-008.3): con un usuario activo saluda por su
   * nombre en lugar del genérico; sin él, cae al de la prop. Determinista,
   * derivado en el render y sin entrar al estado de la conversación.
   */
  const waiting = chatPrompt({ userName, exampleMessage });

  // B-032.10: el feed informativo vive DENTRO de la burbuja como pila de
  // mensajes cortos (hasta MAX_FEED_LINES, el viejo cae primero). La
  // jerarquía se conserva: conversación > oferta > feed > espera. La función
  // automática de achicar usa la pila completa como texto, así que el tamaño
  // y el scroll siguen valiendo (mensaje corto → grande).
  const feedBubble = reply === null && offerQuestion === null && feed.length > 0;
  const feedText = feed.map((line) => line.text).join("\n");
  /** La línea recién llegada sigue escribiéndose (cursor en su línea). */
  const feedTyping =
    feedBubble && lastFeedLine !== null && feedVisibleChars < lastFeedLine.text.length;

  const shown = reply ?? offerQuestion ?? (feedBubble ? feedText : waiting);
  const visible =
    reply === null ? offerQuestion ?? (feedBubble ? null : waiting) : typedSlice(reply, visibleChars);
  const typing = reply !== null && visibleChars < reply.length;
  /**
   * B-032.10 con el ajuste del usuario: el chip «Pedir pista al agente» se
   * vuelve translúcido cuando el texto de la burbuja es muy largo (el mismo
   * umbral que activa el tamaño pequeño) y vuelve entero al pasar el ratón.
   */
  const ghostHint = chatFontSize(shown) === "sm";

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

      <div
        className={`${styles.bubble} ${FONT_CLASS[chatFontSize(shown)]}`}
        aria-live="polite"
        aria-busy={busy || typing || feedTyping}
      >
        {feedBubble ? (
          <ul className={styles.feed}>
            {feed.map((line) => (
              <li key={line.id} className={styles.informantLine}>
                {line.id === lastFeedLine?.id
                  ? typedSlice(line.text, feedVisibleChars)
                  : line.text}
                {line.id === lastFeedLine?.id && feedTyping && (
                  <span className={styles.cursor}>{TYPING_CURSOR}</span>
                )}
              </li>
            ))}
          </ul>
        ) : offerQuestion !== null ? (
          offerQuestion
        ) : busy && reply === null ? (
          "Pensando…"
        ) : (
          visible
        )}
        {!offerQuestion && typing && <span className={styles.cursor}>{TYPING_CURSOR}</span>}
        {/* Con oferta en juego las píldoras de respuesta van a lo ancho de la
            burbuja; sin ella, el chip de pista de toda la vida. */}
        {session.sessionId !== null &&
          (offerPending || offerRepeating ? (
            <OfferActions
              mode={offerPending ? "pending" : "repeat"}
              repeatUsed={repeatUsed}
              disabled={answered || busy}
              onAccept={acceptOffer}
              onDismiss={dismissOffer}
              onRepeat={repeatDemo}
            />
          ) : (
            <span className={`${styles.hintSlot} ${ghostHint ? styles.hintGhost : ""}`}>
              <AgentHintButton onAsk={() => void askHint()} disabled={busy} />
            </span>
          ))}
      </div>

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
