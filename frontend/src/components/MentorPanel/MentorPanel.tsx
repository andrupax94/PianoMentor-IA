// description: Columna derecha completa (chat, modos, pestañas y estado de sesión).
// context: B-006.4; reutiliza MidiUploader y SessionStatus, enganchado a la sesión viva con SessionStatusLive. B-032.10: sin sesión se ocultan el selector de manos y la pestaña «Rendimiento»; con sesión se oculta «Carga pieza» (petición del usuario). B-033.3: con el modo informe del chat activo (dev-only) el resto de bloques se ocultan y el chat ocupa todo el alto del panel.

"use client";

import { useState, useSyncExternalStore } from "react";

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
  /**
   * B-033.3 (dev-only, lo dispara MentorChat en dev): maximizado, solo queda
   * el chat con el informe; se vuelve con el mismo botón. El estado nace a
   * false en cada montaje, así que el vaciado del callback del cleanup no
   * necesita distinguir nada.
   */
  const [chatMaximized, setChatMaximized] = useState(false);

  return (
    <aside className={styles.panel} aria-label="Panel del mentor">
      <MentorChat onReportModeChange={setChatMaximized} />
      {!chatMaximized &&
        <>
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
        </>
      }
    </aside>
  );
}
