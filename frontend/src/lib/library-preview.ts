// description: Lógica pura del preview de la Library: qué hace el play de una fila.
// context: B-027.3; la Library reproduce con el mismo motor que el piano, sin salir
// de la lista. El componente solo pinta el resultado de esta decisión.

import type { PlaybackStatus } from "./playback-engine";

/** Paso a ejecutar al pulsar el play (o la pausa) de una fila. */
export type PreviewStep = "start" | "pause" | "resume";

/**
 * Decide el paso comparando la pieza ya cargada en el transporte con la pulsada.
 * Pausar y reanudar solo valen para la misma pieza viva; todo lo demás arranca
 * desde el principio, incluida una pieza que ya terminó.
 */
export function previewStep(
  loadedId: string | null,
  songId: string,
  status: PlaybackStatus,
): PreviewStep {
  if (loadedId !== songId) return "start";
  if (status === "playing") return "pause";
  if (status === "paused") return "resume";
  return "start";
}
