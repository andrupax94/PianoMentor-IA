// description: Registro en vivo del modo depuración (B-033.2): anillo de entradas (señales de práctica, teclas del robot, intervenciones del agente y eventos de escenario), estado del robot (escenario activo y semilla) y los textos de las entradas. El menú dev lo pinta; ni en producción se publica.
// context: Módulo puro, sin DOM ni React, al estilo de session-store/agent-playback: los publicadores son PracticeBridge (señal practice, acciones del agente, robot) y el registro se lee con useSyncExternalStore. La publicación es no-op bajo NODE_ENV === "production", así que el bundle prod no arrastra historial.

import type { PracticeEvent } from "./gate-controller";
import type { AgentActionMessage } from "./websocket-client";

/** Categorías del registro: qué canal produjo la entrada. */
export type DebugLogKind = "practice" | "note" | "agent" | "scenario" | "system";

/** Una línea del registro del modo depuración. */
export interface DebugLogEntry {
  /** Monotónico: el orden del registro es el orden de llegada. */
  id: number;
  kind: DebugLogKind;
  text: string;
}

/** Líneas que conserva el anillo: los más viejos se descartan. */
const MAX_DEBUG_ENTRIES = 120;

let nextEntryId = 1;
let entries: readonly DebugLogEntry[] = [];
const logListeners = new Set<() => void>();
const scenarioListeners = new Set<() => void>();

/** Escenario del robot activo ahora mismo (null si no hay). */
interface DebugScenarioState {
  scenario: string | null;
  seed: number | null;
}

let scenarioState: DebugScenarioState = { scenario: null, seed: null };

/** Publica una entrada; no-op declarado en producción. */
export function publishDebugLog(kind: DebugLogKind, text: string): void {
  if (process.env.NODE_ENV === "production") return;
  const entry: DebugLogEntry = { id: nextEntryId, kind, text };
  nextEntryId += 1;
  entries =
    entries.length >= MAX_DEBUG_ENTRIES
      ? [...entries.slice(-(MAX_DEBUG_ENTRIES - 1)), entry]
      : [...entries, entry];
  for (const listener of logListeners) listener();
}

/** Copia del anillo (referencia estable entre publicaciones). */
export function getDebugLogSnapshot(): readonly DebugLogEntry[] {
  return entries;
}

/** Se suscribe al registro; devuelve la baja. */
export function subscribeDebugLog(listener: () => void): () => void {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

/** Vacía el registro; el estado del robot queda intacto. */
export function clearDebugLog(): void {
  if (entries.length === 0) return;
  entries = [];
  for (const listener of logListeners) listener();
}

/** Pinta el escenario del robot; null = robot parado. Cada cambio deja línea. */
export function publishDebugScenario(scenario: string | null, seed: number | null): void {
  if (process.env.NODE_ENV === "production") return;
  if (scenarioState.scenario === scenario && scenarioState.seed === seed) return;
  scenarioState = { scenario, seed };
  if (scenario) {
    publishDebugLog(
      "scenario",
      seed === null ? `robot lanzado: ${scenario}` : `robot lanzado: ${scenario} (semilla ${seed})`,
    );
  } else {
    publishDebugLog("scenario", "robot parado");
  }
  for (const listener of scenarioListeners) listener();
}

/** Escenario activo del robot (provisto por B-033.1 en PracticeBridge). */
export function getDebugScenarioSnapshot(): DebugScenarioState {
  return scenarioState;
}

/** Se suscribe al estado del robot; devuelve la baja. */
export function subscribeDebugScenario(listener: () => void): () => void {
  scenarioListeners.add(listener);
  return () => {
    scenarioListeners.delete(listener);
  };
}

/** Texto de una señal de práctica para el registro. */
export function practiceEventText(event: PracticeEvent): string {
  const outcomes: Record<PracticeEvent["outcome"], string> = {
    hit: "acierto",
    miss: "falta",
    wrong: "equivocada",
    timeout: "vencido",
  };
  return `gate ${event.gate} → ${outcomes[event.outcome]} · compás ${event.measure ?? "?"}, espera ${event.wait_ms} ms`;
}

/** Texto de una intervención del agente para el registro. */
export function agentActionText(action: AgentActionMessage): string {
  const labels: Record<string, string> = {
    demonstrate: "IA: demostración",
    slow_down: action.tempo_factor !== undefined ? `IA: tempo lento (×${action.tempo_factor})` : "IA: tempo lento",
    accompany: "IA: acompañamiento",
    return_control: "IA: control devuelto",
    offer_demo: "IA: oferta de demostración",
    give_hint: `IA: pista (${action.hint_type ?? "pista"})`,
  };
  const base = labels[action.action] ?? `IA: ${action.action}`;
  return action.reason ? `${base} — ${action.reason}` : base;
}

/** Restaura el estado del módulo (solo tests: el registro es estado de módulo). */
export function resetDebugLog(): void {
  entries = [];
  nextEntryId = 1;
  scenarioState = { scenario: null, seed: null };
  logListeners.clear();
  scenarioListeners.clear();
}
