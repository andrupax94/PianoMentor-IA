// description: Selector de modo (Observar, Duo, Tomar Control).
// context: B-006.4; armazón estático.

import { url } from "inspector";
import styles from "./ModeSelector.module.css";
import type { MentorMode, ModeSelectorProps } from "./ModeSelector.types";

const MODES: { id: MentorMode; className: string; label: string; icon: string }[] = [
  { id: "observar", className: styles.observar + " col-6", label: "Observar", icon: "eye.svg" },
  { id: "duo", className: styles.duo + " col-6", label: "Duo", icon: "play2.svg" },
  { id: "control", className: styles.control + " col-12", label: "Tomar Control", icon: "piano.svg" },
];

export function ModeSelector({ mode = "observar" }: ModeSelectorProps) {
  return (
    <div className="container">
      <div className={styles.modes + " row g-2  justify-content-between"} role="group" aria-label="Modo del mentor">
        {MODES.map((item) => (
          <button key={item.id} className={item.className} type="button" aria-pressed={item.id === mode}>
            <span style={{ maskImage: `url(/assets/icons/${item.icon})` }}></span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
