// description: Puerto único de entrada de notas (B-032.2): un evento por tecla con su fuente (teclado del PC, piano en pantalla o Web MIDI), un canal de suscripción y una puerta que bloquea las pulsaciones mientras el agente tiene el control.
// context: El audio local y el envío a la sesión salen del mismo evento: TransportProvider suena lo que llega y PracticeBridge lo manda al WebSocket. La puerta solo corta los `note_on` (soltar una tecla siempre es seguro); quien suena libera lo que tuviera pulsado al cerrarse. Vive en memoria y sin DOM, así que se prueba con Vitest en entorno node.

/** De dónde viene la pulsación. */
export type NoteInputSource = "pc" | "screen" | "midi";

/** Una tecla pulsada o soltada, ya en pitch MIDI. */
export interface NoteInputEvent {
  /** Pitch MIDI (0–127). */
  pitch: number;
  /** 1–127 al pulsar; 0 al soltar. */
  velocity: number;
  /**
   * Marca de tiempo del hardware en milisegundos (solo Web MIDI, B-032.2).
   * Opcional: deja la puerta abierta a puntuar el timing con el reloj del
   * teclado sin cambiar el contrato.
   */
  t_ms?: number;
  source: NoteInputSource;
}

export type NoteInputListener = (event: NoteInputEvent) => void;

/** Lo que puede escuchar un consumidor del puerto. */
export interface NoteInputHandlers {
  onNoteOn?: NoteInputListener;
  onNoteOff?: NoteInputListener;
}

const listeners = new Set<NoteInputHandlers>();
const gateListeners = new Set<(enabled: boolean) => void>();
let enabled = true;

/** Copia normalizada del evento, o null si el pitch no es un número MIDI válido. */
function normalize(event: NoteInputEvent): NoteInputEvent | null {
  if (!Number.isFinite(event.pitch)) return null;
  const pitch = Math.round(event.pitch);
  if (pitch < 0 || pitch > 127) return null;
  const velocity = Number.isFinite(event.velocity) ? Math.round(event.velocity) : 0;
  const normalized: NoteInputEvent = {
    pitch,
    velocity: Math.min(Math.max(velocity, 0), 127),
    source: event.source,
  };
  if (event.t_ms !== undefined && Number.isFinite(event.t_ms)) {
    normalized.t_ms = event.t_ms;
  }
  return normalized;
}

/** Se suscribe al puerto; devuelve la función de baja. */
export function subscribeNoteInput(handlers: NoteInputHandlers): () => void {
  listeners.add(handlers);
  return () => {
    listeners.delete(handlers);
  };
}

/**
 * Publica una pulsación. Se descarta si la puerta está cerrada: durante una
 * demostración del agente no suena ni se envía nada del alumno (B-032.2).
 */
export function emitNoteOn(event: NoteInputEvent): void {
  if (!enabled) return;
  const normalized = normalize(event);
  if (!normalized) return;
  for (const handlers of listeners) handlers.onNoteOn?.(normalized);
}

/**
 * Publica una suelta. Pasa siempre, incluso con la puerta cerrada: si se
 * bloqueara, una tecla pulsada antes de la intervención quedaría colgada.
 */
export function emitNoteOff(event: NoteInputEvent): void {
  const normalized = normalize({ ...event, velocity: 0 });
  if (!normalized) return;
  for (const handlers of listeners) handlers.onNoteOff?.(normalized);
}

/** Estado de la puerta: `false` mientras el agente tiene el control. */
export function isNoteInputEnabled(): boolean {
  return enabled;
}

/** Abre o cierra la puerta; avisa solo cuando cambia. */
export function setNoteInputEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  for (const listener of gateListeners) listener(enabled);
}

/** Se suscribe a los cambios de la puerta (para liberar lo que estuviera sonando). */
export function subscribeNoteInputGate(listener: (enabled: boolean) => void): () => void {
  gateListeners.add(listener);
  return () => {
    gateListeners.delete(listener);
  };
}

/** Vuelve al estado inicial (solo tests: el puerto es estado de módulo). */
export function resetNoteInput(): void {
  listeners.clear();
  gateListeners.clear();
  enabled = true;
}
