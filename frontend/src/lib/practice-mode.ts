// description: Modo de práctica de la sesión (B-032.4): observar, una mano y dos manos, con la mano que practica el alumno; decide qué se atenúa en la cascada, qué mano suena en el transporte y qué mano se evalúa. En «una mano» la opacidad cae en la mano de la IA (la que suena) y la del alumno queda plena.
// context: Sin DOM ni React: es la lógica pura que comparten el selector (PlayerBar), PlaybackArea (cascada y audio) y el backend (evaluación). El modo vive en la sesión y llega por WebSocket; aquí solo se interpreta.
import type { PracticeMode, PlayableNote, StudentHand } from "./api-client";

/** Modos de práctica, en el orden en que se muestran. */
export const PRACTICE_MODES: readonly PracticeMode[] = ["observe", "one_hand", "both_hands"];

/** Etiqueta en español de cada modo (B-032.4). */
export const PRACTICE_MODE_LABELS: Record<PracticeMode, string> = {
  observe: "Observar",
  one_hand: "Una mano",
  both_hands: "Dos manos",
};

/** Etiqueta de la mano para la interfaz. */
export const STUDENT_HAND_LABELS: Record<StudentHand, string> = {
  left: "mano izquierda",
  right: "mano derecha",
};

/** Mano que suena en el transporte mientras el alumno practica una mano. */
export type AudibleHand = "left" | "right";

/** Todo lo que el modo gobierna (B-032.4). */
export interface PracticeModePlan {
  /** Mano que se atenúa en la cascada; null si no se atenúa nada. */
  dimmedHand: StudentHand | null;
  /** Mano que se evalúa; null en `observe` (no se evalúa). */
  evaluatedHand: StudentHand | "both" | null;
  /**
   * true si el transporte debe callar: en `both_hands` el alumno toca las dos
   * y la pieza solo se oye como referencia si pulsa play.
   */
  silentTransport: boolean;
}

/**
 * Reparto del modo: qué se atenúa, qué se evalúa y si el transporte calla.
 *
 * - `observe`: no se atenúa nada, no se evalúa nada y suena la pieza entera.
 * - `one_hand`: se atenúa la mano de la IA (la contraria, la que suena en el
 *   transporte) y se evalúa solo la del alumno; el alumno quiere ver su mano
 *   plena en la cascada y la del profesor secundaria (ajuste vivo de B-032.4).
 * - `both_hands`: no se atenúa nada, se evalúa todo y el transporte calla.
 */
export function practiceModePlan(
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
): PracticeModePlan {
  if (mode === "one_hand") {
    const student: StudentHand = hand === "left" ? "left" : "right";
    const agent: StudentHand = student === "left" ? "right" : "left";
    return { dimmedHand: agent, evaluatedHand: student, silentTransport: false };
  }
  if (mode === "both_hands") {
    return { dimmedHand: null, evaluatedHand: "both", silentTransport: true };
  }
  return { dimmedHand: null, evaluatedHand: null, silentTransport: false };
}

/**
 * Mano que debe sonar en el transporte mientras el alumno practica: la
 * contraria a la suya en `one_hand`; en los demás modos no cambia (la pieza
 * entera o el silencio, según diga el modo).
 */
export function audibleHand(
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
): AudibleHand | null {
  if (mode !== "one_hand") return null;
  return hand === "left" ? "right" : "left";
}

/**
 * Notas que suenan en el transporte según el modo (B-032.4). Reutiliza el
 * `audible` del motor (B-012.7): en `one_hand` solo la mano contraria; en
 * `both_hands` ninguna (el alumno toca las dos); en `observe` la pieza entera.
 *
 * Las notas sin mano conocida (`unknown`) suenan siempre: sin saber de qué
 * mano son, callarlas dejaría la práctica sin referencia.
 */
export function audibleNotes(
  notes: readonly PlayableNote[],
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
): PlayableNote[] {
  if (mode === "both_hands") return [];
  const wanted = audibleHand(mode, hand);
  if (wanted === null) return [...notes];
  return notes.filter((note) => note.hand === undefined || note.hand === "unknown" || note.hand === wanted);
}

/**
 * Mano que se atenúa en la cascada: la de la IA (la que suena) en `one_hand`;
 * null en los demás modos (no se borra nada, solo se atenúa).
 */
export function dimmedHand(
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
): StudentHand | null {
  return practiceModePlan(mode, hand).dimmedHand;
}

/**
 * Mano que se evalúa según el modo (B-032.4). En `observe` no se evalúa
 * (null): es el modo de escuchar.
 */
export function evaluatedHand(
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
): StudentHand | "both" | null {
  return practiceModePlan(mode, hand).evaluatedHand;
}
