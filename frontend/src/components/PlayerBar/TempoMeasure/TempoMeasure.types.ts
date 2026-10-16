// description: Props de tempo, compás actual y firma mostrados.
// context: B-008.3; sin datos se muestra indicador vacío, nunca un valor inventado.

export interface TempoMeasureProps {
  /** Tempo efectivo en BPM (null/undefined = desconocido). */
  tempoBpm?: number | null;
  /** Compás actual, 1-based (null/undefined = desconocido). */
  measure?: number | null;
  /** Total de compases (null/undefined = desconocido). */
  measureCount?: number | null;
  /** Firma [numerador, denominador] del compás actual (null/undefined = desconocida). */
  signature?: readonly [number, number] | null;
}
