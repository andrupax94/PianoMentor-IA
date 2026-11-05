// description: Enlace entre la sesión de la ruta y la portada: WebSocket (estado, latencia y acciones del agente), puerto de entrada de notas, almacén de estado y la pieza que la sesión manda al piano (B-032.1). Desde B-032.2 el `t_s` de cada nota y la posición que viaja al backend salen del transporte único, y una puerta corta el audio y el envío mientras el agente demuestra.
// context: La práctica vive en /{id} sobre la portada (reposición post-B-012.1); absorbe la lógica de PracticeSession (B-012.1). No pinta nada: manda las notas al servidor (bloqueadas mientras el agente demuestra, B-012.5), publica el estado en session-store, decide si el acompañamiento se puede sonar o hay que degradarlo a demostración según la latencia del canal (B-012.7) y reconcilia la pieza del almacén con el `piece_id` de la sesión (B-032.1). La posición se manda a 4 Hz y el backend decide cuándo difundirla. Con B-032.5/B-032.6 vive además el gate-controller (activa gates por modo y emite `practice`) y aplica las decisiones del agente: `slow_down` cambia el tempo del transporte y `return_control` publica el stop con el compás demostrado, donde la práctica reanuda y rearma el gate. Con B-032.7 suscribe el bus offer-choice y traduce la respuesta del alumno a la oferta en los sobres WS.

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { accompanyPlan, demoParamsFor, shouldDegradeToDemo } from "../lib/agent-accompany";
import { fetchPieceInfo } from "../lib/agent-commands";
import { demoWindow, effectiveControl, type AgentDemoWindow } from "../lib/agent-demo";
import { publishAgentPlayback } from "../lib/agent-playback";
import { ApiError, executeAgentAction, getSessionState } from "../lib/api-client";
import { inform, sessionClosedText } from "../lib/chat-feed";
import { createGateController, type GateController } from "../lib/gate-controller";
import { measureIndexAt } from "../lib/measures";
import { setNoteInputEnabled, subscribeNoteInput } from "../lib/note-input";
import { evaluatedHand } from "../lib/practice-mode";
import { musicalPosition } from "../lib/playback-schedule";
import { subscribeOfferChoice } from "../lib/offer-choice";
import { syncSessionPiece } from "../lib/session-piece";
import {
  clearSession,
  getSessionSnapshot,
  isPracticeModeChanging,
  getLastRequestedPracticeMode,
  subscribeSession,
  updateSession,
  type SessionSnapshot,
} from "../lib/session-store";
import { useTransport } from "../lib/transport-context";
import { SessionSocket, type AgentActionMessage } from "../lib/websocket-client";

export interface PracticeBridgeProps {
  /** Sesión ya creada con POST /api/v1/sessions, tomada de la ruta (/{id}). */
  sessionId: string;
}

/** Cada cuánto se mide la latencia del canal con un `ping` (B-012.7). */
const PING_INTERVAL_MS = 2000;

/** Cada cuánto se manda la posición del transporte al backend (B-032.2). */
const POSITION_PUSH_MS = 500;

/** Ventana vacía: la demostración sin compases explícitos toca la pieza entera. */
const WHOLE_PIECE: AgentDemoWindow = {
  fromMeasure: null,
  toMeasure: null,
  tempoFactor: null,
};

/**
 * Estado que gobierna el puente: no incluye `lastStep`, que escribe el chat
 * al pedir una pista y este componente no debe pisarlo en cada actualización.
 * `agentAction` y `latencyMs` sí los publica este puente (B-012.5/B-012.7).
 */
type PracticeSnapshot = Omit<SessionSnapshot, "lastStep" | "practiceMode" | "studentHand">;

/** Foto inicial mientras el socket y el REST contestan. */
function connectingSnapshot(sessionId: string): PracticeSnapshot {
  return {
    sessionId,
    state: null,
    connection: "connecting",
    error: null,
    agentAction: null,
    latencyMs: null,
  };
}

export function PracticeBridge({ sessionId }: PracticeBridgeProps) {
  const [snapshot, setSnapshot] = useState<PracticeSnapshot>(() => connectingSnapshot(sessionId));
  /** Transporte único de la portada (B-032.2): de aquí sale el `t_s` musical. */
  const transport = useTransport();
  /** Modo de práctica vigente en el almacén (selector + confirmación del servidor). */
  const sessionStore = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  const socketRef = useRef<SessionSocket | null>(null);
  const gateControllerRef = useRef<GateController | null>(null);
  /**
   * Último estado visto: el sobre `agent_action` no trae la pieza, así que la
   * intervención la saca de aquí (B-012.5).
   */
  const stateRef = useRef<PracticeSnapshot["state"]>(null);
  /**
   * B-032.6: la ventana que se estaba demostrando. Al devolver el control, el
   * transporte reanuda la práctica en su inicio y el gate se rearma.
   */
  const lastDemoWindowRef = useRef<AgentDemoWindow | null>(null);
  /**
   * Última latencia medida del canal: decide si el acompañamiento puede sonar
   * junto al estudiante o hay que degradarlo a demostración (B-012.7).
   */
  const rttRef = useRef<number | null>(null);
  /**
   * Última foto del transporte, para leer posición y factor desde callbacks
   * sin volver a suscribirse en cada tick (B-032.2).
   */
  const transportRef = useRef(transport);
  transportRef.current = transport;

  useEffect(() => {
    let cancelled = false;

    /**
     * B-032.1: la sesión manda la pieza. Por URL directa o tras un F5 el
     * almacén está vacío (o tiene la demo), así que se publica la de la
     * sesión; la reconciliación es idempotente por id, de modo que cada
     * mensaje de `state` no recarga la partitura ni reinicia la posición.
     */
    const ensureSessionPiece = (pieceId: string | undefined) => {
      if (!pieceId) return;
      void syncSessionPiece(pieceId, fetchPieceInfo).catch(() => undefined);
    };

    const socket = new SessionSocket({
      sessionId,
      onState: (message) => {
        stateRef.current = message;
        setSnapshot((previous) => ({ ...previous, state: message }));
        ensureSessionPiece(message.piece_id);
        // B-032.4: el modo del servidor manda sobre el local (otra pestaña, o
        // un cambio hecho desde el chat): el selector refleja el estado real.
        // Se ignora un `state` tardío que contradiga un cambio reciente del
        // alumno, para no revertirlo por una carrera con el estado inicial.
        if (message.mode) {
          const recent = isPracticeModeChanging();
          const requested = getLastRequestedPracticeMode();
          const stale =
            recent && message.mode !== requested;
          if (!stale) {
            updateSession({
              practiceMode: message.mode,
              studentHand: message.hand === "left" ? "left" : "right",
            });
          }
        }
      },
      onStatusChange: (status) => {
        setSnapshot((previous) => ({ ...previous, connection: status }));
        // Con el canal abierto se mide la latencia ya, sin esperar al turno.
        if (status === "open") socket.ping();
      },
      onLatency: (rttMs) => {
        rttRef.current = rttMs;
        setSnapshot((previous) => ({ ...previous, latencyMs: rttMs }));
      },
      onError: (message) => {
        setSnapshot((previous) => ({ ...previous, error: message.message }));
        // Una sesión que no existe no se arregla reintentando: se deja de insistir.
        if (message.code === "session_not_found") socket.close();
      },
      // B-012.5/B-012.7: la demostración bloquea el teclado y manda la ventana
      // al transporte; el acompañamiento hace sonar una mano sin bloquearlo.
      // Devolver el control detiene la intervención; el estado del servidor no
      // re-empuja el campo `control`.
      onAction: (message: AgentActionMessage) => {
        setSnapshot((previous) => ({ ...previous, agentAction: message }));
        const pieceId = stateRef.current?.piece_id;

        if (message.action === "demonstrate") {
          if (pieceId) {
            const window = demoWindow(message) ?? WHOLE_PIECE;
            lastDemoWindowRef.current = window;
            publishAgentPlayback({ kind: "demo", pieceId, window });
          }
          return;
        }

        if (message.action === "slow_down") {
          // B-032.6: bajar el tempo de la práctica. El tiempo no es del WS:
          // pide el factor y el transporte único lo aplica, como haría el usuario.
          const factor = message.tempo_factor;
          if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
            transportRef.current.setTempoFactor(factor);
          }
          return;
        }

        if (message.action === "accompany") {
          const plan = accompanyPlan(message);
          if (pieceId && plan && !shouldDegradeToDemo(rttRef.current)) {
            publishAgentPlayback({ kind: "accompany", pieceId, plan });
            return;
          }
          // Sin plan, sin pieza o con el canal lento: la IA demuestra la misma
          // sección. La decisión sigue siendo del backend, que valida y difunde.
          void executeAgentAction(
            sessionId,
            "demonstrate",
            demoParamsFor(message, plan),
          ).catch(() => undefined);
          return;
        }

        if (message.action === "return_control") {
          // B-032.6: la práctica reanuda al inicio del compás demostrado, con
          // el tempo vigente (el `slow_down` no se pierde al recargar la pieza).
          const window = lastDemoWindowRef.current;
          lastDemoWindowRef.current = null;
          publishAgentPlayback({
            kind: "stop",
            resumeFromMeasure: window?.fromMeasure ?? null,
            tempoFactor: transportRef.current.tempoFactor,
          });
        }
      },
    });
    socketRef.current = socket;
    socket.connect();

    // La latencia se refresca mientras dure la práctica: es lo que permite
    // degradar un acompañamiento que llegaría tarde.
    const pingTimer = window.setInterval(() => socket.ping(), PING_INTERVAL_MS);

    // B-032.7: la respuesta del alumno a la oferta del mentor llega por el bus
    // (la burbuja no toca el canal) y sale por el WS sin parámetros: los suyos
    // ya los guardó el backend al ofrecer la demostración.
    const unsubscribeOffers = subscribeOfferChoice((choice) => {
      if (choice.choice === "accept") socket.sendOfferAccept();
      if (choice.choice === "dismiss") socket.sendOfferDismiss();
      if (choice.choice === "repeat") socket.sendOfferRepeat();
    });

    // Primer pintado del mini cuadro sin esperar a que abra el socket.
    getSessionState(sessionId)
      .then((state) => {
        if (cancelled) return;
        setSnapshot((previous) => ({ ...previous, state }));
        ensureSessionPiece(state.piece_id);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setSnapshot((previous) => ({
          ...previous,
          error: failure instanceof ApiError ? failure.message : "No se pudo leer la sesión.",
        }));
      });

    return () => {
      cancelled = true;
      window.clearInterval(pingTimer);
      unsubscribeOffers();
      socket.close();
      socketRef.current = null;
      // Salir con una intervención en marcha no debe dejar el transporte
      // tocando lo del agente: el orden de parar va antes de limpiar.
      publishAgentPlayback({ kind: "stop" });
      // B-032.10: el cierre de la práctica también se cuenta en el chat; la
      // línea sobrevive al desmonte porque el feed vive fuera del componente.
      inform(sessionClosedText());
      clearSession();
    };
  }, [sessionId]);

  // B-032.5: gate-controller del modo espera. Solo está activo en modos de
  // práctica (one_hand / both_hands), nunca en observar.
  useEffect(() => {
    const mode = sessionStore.practiceMode;
    const hand = evaluatedHand(mode, sessionStore.studentHand) ?? "both";
    const enabled = mode === "one_hand" || mode === "both_hands";

    gateControllerRef.current?.setOptions({ enabled, hand });
    if (!enabled) {
      gateControllerRef.current?.stop();
      gateControllerRef.current = null;
      return;
    }
    if (gateControllerRef.current) return;

    const socket = socketRef.current;
    if (!socket) return;

    const controller = createGateController({
      getSnapshot: () => transportRef.current.getEngineSnapshot(),
      subscribeNoteInput,
      sendPracticeEvent: (event) => socket.sendPracticeEvent(event),
      clockMs: () => performance.now(),
      onHit: () => transportRef.current.resolveGate(),
      // B-032.8: con una tecla errónea la cascada regresa al punto de pulsación.
      onWrong: () => transportRef.current.wrongGate(),
      options: { enabled: true, hand },
    });
    controller.start();
    gateControllerRef.current = controller;

    return () => {
      controller.stop();
      gateControllerRef.current = null;
    };
  }, [sessionStore.practiceMode, sessionStore.studentHand, sessionId]);

  // El mini cuadro del panel del mentor se suscribe al almacén, no a este componente.
  useEffect(() => {
    updateSession(snapshot);
  }, [snapshot]);

  // El teclado del PC ya toca en la portada (B-011); aquí solo se reenvía al
  // servidor. El control efectivo (B-012.5) bloquea el teclado mientras el
  // agente demuestra, aunque el último `state` cacheado diga "student"; con el
  // acompañamiento (B-012.7) el estudiante sigue tocando.
  const canPlay =
    snapshot.connection === "open" &&
    effectiveControl(snapshot.state, snapshot.agentAction) === "student";

  /**
   * B-032.2: la puerta del puerto de entrada. Cerrarla corta el audio local y
   * el envío a la sesión a la vez; abrirla los devuelve. Al desmontar se deja
   * abierta para que la portada sin sesión siga sonando.
   */
  useEffect(() => {
    setNoteInputEnabled(canPlay);
    return () => setNoteInputEnabled(true);
  }, [canPlay]);

  /**
   * B-032.2: el `t_s` de una nota es la posición musical del transporte
   * (`position_s` escalado × factor), no un reloj aparte. Con la puerta
   * cerrada no llega ningún `note_on`, así que no hay que comprobarlo aquí.
   */
  const musicalTime = () => {
    const current = transportRef.current;
    return musicalPosition(current.getPosition(), current.tempoFactor);
  };

  useEffect(
    () =>
      subscribeNoteInput({
        onNoteOn: ({ pitch, velocity }) => {
          socketRef.current?.sendNoteOn({ pitch, velocity, t_s: musicalTime() });
        },
        onNoteOff: ({ pitch }) => {
          socketRef.current?.sendNoteOff({ pitch, velocity: 0, t_s: musicalTime() });
        },
      }),
    // `musicalTime` lee del ref: no hace falta volver a suscribirse en cada tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  );

  /**
   * B-032.2: la posición viaja al backend a 4 Hz. Allí solo se difunde cuando
   * cambia el compás o cada 500 ms, para no inundar el canal. Parado en el
   * inicio no se manda nada: no hay posición que contar.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      if (!socket) return;
      const current = transportRef.current;
      const position_s = current.getPosition();
      if (current.status === "stopped" && position_s === 0) return;
      socket.sendPosition({
        t_s: musicalPosition(position_s, current.tempoFactor),
        measure: measureIndexAt(current.measures, current.tempoFactor, position_s),
      });
    }, POSITION_PUSH_MS);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  return null;
}
