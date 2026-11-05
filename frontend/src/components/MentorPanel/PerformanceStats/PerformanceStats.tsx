// description: Rendimiento del pasaje (medidores y punto débil).
// context: B-006.4; armazón estático. B-032.10: el prop weakPoint existía y no se pintaba — ahora la tarjeta crece en columna y lo muestra como franja dorada bajo los medidores (revisión de estilos con el usuario). Los medidores llevan los colores de la cascada (Timing con la mano derecha, Notas con la izquierda) para no desentonar: tokens, no literales.

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
      <div className={styles.gauges}>
        <GaugeChart value={timing} label="Timing" color="var(--hand-right)" />
        <GaugeChart value={notes} label="Notas" color="var(--hand-left)" />
      </div>
      {/* El punto débil que follow-up el agente suele retomar: franja dorada
          (el dato es armazón estático hasta que la evaluación corre por sesiones). */}
      <p className={styles.weak}>{weakPoint}</p>
    </section>
  );
}
