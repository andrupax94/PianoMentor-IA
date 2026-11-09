// description: Almacén de la grabación «rec» del modo depuración (B-033.5): interruptor rec (apagado por defecto, sin memoria entre recargas), el tap de audio que publica usePlayback (AudioContext + nodo donde el sonido ya está sumado), el estado del flujo (idle/grabando/lista) y las reglas automáticas — empezar a grabar cuando suena algo de la IA (robot de escenarios o demostración) y parar cuando vuelve la calma.
// context: B-033.5; módulo puro estilo session-store/practice-debug: sin DOM, los consumidores van con useSyncExternalStore. La grabación es TEMPORAL por definición (blob en memoria tras convertir a WAV, recarga = fuera, jamás localStorage ni back-end). Todo el mecanismo no existe en producción (no-op declarado).

import { publishDebugLog } from "./practice-debug";
import { getDebugScenarioSnapshot, subscribeDebugScenario } from "./practice-debug";
import {
  type AudioTap,
  getCurrentTap,
  recordingElapsedMs,
  subscribeAudioTap,
  REC_MAX_MS,
} from "./practice-recorder";
import {
  discardRecording,
  getRecorderState,
  startTapRecording,
  stopTapRecording,
} from "./practice-recorder";
import { getSessionSnapshot, subscribeSession } from "./session-store";

/** Estados del flujo rec que pinta la UI. */
export type RecUiState = "idle" | "recording" | "ready";

let recEnabled = false;
const recListeners = new Set<() => void>();

function notify(listeners: Iterable<() => void>): void {
  for (const listener of listeners) listener();
}

/** Interruptor rec (B-033.5): apagarlo para la grabación en curso y CONSERVA lo capturado. */
export function setRecEnabled(enabled: boolean): void {
  if (process.env.NODE_ENV === "production") return;
  if (recEnabled === enabled) return;
  recEnabled = enabled;
  notify(recListeners);
  if (!enabled && kind === "recording") {
    void finishRecording();
  }
}

export function isRecEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return recEnabled;
}

export function subscribeRecEnabled(listener: () => void): () => void {
  recListeners.add(listener);
  return () => {
    recListeners.delete(listener);
  };
}

/** Estado del flujo para la UI. */
let kind: RecUiState = "idle";
const stateListeners = new Set<() => void>();

export function getRecSnapshot(): RecUiState {
  if (process.env.NODE_ENV === "production") return "idle";
  return kind;
}

export function subscribeRec(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function setKind(next: RecUiState): void {
  kind = next;
  notify(stateListeners);
  notify(recListeners); // el switch y los mensajes dependen: misma fila.
}

/** ¿Hay WAV listo para el paquete? (si no, el zip sale sin el fichero 3.) */
export function getRecordingBlob(): Blob | null {
  if (process.env.NODE_ENV === "production") return null;
  const recorderState = getRecorderState();
  return recorderState.kind === "ready" ? recorderState.blob : null;
}

/** Texto del estado para el registro del menú. */
export function recStateText(): string {
  if (process.env.NODE_ENV === "production") return "rec apagada";
  switch (kind) {
    case "recording":
      return "rec grabando…";
    case "ready":
      return "rec: grabación lista (temporal)";
    default:
      return "rec sin grabación";
  }
}

/** Empieza a grabar: interruptor encendido, motor montado, y sin grabación viva. */
async function startIfIdle(): Promise<void> {
  if (!recEnabled || kind === "recording") return;
  const tap: AudioTap | null = getCurrentTap();
  if (tap === null) return; // el motor no está montado: nada que grabar aún
  try {
    await startTapRecording(tap.ctx, tap.node);
    setKind("recording");
    publishDebugLog("system", "rec: grabación iniciada");
  } catch (failure: unknown) {
    const message = failure instanceof Error ? failure.message : String(failure);
    publishDebugLog("system", `rec: no se pudo grabar (${message})`);
  }
}

/** Para la grabación y convierte el WAV; sin grabación viva, no-op. */
async function finishRecording(): Promise<void> {
  if (kind !== "recording") return;
  try {
    await stopTapRecording();
    setKind("ready");
    publishDebugLog("system", "rec: grabación lista (WAV en memoria hasta recargar)");
  } catch (failure: unknown) {
    const message = failure instanceof Error ? failure.message : String(failure);
    setKind("idle");
    publishDebugLog("system", `rec: la grabación no se convirtió (${message})`);
  }
}

/** Para descartar sin convertir a WAV (o la grabación lista): Reiniciar sesión. */
export function resetRecording(): void {
  if (kind === "idle") return;
  discardRecording();
  setKind("idle");
  publishDebugLog("system", "rec: grabación descartada");
}

/** Motor nuevo = grabación huérfana: se para y queda la conversión hecha. */
function onTapChanged(): void {
  if (kind === "recording") void finishRecording();
}

/**
 * Reglas automáticas (B-033.5): rec ARRANCA con el robot lanzado o con el
 * agente al piano (demostración/acompañamiento tiemblan lo mismo) y PARA
 * cuando vuelve la calma (robot parado y control del estudiante). El
 * intervalo (750 ms) es el polled con la independencia del paso del sobre:
 * el sonido en sí va por el tap del motor, nunca por este reloj.
 */
function tick(): void {
  const robot = getDebugScenarioSnapshot();
  const session = getSessionSnapshot();
  const agentHasPiano = session.state?.control === "agent";
  const somethingPlaying = robot.scenario !== null || agentHasPiano;
  if (kind === "idle" && somethingPlaying) {
    void startIfIdle();
    return;
  }
  if (kind === "recording") {
    const elapsed = recordingElapsedMs();
    if (elapsed !== null && elapsed >= REC_MAX_MS) {
      publishDebugLog("system", "rec: tope de 5 minutos — la grabación se corta aquí");
      void finishRecording();
      return;
    }
    if (!somethingPlaying) void finishRecording();
  }
}

let wireInterval: ReturnType<typeof setInterval> | null = null;

function wireAutoRules(): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  if (wireInterval !== null) return;
  wireInterval = setInterval(tick, 750);
}
function unwireAutoRules(): void {
  if (wireInterval === null) return;
  clearInterval(wireInterval);
  wireInterval = null;
}

if (typeof window !== "undefined") {
  subscribeAudioTap(onTapChanged);
  subscribeDebugScenario(tick);
  subscribeSession(tick); // el cambio de control dispara de paso, sin esperar al intervalo
  // El intervalo amarra además las señales sueltas (traza de audio encendida
  // a mitad, robot relanzado): el tick repite las reglas y limpia estados.
  wireAutoRules();
}

/** (solo tests) reenganche del reloj y estado del módulo. */
export function resetRecStore(): void {
  unwireAutoRules();
  discardRecording();
  recEnabled = false;
  kind = "idle";
}
