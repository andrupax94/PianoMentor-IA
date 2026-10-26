// description: Franja del reproductor cableada al transporte: play/pausa (botón único que alterna ▶/⏸), parar, Atrás al inicio, Adelante +5 s, tempo real editable (el BPM pedido se convierte en factor con tempoFactorFor), compás actual real (derivado de la rejilla con measureIndexAt) y progreso redondeado.
// context: B-007.3/B-008.3/B-027.3; B-006.4 la dejó solo HTML/CSS. El título y la portada llegan por props (la demo, el nombre del archivo subido o la ficha del catálogo) y nunca son un marcador: siempre nombran la pieza que suena.

"use client";
// real de la rejilla servida por el backend. El título lo aporta PlaybackArea —la
// demo o la pieza elegida—, así que nunca puede desentonar con lo que suena.

import { measureIndexAt } from "../../lib/measures";
import { tempoFactorFor } from "../../lib/playback-schedule";
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
  songTitle,
  songCover,
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
    setTempoFactor,
  } = player;

  const isPlaying = status === "playing";

  // Redondeado aquí: la barra pinta un entero, no 25.131969576413994%.
  const progress = duration_s > 0 ? Math.round((position_s / duration_s) * 100) : 0;
  const tempoBpm = tempo_bpm === null ? null : Math.round(tempo_bpm * tempoFactor);

  // El BPM que teclea el usuario es relativo al tempo de la pieza: aquí se
  // convierte en el factor del motor (recortado a 0.5–2.0) y el resto de la
  // pieza, con sus propios cambios de tempo, escala por igual (B-006.5).
  const changeTempo = (bpm: number) => setTempoFactor(tempoFactorFor(bpm, tempo_bpm));

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
      <SongInfo title={songTitle} cover={songCover} subtitle={arrangement} />
      <PlaybackControls
        onRewind={() => seek(0)}
        onTogglePlay={togglePlay}
        onStop={stop}
        onForward={() => seek(position_s + SKIP_S)}
        isPlaying={isPlaying}
      />
      <span></span>
      <TempoMeasure
        tempoBpm={tempoBpm}
        baseTempoBpm={tempo_bpm}
        onTempoChange={changeTempo}
        measure={measure}
        measureCount={measureCount}
        signature={signature}
      />
      <ProgressBar value={progress} />
    </section>
  );
}
