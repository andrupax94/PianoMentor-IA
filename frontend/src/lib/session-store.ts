// description: Almacén de la sesión de práctica abierta en la portada.
// context: La práctica es la portada con el id en la ruta (/{id}); PracticeBridge publica aquí el estado que llega por WebSocket y el mini cuadro del panel del mentor se suscribe, igual que piece-store con la pieza. Vive solo en memoria: al salir de la ruta se limpia.

import type { SessionState } from "./api-client";
import type { ConnectionStatus } from "./websocket-client";

/** Fotografía completa de la sesión visible en el mini cuadro del mentor. */
export interface SessionSnapshot {
  /** Id de la sesión abierta; null cuando no hay práctica en la portada. */
  sessionId: string | null;
  /** Último estado del servidor; null mientras no llegue ninguno. */
  state: SessionState | null;
  /** Estado del WebSocket de la sesión. */
  connection: ConnectionStatus;
  /** Último aviso del servidor o del transporte; null si no hay ninguno. */
  error: string | null;
}

/** Fotografía por defecto: sin sesión, como el mini cuadro sin práctica abierta. */
export const EMPTY_SESSION: SessionSnapshot = {
  sessionId: null,
  state: null,
  connection: "closed",
  error: null,
};

let current: SessionSnapshot = EMPTY_SESSION;
const listeners = new Set<() => void>();

/** Fotografía vigente; inmutable para quien la recibe (useSyncExternalStore). */
export function getSessionSnapshot(): SessionSnapshot {
  return current;
}

/** Suscribirse a los cambios; devuelve la función de baja. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Aplica un parche sobre la foto vigente y avisa solo si algo cambia. */
export function updateSession(patch: Partial<SessionSnapshot>): void {
  const next: SessionSnapshot = { ...current, ...patch };
  if (
    next.sessionId === current.sessionId &&
    next.state === current.state &&
    next.connection === current.connection &&
    next.error === current.error
  ) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}

/** Vuelve al estado vacío: la ruta de práctica ya no está montada. */
export function clearSession(): void {
  updateSession(EMPTY_SESSION);
}
