// description: Rendimiento del pasaje (medidores y punto débil).
// context: B-006.4; armazón estático.

import { GaugeChart } from "./GaugeChart/GaugeChart";
import styles from "./PerformanceStats.module.css";
import type { PerformanceStatsProps } from "./PerformanceStats.types";

export function PerformanceStats({
  timing = 74,
  notes = 91,
  weakPoint = "Transición de mano izquierda",
}: PerformanceStatsProps) {
  return (
    <section className={styles.stats} aria-label="Rendimiento">
      <h2>Rendimiento (Este Pasaje)</h2>
      <div className={styles.gauges}>
        <GaugeChart value={timing} label="Timing" />
        <GaugeChart value={notes} label="Notas" />
      </div>
      <p className={styles.weak}>
        <strong>Punto Débil:</strong> {weakPoint}
      </p>
    </section>
  );
}
