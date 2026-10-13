"use client";
// description: Franja superior del área izquierda (pieza, controles, tempo, progreso).
// context: B-007.3; B-006.4 la dejó solo HTML/CSS con la nota "el transporte se enchufa
// en B-007", así que aquí reenvía las acciones del transporte. El título de la pieza y
// el compás siguen siendo marcadores (B-008/B-012).

import { PlaybackControls } from "./PlaybackControls/PlaybackControls";
import { ProgressBar } from "./ProgressBar/ProgressBar";
import { SongInfo } from "./SongInfo/SongInfo";
import { TempoMeasure } from "./TempoMeasure/TempoMeasure";
import styles from "./PlayerBar.module.css";
import type { PlayerBarProps } from "./PlayerBar.types";

/** Segundos que salta Adelante (⏭); Atrás (⏮) vuelve al inicio de la pieza. */
const SKIP_S = 5;

export function PlayerBar({
  player,
  songTitle = "Beethoven – Symphony No. 5",
  arrangement = "Piano Arrangement",
  measure = "12/16",
}: PlayerBarProps) {
  const { position_s, duration_s, tempo_bpm, tempoFactor, status, play, pause, stop, seek } =
    player;

  const isPlaying = status === "playing";

  // Redondeado aquí: la barra pinta un entero, no 25.131969576413994%.
  const progress = duration_s > 0 ? Math.round((position_s / duration_s) * 100) : 0;
  const tempoBpm = tempo_bpm === null ? null : Math.round(tempo_bpm * tempoFactor);

  const togglePlay = () => {
    if (isPlaying) {
      // Pausa sin tocar la posición: la cascada y el resaltado se quedan donde están.
      pause();
      return;
    }
    // El gesto del clic desbloquea el AudioContext; si el navegador lo rechaza,
    // no hay reproducción que avisar: la página sigue funcionando.
    void play().catch(() => undefined);
  };

  return (
    <section className={styles.bar} aria-label="Reproductor">
      <SongInfo title={songTitle} subtitle={arrangement} />
      <PlaybackControls
        onRewind={() => seek(0)}
        onTogglePlay={togglePlay}
        onStop={stop}
        onForward={() => seek(position_s + SKIP_S)}
        isPlaying={isPlaying}
      />
      <TempoMeasure tempoBpm={tempoBpm} measure={measure} />
      <ProgressBar value={progress} />
    </section>
  );
}
