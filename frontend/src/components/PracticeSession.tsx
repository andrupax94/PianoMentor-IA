// description: Vista de una sesión de práctica: teclado del PC, WebSocket y estado en vivo.
// context: B-012.1; envía eventos MIDI a la sesión y pinta el estado que devuelve el servidor.

"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, getSessionState, type SessionState } from "../lib/api-client";
import { useComputerKeyboard } from "../lib/useComputerKeyboard";
import { SessionSocket, type ConnectionStatus } from "../lib/websocket-client";

import { SessionStatus } from "./SessionStatus";

export interface PracticeSessionProps {
  /** Sesión ya creada con POST /api/v1/sessions. */
  sessionId: string;
}

export function PracticeSession({ sessionId }: PracticeSessionProps) {
  const [state, setState] = useState<SessionState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("closed");
  const [error, setError] = useState<string | null>(null);
  const [clockAnchored, setClockAnchored] = useState(false);

  const socketRef = useRef<SessionSocket | null>(null);
  /**
   * Origen del reloj del estudiante (`t_s`). Se ancla en la primera tecla, que
   * es cuando la práctica empieza de verdad; B-012.5 lo moverá al transporte
   * de reproducción (B-006.2), que ya sabe cuándo empieza la pieza.
   */
  const clockRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const socket = new SessionSocket({
      sessionId,
      onState: (message) => setState(message),
      onStatusChange: setConnection,
      onError: (message) => {
        setError(message.message);
        // Una sesión que no existe no se arregla reintentando: se deja de insistir.
        if (message.code === "session_not_found") socket.close();
      },
    });
    socketRef.current = socket;
    socket.connect();

    // Primer pintado sin esperar a que abra el socket.
    getSessionState(sessionId)
      .then((session) => {
        if (!cancelled) setState(session);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(failure instanceof ApiError ? failure.message : "No se pudo leer la sesión.");
      });

    return () => {
      cancelled = true;
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId]);

  /** Segundos desde la primera tecla; la ancla si aún no lo estaba. */
  function elapsedSeconds(): number {
    const now = performance.now();
    if (clockRef.current === null) {
      clockRef.current = now;
      setClockAnchored(true);
    }
    return (now - clockRef.current) / 1000;
  }

  function resetClock(): void {
    clockRef.current = null;
    setClockAnchored(false);
  }

  const canPlay = connection === "open" && (state?.control ?? "student") === "student";
  useComputerKeyboard({
    enabled: canPlay,
    onNoteOn: ({ pitch, velocity }) => {
      socketRef.current?.sendNoteOn({ pitch, velocity, t_s: elapsedSeconds() });
    },
    onNoteOff: (pitch) => {
      socketRef.current?.sendNoteOff({ pitch, velocity: 0, t_s: elapsedSeconds() });
    },
  });

  return (
    <div className="grid">
      <SessionStatus state={state} connection={connection} error={error} />

      <section className="panel">
        <h2>Tocar</h2>
        <p>
          {canPlay
            ? "Toca con el teclado del ordenador (A–; blancas, W E T Y U O P negras; Z/X cambian de octava)."
            : "Esperando a que la sesión esté conectada…"}
        </p>
        <p>
          Reloj: <strong>{clockAnchored ? "en marcha" : "arranca con la primera tecla"}</strong>
        </p>
        <button type="button" onClick={resetClock} disabled={!clockAnchored}>
          Reiniciar reloj
        </button>
      </section>
    </div>
  );
}
