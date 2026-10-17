// description: Columna derecha completa (chat, modos, rendimiento y flujo existente).
// context: B-006.4; reutiliza MidiUploader y SessionStatus.

import { MentorChat } from "./MentorChat/MentorChat";
import { ModeSelector } from "./ModeSelector/ModeSelector";
import { MentorTabs } from "./MentorTabs/MentorTabs";
import styles from "./MentorPanel.module.css";
import type { MentorPanelProps } from "./MentorPanel.types";

export function MentorPanel({ weakPoint = "Transición de mano izquierda" }: MentorPanelProps) {
  return (
    <aside className={styles.panel} aria-label="Panel del mentor">
      <MentorChat />
      <ModeSelector />
      {/* Carga pieza, estado de sesión y rendimiento ahora viven en pestañas. */}
      <MentorTabs weakPoint={weakPoint} />
    </aside>
  );
}
