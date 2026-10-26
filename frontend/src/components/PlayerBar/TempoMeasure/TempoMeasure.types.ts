// description: Props de tempo, compás actual/total y firma (tempoBpm, measure, measureCount, signature), más baseTempoBpm y onTempoChange para hacer el tempo editable (B-006.5).
// context: B-008.3; sin datos se muestra indicador vacío, nunca un valor inventado.

export interface TempoMeasureProps {
  /** Tempo efectivo en BPM (null/undefined = desconocido). */
  tempoBpm?: number | null;
  /**
   * Tempo base de la pieza sin factor aplicado; con `onTempoChange` convierte
   * el BPM que pide el usuario en el factor del motor (B-006.5). Null → el
   * tempo se pinta como texto, no editable.
   */
  baseTempoBpm?: number | null;
  /** El usuario pidió este tempo efectivo; quien lo recibe aplica el factor. */
  onTempoChange?: (bpm: number) => void;
  /** Compás actual, 1-based (null/undefined = desconocido). */
  measure?: number | null;
  /** Total de compases (null/undefined = desconocido). */
  measureCount?: number | null;
  /** Firma [numerador, denominador] del compás actual (null/undefined = desconocida). */
  signature?: readonly [number, number] | null;
}
