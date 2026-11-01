"use client";

import { useState } from "react";
import { useSyncExternalStore } from "react";

import { getSessionSnapshot, subscribeSession } from "../lib/session-store";
import { useTransport } from "../lib/transport-context";
import { SessionStatus } from "./SessionStatus";
import styles from "./SessionStatusLive.module.css";

export function SessionStatusLive() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const transport = useTransport();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.widget}>
      <button
        type="button"
        className={styles.fab}
        aria-label="Estado de sesión"
        aria-expanded={open}
        hidden={open}
        onClick={() => setOpen(true)}
      >
        i
      </button>
      <div className={styles.panel} hidden={!open}>
        <button
          type="button"
          aria-label="Cerrar estado de sesión"
          onClick={() => setOpen(false)}
          style={{ float: "right", background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
        >
          ×
        </button>
        <SessionStatus
          state={session.state}
          connection={session.connection}
          error={session.error}
          action={session.agentAction}
          step={session.lastStep}
          latencyMs={session.latencyMs}
          transportStatus={transport.status}
        />
      </div>
    </div>
  );
}