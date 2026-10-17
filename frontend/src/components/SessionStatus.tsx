// description: Estado de la sesión de práctica: conexión, estado musical y quién controla el piano.
// context: B-012.1; hace visible idle/playing/paused y el control student/agent.

import type { SessionState } from "../lib/api-client";
import type { ConnectionStatus } from "../lib/websocket-client";

const STATUS_LABELS: Record<SessionState["status"], string> = {
  idle: "ESPERANDO",
  playing: "TOCANDO",
  paused: "EN PAUSA",
};

const CONTROL_LABELS: Record<SessionState["control"], string> = {
  student: "ESTUDIANTE",
  agent: "AGENTE",
};

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "conectando…",
  open: "conectada",
  closed: "desconectada",
};

export interface SessionStatusProps {
  /** Estado vivo recibido por WebSocket; null mientras no ha llegado ninguno. */
  state?: SessionState | null;
  connection?: ConnectionStatus;
  /** Último aviso del servidor o del transporte; null si no hay ninguno. */
  error?: string | null;
}

export function SessionStatus({
  state = null,
  connection = "closed",
  error = null,
}: SessionStatusProps) {
  return (
    <section className="panel">
      <h2>Estado de sesión</h2>

      {state === null ? (
        // Sin conexión ni estado no hay sesión: es el caso del panel del piano,
        // que todavía no practica. Con la conexión en marcha, solo es el primer
        // pintado y el estado está a punto de llegar.
        <p>{connection === "closed" ? "Sin sesión activa." : "Cargando la sesión…"}</p>
      ) : (
        <>
          <p>
            Modo: <strong>{STATUS_LABELS[state.status]}</strong>
          </p>
          <p>
            Control: <strong>{CONTROL_LABELS[state.control]}</strong>
          </p>
          <p>
            Compás: <strong>{state.current_measure ?? "—"}</strong>
          </p>
        </>
      )}

      <p>
        Conexión: <strong>{CONNECTION_LABELS[connection]}</strong>
      </p>

      {error && (
        <p role="alert" style={{ color: "#ff8b8b" }}>
          {error}
        </p>
      )}
    </section>
  );
}
