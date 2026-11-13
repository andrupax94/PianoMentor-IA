"use client";

// description: Burbuja de estado de sesión (D-002.5): FAB «i» que despliega el panel flotante en la esquina inferior derecha con el estado vivo. B-033.2: solo en desarrollo añade pestañas Estado/Depurar; el panel crece a ~340px y 70vh en dev y el código del menú no existe en producción (el import lazy es condicional).
// context: El estado es un almacén de módulo (session-store), no props del servidor, y el transporte se lee del contexto único de la portada. Con B-032.10 el mini cuadro se alimenta del store, no de este componente. Sesión en /{id}: nunca aparece sin práctica en la portada (el widget lo monta MentorPanel).

import { useState, lazy, Suspense, useSyncExternalStore, useEffect, useRef } from "react";

import { getSessionSnapshot, subscribeSession } from "../lib/session-store";
import { useTransport } from "../lib/transport-context";
import { SessionStatus } from "./SessionStatus";
import { toAuthUserInfo, type AuthSessionRaw } from "../lib/auth-user";
import {
  isDebugBubbleVisible,
  isDebugModeRequested,
  isAllowedDebugUser,
  DEBUG_BUBBLE_ALLOWED_EMAILS,
} from "../lib/debug-bubble";
import styles from "./SessionStatusLive.module.css";
import { useCornerBubbleDrag } from "../lib/use-corner-bubble-drag";

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

export interface SessionStatusLiveProps {
  /** Correo del usuario (sobrescribe la lectura de /api/auth/session). Útil en tests. */
  userEmail?: string | null;
  /** Fuerza el modo depuración (sobrescribe ?debugmode de la URL). Útil en tests. */
  debugMode?: boolean;
}

export function SessionStatusLive({ userEmail: userEmailProp, debugMode: debugModeProp }: SessionStatusLiveProps = {}) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const transport = useTransport();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>("estado");

  // --- Gating en producción: oculta la burbuja salvo ?debugmode + usuario autorizado ---
  const hasUserEmailProp = userEmailProp !== undefined;
  const hasDebugModeProp = debugModeProp !== undefined;

  const [debugMode, setDebugMode] = useState<boolean>(() => {
    if (IS_DEV) return true;
    if (hasDebugModeProp) return debugModeProp as boolean;
    if (typeof window !== "undefined") return isDebugModeRequested(window.location.search);
    return false;
  });
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    if (IS_DEV) return null;
    return hasUserEmailProp ? (userEmailProp ?? null) : null;
  });
  const [checked, setChecked] = useState<boolean>(() => {
    if (IS_DEV) return true;
    if (hasUserEmailProp || hasDebugModeProp) return true;
    // En SSR no hay sesión; se resolverá en el cliente. Mientras tanto, oculto.
    return typeof window === "undefined";
  });

  // Lectura de la URL (solo producción, y solo si no se fuerza por prop).
  useEffect(() => {
    if (IS_DEV || hasDebugModeProp || typeof window === "undefined") return;
    const readUrl = () => setDebugMode(isDebugModeRequested(window.location.search));
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [IS_DEV, hasDebugModeProp]);

  // Lectura de la sesión (solo producción, y solo si no se pasa por prop).
  useEffect(() => {
    if (IS_DEV || hasUserEmailProp) {
      if (IS_DEV || hasUserEmailProp) setChecked(true);
      return;
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const raw: AuthSessionRaw | null = response.ok ? await response.json() : null;
        const { user: info } = toAuthUserInfo(raw ?? null);
        if (active) setUserEmail(info?.email ?? null);
      } catch {
        if (active) setUserEmail(null);
      } finally {
        if (active) setChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [IS_DEV, hasUserEmailProp]);

  // Si se fuerza por prop, sincroniza el flag checked.
  useEffect(() => {
    if (IS_DEV) return;
    if (hasUserEmailProp || hasDebugModeProp) setChecked(true);
  }, [IS_DEV, hasUserEmailProp, hasDebugModeProp, userEmailProp, debugModeProp]);

  // Sincroniza props cuando cambian.
  useEffect(() => {
    if (hasUserEmailProp) setUserEmail(userEmailProp ?? null);
  }, [hasUserEmailProp, userEmailProp]);
  useEffect(() => {
    if (hasDebugModeProp) setDebugMode(debugModeProp as boolean);
  }, [hasDebugModeProp, debugModeProp]);

  const effectiveUserEmail = hasUserEmailProp ? (userEmailProp ?? null) : userEmail;
  const effectiveDebugMode = hasDebugModeProp ? (debugModeProp as boolean) : debugMode;

  const drag = useCornerBubbleDrag({
    open,
    storageKey: "pm-bubble-corner-debug",
    userId: effectiveUserEmail ?? null,
    margin: 8,
  });

  const visible = isDebugBubbleVisible({
    isDev: IS_DEV,
    userEmail: IS_DEV ? null : effectiveUserEmail,
    debugMode: IS_DEV ? true : effectiveDebugMode,
  });

  // En producción, hasta resolver la sesión, no se pinta (evita flash no autorizado).
  if (!IS_DEV && !checked) return null;
  if (!visible) return null;

  return (
    <div
      ref={drag.ref}
      className={styles.widget}
      style={drag.style}
      onPointerDown={drag.handlers.onPointerDown}
      onPointerMove={drag.handlers.onPointerMove}
      onPointerUp={drag.handlers.onPointerUp}
      onPointerCancel={drag.handlers.onPointerCancel}
    >
      {open && drag.dragging && <div className={styles.distort} aria-hidden="true" />}
      <button
        type="button"
        className={styles.fab}
        aria-label="Estado de sesión"
        aria-expanded={open}
        hidden={open}
        onClick={() => {
          if (drag.consumeClickIfJustDragged()) return;
          setOpen(true);
        }}
      >
        <span className={styles.fabIcon} aria-hidden="true" />
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

// Reexportaciones de conveniencia para tests/documentación.
export {
  isDebugBubbleVisible,
  isDebugModeRequested,
  isAllowedDebugUser,
  DEBUG_BUBBLE_ALLOWED_EMAILS,
} from "../lib/debug-bubble";
