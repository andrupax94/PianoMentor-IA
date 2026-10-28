// description: Almacén de la sesión de práctica abierta en la portada, con `agentAction`: la última acción del agente por WebSocket (B-012.5), y `lastStep`: la procedencia de la última pista pedida al agente (B-012.6), solo para diagnóstico.
// context: La práctica es la portada con el id en la ruta (/{id}); PracticeBridge publica aquí el estado y las acciones que llegan por WebSocket y el mini cuadro del panel del mentor se suscribe, igual que piece-store con la pieza. Vive solo en memoria: al salir de la ruta se limpia. `agentAction` decide el bloqueo del teclado y el indicador IA demostrando; `lastStep` lo escribe MentorChat al pedir la pista y updateSession avisa también cuando solo cambia uno de esos campos.

import type { AgentStepResponse, SessionState } from "./api-client";
import type { AgentActionMessage, ConnectionStatus } from "./websocket-client";

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
  /**
   * Última acción del agente escuchada en el socket (`demonstrate` vigente o
   * `return_control` que ya devolvió el control); null mientras no llegue
   * ninguna (B-012.5).
   */
  agentAction: AgentActionMessage | null;
  /**
   * Quién propuso la última pista pedida desde el chat y si hubo que caer al
   * fallback (B-012.6); null hasta que se pida la primera. Es diagnóstico:
   * solo lo enseña el estado de sesión fuera de producción.
   */
  lastStep: Pick<AgentStepResponse, "provider" | "used_fallback"> | null;
}

/** Fotografía por defecto: sin sesión, como el mini cuadro sin práctica abierta. */
export const EMPTY_SESSION: SessionSnapshot = {
  sessionId: null,
  state: null,
  connection: "closed",
  error: null,
  agentAction: null,
  lastStep: null,
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
    next.error === current.error &&
    next.agentAction === current.agentAction &&
    next.lastStep === current.lastStep
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
