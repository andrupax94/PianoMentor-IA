// description: Pestaña «Depurar» del panel de estado (B-033.2, dev-only) con cuatro sub-pestañas: «Escenarios» (lanzar los escenarios del pianista robot de B-033.1 con relanzar y parar), «Registro» (registro en vivo de señales e intervenciones, trazas [audio] si «Traza de audio» está activa e interruptor «rec» de grabación temporal), «Informe» (el informe técnico JSON de B-033.3 + unzip descargable de B-033.5 y el botón «Reiniciar sesión») y «LLM» (caos de verificación de B-036.1: simular 429 una vez o siempre para probar los reintentos sin saturar el proveedor).
// context: Solo se carga con NODE_ENV !== "production" (lazy en SessionStatusLive). No gobierna el transporte directamente: al lanzar un escenario hace stop + play desde 0 por las vías existentes y el resto es disparar-observar (eventos practice:scenario-* que captura PracticeBridge). El log vive en practice-debug.ts (las trazas [audio] entran por audio-trace, canal audio); el interruptor rec lo gobierna rec-store (arranque automático con robot/demostración, WAV temporal en memoria); «Reiniciar sesión» para robot/transporte/rec/registro/consola/grabación y abre una sesión NUEVA de la misma pieza (el informe y la evaluación parten de cero con el id nuevo); el informe es fetch on-demand en su sub-pestaña (la interpretación pedagógica del mentor vive en el chat, B-033.4).

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  clearDebugLog,
  getDebugLogSnapshot,
  getDebugScenarioSnapshot,
  publishDebugLog,
  subscribeDebugLog,
  subscribeDebugScenario,
} from "../../lib/practice-debug";
import { isTraceAudio, setTraceAudio } from "../../lib/audio-trace";
import { isNoteInputEnabled, subscribeNoteInputGate } from "../../lib/note-input";
import { createSession, type SessionResponse } from "../../lib/api-client";
import { SCENARIO_IDS, type ScenarioId } from "../../lib/practice-scenarios";
import {
  getRecSnapshot,
  isRecEnabled,
  resetRecording,
  subscribeRec,
  subscribeRecEnabled,
  setRecEnabled,
} from "../../lib/rec-store";
import { recorderSupported } from "../../lib/practice-recorder";
import { getSessionSnapshot, subscribeSession } from "../../lib/session-store";
import { useTransport } from "../../lib/transport-context";
import { getWaitModeSnapshot, setWaitModeEnabled, subscribeWaitMode } from "../../lib/wait-mode-store";
import { useRouter } from "next/navigation";
import { LlmDebug } from "./LlmDebug/LlmDebug";
import { PracticeReport } from "./PracticeReport/PracticeReport";
import { usePracticeModeChange } from "../PracticeModeBridge";
import styles from "./SessionDebug.module.css";

/** Sub-pestañas internas del panel Depurar (escenarios/registro/informe/llm). */
type DebugTab = "escenarios" | "registro" | "informe" | "llm";

/** Etiqueta y descripción corta de cada escenario (menú v1). */
const SCENARIO_LABELS: Record<ScenarioId, { label: string; desc: string }> = {
  perfecta: { label: "Perfecta", desc: "pulsa al momento y sostiene la nota su tiempo: práctica sin fallos ni intervenciones" },
  siempre_tarde: { label: "Siempre tarde", desc: "pasa el margen y acierta: strikes vencidas + rescate tardío" },
  siempre_equivocada: { label: "Siempre equivocada", desc: "tecla errónea: sube la escalera propia (pista → tempo → demo)" },
  nunca_press: { label: "Nunca pulsa", desc: "el robot no toca: timeouts puros y oferta de demostración" },
  acorde_incompleto: { label: "Acorde incompleto", desc: "pulsa una parte del acorde: gates de acorde en espera" },
  mezcla: { label: "Mezcla", desc: "hit/tarde/equivocada a proporciones fijas, reproducible por semilla" },
  teclas_rapidas: { label: "Teclas rápidas", desc: "como perfecta pero con el golpe corto del v1 (mitad del gate)" },
};

export function SessionDebug() {
  const transport = useTransport();
  const router = useRouter();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const log = useSyncExternalStore(subscribeDebugLog, getDebugLogSnapshot, getDebugLogSnapshot);
  const robot = useSyncExternalStore(subscribeDebugScenario, getDebugScenarioSnapshot, getDebugScenarioSnapshot);
  const gateOpen = useSyncExternalStore(subscribeNoteInputGate, isNoteInputEnabled, isNoteInputEnabled);
  const waitMode = useSyncExternalStore(subscribeWaitMode, getWaitModeSnapshot, getWaitModeSnapshot);
  const changePracticeMode = usePracticeModeChange();
  /** Sub-pestaña activa: escenarios por defecto; el informe se carga on-demand al entrar. */
  const [tab, setTab] = useState<DebugTab>("escenarios");
  /** B-033.5: el interruptor rec y el estado del flujo (idle/grabando/lista). */
  const recOn = useSyncExternalStore(subscribeRecEnabled, isRecEnabled, isRecEnabled);
  const recFlow = useSyncExternalStore(subscribeRec, getRecSnapshot, getRecSnapshot);
  /** B-033.5: el Reiniciar sesión pide la pieza nueva en marcha (estado del botón). */
  const [resetting, setResetting] = useState(false);

  // Acceso directo a las trazas de audio (petición del usuario): el estado se
  // lee en el efecto para no desincronizar la hidratación (localStorage solo
  // existe en el cliente).
  const [traceAudio, setTraceAudioState] = useState(false);
  useEffect(() => {
    setTraceAudioState(isTraceAudio());
  }, []);
  const toggleTraceAudio = () => {
    setTraceAudioState(setTraceAudio(!traceAudio));
  };

  // B-033.2/B-033.3: sin sesión activa, escenarios y registro no tienen nada
  // que dirigir (los gates solo ocurren en modos de práctica): la sub-pestaña
  // lo explica en vez de controles muertos. «Informe» funciona siempre: su
  // componente ya sabe pintar «No hay sesión activa».

  /** Relanza la pieza desde 0 (parar + play por el transporte, sin recrear el reloj) y arma el robot sobre ella. */
  const launch = (scenario: ScenarioId) => {
    // Petición del usuario (2026-11-07): cada escenario se lanza con el
    // switch de manos en «Dos manos» y el «Modo espera» apagado — sin la
    // espera, el robot recorre la pieza de principio a fin sin atascarse en
    // el primer fallo, y a dos manos ejercita la pieza entera. El cambio va
    // por el mismo canal del selector (almacén + PATCH): el backend lo
    // persiste y el switch real de la interfaz lo refleja.
    if (session.practiceMode !== "both_hands") {
      changePracticeMode({ mode: "both_hands", hand: session.studentHand });
    }
    if (waitMode.enabled) setWaitModeEnabled(false);
    transport.stop();
    void transport.play();
    window.dispatchEvent(new CustomEvent("practice:scenario-start", { detail: { scenario } }));
  };

  const stopScenario = () => {
    window.dispatchEvent(new CustomEvent("practice:scenario-stop"));
  };

  /**
   * B-033.5 (petición del usuario): «Reiniciar sesión» — no borra nada del
   * back-end (la historia ya persistió y seguiría llegando por descarga): lo
   * que hace es pararlo TODO aquí y abrir una sesión NUEVA de la misma
   * pieza, de modo que registro, informe, evaluación y grabación parten de
   * cero con id nuevo. Orden barato y seguro:
   * 1. robot parado (el botón del robot queda coherente),
   * 2. transporte a stop (posición desde el inicio),
   * 3. grabación rec descartada, registro vaciado y consola limpiada,
   * 4. POST /sessions con la misma pieza → navegar al id nuevo.
   */
  const resetSession = async () => {
    const pieceId = session.state?.piece_id;
    if (resetting || session.sessionId === null || typeof pieceId !== "string") return;
    setResetting(true);
    window.dispatchEvent(new CustomEvent("practice:scenario-stop"));
    setRecEnabled(false);
    transport.stop();
    resetRecording();
    clearDebugLog();
    try {
      console.clear(); // best-effort: la consola propia también queda limpia
    } catch {
      // algunos navegadores lo prohíben sin sentido hostility: no pasa nada
    }
    try {
      const next: SessionResponse = await createSession(pieceId);
      publishDebugLog("system", `sesión reiniciada: ${next.id}`);
      router.push(`/${next.id}`);
    } catch (failure: unknown) {
      const message = failure instanceof Error ? failure.message : "No se pudo abrir la sesión nueva.";
      publishDebugLog("system", `el reinicio no abrió sesión nueva (${message})`);
    } finally {
      setResetting(false);
    }
  };

  if (session.sessionId === null && tab !== "informe" && tab !== "llm") {
    // Antes todo el panel callaba sin sesión; con sub-pestañas, «Informe»
    // sigue navegable y las otras dos explican (como hacía B-033.2). La pestaña
    // LLM tampoco necesita sesión: el caos es global del proceso del backend.
    return (
      <div className={styles.debug}>
        <DebugTabstrip tab={tab} setTab={setTab} />
        <p className={styles.empty}>No hay sesión activa: abre una práctica para lanzar escenarios.</p>
      </div>
    );
  }

  return (
    <div className={styles.debug}>
      <DebugTabstrip tab={tab} setTab={setTab} />
      {tab === "escenarios" && (
        <>
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
        </>
      )}

      {tab === "registro" && (
        <>
          <div className={styles.logHead}>
            <h3>Registro</h3>
            <div className={styles.logActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={toggleTraceAudio}
                title="Muestra el rastro del sampler/transporte/robot en la consola (filtro [audio]) sin tocar la URL"
              >
                Traza de audio: {traceAudio ? "activa" : "apagada"}
              </button>
              <button type="button" className={styles.secondary} onClick={() => clearDebugLog()}>
                Limpiar
              </button>
            </div>
          </div>
          <div className={styles.log} role="log" aria-live="polite" aria-label="Registro de la práctica">
            {log.length === 0 && <p className={styles.empty}>Sin señales todavía.</p>}
            {log.map((entry) => (
              <p key={entry.id} className={`${styles.row} ${styles[entry.kind]}`}>
                {entry.text}
              </p>
            ))}
          </div>
          {/* B-033.5: interruptor rec — apagado por defecto, grabación temporal
              en memoria: con rec encendido, automatiza cuando suena algo de la
              IA (robot o demostración) y para al terminar; un WAV mono queda
              listo para el paquete del informe hasta recargar la página. */}
          <div className={styles.recRow}>
            <button
              type="button"
              className={recOn ? styles.recOn : styles.secondary}
              disabled={!recorderSupported()}
              title={
                recorderSupported()
                  ? "Graba el audio de la práctica (temporal: vive solo hasta recargar). Encendido, arranca con el robot o una demostración y para al terminar."
                  : "Este navegador no soporta MediaRecorder: sin rec."
              }
              onClick={() => setRecEnabled(!recOn)}
            >
              rec {recOn ? "ON" : "OFF"}
              {recFlow === "recording" ? " — grabando…" : recFlow === "ready" ? " — WAV listo" : ""}
            </button>
            <span className={styles.desc}>
              {recorderSupported()
                ? "Grabación temporal de la práctica (muere al recargar). Con rec encendida arranca sola con el robot o con las demostraciones, y para al terminar."
                : "MediaRecorder no está disponible en este navegador."}
            </span>
          </div>
        </>
      )}

      {tab === "informe" && (
        <>
          <div className={styles.resetRow}>
            <button
              type="button"
              className={resetting ? styles.secondary : styles.resetButton}
              disabled={resetting || session.state?.control === "agent"}
              title={
                session.state?.control === "agent"
                  ? "La IA tiene el piano: espera a que devuelva el control."
                  : "Para todo (robot, transporte desde el inicio, rec, registro, consola) y abre una práctica NUEVA de la misma pieza: informe, evaluación y grabación parten de cero."
              }
              onClick={() => void resetSession()}
            >
              Reiniciar sesión
            </button>
            <span className={styles.desc}>
              Para robot, transporte y rec, limpia registro/consola/grabación y abre una
              práctica nueva de la misma pieza (id nuevo: informe y evaluación desde cero).
            </span>
          </div>
          <PracticeReport sessionId={session.sessionId} />
        </>
      )}

      {/* B-036.1: caos del LLM para verificar a mano los reintentos. No
          necesita sesión: el modo vive en el proceso del backend. */}
      {tab === "llm" && <LlmDebug />}
    </div>
  );
}

/**
 * Strip de sub-pestañas del Depurar (B-033.3): el mismo patrón del strip
 * Estado/Depurar del panel — role=tablist, aria-selected y navegación
 * completa por teclado por ser botones.
 */
function DebugTabstrip({
  tab,
  setTab,
}: {
  tab: DebugTab;
  setTab: (next: DebugTab) => void;
}) {
  return (
    <div className={styles.subtabs} role="tablist" aria-label="Herramientas de depuración">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "escenarios"}
        className={tab === "escenarios" ? styles.subtabActive : styles.subtab}
        onClick={() => setTab("escenarios")}
      >
        Escenarios
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "registro"}
        className={tab === "registro" ? styles.subtabActive : styles.subtab}
        onClick={() => setTab("registro")}
      >
        Registro
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "informe"}
        className={tab === "informe" ? styles.subtabActive : styles.subtab}
        onClick={() => setTab("informe")}
      >
        Informe
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "llm"}
        className={tab === "llm" ? styles.subtabActive : styles.subtab}
        onClick={() => setTab("llm")}
      >
        LLM
      </button>
    </div>
  );
}
