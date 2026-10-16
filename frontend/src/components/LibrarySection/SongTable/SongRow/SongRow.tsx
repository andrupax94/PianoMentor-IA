// description: Fila de la tabla de Library: portada, metadatos, puntaje y transporte.
// context: B-027.3; el play suena en la propia lista con el motor del piano, y el
// resto de métricas siguen pendientes de B-012/B-014.

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

export function SongRow({ song, index, selected, preview, onSelect, onPlay }: SongRowProps) {
  const score = song.bestScore ?? 0;
  const playing = preview.id === song.id && preview.playing;
  const loading = preview.loadingId === song.id;

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
        <button
          type="button"
          className={`${styles.play} ${playing ? styles.playing : ""}`}
          aria-label={playing ? `Pausar ${song.title}` : `Reproducir ${song.title}`}
          aria-pressed={playing}
          disabled={loading}
          onClick={() => onPlay(song)}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          )}
        </button>
      </td>
    </tr>
  );
}
