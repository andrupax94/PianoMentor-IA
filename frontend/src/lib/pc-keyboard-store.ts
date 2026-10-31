// description: Estado visible del teclado del PC (B-032.2): octava activa, letras que se pintan sobre el piano y si manda la distribución partida de dos manos.
// context: TransportProvider captura el teclado y publica aquí lo que hay que pintar; Keyboard se suscribe para rotular las teclas, igual que piece-store o visible-range-store. Vive en memoria y no pinta nada.

import { DEFAULT_OCTAVE } from "./pc-keyboard";

/** Lo que el piano necesita saber del teclado del PC para rotular sus teclas. */
export interface PcKeyboardState {
  /** Octava base del mapa clásico (A = C4). */
  octave: number;
  /** Id de tecla del piano → letra del PC que la toca. */
  labels: Record<string, string>;
  /** true cuando manda la distribución partida de dos manos (B-032.2). */
  split: boolean;
}

/** Foto inicial: la misma que pinta el servidor, para no romper la hidratación. */
export const EMPTY_PC_KEYBOARD: PcKeyboardState = {
  octave: DEFAULT_OCTAVE,
  labels: {},
  split: false,
};

let current: PcKeyboardState = EMPTY_PC_KEYBOARD;
const listeners = new Set<() => void>();

/** Estado vigente; la referencia es estable entre publicaciones. */
export function getPcKeyboardState(): PcKeyboardState {
  return current;
}

/** Se suscribe a los cambios; devuelve la función de baja. */
export function subscribePcKeyboard(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica un estado nuevo; no avisa si es idéntico al vigente. */
export function publishPcKeyboard(next: PcKeyboardState): void {
  if (
    next.octave === current.octave &&
    next.split === current.split &&
    next.labels === current.labels
  ) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}

/** Vuelve al estado inicial (solo tests: es estado de módulo). */
export function resetPcKeyboard(): void {
  current = EMPTY_PC_KEYBOARD;
  listeners.clear();
}
