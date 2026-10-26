// description: Switch del modo del mentor: Observar, Mano izquierda, Dos manos y Mano derecha.
// context: B-006.4 armazón; D-002.3 lo hace switch de 4 posiciones con un color por opción y retira Tomar Control (cualquier mano que no sea Observar implica que el estudiante toca); el estado es interno y cosmético, y los colores por opción son los mismos que tiñen la cascada (D-002.1).

"use client";

import { useState } from "react";

import styles from "./ModeSelector.module.css";
import type { MentorMode, ModeSelectorProps } from "./ModeSelector.types";

interface Opcion {
  id: MentorMode;
  label: string;
  clase: string;
  /** Dos manos son dos palmas: la segunda va espejada. */
  espejo?: boolean;
}

/** Las cuatro posiciones del switch, en el orden en que se muestran. */
const MODES: Opcion[] = [
  { id: "observar", label: "Observar", clase: styles.observar },
  { id: "izquierda", label: "Mano izquierda", clase: styles.izquierda },
  { id: "dos", label: "Dos manos", clase: styles.dos, espejo: true },
  { id: "derecha", label: "Mano derecha", clase: styles.derecha },
];

export function ModeSelector({ mode: inicial = "observar" }: ModeSelectorProps) {
  // Estado interno y cosmético: solo dibuja el switch; la semántica la decide B-012.
  const [modo, setModo] = useState<MentorMode>(inicial);

  return (
    <div className={styles.contenedor} data-mode={modo} role="group" aria-label="Modo del mentor">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.opcion} ${item.clase}`}
          aria-pressed={item.id === modo}
          onClick={() => setModo(item.id)}
        >
          <span className={styles.iconos}>
            <span className={styles.icono} aria-hidden="true" />
            {item.espejo ? (
              <span className={`${styles.icono} ${styles.espejo}`} aria-hidden="true" />
            ) : null}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
