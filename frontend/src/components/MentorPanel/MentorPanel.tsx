// description: Columna derecha completa (chat, modos, rendimiento y flujo existente).
// context: B-006.4; reutiliza MidiUploader y SessionStatus sin modificarlos.

import { MentorChat } from "./MentorChat/MentorChat";
import { ModeSelector } from "./ModeSelector/ModeSelector";
import { PerformanceStats } from "./PerformanceStats/PerformanceStats";
import { MidiUploader } from "../MidiUploader";
import { SessionStatus } from "../SessionStatus";
import styles from "./MentorPanel.module.css";
import type { MentorPanelProps } from "./MentorPanel.types";

export function MentorPanel({ weakPoint = "Transición de mano izquierda" }: MentorPanelProps) {
  return (
    <aside className={styles.panel} aria-label="Panel del mentor">
      <MentorChat />
      <ModeSelector />
      <PerformanceStats weakPoint={weakPoint} />
      {/* Temporal hasta B-012: la subida vive en la zona "Upload Midi" de la caja. */}
      <MidiUploader />
      {/* Temporal: el estado de sesión se integrará con el panel en B-007/B-012. */}
      <SessionStatus />
    </aside>
  );
}
