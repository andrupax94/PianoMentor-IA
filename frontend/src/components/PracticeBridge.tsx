// description: Enlace entre la sesión de la ruta y la portada: WebSocket (estado y acciones del agente), teclado del PC y almacén de estado.
// context: La práctica vive en /{id} sobre la portada (reposición post-B-012.1); absorbe la lógica de PracticeSession (B-012.1). No pinta nada: manda las notas al servidor (bloqueadas mientras el agente demuestra, B-012.5) y publica el estado en session-store, que lee el mini cuadro del panel del mentor.

"use client";

import { useEffect, useRef, useState } from "react";

import { demoWindow, effectiveControl, publishDemoPlayback } from "../lib/agent-demo";
import { ApiError, getSessionState } from "../lib/api-client";
import { createSessionClock, type SessionClock } from "../lib/session-clock";
import { clearSession, updateSession, type SessionSnapshot } from "../lib/session-store";
import { useComputerKeyboard } from "../lib/useComputerKeyboard";
import { SessionSocket, type AgentActionMessage } from "../lib/websocket-client";

export interface PracticeBridgeProps {
  /** Sesión ya creada con POST /api/v1/sessions, tomada de la ruta (/{id}). */
  sessionId: string;
}

/**
 * Estado que gobierna el puente: no incluye `lastStep`, que escribe el chat
 * al pedir una pista y este componente no debe pisarlo en cada actualización.
 * `agentAction` sí lo publica este puente (B-012.5), desde el sobre del socket.
 */
type PracticeSnapshot = Omit<SessionSnapshot, "lastStep">;

/** Foto inicial mientras el socket y el REST contestan. */
function connectingSnapshot(sessionId: string): PracticeSnapshot {
  return { sessionId, state: null, connection: "connecting", error: null, agentAction: null };
}

export function PracticeBridge({ sessionId }: PracticeBridgeProps) {
  const [snapshot, setSnapshot] = useState<PracticeSnapshot>(() => connectingSnapshot(sessionId));

  const socketRef = useRef<SessionSocket | null>(null);
  /**
   * Último estado visto: el sobre `agent_action` no trae la pieza, así que la
   * demostración la saca de aquí (B-012.5).
   */
  const stateRef = useRef<PracticeSnapshot["state"]>(null);
  /**
   * Origen del reloj del estudiante (`t_s`): se ancla en la primera tecla, que
   * es cuando la práctica empieza de verdad; B-012.5 lo moverá al transporte
   * de reproducción (B-006.2), que ya sabe cuándo empieza la pieza.
   */
  const clockRef = useRef<SessionClock>(createSessionClock());

  useEffect(() => {
    let cancelled = false;
    const socket = new SessionSocket({
      sessionId,
      onState: (message) => {
        stateRef.current = message;
        setSnapshot((previous) => ({ ...previous, state: message }));
      },
      onStatusChange: (status) => setSnapshot((previous) => ({ ...previous, connection: status })),
      onError: (message) => {
        setSnapshot((previous) => ({ ...previous, error: message.message }));
        // Una sesión que no existe no se arregla reintentando: se deja de insistir.
        if (message.code === "session_not_found") socket.close();
      },
      // B-012.5: la demostración bloquea el teclado, manda la ventana al
      // transporte para que suene y devolver el control la detiene; el estado
      // del servidor no re-empuja el campo `control`.
      onAction: (message: AgentActionMessage) => {
        setSnapshot((previous) => ({ ...previous, agentAction: message }));
        if (message.action === "demonstrate") {
          const pieceId = stateRef.current?.piece_id;
          if (pieceId) {
            publishDemoPlayback({
              kind: "start",
              pieceId,
              window: demoWindow(message) ?? { fromMeasure: null, toMeasure: null, tempoFactor: null },
            });
          }
        } else if (message.action === "return_control") {
          publishDemoPlayback({ kind: "stop" });
        }
      },
    });
    socketRef.current = socket;
    socket.connect();

    // Primer pintado del mini cuadro sin esperar a que abra el socket.
    getSessionState(sessionId)
      .then((state) => {
        if (!cancelled) setSnapshot((previous) => ({ ...previous, state }));
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
      socket.close();
      socketRef.current = null;
      // Salir con una demostración en marcha no debe dejar el transporte
      // tocando la ventana recortada: el orden de parar va antes de limpiar.
      publishDemoPlayback({ kind: "stop" });
      clearSession();
    };
  }, [sessionId]);

  // El mini cuadro del panel del mentor se suscribe al almacén, no a este componente.
  useEffect(() => {
    updateSession(snapshot);
  }, [snapshot]);

  // El teclado del PC ya toca en la portada (B-011); aquí solo se reenvía al
  // servidor. El control efectivo (B-012.5) bloquea el teclado mientras el
  // agente demuestra, aunque el último `state` cacheado diga "student".
  const canPlay =
    snapshot.connection === "open" &&
    effectiveControl(snapshot.state, snapshot.agentAction) === "student";
  useComputerKeyboard({
    enabled: canPlay,
    onNoteOn: ({ pitch, velocity }) => {
      socketRef.current?.sendNoteOn({ pitch, velocity, t_s: clockRef.current.elapsedSeconds() });
    },
    onNoteOff: (pitch) => {
      socketRef.current?.sendNoteOff({ pitch, velocity: 0, t_s: clockRef.current.elapsedSeconds() });
    },
  });

  return null;
}
