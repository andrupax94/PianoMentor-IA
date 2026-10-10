// description: Props de las estadísticas de rendimiento.
// context: B-006.4; los valores reales los calcula B-013.

export interface PerformanceStatsProps {
  /** Porcentaje de timing. */
  timing?: number;
  /** Porcentaje de notas. */
  notes?: number;
  /** Punto débil detectado. */
  weakPoint?: string;
}
