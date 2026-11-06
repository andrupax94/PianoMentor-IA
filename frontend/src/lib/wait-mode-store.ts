// description: Estado del modo espera del reproductor (B-033.2, petición del usuario): congelarse en cada gate es lo habitual, pero el switch «Modo espera» del PlayerBar lo puede apagar — con la espera desactivada el transporte no se congela y la piece sigue sola, como en «observar».
// context: Módulo puro, como los demás almacenes de front (useSyncExternalStore en PlayerBar y PlaybackArea). El modo de práctica activa los gates y aquí se multiplica: sin sesión el motor ya no congela nunca y el switch no tiene efecto. Vive en memoria: al recargar vuelve al default (activado).

const listeners = new Set<() => void>();

/** Snapshot inmutable para useSyncExternalStore (referencia estable). */
let state: WaitModeState = { enabled: true };

export interface WaitModeState {
  /**
   * Con true (default) el transporte se congela en cada gate de práctica hasta
   * que el alumno toca. Con false la partitura no se congela: la cascada sigue
   * sola y las señales de práctica desaparecen (no hay gates que esperar).
   */
  enabled: boolean;
}

/** Lee el estado del switch «Modo espera». */
export function getWaitModeSnapshot(): WaitModeState {
  return state;
}

/** Se suscribe a los cambios del switch; devuelve la baja. */
export function subscribeWaitMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Cambia el estado del switch; avisa solo cuando cambia. */
export function setWaitModeEnabled(next: boolean): void {
  if (next === state.enabled) return;
  state = { enabled: next };
  for (const listener of listeners) listener();
}

/** Vuelve al estado inicial (solo tests: el switch es estado de módulo). */
export function resetWaitMode(): void {
  state = { enabled: true };
  listeners.clear();
}
