// description: Tempo, compás actual/total y firma durante la reproducción.
// context: B-008.3; valores reales del motor, o "–" cuando no hay datos (nunca inventados).

import { formatMeasure, formatSignature } from "../../../lib/measures";
import styles from "./TempoMeasure.module.css";
import type { TempoMeasureProps } from "./TempoMeasure.types";

export function TempoMeasure({ tempoBpm, measure, measureCount, signature }: TempoMeasureProps) {
  return (
    <div className={styles.tempo}>
      <p>
        <span style={{ maskImage: 'url("/assets/icons/metronome.svg")' }}></span>
        <span>Tempo: </span>
        {tempoBpm == null ? "–" : `${tempoBpm} BPM`}
      </p>

      <p>
        <span style={{ maskImage: 'url("/assets/icons/cronometer.svg")' }}></span>
        <span>Compás: </span>
        {formatMeasure(measure, measureCount)}
      </p>

      <p>
        <span style={{ maskImage: 'url("/assets/icons/firma.svg")' }}></span>
        <span>Firma: </span>
        {formatSignature(signature)}
      </p></div>
  );
}
