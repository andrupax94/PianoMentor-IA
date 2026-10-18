// description: Selector de modo (Observar, Duo, Tomar Control).
// context: B-006.4; armazón estático.

import styles from "./ModeSelector.module.css";
import type { MentorMode, ModeSelectorProps } from "./ModeSelector.types";

const MODES: { id: MentorMode; className: string; label: string; icon: string }[] = [
  { id: "observar", className: styles.observar, label: "Observar", icon: "eye.svg" },
  { id: "duo", className: styles.duo, label: "Duo", icon: "eye.svg" },
  { id: "control", className: styles.control, label: "Tomar Control", icon: "eye.svg" },
];

export function ModeSelector({ mode = "observar" }: ModeSelectorProps) {
  return (
    <div className={styles.modes} role="group" aria-label="Modo del mentor">
      {MODES.map((item) => (
        <button key={item.id} className={item.className} type="button" aria-pressed={item.id === mode}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
