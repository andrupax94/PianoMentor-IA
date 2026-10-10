// description: Selector de modo (Observar, Duo, Tomar Control).
// context: B-006.4; armazón estático.

import styles from "./ModeSelector.module.css";
import type { MentorMode, ModeSelectorProps } from "./ModeSelector.types";

const MODES: { id: MentorMode; label: string }[] = [
  { id: "observar", label: "👁 Observar" },
  { id: "duo", label: "▶ Duo" },
  { id: "control", label: "🎹 Tomar Control" },
];

export function ModeSelector({ mode = "observar" }: ModeSelectorProps) {
  return (
    <div className={styles.modes} role="group" aria-label="Modo del mentor">
      {MODES.map((item) => (
        <button key={item.id} type="button" aria-pressed={item.id === mode}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
