"use client";

// description: Switch «Modo espera» del reproductor (B-033.2, petición del usuario): con él activado (default) el transporte se congela en cada gate; apagado, la partitura no se congela y suena seguida, como en «observar» (sin sesión no tiene efecto: el motor ya no congela).
// context: Lee y escribe el almacén puro wait-mode-store; PlaybackArea multiplica este estado con el modo de práctica al configurar los gates del motor. Vive junto a la firma/tempo de la barra, donde el usuario ya mira el compás.

import { useSyncExternalStore } from "react";

import { getWaitModeSnapshot, setWaitModeEnabled, subscribeWaitMode } from "../../../lib/wait-mode-store";
import styles from "./WaitModeSwitch.module.css";

export function WaitModeSwitch() {
  const wait = useSyncExternalStore(subscribeWaitMode, getWaitModeSnapshot);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={wait.enabled}
      className={wait.enabled ? `${styles.switch} ${styles.on}` : styles.switch}
      onClick={() => setWaitModeEnabled(!wait.enabled)}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      <span className={styles.label}>Modo espera</span>
    </button>
  );
}
