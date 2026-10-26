// description: Chat del agente flotante y colapsable: FAB circular cerrada por defecto con bot.svg y panel al pulsarla (D-002.5); se oculta en la portada (/ y /{id}) donde ya está el del mentor. shouldShowDock y shouldCollapseOnNavigate son los predicados puros.
// context: El layout no re-renderiza al navegar y no puede leer la ruta, así que el pathname se lee aquí con usePathname y no en el layout (guía de layout de Next 16). Las rutas de práctica son UUID en la raíz; una ruta suelta que no lo sea se trata como página normal. D-002.5: el estado arranca cerrado, el panel queda montado y oculto (hidden) para no perder la conversación, se cierra con el botón de su cabecera u Escape, y shouldCollapseOnNavigate lo devuelve a cerrado en cada navegación.

// shouldShowDock y shouldCollapseOnNavigate son puros para probarse sin DOM.

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { MentorChat } from "../MentorPanel/MentorChat/MentorChat";
import styles from "./AgentDock.module.css";

/** Ruta de la página principal, donde ya vive el chat dentro del panel del mentor. */
const HOME_PATH = "/";
/**
 * Ruta de una sesión de práctica (/{id}): la portada con el id en la URL. Los ids
 * de sesión son UUID; una ruta suelta que no lo sea es una página normal y enseña dock.
 */
const SESSION_PATH = /^\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/**
 * true si en esta ruta debe verse el chat flotante: en todas menos en la principal
 * y en la de práctica, porque en ambas ya está el del mentor y dos chats serían ruido.
 */
export function shouldShowDock(pathname: string | null): boolean {
  return pathname !== HOME_PATH && !SESSION_PATH.test(pathname ?? "");
}

/**
 * true si el panel debe volver a cerrado al llegar a otra ruta: siempre que la
 * ruta cambie, para que cada página empiece solo con el círculo (D-002.5).
 */
export function shouldCollapseOnNavigate(
  prevPath: string | null,
  nextPath: string | null,
): boolean {
  return prevPath !== nextPath;
}

export function AgentDock() {
  const pathname = usePathname();
  /** Estado del panel: arranca cerrado en todas las rutas. */
  const [open, setOpen] = useState(false);
  /** Última ruta vista; si llega otra distinta, el usuario navegó de página. */
  const [lastPath, setLastPath] = useState<string | null>(null);

  // El dock vive en el layout y no se desmonta al navegar, así que el cambio de
  // ruta se detecta aquí y el panel vuelve a cerrado (queda montado y oculto).
  useEffect(() => {
    if (shouldCollapseOnNavigate(lastPath, pathname)) {
      setOpen(false);
      setLastPath(pathname);
    }
  }, [pathname, lastPath]);

  /** Escape cierra el panel con el foco dentro, sin robar el atajo al resto de la página. */
  const onKeyDownPanel = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
    }
  }, []);

  if (!shouldShowDock(pathname)) return null;

  return (
    <div>
      <button
        className={styles.fab}
        type="button"
        aria-label="Abrir chat"
        aria-expanded={open}
        aria-controls="chat-flotante"
        onClick={() => setOpen(true)}
        hidden={open}
      >
        <span className={styles.fabIcon} aria-hidden="true" />
      </button>
      <aside
        className={styles.dock}
        id="chat-flotante"
        aria-label="Chat del agente"
        hidden={!open}
        onKeyDown={onKeyDownPanel}
      >
        <MentorChat onClose={() => setOpen(false)} />
      </aside>
    </div>
  );
}
