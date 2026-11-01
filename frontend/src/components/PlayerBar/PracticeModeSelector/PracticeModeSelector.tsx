// description: Selector del modo de práctica: Observar, Una mano y Dos manos, con el interruptor de mano izquierda/derecha cuando el modo es «una mano».
// context: B-032.4; vive junto a los controles del transporte en la PlayerBar y solo se pinta con sesión activa. No gobierna el transporte: publica el cambio y quien lo recibe lo manda al backend (el WS no toca el motor).
import { PRACTICE_MODE_LABELS, PRACTICE_MODES } from "../../../lib/practice-mode";
import styles from "./PracticeModeSelector.module.css";
import type { PracticeModeSelectorProps } from "./PracticeModeSelector.types";

/** Etiqueta corta de la mano, para el interruptor. */
const HAND_LABELS = { left: "Izquierda", right: "Derecha" } as const;

export function PracticeModeSelector({
  mode,
  hand,
  suspended = false,
  onChange,
}: PracticeModeSelectorProps) {
  const current = mode ?? "observe";

  const pickMode = (next: typeof current) => {
    // Cambiar de modo no reinicia la posición ni recarga la partitura: solo
    // cambia qué se oye, qué se atenúa y qué se evalúa (B-032.4).
    onChange({ mode: next, hand });
  };

  return (
    <div className={styles.selector} data-suspended={suspended ? "true" : "false"}>
      <span className={styles.label}>Modo</span>
      <div className={styles.modes} role="group" aria-label="Modo de práctica">
        {PRACTICE_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.mode}
            aria-pressed={option === current}
            disabled={suspended}
            onClick={() => pickMode(option)}
          >
            {PRACTICE_MODE_LABELS[option]}
          </button>
        ))}
      </div>
      {/* La mano solo importa en «una mano»: en los demás modos no hay
          interruptor que enseñe (B-032.4). */}
      {current === "one_hand" && (
        <div className={styles.hands} role="group" aria-label="Mano que practicas">
          {(["left", "right"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={styles.hand}
              aria-pressed={option === hand}
              data-hand={option}
              disabled={suspended}
              onClick={() => onChange({ mode: current, hand: option })}
            >
              {HAND_LABELS[option]}
            </button>
          ))}
        </div>
      )}
      {/* Con el agente delante, el modo del alumno queda suspendido (visible). */}
      {suspended && (
        <span className={styles.suspended} role="status">
          IA al piano
        </span>
      )}
    </div>
  );
}
