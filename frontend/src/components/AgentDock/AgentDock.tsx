"use client";
// description: Chat del agente disponible en todas las páginas, flotante sobre el contenido.
// context: B-012.8 bloque C; el chat nació en el panel del mentor, en la página principal.
// En el resto de páginas (Library, práctica) no hay panel, así que este dock lleva el mismo
// chat flotando. Se oculta en "/" porque allí ya está el del mentor: duplicarlo sería ruido.
//
// El layout no re-renderiza al navegar y no puede leer la ruta, así que el pathname se decide
// aquí, en cliente; shouldShowDock es puro para poder probarse sin DOM.

import { usePathname } from "next/navigation";

import { MentorChat } from "../MentorPanel/MentorChat/MentorChat";
import styles from "./AgentDock.module.css";

/** Ruta de la página principal, donde ya vive el chat dentro del panel del mentor. */
const HOME_PATH = "/";

/**
 * true si en esta ruta debe verse el chat flotante: en todas menos en la principal,
 * porque en "/" ya está el del mentor y dos chats serían ruido.
 */
export function shouldShowDock(pathname: string | null): boolean {
  return pathname !== HOME_PATH;
}

export function AgentDock() {
  const pathname = usePathname();

  if (!shouldShowDock(pathname)) return null;

  return (
    <aside className={styles.dock} aria-label="Chat del agente">
      <MentorChat />
    </aside>
  );
}
