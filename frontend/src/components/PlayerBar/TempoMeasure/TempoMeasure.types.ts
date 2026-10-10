// description: Props de tempo y compás mostrados.
// context: B-006.4; el tempo efectivo lo expone el motor de B-006.2/B-006.3.

export interface TempoMeasureProps {
  /** Tempo en BPM (null = desconocido). */
  tempoBpm?: number | null;
  /** Compás actual/total. */
  measure?: string;
}
