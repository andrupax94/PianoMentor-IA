// description: Barra de progreso de reproducción con porcentaje.
// context: B-006.4; armazón estático.

import styles from "./ProgressBar.module.css";
import type { ProgressBarProps } from "./ProgressBar.types";

export function ProgressBar({ value = 75 }: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div className={styles.wrap}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de reproducción"
      >
        <span className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
      <strong>{clamped}%</strong>
    </div>
  );
}
