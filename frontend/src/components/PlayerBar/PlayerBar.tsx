// description: Franja superior del área izquierda (pieza, controles, tempo, progreso).
// context: B-006.4; armazón estático, el transporte se enchufa en B-007.

import { PlaybackControls } from "./PlaybackControls/PlaybackControls";
import { ProgressBar } from "./ProgressBar/ProgressBar";
import { SongInfo } from "./SongInfo/SongInfo";
import { TempoMeasure } from "./TempoMeasure/TempoMeasure";
import styles from "./PlayerBar.module.css";
import type { PlayerBarProps } from "./PlayerBar.types";

export function PlayerBar({
  songTitle = "Beethoven – Symphony No. 5",
  arrangement = "Piano Arrangement",
  tempoBpm = 60,
  measure = "12/16",
  progress = 75,
}: PlayerBarProps) {
  return (
    <section className={styles.bar} aria-label="Reproductor">
      <SongInfo title={songTitle} subtitle={arrangement} />
      <PlaybackControls />
      <TempoMeasure tempoBpm={tempoBpm} measure={measure} />
      <ProgressBar value={progress} />
    </section>
  );
}
