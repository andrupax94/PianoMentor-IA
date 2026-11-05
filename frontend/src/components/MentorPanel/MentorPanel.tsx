// description: Columna derecha completa (chat, modos, pestañas y estado de sesión).
// context: B-006.4; reutiliza MidiUploader y SessionStatus, enganchado a la sesión viva con SessionStatusLive. B-032.10: sin sesión se ocultan el selector de manos y la pestaña «Rendimiento»; con sesión se oculta «Carga pieza» (petición del usuario).

"use client";

import { useSyncExternalStore } from "react";

import { getSessionSnapshot, subscribeSession } from "../../lib/session-store";
import { MentorChat } from "./MentorChat/MentorChat";
import { ModeSelector } from "./ModeSelector/ModeSelector";
import { MentorTabs } from "./MentorTabs/MentorTabs";
import { SessionStatusLive } from "../SessionStatusLive";
import styles from "./MentorPanel.module.css";
import type { MentorPanelProps } from "./MentorPanel.types";

export function MentorPanel({ weakPoint = "Transición de mano izquierda" }: MentorPanelProps) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const inSession = session.sessionId !== null;

  return (
    <aside className={styles.panel} aria-label="Panel del mentor">
      <MentorChat />
      {/* El selector de manos solo existe con una práctica abierta: sin sesión
          no hay modo que gobernar (B-032.10, petición del usuario). */}
      {inSession && <ModeSelector />}
      {/* Carga pieza y rendimiento viven en pestañas y se alternan con la
          sesión: sin práctica solo «Carga pieza», con práctica solo
          «Rendimiento». El estado de sesión queda siempre visible debajo. */}
      <MentorTabs weakPoint={weakPoint} visibleTabs={inSession ? ["rendimiento"] : ["carga"]} />
      <div className={styles.sessionStatus}>
        <SessionStatusLive />
      </div>
    </aside>
  );
}
