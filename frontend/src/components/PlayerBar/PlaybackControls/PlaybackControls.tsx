// description: Botones de transporte (atrás, reproducir/pausa, stop, adelante).
// context: B-006.4; solo reenvía callbacks, sin lógica propia. El play alterna desde
// B-007.3, así que icono y etiqueta salen de isPlaying y no de estado propio.

import styles from "./PlaybackControls.module.css";
import type { PlaybackControlsProps } from "./PlaybackControls.types";

export function PlaybackControls({
  onRewind,
  onTogglePlay,
  onStop,
  onForward,
  isPlaying = false,
}: PlaybackControlsProps) {
  return (
    <div className={styles.controls} role="group" aria-label="Controles de reproducción">
      <button type="button" aria-label="Atrás" onClick={onRewind}>
        ⏮
      </button>
      {/* El mismo botón pausa mientras suena; la etiqueta dice lo que va a pasar. */}
      <button
        type="button"
        aria-label={isPlaying ? "Pausar" : "Reproducir"}
        onClick={onTogglePlay}
      >
        {isPlaying ? "⏸" : "▶"}
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
