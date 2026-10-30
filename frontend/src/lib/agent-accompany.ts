// description: Lógica pura del acompañamiento del agente (B-012.7): plan a partir del sobre agent_action (mano, sección y notas), mano del estudiante, etiqueta del indicador, umbral de latencia y degradación a demostración con parámetros válidos.
// context: Sin DOM ni React; PracticeBridge decide con él si acompañar o degradar, SessionStatus pinta la etiqueta y PlaybackArea recibe el plan por el canal de agent-playback. El backend manda los tiempos relativos al inicio de la sección; aquí se pasan a absolutos para el transporte.

import type { PlayableNote } from "./api-client";
import type { AgentActionMessage, AgentAccompanyNote } from "./websocket-client";

/** Latencia de ida y vuelta por encima de la cual no se acompaña (B-012.7). */
export const ACCOMPANY_MAX_RTT_MS = 50;

/** Máximo de compases de una demostración (límite de validación del backend). */
export const DEMO_MAX_MEASURES = 16;

/** Factor de tempo mínimo y máximo que acepta `demonstrate`. */
export const DEMO_TEMPO_RANGE = { min: 0.5, max: 0.8 } as const;

/** Compases de la degradación cuando el sobre no trae sección. */
const DEMO_FALLBACK_MEASURES = 4;

export type AccompanyHand = "left" | "right" | "both";

/** Plan de acompañamiento listo para el transporte. */
export interface AccompanyPlan {
  /** Mano que toca la IA. */
  hand: AccompanyHand;
  /** Mano que le queda al estudiante; null si la IA toca las dos. */
  studentHand: "left" | "right" | null;
  fromMeasure: number | null;
  toMeasure: number | null;
  tempoFactor: number | null;
  /** Inicio de la sección en segundos de partitura. */
  from_s: number;
  /** Duración de la sección en segundos de partitura. */
  duration_s: number;
  /** Notas de la IA en tiempo absoluto de la pieza, listas para el transporte. */
  notes: PlayableNote[];
}

/** El agente está acompañando ahora mismo según la última acción recibida. */
export function isAccompanying(action: AgentActionMessage | null | undefined): boolean {
  return action?.action === "accompany";
}

/** La mano que le queda al estudiante cuando la IA toca `hand`. */
export function studentHandFor(hand: AccompanyHand): "left" | "right" | null {
  if (hand === "left") return "right";
  if (hand === "right") return "left";
  return null;
}

/**
 * Plan del sobre de acompañamiento; `null` si la acción no es `accompany` o si
 * el sobre no trae lo mínimo para sonar (mano, sección y notas). Sin plan no se
 * puede acompañar, así que el puente degrada a demostración.
 */
export function accompanyPlan(
  action: AgentActionMessage | null | undefined,
): AccompanyPlan | null {
  if (!isAccompanying(action) || !action) return null;

  const hand = parseHand(action.hand);
  if (hand === null) return null;

  const from_s = finiteOrNull(action.from_s);
  const duration_s = finiteOrNull(action.duration_s);
  if (from_s === null || from_s < 0) return null;
  if (duration_s === null || duration_s <= 0) return null;

  const notes = accompanyNotes(action.notes, from_s);
  if (notes.length === 0) return null;

  return {
    hand,
    studentHand: studentHandFor(hand),
    fromMeasure: finiteOrNull(action.from_measure),
    toMeasure: finiteOrNull(action.to_measure),
    tempoFactor: finiteOrNull(action.tempo_factor),
    from_s,
    duration_s,
    notes,
  };
}

function parseHand(hand: string | undefined): AccompanyHand | null {
  return hand === "left" || hand === "right" || hand === "both" ? hand : null;
}

/**
 * Notas del sobre pasadas al tiempo de la pieza. Se descartan las que no son
 * números finitos: una nota rota no debe envenenar el transporte.
 */
function accompanyNotes(
  notes: AgentAccompanyNote[] | undefined,
  from_s: number,
): PlayableNote[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter(
      (note) =>
        note !== null &&
        typeof note === "object" &&
        Number.isFinite(note.pitch) &&
        Number.isFinite(note.start_s) &&
        Number.isFinite(note.duration_s) &&
        note.start_s >= 0 &&
        note.duration_s > 0,
    )
    .map((note) => ({
      pitch: note.pitch,
      start_seconds: from_s + note.start_s,
      duration_seconds: note.duration_s,
      velocity: Number.isFinite(note.velocity) ? note.velocity : 80,
      channel: 0,
      track: 0,
    }));
}

/**
 * Si con esta latencia hay que renunciar al acompañamiento. Sin medida todavía
 * (`null`) no se degrada: la primera acción no debe castigar la falta de datos.
 */
export function shouldDegradeToDemo(rttMs: number | null | undefined): boolean {
  return typeof rttMs === "number" && Number.isFinite(rttMs) && rttMs > ACCOMPANY_MAX_RTT_MS;
}

/**
 * Parámetros de la demostración que sustituye a un acompañamiento: la misma
 * sección, recortada a los límites de `demonstrate` (16 compases y 50–80 % del
 * tempo) para que el backend la acepte sin rechazarla.
 *
 * Ojo con las convenciones: el acompañamiento trae `to_measure` **exclusivo**
 * (como la rejilla de B-008) y la ventana de la demostración del front es
 * **inclusiva** (el último compás que suena), así que aquí se resta uno.
 */
export function demoParamsFor(
  action: AgentActionMessage | null | undefined,
  plan: AccompanyPlan | null,
): { from_measure: number; to_measure: number; tempo_factor: number } {
  const from = Math.max(0, Math.trunc(plan?.fromMeasure ?? action?.from_measure ?? 0));
  const exclusiveEnd = Math.trunc(
    plan?.toMeasure ?? action?.to_measure ?? from + DEMO_FALLBACK_MEASURES,
  );
  const lastIncluded = Math.min(
    Math.max(from, exclusiveEnd - 1),
    from + DEMO_MAX_MEASURES - 1,
  );
  // El backend exige `to_measure > from_measure`: una sección de un compás se
  // demuestra con el siguiente incluido antes que mandar una acción inválida.
  const to = Math.max(from + 1, lastIncluded);
  const factor = plan?.tempoFactor ?? action?.tempo_factor ?? DEMO_TEMPO_RANGE.max;

  return {
    from_measure: from,
    to_measure: to,
    tempo_factor: Math.min(DEMO_TEMPO_RANGE.max, Math.max(DEMO_TEMPO_RANGE.min, factor)),
  };
}

/** Nombre de la mano para la interfaz. */
function handName(hand: AccompanyHand): string {
  if (hand === "left") return "mano izquierda";
  if (hand === "right") return "mano derecha";
  return "las dos manos";
}

/**
 * Etiqueta del indicador: qué toca la IA, qué le queda al estudiante y, si
 * viene, la ventana de compases (1-based, como el resto de la interfaz).
 */
export function accompanyLabel(plan: AccompanyPlan | null | undefined): string {
  if (!plan) return "IA acompañando";

  const partes: string[] = [handName(plan.hand)];
  if (plan.studentHand !== null) {
    partes.push(`tú, ${handName(plan.studentHand)}`);
  }
  if (plan.fromMeasure !== null && plan.toMeasure !== null) {
    partes.push(`compases ${plan.fromMeasure + 1}–${plan.toMeasure}`);
  }

  return `IA acompañando (${partes.join("; ")})`;
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
