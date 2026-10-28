// description: Lógica pura de la demostración del agente (B-012.5): control efectivo del piano (el sobre agent_action manda sobre el estado cacheado en ambos sentidos), ventana demostrada (compases y tempo) y etiqueta del indicador; y la parte audible: canal publish/subscribe DemoPlaybackMessage (start con pieza y ventana / stop, con seq monotónico) y demoSubScore, que recorta la ventana de compases de la partitura (notas y rejilla desplazadas al 0) para que suene en el transporte.
// context: Sin DOM ni React; el bloqueo y el indicador lo consumen PracticeBridge y SessionStatus, y el canal y el recorte los consume PlaybackArea (único dueño del reloj). El backend cambia el control sin re-empujar state, así que el estado del cliente puede estar desfasado y el sobre manda. Sin rejilla no hay mapa compase→segundo: se devuelve la pieza entera.

import type { PieceMeasures, PlayableNote, SessionControl, SessionState } from "./api-client";
import type { AgentActionMessage } from "./websocket-client";

/** Ventana de compases y tempo de la demostración en curso. */
export interface AgentDemoWindow {
  /** Compás inicial del rango (0-based, como lo manda el backend); null si no viene. */
  fromMeasure: number | null;
  /** Compás final incluido del rango (0-based); null si no viene. */
  toMeasure: number | null;
  /** Factor de tempo pedido para la demo (1 = tiempo real); null si no viene. */
  tempoFactor: number | null;
}

/** El agente está demostrando ahora mismo según la última acción recibida. */
export function isDemonstrating(action: AgentActionMessage | null | undefined): boolean {
  return action?.action === "demonstrate";
}

/**
 * Quién controla el piano a la vista del cliente: el sobre de la última
 * acción del agente manda sobre el estado cacheado del servidor, en ambos
 * sentidos. El backend cambia el control en su base de datos pero no
 * re-empuja `state`, así que ese estado puede estar desfasado: durante
 * `demonstrate` el estudiante queda bloqueado aunque diga "student", y tras
 * `return_control` recupera el teclado aunque todavía diga "agent".
 */
export function effectiveControl(
  state: Pick<SessionState, "control"> | null | undefined,
  action: AgentActionMessage | null | undefined,
): SessionControl {
  if (isDemonstrating(action)) return "agent";
  if (action?.action === "return_control") return "student";
  return state?.control ?? "student";
}

/** La ventana demostrada del sobre; null si no hay acción o no es `demonstrate`. */
export function demoWindow(action: AgentActionMessage | null | undefined): AgentDemoWindow | null {
  if (!isDemonstrating(action) || !action) return null;
  return {
    fromMeasure: finiteOrNull(action.from_measure),
    toMeasure: finiteOrNull(action.to_measure),
    tempoFactor: finiteOrNull(action.tempo_factor),
  };
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* --- Reproducción de la demostración (B-012.5) ---------------------------- */

/** Orden de reproducción de la demostración para el transporte. */
export interface DemoPlaybackStart {
  kind: "start";
  /** Pieza de la sesión; el transporte la sirve si no es la que ya tiene cargada. */
  pieceId: string;
  window: AgentDemoWindow;
}

/** El agente ha devuelto el control: la demostración termina y se restaura la pieza. */
export interface DemoPlaybackStop {
  kind: "stop";
}

export type DemoPlaybackEvent = DemoPlaybackStart | DemoPlaybackStop;

/** Orden con su contador, para que dos demos seguidas no sean la misma. */
export interface DemoPlaybackMessage {
  event: DemoPlaybackEvent;
  seq: number;
}

type DemoListener = (message: DemoPlaybackMessage) => void;

const demoListeners = new Set<DemoListener>();
let demoSeq = 0;

/** Se suscribe a las órdenes de reproducción de la demostración; devuelve la baja. */
export function subscribeDemoPlayback(listener: DemoListener): () => void {
  demoListeners.add(listener);
  return () => {
    demoListeners.delete(listener);
  };
}

/**
 * Publica una orden de demostración. Es un evento, no un estado: no se guarda
 * el último, así que quien no esté escuchando (el transporte aún no montado)
 * la pierde; un piano que todavía no existe no puede reproducir nada.
 */
export function publishDemoPlayback(event: DemoPlaybackEvent): void {
  demoSeq += 1;
  const payload: DemoPlaybackMessage = { event, seq: demoSeq };
  // Copia: un listener puede darse de baja a sí mismo durante la iteración.
  for (const listener of [...demoListeners]) {
    listener(payload);
  }
}

/** Partitura completa con su rejilla; lo que necesita el transporte para recortar la ventana. */
export interface DemoScore {
  notes: PlayableNote[];
  measures: PieceMeasures | null;
}

/** La ventana recortada, lista para `load`: notas y rejilla desplazadas al 0. */
export interface DemoSubScore {
  notes: PlayableNote[];
  measures: PieceMeasures | null;
  /** Duración en segundos de la ventana (sin escalar por tempo). */
  duration_s: number;
}

/**
 * Recorta la ventana demostrada de la partitura (B-012.5): se quedan las notas
 * que empiezan dentro del rango de compases, todo se desplaza al segundo 0 y
 * la rejilla se recorta al mismo rango para que el compás siga siendo real.
 * Sin rejilla no hay forma de mapear compases a segundos, así que se devuelve
 * la pieza entera (una demostración a tempo reducido de todo vale).
 */
export function demoSubScore(score: DemoScore, window: AgentDemoWindow): DemoSubScore {
  const { measures } = score;
  if (measures === null || measures.starts_s.length === 0) {
    return {
      notes: score.notes,
      measures: null,
      duration_s: lastStart(score.notes),
    };
  }

  const count = measures.starts_s.length;
  const from = clampIndex(window.fromMeasure ?? 0, count);
  const to = clampIndex(window.toMeasure ?? count - 1, count);
  // El rango va ordenado: una ventana invertida (de mayor a menor) es válida.
  const first = Math.min(from, to);
  const last = Math.max(from, to);
  const start = measures.starts_s[first];
  // El fin es el inicio del compás siguiente; si el rango llega al final,
  // manda el fin real de la pieza.
  const end = last === count - 1 ? measures.end_s : measures.starts_s[last + 1];

  const notes = score.notes
    .filter((note) => note.start_seconds >= start && note.start_seconds < end)
    .map((note) => ({ ...note, start_seconds: note.start_seconds - start }));

  const sliced: PieceMeasures = {
    count: last - first + 1,
    starts_s: measures.starts_s.slice(first, last + 1).map((s) => s - start),
    signatures: measures.signatures.slice(first, last + 1),
    end_s: end - start,
  };

  return { notes, measures: sliced, duration_s: end - start };
}

function clampIndex(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
}

function lastStart(notes: PlayableNote[]): number {
  return notes.reduce((end, note) => Math.max(end, note.start_seconds + note.duration_seconds), 0);
}

/**
 * Etiqueta de la demostración para el indicador: nombre, ventana de compases
 * (en pantalla los compases son 1-based, como en el resto de la interfaz) y
 * porcentaje del tempo, omitiendo lo que no venga en el sobre.
 */
export function demoLabel(window: AgentDemoWindow | null | undefined): string {
  if (!window) return "IA demostrando";

  const partes: string[] = [];
  if (window.fromMeasure !== null && window.toMeasure !== null) {
    partes.push(`compases ${window.fromMeasure + 1}–${window.toMeasure + 1}`);
  }
  if (window.tempoFactor !== null) {
    partes.push(`${Math.round(window.tempoFactor * 100)} % del tempo`);
  }

  return partes.length === 0 ? "IA demostrando" : `IA demostrando (${partes.join(", ")})`;
}
