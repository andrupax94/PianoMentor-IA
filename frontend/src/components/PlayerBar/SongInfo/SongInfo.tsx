// description: Portada y título de la pieza en reproducción.
// context: B-006.4; el título lo aporta PlaybackArea (la demo o la pieza elegida),
// así que la portada siempre nombra la pieza que está sonando.

import styles from "./SongInfo.module.css";
import type { SongInfoProps } from "./SongInfo.types";

export function SongInfo({
  title,
  cover = null,
  subtitle = "Piano Arrangement",
}: SongInfoProps) {
  return (
    <div className={styles.info}>
      <span className={styles.cover} aria-hidden="true">
        {cover ? <img className={styles.coverImg} src={cover} alt="" /> : "♫"}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
