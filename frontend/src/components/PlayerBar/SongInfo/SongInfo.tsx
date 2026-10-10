// description: Portada y título de la pieza en reproducción.
// context: B-006.4; armazón estático.

import styles from "./SongInfo.module.css";
import type { SongInfoProps } from "./SongInfo.types";

export function SongInfo({
  title = "Beethoven – Symphony No. 5",
  subtitle = "Piano Arrangement",
}: SongInfoProps) {
  return (
    <div className={styles.info}>
      <span className={styles.cover} aria-hidden="true">
        ♫
      </span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
