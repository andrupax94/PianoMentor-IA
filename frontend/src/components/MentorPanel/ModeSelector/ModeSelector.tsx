// description: Switch del modo del mentor: Observar, Mano izquierda, Dos manos y Mano derecha.
// context: B-006.4 armazón; D-002.3 lo hace switch de 4 posiciones con un color por opción y retira Tomar Control (cualquier mano que no sea Observar implica que el estudiante toca); el estado es interno y cosmético, y los colores por opción son los mismos que tiñen la cascada (D-002.1).

"use client";

import { useState, useSyncExternalStore } from "react";

import { effectiveControl } from "../../../lib/agent-demo";
import { getSessionSnapshot, subscribeSession } from "../../../lib/session-store";
import { usePracticeModeChange } from "../../PracticeModeBridge";
import styles from "./ModeSelector.module.css";
import type { MentorMode, ModeSelectorProps } from "./ModeSelector.types";

interface Opcion {
  id: MentorMode;
  label: string;
  clase: string;
  espejo?: boolean;
}

const MODES: Opcion[] = [
  { id: "observar", label: "Observar", clase: styles.observar },
  { id: "izquierda", label: "Mano izquierda", clase: styles.izquierda },
  { id: "dos", label: "Dos manos", clase: styles.dos, espejo: true },
  { id: "derecha", label: "Mano derecha", clase: styles.derecha },
];

/** Convierte el modo de práctica de la sesión al modo del switch visual. */
function practiceToMentor(mode: string, hand: string): MentorMode {
  if (mode === "one_hand") return hand === "left" ? "izquierda" : "derecha";
  if (mode === "both_hands") return "dos";
  return "observar";
}

/** Convierte la opción del switch al cambio de modo de práctica. */
function mentorToPractice(mode: MentorMode, hand: string): { mode: "observe" | "one_hand" | "both_hands"; hand: "left" | "right" } {
  if (mode === "izquierda") return { mode: "one_hand", hand: "left" };
  if (mode === "derecha") return { mode: "one_hand", hand: "right" };
  if (mode === "dos") return { mode: "both_hands", hand: hand === "left" ? "left" : "right" };
  return { mode: "observe", hand: hand === "left" ? "left" : "right" };
}

export function ModeSelector({ mode: inicial = "observar" }: ModeSelectorProps) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const inSession = session.sessionId !== null;
  const changePracticeMode = usePracticeModeChange();

  const [internal, setInternal] = useState<MentorMode>(inicial);

  // Con sesión abierta manda el estado de la sesión; sin ella, el estado interno
  // cosmético de siempre (B-006.4/D-002.3).
  const modo: MentorMode = inSession
    ? practiceToMentor(session.practiceMode, session.studentHand)
    : internal;

  const suspended =
    inSession && effectiveControl(session.state, session.agentAction) === "agent";

  const indice = MODES.findIndex((m) => m.id === modo);

  const handleSelect = (next: MentorMode) => {
    if (inSession) {
      changePracticeMode(mentorToPractice(next, session.studentHand));
    } else {
      setInternal(next);
    }
  };

  /** Contenido visual de una opción: se reutiliza en la barra real y en el clon.
   *  Solo el icono: el texto se expone como tooltip (title) y aria-label para
   *  ahorrar altura en pantallas pequeñas (petición del usuario). */
  const contenido = (item: Opcion) => (
    <>
      <span className={styles.iconos}>
        <span className={styles.icono} aria-hidden="true" />
        {item.espejo ? (
          <span className={`${styles.icono} ${styles.espejo}`} aria-hidden="true" />
        ) : null}
      </span>
    </>
  );

  return (
    <div
      className={styles.contenedor}
      data-mode={modo}
      role="group"
      aria-label="Modo del mentor"
      style={{ "--i": indice, "--n": MODES.length } as React.CSSProperties}
    >
      {/* Capa 1: barra real, interactiva y accesible */}
      <div className={styles.capa}>
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.opcion} ${item.clase}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={item.id === modo}
            disabled={suspended}
            onClick={() => handleSelect(item.id)}
          >
            {contenido(item)}
          </button>
        ))}
      </div>

      {/* Capa 2: clon recortado por el círculo. Decorativo: sin eventos ni a11y */}
      <div className={styles.lente} aria-hidden="true">
        <div className={styles.clon}>
          {MODES.map((item) => (
            <span key={item.id} className={`${styles.opcion} ${item.clase} ${styles.opcionClon}`}>
              {contenido(item)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
