// description: Controlador de gates del modo espera (B-032.5): suscrito al puerto de entrada, decide hit/miss/wrong/timeout y emite el mensaje `practice` por WebSocket. La reanudación del motor la pide mediante `onHit`.
// context: Sin DOM ni React; vive en PracticeBridge. El transporte expone el gate actual y el estado waiting; este módulo solo mide y emite.

import type { Gate, GateHand, GateOutcome } from "./practice-gate";
import { gateSatisfied, gateWrong, strikeFor, waitTimeoutMs } from "./practice-gate";
import type { PlaybackSnapshot } from "./playback-engine";
import { subscribeNoteInput, type NoteInputEvent } from "./note-input";

/** Evento de práctica que manda el front al backend (B-032.5). */
export interface PracticeEvent {
  gate: string;
  measure: number | null;
  outcome: GateOutcome;
  wait_ms: number;
  hand: GateHand;
}

/** Dependencias inyectadas para poder probar sin WebSocket ni DOM. */
export interface GateControllerDeps {
  /** Lee el snapshot actual del motor. */
  getSnapshot: () => PlaybackSnapshot;
  /** Suscripción al puerto de entrada de notas. */
  subscribeNoteInput: typeof subscribeNoteInput;
  /** Envía el evento de práctica al backend. */
  sendPracticeEvent: (event: PracticeEvent) => void;
  /** Reloj en milisegundos para medir el timeout. */
  clockMs: () => number;
  /** Se llama cuando el gate se satisface; quien escucha reanuda el motor. */
  onHit: () => void;
  /** B-032.8: se llama con una tecla errónea; el transporte pega la cascada a la línea. */
  onWrong?: () => void;
  /** Opciones iniciales. */
  options: GateControllerOptions;
}

export interface GateControllerOptions {
  enabled: boolean;
  hand: GateHand;
}

const POLL_INTERVAL_MS = 100;

/**
 * Controlador de gates: mantiene las teclas pulsadas, detecta hit/wrong/timeout
 * y emite la señal al backend. No toca el reloj del transporte.
 */
export interface GateController {
  start(): void;
  stop(): void;
  setOptions(options: Partial<GateControllerOptions>): void;
}

/** Crea un controlador de gates con las dependencias inyectadas. */
export function createGateController(deps: GateControllerDeps): GateController {
  let { getSnapshot, subscribeNoteInput: subscribeInput, sendPracticeEvent, clockMs, onHit, options } =
    deps;
  const onWrong = deps.onWrong ?? ((): void => {});
  let unsubscribeNotes: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const pressed = new Set<number>();
  let lastGateId: string | null = null;
  let waitingSinceMs: number | null = null;
  let lastOutcome: GateOutcome | null = null;

  const clear = () => {
    pressed.clear();
    lastGateId = null;
    waitingSinceMs = null;
    lastOutcome = null;
  };

  const onNoteOn = ({ pitch }: NoteInputEvent) => {
    pressed.add(pitch);
    checkGate();
  };

  const onNoteOff = ({ pitch }: NoteInputEvent) => {
    pressed.delete(pitch);
  };

  const sendOutcome = (gate: Gate, outcome: GateOutcome) => {
    // No repetir el mismo outcome para el mismo gate.
    if (lastOutcome === outcome && lastGateId === gate.id) return;
    lastOutcome = outcome;
    lastGateId = gate.id;
    sendPracticeEvent({
      gate: gate.id,
      measure: gate.measure,
      outcome,
      wait_ms: waitingSinceMs === null ? 0 : Math.max(0, Math.round(clockMs() - waitingSinceMs)),
      hand: options.hand,
    });
  };

  const checkGate = () => {
    if (!options.enabled) return;
    const snapshot = getSnapshot();
    if (snapshot.status !== "waiting" || !snapshot.currentGate) return;
    const gate = snapshot.currentGate;

    if (waitingSinceMs === null) {
      waitingSinceMs = clockMs();
    }

    const timeoutMs = waitTimeoutMs({ tempoBpm: snapshot.tempo_bpm });
    const elapsedMs = clockMs() - waitingSinceMs;
    const timedOut = elapsedMs >= timeoutMs;

    const outcome = strikeFor(gate, pressed, timedOut);
    // B-032.8: onWrong solo en la transición. El sondeo repite el outcome cada
    // 100 ms; si el callback saliera siempre, el desvanecimiento del rebote se
    // reiniciaba sin parar y la cascada se quedaba pasada de la línea.
    const repeatOfSameGate = lastOutcome === outcome && lastGateId === gate.id;

    if (outcome === "hit") {
      sendOutcome(gate, "hit");
      onHit();
      return;
    }

    if (outcome === "wrong") {
      sendOutcome(gate, "wrong");
      if (!repeatOfSameGate) onWrong();
      return;
    }

    if (outcome === "timeout") {
      sendOutcome(gate, "timeout");
      // El motor sigue esperando: B-032.6 decidirá qué hacer.
      return;
    }
  };

  const poll = () => {
    const snapshot = getSnapshot();
    if (snapshot.status !== "waiting") {
      waitingSinceMs = null;
      return;
    }
    if (snapshot.currentGate && snapshot.currentGate.id !== lastGateId) {
      // Cambió el gate: resetear el seguimiento.
      lastGateId = snapshot.currentGate.id;
      waitingSinceMs = clockMs();
      lastOutcome = null;
    }
    checkGate();
  };

  return {
    start() {
      if (unsubscribeNotes !== null) return;
      unsubscribeNotes = subscribeInput({ onNoteOn, onNoteOff });
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    },
    stop() {
      unsubscribeNotes?.();
      unsubscribeNotes = null;
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      clear();
    },
    setOptions(next) {
      options = { ...options, ...next };
      if (!options.enabled) {
        waitingSinceMs = null;
        lastGateId = null;
        lastOutcome = null;
      }
    },
  };
}
