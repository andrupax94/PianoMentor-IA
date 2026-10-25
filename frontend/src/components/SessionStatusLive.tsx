// description: Mini cuadro de estado de sesión enganchado al almacén de la práctica.
// context: MentorPanel es Server Component y session-store vive en cliente, así que el enganche va en este componente cliente; sin práctica abierta pinta el estado vacío de siempre.

"use client";

import { useSyncExternalStore } from "react";

import { getSessionSnapshot, subscribeSession } from "../lib/session-store";
import { SessionStatus } from "./SessionStatus";

export function SessionStatusLive() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);

  return (
    <SessionStatus
      state={session.state}
      connection={session.connection}
      error={session.error}
      step={session.lastStep}
    />
  );
}
