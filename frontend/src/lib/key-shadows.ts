// description: Sombras de teclas que pinta el reproductor (B-032.9): qué schedule ilumina el teclado según el modo y cuándo está activo. La tecla se hunde solo si suena de verdad — en práctica las teclas del alumno solo se hunden por su entrada, y mientras el transporte espera no marca nada.
// context: Puro y sin DOM; lo consume Keyboard (el SvgKeyboard). En `observe`/demo el reproductor suena la pieza entera (toda la partitura ilumina); en `una mano` solo la mano contraria del transporte; en `dos manos` nada (el alumno toca las dos). El `hit` del alumno entra por el puerto de nota (playedIds), nunca por aquí.
import type { PracticeMode, PlayableNote, StudentHand } from "./api-client";
import type { PlaybackStatus } from "./playback-engine";
import { audibleNotes } from "./practice-mode";
import type { ScheduledEvent } from "./playback-schedule";
import { buildSchedule } from "./playback-schedule";

/**
 * El schedule que iluminan las sombras del teclado según el modo (B-032.9):
 * la tabla de la issue —
 *
 * | Modo | ¿Qué suena audible de verdad? | ¿Qué se ilumina por schedule? |
 * |---|---|---|
 * | observar (o demo) | la pieza entera por el transporte | schedule completo |
 * | una mano | solo la mano contraria del transporte | esa mano (schedule audible) |
 * | dos manos | nada (referencia solo al pulsar play) | nada |
 *
 * La cascada no cambia (referencia de estudio); esta es la verdad del sonido.
 */
export function shadowScheduleFor(
  notes: readonly PlayableNote[],
  mode: PracticeMode,
  hand: StudentHand | "both" | null | undefined,
  tempoFactor: number,
): ScheduledEvent[] {
  return buildSchedule(audibleNotes(notes, mode, hand), tempoFactor);
}

/**
 * true solo cuando el transporte está sonando de verdad (playing). En
 * `waiting`/`preroll`/`paused`/`stopped` no suena nada: ninguna sombra de
 * schedule, aunque la posición esté clavada en un gate.
 */
export function shadowsActive(status: PlaybackStatus): boolean {
  return status === "playing";
}
