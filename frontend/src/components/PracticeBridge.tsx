// description: Enlace entre la sesión de la ruta y la portada: WebSocket, teclado del PC y almacén de estado.
// context: La práctica vive en /{id} sobre la portada (reposición post-B-012.1); absorbe la lógica de PracticeSession (B-012.1). No pinta nada: manda las notas al servidor y publica el estado en session-store, que lee el mini cuadro del panel del mentor.

"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, getSessionState } from "../lib/api-client";
import { createSessionClock, type SessionClock } from "../lib/session-clock";
import { clearSession, updateSession, type SessionSnapshot } from "../lib/session-store";
import { useComputerKeyboard } from "../lib/useComputerKeyboard";
import { SessionSocket } from "../lib/websocket-client";

export interface PracticeBridgeProps {
  /** Sesión ya creada con POST /api/v1/sessions, tomada de la ruta (/{id}). */
  sessionId: string;
}

/**
 * Estado que gobierna el puente: no incluye `lastStep`, que escribe el chat
 * al pedir una pista y este componente no debe pisarlo en cada actualización.
 */
type PracticeSnapshot = Omit<SessionSnapshot, "lastStep">;

/** Foto inicial mientras el socket y el REST contestan. */
function connectingSnapshot(sessionId: string): PracticeSnapshot {
  return { sessionId, state: null, connection: "connecting", error: null };
}

export function PracticeBridge({ sessionId }: PracticeBridgeProps) {
  const [snapshot, setSnapshot] = useState<PracticeSnapshot>(() => connectingSnapshot(sessionId));

  const socketRef = useRef<SessionSocket | null>(null);
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
      onState: (message) => setSnapshot((previous) => ({ ...previous, state: message })),
      onStatusChange: (status) => setSnapshot((previous) => ({ ...previous, connection: status })),
      onError: (message) => {
        setSnapshot((previous) => ({ ...previous, error: message.message }));
        // Una sesión que no existe no se arregla reintentando: se deja de insistir.
        if (message.code === "session_not_found") socket.close();
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
      clearSession();
    };
  }, [sessionId]);

  // El mini cuadro del panel del mentor se suscribe al almacén, no a este componente.
  useEffect(() => {
    updateSession(snapshot);
  }, [snapshot]);

  // El teclado del PC ya toca en la portada (B-011); aquí solo se reenvía al servidor.
  const canPlay =
    snapshot.connection === "open" && (snapshot.state?.control ?? "student") === "student";
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
