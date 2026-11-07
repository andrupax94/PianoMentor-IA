"use client";
// description: Rendimiento del pasaje (medidores y punto débil).
// context: B-006.4; armazón estático. B-032.10: el prop weakPoint existía y no se pintaba — ahora la tarjeta crece en columna y lo muestra como franja dorada bajo los medidores. Los medidores llevan los colores de la cascada (Timing con la mano derecha, Notas con la izquierda). Ahora se cablea a la evaluación real (B-012.2) cuando hay sesión abierta; sin datos se muestra un placeholder.
import { useCallback, useEffect, useState } from "react";
import { useSyncExternalStore } from "react";

import { evaluateSession } from "../../../lib/api-client";
import { getSessionSnapshot, subscribeSession } from "../../../lib/session-store";
import { GaugeChart } from "./GaugeChart/GaugeChart";
import styles from "./PerformanceStats.module.css";
import type { PerformanceStatsProps } from "./PerformanceStats.types";

function deriveWeakPoint(ev: {
  counts?: { wrong_pitch?: number; omitted?: number; early?: number; late?: number; extra?: number };
  timing_ms?: number;
  expected_total?: number;
}): string {
  const counts = ev.counts ?? {};
  const wrong = counts.wrong_pitch ?? 0;
  const omitted = counts.omitted ?? 0;
  const timing = counts.early ?? 0 + (counts.late ?? 0);
  const extra = counts.extra ?? 0;
  const timingMs = ev.timing_ms ?? 0;
  if (!ev.expected_total) return "Sin datos aún";
  if (wrong > 0 && wrong >= omitted && wrong >= timing && wrong >= extra) return "Notas equivocadas";
  if (omitted > 0 && omitted >= wrong) return "Notas omitidas";
  if (timingMs > 200) return "Timing";
  if (extra > 0) return "Notas de más";
  return "Sin debilidad clara";
}

export function PerformanceStats({
  timing: timingProp,
  notes: notesProp,
  weakPoint: weakPointProp,
}: PerformanceStatsProps) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const sessionId = session.sessionId;

  const [timing, setTiming] = useState<number | undefined>(timingProp);
  const [notes, setNotes] = useState<number | undefined>(notesProp);
  const [weakPoint, setWeakPoint] = useState<string | undefined>(weakPointProp);
  const [measureTiming, setMeasureTiming] = useState<number | undefined>(undefined);
  const [measureNotes, setMeasureNotes] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(!sessionId);

  const currentMeasure = session.state?.current_measure ?? null;

  const load = useCallback(async () => {
    if (!sessionId) {
      setEmpty(true);
      return;
    }
    setLoading(true);
    setEmpty(false);
    try {
      const ev = await evaluateSession(sessionId);
      setTiming(Math.round((ev.timing_score ?? 0) * 100));
      setNotes(Math.round((ev.notes_score ?? 0) * 100));
      setWeakPoint(deriveWeakPoint(ev));
      // Evaluación del compás actual para feedback inmediato (tiempo real).
      if (currentMeasure !== null) {
        try {
          const mev = await evaluateSession(sessionId, {
            from_measure: currentMeasure,
            to_measure: currentMeasure + 1,
          });
          setMeasureTiming(Math.round((mev.timing_score ?? 0) * 100));
          setMeasureNotes(Math.round((mev.notes_score ?? 0) * 100));
        } catch {
          setMeasureTiming(undefined);
          setMeasureNotes(undefined);
        }
      }
    } catch {
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId, currentMeasure]);

  useEffect(() => {
    void load();
  }, [load]);

  // Permite que props controlen los valores cuando se pasan explícitamente.
  useEffect(() => {
    if (timingProp !== undefined) setTiming(timingProp);
  }, [timingProp]);
  useEffect(() => {
    if (notesProp !== undefined) setNotes(notesProp);
  }, [notesProp]);
  useEffect(() => {
    if (weakPointProp !== undefined) setWeakPoint(weakPointProp);
  }, [weakPointProp]);

  const showEmpty = empty || (!loading && timing === undefined && notes === undefined);

  return (
    <section className={styles.stats} aria-label="Rendimiento">
      <div className={styles.gauges}>
        <GaugeChart value={timing ?? 0} label="Timing" color="var(--hand-right)" />
        <GaugeChart value={notes ?? 0} label="Notas" color="var(--hand-left)" />
      </div>
      <div className={styles.gauges}>
        <GaugeChart value={measureTiming ?? 0} label="Timing compás" color="var(--hand-right)" />
        <GaugeChart value={measureNotes ?? 0} label="Notas compás" color="var(--hand-left)" />
      </div>
      {loading && <p className={styles.weak}>Cargando rendimiento…</p>}
      {showEmpty && !loading && <p className={styles.weak}>Sin datos aún: toca algo para ver tu rendimiento.</p>}
      {!showEmpty && !loading && <p className={styles.weak}>{weakPoint ?? "Sin debilidad clara"}</p>}
    </section>
  );
}