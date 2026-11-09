// description: Informe técnico de la práctica (B-033.3, dev-only): pide el informe consolidado on-demand al cambiar a «Informe» en Depurar (GET practice-report vía api-client), muestra cargando/error (session_not_found del 404 estable se pinta como sesión sin señales, no como fallo), línea de cifras (señales, compases, intervenciones) y botones copiar (clipboard), descarga del paquete .zip (B-033.5: informe.json + registro.txt + grabacion.wav si hay rec + LÉEME.md) y volver a pedir explícito; el JSON viaja con sangría legible en un pre con tabindex.
// context: Vive como sub-pestaña «Informe» del panel Depurar (movido del chat en la revisión de B-033.3). No toca el transporte ni el WS: el informe es lectura de lo ya persistido por B-032.6 con la evaluación compacta de B-032.3. Lo puro (texto de error, formato, nombre de archivo y descarga) vive en lib/practice-report.ts y lib/snapshot-pack.ts (B-033.5: el zip puro con bytes CRC-checked); desde B-033.5 «Reiniciar sesión» vive en SessionDebug, a su lado, y la interpretación pedagógica del mentor en el chat (B-033.4).

"use client";

import { useCallback, useEffect, useState } from "react";

import { getPracticeReport, type PracticeReport } from "../../../lib/api-client";
import {
  formatPracticeReport,
  practiceReportErrorText,
} from "../../../lib/practice-report";
import {
  getDebugLogSnapshot,
  getDebugScenarioSnapshot,
} from "../../../lib/practice-debug";
import { getRecordingBlob } from "../../../lib/rec-store";
import { downloadPackage } from "../../../lib/snapshot-pack";
import type { PackageParts } from "../../../lib/snapshot-pack";

/**
 * El paquete desde el informe cargado (B-033.5): materiales actuales del
 * Registro (robot + IA + trazas [audio]) y la grabación rec (blob WAV en
 * memoria); sin grabación el zip sale sin el fichero y el LÉEME lo explica.
 */
function downloadPackageFromReport(report: PracticeReport): void {
  const parts: PackageParts = {
    informeJson: formatPracticeReport(report),
    registroLineas: getDebugLogSnapshot().map((entry) => entry.text),
    grabacion: getRecordingBlob() ?? null,
    contexto: {
      sessionId: report.session.session_id,
      pieceTitle: report.session.piece_title,
      escenario: getDebugScenarioSnapshot().scenario,
    },
  };
  void downloadPackage(parts).catch((failure: unknown) => {
    console.error("El paquete no se pudo montar", failure instanceof Error ? failure.message : failure);
  });
}
import styles from "./PracticeReport.module.css";
import type { PracticeReportProps } from "./PracticeReport.types";

type ReportState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; report: PracticeReport }
  | { phase: "error"; message: string };

export function PracticeReport({ sessionId }: PracticeReportProps) {
  const [state, setState] = useState<ReportState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);

  /**
   * Fetch on-demand: abrir el modo informe hace la petición; recargar es
   * explícito con el botón «Volver a pedir». Sin sesión no se pide nada.
   */
  const load = useCallback(async (id: string) => {
    setState({ phase: "loading" });
    try {
      const report = await getPracticeReport(id);
      setState({ phase: "ready", report });
    } catch (failure: unknown) {
      setState({ phase: "error", message: practiceReportErrorText(failure) });
    }
  }, []);

  useEffect(() => {
    if (sessionId === null) return;
    void load(sessionId);
  }, [sessionId, load]);

  const report = state.phase === "ready" ? state.report : null;

  const copy = useCallback(() => {
    if (report === null) return;
    void navigator.clipboard
      .writeText(formatPracticeReport(report))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }, [report]);

  /**
   * B-033.5: la descarga es el paquete .zip de la sesión (petición del
   * usuario): informe.json (el consolidado con evaluación y summary),
   * registro.txt (las líneas del Registro, robot + IA + [audio]), la
   * grabación rec en WAV si la hay y un LÉEME.md que lo explica todo.
   */
  const download = useCallback(() => {
    if (report !== null) downloadPackageFromReport(report);
  }, [report]);

  if (sessionId === null) {
    return <p className={styles.note}>No hay sesión activa: el informe necesita una práctica abierta.</p>;
  }

  return (
    <div className={styles.report} aria-label="Informe de la sesión">
      <div className={styles.toolbar}>
        <p className={styles.hint} aria-hidden="true">
          Informe consolidado de la práctica (dev).
        </p>
        <div className={styles.actions}>
          {report !== null && (
            <>
              <span className={styles.stats} aria-hidden="true">
                {report.signals.total} señales · {report.by_measure.length} compases ·{" "}
                {report.agent_decisions.length} intervenciones
              </span>
              <button type="button" className={styles.action} onClick={copy}>
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
              <button
                type="button"
                className={styles.action}
                title="Baja un .zip con cuatro ficheros: informe.json (el informe con evaluación y summary), registro.txt (el Registro con las trazas [audio] si estaban activas), grabacion.wav si rec grabó algo y un LÉEME.md que lo explica todo. La grabación vive solo en esta pestaña: si recargaste, el zip no la lleva."
                onClick={download}
              >
                Descargar pack (.zip)
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.action}
            disabled={state.phase === "loading"}
            onClick={() => void load(sessionId)}
          >
            Volver a pedir
          </button>
        </div>
      </div>

      {state.phase === "loading" && <p className={styles.note}>Cargando informe…</p>}
      {state.phase === "error" && (
        <p className={styles.note} role="alert">
          {state.message}
        </p>
      )}
      {report !== null && (
        <pre className={styles.json} tabIndex={0} aria-label="JSON del informe">
          {formatPracticeReport(report)}
        </pre>
      )}
    </div>
  );
}
