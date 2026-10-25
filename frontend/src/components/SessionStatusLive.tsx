// description: Mini cuadro de estado de sesión enganchado al almacén de la práctica y panel del paso del agente.
// context: MentorPanel es Server Component y session-store vive en cliente, así que el enganche va en este componente cliente; sin práctica abierta pinta el estado vacío de siempre y esconde el panel de agent-step (B-012.6).

"use client";

import { useSyncExternalStore } from "react";

import { getSessionSnapshot, subscribeSession } from "../lib/session-store";
import { AgentStepPanel } from "./AgentStepPanel/AgentStepPanel";
import { SessionStatus } from "./SessionStatus";

export function SessionStatusLive() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);

  return (
    <>
      <SessionStatus
        state={session.state}
        connection={session.connection}
        error={session.error}
      />
      <AgentStepPanel sessionId={session.sessionId} />
    </>
  );
}
