// description: Enlace entre la sesión de la ruta y la portada: WebSocket (estado, latencia y acciones del agente), puerto de entrada de notas, almacén de estado y la pieza que la sesión manda al piano (B-032.1). Desde B-032.2 el `t_s` de cada nota y la posición que viaja al backend salen del transporte único, y una puerta corta el audio y el envío mientras el agente demuestra.
// context: La práctica vive en /{id} sobre la portada (reposición post-B-012.1); absorbe la lógica de PracticeSession (B-012.1). No pinta nada: manda las notas al servidor (bloqueadas mientras el agente demuestra, B-012.5), publica el estado en session-store, que lee el mini cuadro del panel del mentor, decide si el acompañamiento se puede sonar o hay que degradarlo a demostración según la latencia del canal (B-012.7) y reconcilia la pieza del almacén con el `piece_id` de la sesión, para que por URL directa o tras un F5 no se practique sobre la demo (B-032.1). La posición se manda a 4 Hz y el backend decide cuándo difundirla.

"use client";

import { useEffect, useRef, useState } from "react";

import { accompanyPlan, demoParamsFor, shouldDegradeToDemo } from "../lib/agent-accompany";
import { fetchPieceInfo } from "../lib/agent-commands";
import { demoWindow, effectiveControl, type AgentDemoWindow } from "../lib/agent-demo";
import { publishAgentPlayback } from "../lib/agent-playback";
import { ApiError, executeAgentAction, getSessionState } from "../lib/api-client";
import { measureIndexAt } from "../lib/measures";
import { setNoteInputEnabled, subscribeNoteInput } from "../lib/note-input";
import { musicalPosition } from "../lib/playback-schedule";
import { syncSessionPiece } from "../lib/session-piece";
import { clearSession, updateSession, type SessionSnapshot } from "../lib/session-store";
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
type PracticeSnapshot = Omit<SessionSnapshot, "lastStep">;

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

  const socketRef = useRef<SessionSocket | null>(null);
  /**
   * Último estado visto: el sobre `agent_action` no trae la pieza, así que la
   * intervención la saca de aquí (B-012.5).
   */
  const stateRef = useRef<PracticeSnapshot["state"]>(null);
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
            publishAgentPlayback({
              kind: "demo",
              pieceId,
              window: demoWindow(message) ?? WHOLE_PIECE,
            });
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
          publishAgentPlayback({ kind: "stop" });
        }
      },
    });
    socketRef.current = socket;
    socket.connect();

    // La latencia se refresca mientras dure la práctica: es lo que permite
    // degradar un acompañamiento que llegaría tarde.
    const pingTimer = window.setInterval(() => socket.ping(), PING_INTERVAL_MS);

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
      socket.close();
      socketRef.current = null;
      // Salir con una intervención en marcha no debe dejar el transporte
      // tocando lo del agente: el orden de parar va antes de limpiar.
      publishAgentPlayback({ kind: "stop" });
      clearSession();
    };
  }, [sessionId]);

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
