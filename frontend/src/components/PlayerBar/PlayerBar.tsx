"use client";
// description: Franja superior del área izquierda (pieza, controles, tempo, progreso).
// context: B-007.3/B-008.3; reenvía las acciones del transporte y deriva el compás
// real de la rejilla servida por el backend. El título de la pieza sigue siendo
// marcador hasta B-012 (sesión con pieza elegida).

import { measureIndexAt } from "../../lib/measures";
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
}: PlayerBarProps) {
  const {
    position_s,
    duration_s,
    tempo_bpm,
    tempoFactor,
    status,
    measures,
    play,
    pause,
    stop,
    seek,
  } = player;

  const isPlaying = status === "playing";

  // Redondeado aquí: la barra pinta un entero, no 25.131969576413994%.
  const progress = duration_s > 0 ? Math.round((position_s / duration_s) * 100) : 0;
  const tempoBpm = tempo_bpm === null ? null : Math.round(tempo_bpm * tempoFactor);

  // Compás actual derivado de la posición viva (misma cadencia de 25 ms que el resto).
  const measureIndex = measureIndexAt(measures, tempoFactor, position_s);
  const measure = measureIndex === null ? null : measureIndex + 1;
  const measureCount = measures?.count ?? null;
  const signature = measureIndex === null ? null : (measures?.signatures[measureIndex] ?? null);

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
      <TempoMeasure
        tempoBpm={tempoBpm}
        measure={measure}
        measureCount={measureCount}
        signature={signature}
      />
      <ProgressBar value={progress} />
    </section>
  );
}
