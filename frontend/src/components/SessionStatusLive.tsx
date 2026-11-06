"use client";

// description: Burbuja de estado de sesión (D-002.5): FAB «i» que despliega el panel flotante en la esquina inferior derecha con el estado vivo. B-033.2: solo en desarrollo añade pestañas Estado/Depurar; el panel crece a ~340px y 70vh en dev y el código del menú no existe en producción (el import lazy es condicional).
// context: El estado es un almacén de módulo (session-store), no props del servidor, y el transporte se lee del contexto único de la portada. Con B-032.10 el mini cuadro se alimenta del store, no de este componente. Sesión en /{id}: nunca aparece sin práctica en la portada (el widget lo monta MentorPanel).

import { useState, lazy, Suspense, useSyncExternalStore } from "react";

import { getSessionSnapshot, subscribeSession } from "../lib/session-store";
import { useTransport } from "../lib/transport-context";
import { SessionStatus } from "./SessionStatus";
import styles from "./SessionStatusLive.module.css";

/**
 * El código del menú de depuración no existe en producción: al estar el import
 * dinámico condicionado a la constante, el build lo elimina (el flag vive en
 * el import, no en el render).
 */
const IS_DEV = process.env.NODE_ENV !== "production";
const DebugPanelLazy = IS_DEV
  ? lazy(() => import("./SessionDebug/SessionDebug").then((module) => ({ default: module.SessionDebug })))
  : null;

type StatusTab = "estado" | "depurar";

export function SessionStatusLive() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const transport = useTransport();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>("estado");

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
      {/* El panel crece un poco en dev para acoger las pestañas sin tapar la pantalla (B-033.2). */}
      <div className={IS_DEV ? `${styles.panel} ${styles.panelDev}` : styles.panel} hidden={!open}>
        <button
          type="button"
          aria-label="Cerrar estado de sesión"
          onClick={() => setOpen(false)}
          style={{ float: "right", background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
        >
          ×
        </button>
        {IS_DEV && (
          <div className={styles.tabstrip} role="tablist" aria-label="Vistas del panel de estado">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "estado"}
              className={tab === "estado" ? styles.tabActive : styles.tab}
              onClick={() => setTab("estado")}
            >
              Estado
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "depurar"}
              className={tab === "depurar" ? styles.tabActive : styles.tab}
              onClick={() => setTab("depurar")}
            >
              Depurar
            </button>
          </div>
        )}
        {(!IS_DEV || tab === "estado") && (
          <SessionStatus
            state={session.state}
            connection={session.connection}
            error={session.error}
            action={session.agentAction}
            step={session.lastStep}
            latencyMs={session.latencyMs}
            transportStatus={transport.status}
          />
        )}
        {IS_DEV && tab === "depurar" && DebugPanelLazy !== null && (
          <Suspense fallback={<p className={styles.tabLoading}>Cargando depuración…</p>}>
            <DebugPanelLazy />
          </Suspense>
        )}
      </div>
    </div>
  );
}
