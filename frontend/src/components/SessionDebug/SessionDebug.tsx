"use client";

// description: Pestaña «Depurar» del panel de estado (B-033.2, dev-only): lanzar los escenarios del pianista robot (B-033.1) con relanzar y parar, estado del robot (activo o suspendido mientras la IA demuestra) y registro en vivo de señales e intervenciones.
// context: Solo se carga con NODE_ENV !== "production" (lazy en SessionStatusLive). No gobierna el transporte directamente: al lanzar un escenario hace stop + play desde 0 por las vías existentes y el resto es disparar-observar (eventos practice:scenario-* que captura PracticeBridge). El log vive en practice-debug.ts; las señales de práctica llegan vía PracticeBridge.

import { useSyncExternalStore } from "react";

import {
  clearDebugLog,
  getDebugLogSnapshot,
  getDebugScenarioSnapshot,
  subscribeDebugLog,
  subscribeDebugScenario,
} from "../../lib/practice-debug";
import { isNoteInputEnabled, subscribeNoteInputGate } from "../../lib/note-input";
import { SCENARIO_IDS, type ScenarioId } from "../../lib/practice-scenarios";
import { useTransport } from "../../lib/transport-context";
import styles from "./SessionDebug.module.css";

/** Etiqueta y descripción corta de cada escenario (menú v1). */
const SCENARIO_LABELS: Record<ScenarioId, { label: string; desc: string }> = {
  perfecta: { label: "Perfecta", desc: "pulsa al momento: práctica sin fallos ni intervenciones" },
  siempre_tarde: { label: "Siempre tarde", desc: "pasa el margen y acierta: strikes vencidas + rescate tardío" },
  siempre_equivocada: { label: "Siempre equivocada", desc: "tecla errónea: sube la escalera propia (pista → tempo → demo)" },
  nunca_press: { label: "Nunca pulsa", desc: "el robot no toca: timeouts puros y oferta de demostración" },
  acorde_incompleto: { label: "Acorde incompleto", desc: "pulsa una parte del acorde: gates de acorde en espera" },
  mezcla: { label: "Mezcla", desc: "hit/tarde/equivocada a proporciones fijas, reproducible por semilla" },
};

export function SessionDebug() {
  const transport = useTransport();
  const log = useSyncExternalStore(subscribeDebugLog, getDebugLogSnapshot);
  const robot = useSyncExternalStore(subscribeDebugScenario, getDebugScenarioSnapshot);
  const gateOpen = useSyncExternalStore(subscribeNoteInputGate, isNoteInputEnabled, isNoteInputEnabled);

  /** Relanza la pieza desde 0 (parar + play por el transporte, sin recrear el reloj) y arma el robot sobre ella. */
  const launch = (scenario: ScenarioId) => {
    transport.stop();
    void transport.play();
    window.dispatchEvent(new CustomEvent("practice:scenario-start", { detail: { scenario } }));
  };

  const stopScenario = () => {
    window.dispatchEvent(new CustomEvent("practice:scenario-stop"));
  };

  return (
    <div className={styles.debug}>
      <h3>Escenarios</h3>
      <ul className={styles.scenarios}>
        {SCENARIO_IDS.map((scenario) => (
          <li key={scenario} className={scenario === robot.scenario ? styles.activeScenario : styles.scenarioRow}>
            <button type="button" className={styles.launch} onClick={() => launch(scenario)}>
              {SCENARIO_LABELS[scenario].label}
            </button>
            <span className={styles.desc}>{SCENARIO_LABELS[scenario].desc}</span>
          </li>
        ))}
      </ul>

      <div className={styles.robot}>
        <p className={robot.scenario === null ? styles.robotOff : styles.robotOn}>
          Robot:{" "}
          {robot.scenario === null ? "parado" : robot.scenario + (gateOpen ? " — activo" : " — suspendido (IA demostrando)")}
        </p>
        <div className={styles.robotActions}>
          {robot.scenario !== null && (
            <button type="button" className={styles.secondary} onClick={() => launch(robot.scenario as ScenarioId)}>
              Relanzar
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={stopScenario}>
            Parar
          </button>
        </div>
      </div>

      <div className={styles.logHead}>
        <h3>Registro</h3>
        <button type="button" className={styles.secondary} onClick={() => clearDebugLog()}>
          Limpiar
        </button>
      </div>
      <div className={styles.log} role="log" aria-live="polite" aria-label="Registro de la práctica">
        {log.length === 0 && <p className={styles.empty}>Sin señales todavía.</p>}
        {log.map((entry) => (
          <p key={entry.id} className={`${styles.row} ${styles[entry.kind]}`}>
            {entry.text}
          </p>
        ))}
      </div>
    </div>
  );
}
