// description: Estado de la sesión de práctica: modo (esperando/tocando/en pausa), control (estudiante/agente), compás, estado de la conexión, la procedencia de la última pista del agente (solo fuera de producción) y el último error; con las props opcionales muestra 'Sin sesión activa.' donde todavía no hay práctica (B-012.1).
// context: Sustituye el marcador estático que usaba el armazón del piano (B-006.4) y lo pinta SessionStatusLive con el estado que llega por WebSocket. La línea de procedencia (B-012.6) es diagnóstico: se oculta en producción.

import { providerLabel } from "../lib/agent-hint";
import type { AgentStepResponse, SessionState } from "../lib/api-client";
import type { ConnectionStatus } from "../lib/websocket-client";
import styles from "./SessionStatus.module.css";

/** La procedencia es diagnóstico: en producción no se enseña (B-012.6). */
const SHOW_PROVENANCE = process.env.NODE_ENV !== "production";

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
  /** Quién propuso la última pista del agente; solo se pinta fuera de producción. */
  step?: Pick<AgentStepResponse, "provider" | "used_fallback"> | null;
}

export function SessionStatus({
  state = null,
  connection = "closed",
  error = null,
  step = null,
}: SessionStatusProps) {
  return (
    <section className={styles.panel}>
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

      {/* Diagnóstico para depurar en local: en producción no se pinta. */}
      {SHOW_PROVENANCE && step !== null && (
        <p>
          Procedencia: <strong>{providerLabel(step)}</strong>
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "#ff8b8b" }}>
          {error}
        </p>
      )}
    </section>
  );
}
