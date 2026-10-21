// description: Columna derecha completa (chat, modos, pestañas y estado de sesión).
// context: B-006.4; reutiliza MidiUploader y SessionStatus, enganchado a la sesión viva con SessionStatusLive.

import { MentorChat } from "./MentorChat/MentorChat";
import { ModeSelector } from "./ModeSelector/ModeSelector";
import { MentorTabs } from "./MentorTabs/MentorTabs";
import { SessionStatusLive } from "../SessionStatusLive";
import styles from "./MentorPanel.module.css";
import type { MentorPanelProps } from "./MentorPanel.types";

export function MentorPanel({ weakPoint = "Transición de mano izquierda" }: MentorPanelProps) {
  return (
    <aside className={styles.panel} aria-label="Panel del mentor">
      <MentorChat />
      <ModeSelector />
      {/* Carga pieza y rendimiento viven en pestañas; el estado de sesión queda
          siempre visible debajo, fuera del conmutador de pestañas. */}
      <MentorTabs weakPoint={weakPoint} />
      <div className={styles.sessionStatus}>
        <SessionStatusLive />
      </div>
    </aside>
  );
}
