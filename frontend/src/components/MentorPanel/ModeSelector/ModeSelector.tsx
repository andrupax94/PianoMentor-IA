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
  espejo?: boolean;
}

const MODES: Opcion[] = [
  { id: "observar", label: "Observar", clase: styles.observar },
  { id: "izquierda", label: "Mano izquierda", clase: styles.izquierda },
  { id: "dos", label: "Dos manos", clase: styles.dos, espejo: true },
  { id: "derecha", label: "Mano derecha", clase: styles.derecha },
];

export function ModeSelector({ mode: inicial = "observar" }: ModeSelectorProps) {
  const [modo, setModo] = useState<MentorMode>(inicial);
  const indice = MODES.findIndex((m) => m.id === modo);

  /** Contenido visual de una opción: se reutiliza en la barra real y en el clon. */
  const contenido = (item: Opcion) => (
    <>
      <span className={styles.iconos}>
        <span className={styles.icono} aria-hidden="true" />
        {item.espejo ? (
          <span className={`${styles.icono} ${styles.espejo}`} aria-hidden="true" />
        ) : null}
      </span>
      {item.label}
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
            aria-pressed={item.id === modo}
            onClick={() => setModo(item.id)}
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
