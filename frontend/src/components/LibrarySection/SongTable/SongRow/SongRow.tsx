// description: Fila de la tabla de Library: portada, metadatos, puntaje y estado.
// context: B-027.3; el play por fila sigue pendiente (B-012).

import { DIFFICULTY_LABEL, STATUS_LABEL, type SongRowProps } from "./SongRow.types";
import styles from "./SongRow.module.css";

const STATUS_CLASS = {
  new: styles.stNew,
  "in-progress": styles.stProgress,
  mastered: styles.stDone,
} as const;

const DIFFICULTY_CLASS = {
  beginner: styles.beginner,
  intermediate: styles.intermediate,
  advanced: styles.advanced,
} as const;

export function SongRow({ song, index, selected, onSelect }: SongRowProps) {
  const score = song.bestScore ?? 0;

  return (
    <tr className={`${styles.row} ${selected ? styles.selected : ""}`}>
      <td className={`${styles.td} ${styles.idx}`}>{String(index).padStart(2, "0")}</td>

      <td className={styles.td}>
        <button
          type="button"
          className={styles.song}
          aria-pressed={selected}
          onClick={() => onSelect(song.id)}
        >
          <span className={styles.cover}>
            {song.cover ? (
              <img className={styles.coverImg} src={song.cover} alt="" loading="lazy" />
            ) : (
              song.initials
            )}
          </span>
          <span>
            <span className={styles.name}>{song.title}</span>
            <span className={styles.sub}>{song.subtitle}</span>
          </span>
        </button>
      </td>

      <td className={`${styles.td} ${styles.soft}`}>{song.composer}</td>

      <td className={styles.td}>
        {song.difficulty ? (
          <span className={`${styles.chip} ${DIFFICULTY_CLASS[song.difficulty]}`}>
            {DIFFICULTY_LABEL[song.difficulty]}
          </span>
        ) : (
          <span className={styles.chip}>--</span>
        )}
      </td>

      <td className={`${styles.td} ${styles.num}`}>{song.duration}</td>

      <td className={`${styles.td} ${styles.num}`}>
        {song.bpm === null ? "--" : `${song.bpm} BPM`}
      </td>

      <td className={styles.td}>
        <div className={styles.score}>
          <div className={styles.bar}>
            <div className={styles.fill} style={{ width: `${score}%` }} />
          </div>
          <span className={styles.num}>
            {song.bestScore === null ? "--" : `${song.bestScore}%`}
          </span>
        </div>
      </td>

      <td className={styles.td}>
        <span className={`${styles.status} ${STATUS_CLASS[song.status]}`}>
          {STATUS_LABEL[song.status]}
        </span>
      </td>

      <td className={`${styles.td} ${styles.action}`}>
        <button type="button" className={styles.play} aria-label={`Practicar ${song.title}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 5l12 7-12 7z" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
