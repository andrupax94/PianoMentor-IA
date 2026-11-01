// description: Puente del modo de práctica: publica en el session-store el cambio del selector y lo manda al backend (PATCH de la sesión), donde se persiste y se difunde por el WebSocket.
// context: B-032.4; vive en la portada para que el selector nunca toque el transporte: el WS sigue siendo el único camino del estado y el modo del alumno es el que se restaura tras una intervención.
"use client";

import { useCallback, useSyncExternalStore } from "react";

import { updateSessionPracticeMode } from "../lib/api-client";
import type { PracticeMode, StudentHand } from "../lib/api-client";
import { getSessionSnapshot, subscribeSession, updateSession } from "../lib/session-store";

/**
 * Publica el cambio del modo en el almacén y lo manda al backend. Es estado,
 * no un evento: el servidor lo persiste y lo difunde por el WebSocket.
 */
export function usePracticeModeChange(): (
  next: { mode: PracticeMode; hand: StudentHand },
) => void {
  const sessionId = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot,
  ).sessionId;

  return useCallback(
    (next: { mode: PracticeMode; hand: StudentHand }) => {
      if (sessionId === null) return;
      // Optimista: el selector responde al instante. Si el backend rechaza, el
      // `state` que llega por el socket devuelve el modo bueno.
      updateSession({ practiceMode: next.mode, studentHand: next.hand });
      updateSessionPracticeMode(sessionId, next).catch(() => undefined);
    },
    [sessionId],
  );
}
