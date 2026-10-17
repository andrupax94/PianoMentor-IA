// description: Canal de eventos para cambiar de pestaña en el MentorPanel desde cualquier componente.
// context: B-012.8 / UI del mentor. Cualquier componente puede llamar a
// `switchMentorTab('rendimiento')` y el contenedor de pestañas del panel del mentor
// reacciona sin necesidad de compartir props ni contexto React.

export type MentorTabId = "carga" | "sesion" | "rendimiento";

export const mentorTabEvents = new EventTarget();

/** Dispara un cambio de pestaña desde cualquier punto de la aplicación. */
export function switchMentorTab(tab: MentorTabId): void {
  mentorTabEvents.dispatchEvent(
    new CustomEvent<{ tab: MentorTabId }>("mentor:switch-tab", { detail: { tab } }),
  );
}
