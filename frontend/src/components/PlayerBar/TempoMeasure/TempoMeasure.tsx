// description: Tempo y compás en reproducción.
// context: B-006.4; armazón estático.

import styles from "./TempoMeasure.module.css";
import type { TempoMeasureProps } from "./TempoMeasure.types";

export function TempoMeasure({ tempoBpm = 60, measure = "12/16" }: TempoMeasureProps) {
  return (
    <div className={styles.tempo}>
      <p>Tempo: {tempoBpm === null ? "–" : `${tempoBpm} BPM`}</p>
      <p>Measure: {measure}</p>
    </div>
  );
}
