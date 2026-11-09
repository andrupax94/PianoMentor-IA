// description: Chat real del agente (B-012.8 bloque C): burbuja con la respuesta completa, escritura progresiva por bloques (rápida en largas), tamaño de letra dinámico según la longitud, estado «Pensando…», error visible y envío con Enter. Recupera y persiste el chat_id en localStorage para continuar la conversación y ejecuta la orden que el backend devuelve en client_action a través de executeClientAction (reproducir publica en piece-store y navega al piano, las órdenes de transporte viajan por agent-commands y abrir_practica crea sesión y navega a ella). Desde B-012.6, con sesión abierta, enseña el chip «Pedir pista al agente» (AgentHintButton), escribe la propuesta validada en la propia burbuja y guarda su procedencia en session-store para el diagnóstico del estado de sesión. Con B-032.7 la oferta del mentor se escribe EN la burbuja («¿Te muestro el compás 3?», «¿Repetimos la demostración?») y sus respuestas viven en la franja OfferActions con píldoras del estilo del chip, publicando la decisión en offer-choice; el mensaje de espera sale de chat-prompt (bienvenida con nombre o genérico). B-032.10 añade el feed informativo (chat-feed): las líneas «hito de la práctica» (reproducir, pausar, parar, cambio de modo, práctica abierta/cerrada) se pintan DENTRO de la burbuja con .informantLine, apiladas (máx 3, FIFO), con la misma máquina de escribir de la conversación sobre la línea nueva, sin borrar respuestas y sin entrar en el historial del LLM; el chip de pista se vuelve translúcido cuando el texto es muy largo y recupera la opacidad al hover. B-033.4 da contenido al modo interpretación (maximizado, revisión del 2026-11-08: botón de producto): descarga el informe de la sesión una vez (getPracticeReport), renderiza los bloques deterministas del `summary` (session-interpretation.ts, lib pura) y pide la redacción amable del agente por un turno efímero del chat (ephemeral, sin historial) cuya procedencia va a session-store.lastStep; con el Mock o si falla, el fallback es el determinismo, sin error visible.
// context: B-012.8; el backend propone funciones y valida, el navegador ejecuta. La respuesta no se recorta: la burbuja es de altura fija y hace scroll cuando el texto no cabe, así que el usuario puede leerla entera. La animación de escritura usa typingStep para no alargarse ~25 s en respuestas de ~1400 caracteres. Usa useRouter de Next para navegar tras ejecutar la orden; un fallo de la orden se enseña sin borrar la respuesta. La pista del agente reutiliza ese mismo mecanismo de escritura y su traducción vive en lib/agent-hint.ts. La oferta del mentor vive del último agentAction del almacén y de un estado local mínimo (repeticiones), sin tocar el WS. El nombre del usuario es estado, no ref: el mensaje de espera lo lee en el render. La interpretación (B-033.4) comparte chat_id con la conversación para que el agente redacte con memoria, pero su turno no se graba en la historia y su render va en la burbuja maximizada (no en la de la conversación).

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
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
  getPracticeReport,
  runAgentStep,
  sendAgentMessage,
} from "../../../lib/api-client";
import type { PracticeReport } from "../../../lib/api-client";
import {
  buildInterpretation,
  interpretationContext,
  interpretationPrompt,
} from "../../../lib/session-interpretation";
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

/**
 * B-033.4: mensajes del modo interpretación cuando no hay cuerpo que dar
 * (sin sesión abierta, sin señales todavía o falla la lectura del informe).
 * Son texto de cara al alumno: sin referencias internas ni de depuración.
 */
const INTERP_NOTE_NO_SESSION =
  "Todavía no hay práctica abierta. Cuando practiques, aquí te cuento cómo te fue.";

const INTERP_NOTE_EMPTY =
  "Todavía no hay práctica que comentar: toca algo en tu sesión y vuelve.";

const INTERP_NOTE_ERROR = "No he podido leer el informe de la sesión en este momento.";

/**
 * B-033.5 (petición del usuario): «Volver a generar opinión de la IA».
 * Habilitación anti-abuso: mínimo 3 minutos desde la última generación Y
 * señales nuevas de práctica en la sesión (comprobado con una consulta
 * ligera cada 30 s, solo mientras el modo está abierto). Con Mock el
 * click recarga el determinismo (no quema nada de LLM).
 */
const REGEN_COOLDOWN_MS = 3 * 60_000;
const REGEN_CHECK_MS = 30_000;

/** mm:ss de un resto de milisegundos para la pista del botón. */
function countdownText(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
  onReportModeChange,
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
  /**
   * B-033.3: modo interpretación de la IA (el «maximizado»). El estado es de
   * la instancia; el panel del mentor se entera por `onReportModeChange` y
   * oculta al resto de sus bloques mientras el chat ocupa todo el alto.
   */
  const [reportMode, setReportMode] = useState(false);
  /**
   * B-033.4: la interpretación del mentor en el modo maximizado. El informe
   * va una vez por sesión (el ref lo recuerda; session_id cambia, se
   * descarga) desde `getPracticeReport` (B-033.3) y de su `summary` salen los
   * bloques deterministas. La redacción del agente va por el canal del chat
   * en un turno `ephemeral` (no ensucia la conversación): con proveedor real
   * se pinta encima de los bloques y con el Mock (o si falla) se queda solo
   * el determinismo, sin error visible — el fallback de la casa.
   */
  const [interpPhase, setInterpPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [interpReport, setInterpReport] = useState<PracticeReport | null>(null);
  const [interpError, setInterpError] = useState<string | null>(null);
  const [redaction, setRedaction] = useState<string | null>(null);
  /**
   * B-033.5: la generación en vigor del modo (incrementa al pulsar el botón
   * regenerar) y el rastro de la última: cuándo se pidió y cuántas señales
   * tenía el informe que la alimentó. Con ambos decides si se puede generar
   * otra: ≥3 min y señales nuevas.
   */
  const [generation, setGeneration] = useState(0);
  const [lastRun, setLastRun] = useState<{ at: number; signals: number } | null>(null);
  /** Señales ya confirmadas por la comprobación periódica (null = sin dato). */
  const [checkedSignals, setCheckedSignals] = useState<number | null>(null);
  /**
   * Guarda del modo: qué clave (sesión+generación) ya se pidió y si la
   * redacción también. Cambia la clave → se re-pregunta todo.
   */
  const interpRef = useRef<{ key: string; asked: boolean; redacted: boolean }>({
    key: "",
    asked: false,
    redacted: false,
  });
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

  /**
   * B-033.3: alterna el modo interpretación. La cola de salida queda sin avisos
   * colgados si el chat se desmonta maximizado: el cleanup lo devuelve a
   * false (igual que el aplazamiento del aviso de cierre en PracticeBridge).
   */
  const toggleReportMode = useCallback(() => {
    setReportMode((current) => {
      const next = !current;
      onReportModeChange?.(next);
      return next;
    });
  }, [onReportModeChange]);

  useEffect(
    () => () => {
      onReportModeChange?.(false);
    },
    [onReportModeChange],
  );

  // B-033.4: cambia la sesión abierta → la interpretación se limpia; el
  // informe de la sesión anterior no debe sobrevivir al cambio de práctica.
  // B-033.5: la generación y su rastro también vuelven a cero.
  useEffect(() => {
    interpRef.current = { key: "", asked: false, redacted: false };
    setInterpReport(null);
    setInterpPhase("idle");
    setInterpError(null);
    setRedaction(null);
    setGeneration(0);
    setLastRun(null);
    setCheckedSignals(null);
  }, [session.sessionId]);

  /**
   * B-033.4: abrir el modo interpretación descarga el informe (una vez por
   * clave sesión+generación) y con práctica en él pide la redacción del
   * agente por el turno efímero del chat. El fallback es determinista: el
   * Mock (o cualquier fallo del turno) no rompe nada — los bloques
   * deterministas son el mensaje.
   */
  useEffect(() => {
    if (!reportMode) return;
    const sessionId = session.sessionId;
    const key = `${sessionId ?? "none"}|${generation}`;
    const guard = interpRef.current;
    if (guard.asked && guard.key === key) return;
    guard.asked = true;
    guard.key = key;
    guard.redacted = false;
    setInterpReport(null);
    setRedaction(null);
    if (sessionId === null) {
      setInterpPhase("idle");
      return; // sin sesión: texto de espera, sin fetch
    }
    setInterpPhase("loading");
    getPracticeReport(sessionId)
      .then((report) => {
        setInterpReport(report);
        setInterpPhase("ready");
        setLastRun({ at: Date.now(), signals: report.summary.signals });
        setCheckedSignals(null); // la comprobación vuelve a mirar desde cero
      })
      .catch((failure: unknown) => {
        setInterpPhase("error");
        setInterpError(
          failure instanceof ApiError
            ? failure.message
            : "No se pudo leer el informe de la práctica.",
        );
      });
  }, [reportMode, session.sessionId, generation]);

  // La redacción llega aparte: solo cuando hay informe encontrado y el modo
  // pedido. Un turno del chat en `ephemeral` (sin historial) interpreta la
  // práctica; la procedencia viaja al estado de sesión igual que la pista.
  useEffect(() => {
    if (!reportMode || interpReport === null || interpRef.current.redacted) return;
    interpRef.current.redacted = true; // una sola petición por informe cargado
    const interpretation = buildInterpretation(interpReport.summary);
    if (!interpretation.hasPractice) return;

    let alive = true;
    sendAgentMessage(
      {
        message: interpretationPrompt(),
        chat_id: chatIdRef.current,
        context: interpretationContext(
          interpretation,
          typeof window === "undefined" ? {} : { page: window.location.pathname },
        ),
        ephemeral: true,
        // Revisión del 2026-11-09: la ventana maximizada tiene sitio — se pide
        // más presupuesto que el default 400 (el backend lo acota al techo).
        max_tokens: 1200,
      },
      tokenRef.current ?? undefined,
    )
      .then((response) => {
        if (!alive) return;
        // Procedencia para el diagnóstico del estado de sesión (fuera de prod).
        updateSession({
          lastStep: { provider: response.provider, used_fallback: response.used_fallback },
        });
        // Fallback determinista: con el Mock (último de la cadena) los bloques
        // deterministas ya son el mensaje; nada de redacción simuada.
        if (response.provider === "mock" || response.used_fallback) return;
        if (response.reply.trim()) setRedaction(response.reply.trim());
      })
      .catch(() => {
        // Sin redacción el modo sigue siendo legible: sin error visible.
      });
    return () => {
      alive = false;
    };
  }, [reportMode, interpReport]);

  // B-033.5: mientras el modo esté abierto, un tictac de 1 s para la cuenta
  // atrás del enfriamiento y una comprobación ligera cada 30 s que mira si
  // hay señales nuevas (el criterio «ciclo completado» del botón). Sin modo
  // abierto: cero peticiones de más (el efecto queda muerto).
  useEffect(() => {
    if (!reportMode) return;
    const tictac = window.setInterval(() => {
      setLastRun((current) => (current === null ? current : { ...current }));
    }, 1000);
    return () => window.clearInterval(tictac);
  }, [reportMode]);

  useEffect(() => {
    if (!reportMode || session.sessionId === null) return;
    const sessionId = session.sessionId;
    const comprobador = window.setInterval(async () => {
      try {
        const report = await getPracticeReport(sessionId);
        setCheckedSignals(report.summary.signals);
      } catch {
        // sin dato, la comprobación solo retarda la habilitación (honesto)
      }
    }, REGEN_CHECK_MS);
    return () => window.clearInterval(comprobador);
  }, [reportMode, session.sessionId]);

  /** ¿Puede regenerarse ya? (enfriamiento pasado y señales nuevas confirmadas) */
  const regenRemaining = lastRun === null ? 0 : lastRun.at + REGEN_COOLDOWN_MS - Date.now();
  const canRegenerate =
    interpPhase === "ready" &&
    interpReport !== null &&
    interpReport.summary.signals > 0 &&
    lastRun !== null &&
    regenRemaining <= 0 &&
    checkedSignals !== null &&
    checkedSignals > lastRun.signals;

  /** Botón regenerar: nueva clave → el efecto recarga informe y redacción. */
  const regenerate = useCallback(() => {
    if (!canRegenerate || busy) return;
    setInterpPhase("idle");
    setCheckedSignals(null);
    setGeneration((current) => current + 1);
  }, [busy, canRegenerate]);

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
    // Sin interpretación (sesión inactiva) el agente no tiene contexto del
    // rendimiento: pedirle una pista solo haría esperar para recibir «Esperar».
    // Se avisa de forma determinista, sin llamar al backend.
    if (session.state?.status === "idle" || session.state === null) {
      setReply(
        "Todavía no te he escuchado tocar. Reproduce o practica un poco y " +
          "vuelve a pedirme la pista; así podré decirte qué mejorar.",
      );
      return;
    }
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
  }, [busy, session.sessionId, session.state]);

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
   * vuelve translúcido en cuanto el texto deja de ser corto (tamaño md o sm,
   * el mismo criterio del achicado) y vuelve entero al pasar el ratón.
   */
  const ghostHint = chatFontSize(shown) !== "lg";

  /**
   * B-033.4: el cuerpo del modo interpretación. Con sesión → informe descargado
   * (loading/ready/error), y con práctica en él los bloques deterministas
   * precedidos, si llega, por la redacción amable del agente (turno efímero
   * del chat). Sin sesión o sin señales, el mensaje de espera correspondiente.
   */
  const interpretation = interpReport ? buildInterpretation(interpReport.summary) : null;
  let interpBody: ReactNode;
  if (session.sessionId === null) {
    interpBody = INTERP_NOTE_NO_SESSION;
  } else if (interpPhase === "loading" || interpPhase === "idle") {
    interpBody = "Revisando tu práctica…";
  } else if (interpPhase === "error") {
    interpBody = interpError ?? INTERP_NOTE_ERROR;
  } else if (interpretation !== null && !interpretation.hasPractice) {
    interpBody = INTERP_NOTE_EMPTY;
  } else if (interpretation !== null) {
    interpBody = (
      <div className={styles.report}>
        <div className={styles.reportActions}>
          <button
            type="button"
            className={styles.reportRegen}
            disabled={!canRegenerate}
            aria-label={
              canRegenerate
                ? "Volver a generar la opinión de la IA con la práctica nueva"
                : `Volver a generar la opinión de la IA (otra opinión en ${countdownText(Math.max(regenRemaining, 0))} y con señales nuevas)`
            }
            title={
              canRegenerate
                ? "Rehace la interpretación con lo nuevo de la práctica (turno efímero, sin ensuciar la conversación)"
                : "Vuelve a estar disponible pasados 3 minutos de la última opinión y con señales nuevas de práctica"
            }
            onClick={regenerate}
          >
            Volver a generar opinión de la IA
          </button>
          {!canRegenerate && regenRemaining > 0 && (
            <span className={styles.regenHint}>
              otra opinión en {countdownText(regenRemaining)}
              {checkedSignals !== null && !canRegenerate ? " · siguen sin aparecer señales nuevas" : ""}
            </span>
          )}
        </div>
        {redaction !== null && <p className={styles.reportNarration}>{redaction}</p>}
        {interpretation.blocks.map((block) => (
          <section key={block.heading} className={styles.reportBlock}>
            <h4 className={styles.reportHeading}>{block.heading}</h4>
            <ul className={styles.reportList}>
              {block.lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className={styles.chat} aria-label="Chat del mentor">
      <div className={styles.heading}>
        <span className={styles.avatar} aria-hidden="true" />
        <div className={styles.chat__title}>
          <strong>PianoMentor <span>Chat</span></strong>
          <p>Tu Profesor de piano IA</p>
        </div>
        {/* B-033.3 + revisión del 2026-11-08: alternador de la interpretación
            (evaluación) de la IA, de producto — no dev-only, porque el conte-
            nido técnico ya vive en «Depurar → Informe». Mientras llega la
            interpretación (B-033.4), maximizado muestra el hueco con la nota
            por entorno. Vuelve el chat con el mismo botón. */}
        <div className={styles.headingActions}>
          <button
            type="button"
            className={styles.reportToggle}
            aria-expanded={reportMode}
            aria-label={reportMode ? "Minimizar la interpretación de la IA" : "Interpretación de la IA"}
            title="Interpretación de la IA"
            onClick={toggleReportMode}
          />
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
      </div>

      {/* B-033.4: maximizado, el chat reserva el alto del panel y la burbuja
          acoge la interpretación del mentor: la redacción amable (turno efímero
          del chat) cuando hay LLM y, siempre, los bloques deterministas del
          `summary`. El informe técnico sigue en «Depurar → Informe». */}
      {reportMode ? (
        <div
          className={`${styles.bubble} ${styles.fontSm} ${styles.reportMode}`}
          aria-live="polite"
          aria-busy={interpPhase === "loading"}
        >
          {interpBody}
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
