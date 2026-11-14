// description: Latch de fin de pieza para el chip multimodo (B-033.8): se fija
// cuando el transporte llega al final (status stopped + position >= duration)
// y se resetea al iniciar una nueva ronda (playing/preroll). Sobrevive al stop
// manual (que rebobina a 0), por eso no se puede derivar en vivo de position_s.
// Lleva además el contador de señales de la ronda en curso (B-033.9): el chip
// solo pasa a «informe» si la ronda que acaba tiene práctica registrada.
// context: B-033.8; puro, sin DOM ni React, referencia estable para
// useSyncExternalStore, al estilo de wait-mode-store.ts.

type Listener = () => void;

let rondaAlFinal = false;
let senalesRonda = 0;
const listeners = new Set<Listener>();

function notificar(): void {
  for (const listener of listeners) listener();
}

export function getRondaFinalSnapshot(): boolean {
  return rondaAlFinal;
}

/** Señales de práctica enviadas en la ronda en curso (0 si aún no empezó). */
export function getSenalesRonda(): number {
  return senalesRonda;
}

export function subscribeRondaFinal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setRondaAlFinal(value: boolean): void {
  if (rondaAlFinal === value) return;
  rondaAlFinal = value;
  if (!value) senalesRonda = 0; // ronda nueva: el contador parte de cero
  notificar();
}

/** Cada señal de práctica enviada cuenta para la ronda en curso (B-033.9). */
export function bumpSenalesRonda(): void {
  senalesRonda += 1;
  notificar();
}

/** Cambio de sesión (o reinicio): latch y contador vuelven a cero. */
export function resetRondaFinal(): void {
  if (rondaAlFinal === false && senalesRonda === 0) return;
  rondaAlFinal = false;
  senalesRonda = 0;
  notificar();
}

export function resetRondaFinalForTests(): void {
  rondaAlFinal = false;
  senalesRonda = 0;
  listeners.clear();
}
