// description: Cuadrícula donde caerán las notas (placeholder).
// context: B-006.4; armazón estático.

import styles from "./NoteFallGrid.module.css";
import type { NoteFallGridProps } from "./NoteFallGrid.types";

export function NoteFallGrid({ octaves = ["C1", "C2", "C3"] }: NoteFallGridProps) {
  return (
    <div className={styles.grid} aria-label="Notas cayendo">
      <div className={styles.side}>
        {octaves.map((octave) => (
          <span key={`left-${octave}`}>{octave}</span>
        ))}
      </div>
      <p className={styles.hint}>Aquí caerán las notas.</p>
      <div className={styles.side}>
        {octaves.map((octave) => (
          <span key={`right-${octave}`}>{octave}</span>
        ))}
      </div>
    </div>
  );
}
