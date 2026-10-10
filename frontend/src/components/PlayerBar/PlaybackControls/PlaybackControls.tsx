// description: Botones de transporte (atrás, play, stop, adelante).
// context: B-006.4; solo reenvía callbacks, sin lógica propia.

import styles from "./PlaybackControls.module.css";
import type { PlaybackControlsProps } from "./PlaybackControls.types";

export function PlaybackControls({ onRewind, onPlay, onStop, onForward }: PlaybackControlsProps) {
  return (
    <div className={styles.controls} role="group" aria-label="Controles de reproducción">
      <button type="button" aria-label="Atrás" onClick={onRewind}>
        ⏮
      </button>
      <button type="button" aria-label="Reproducir" onClick={onPlay}>
        ▶
      </button>
      <button type="button" aria-label="Detener" onClick={onStop}>
        ⏹
      </button>
      <button type="button" aria-label="Adelante" onClick={onForward}>
        ⏭
      </button>
    </div>
  );
}
