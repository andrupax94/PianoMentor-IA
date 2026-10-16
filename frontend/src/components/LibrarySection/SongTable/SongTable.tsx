import { SongRow } from "./SongRow/SongRow";
import type { SongTableProps } from "./SongTable.types";
import styles from "./SongTable.module.css";

const COLUMNS = ["#", "Canción", "Compositor", "Dificultad", "Duración", "Tempo", "Mejor puntaje", "Estado", ""];

export function SongTable({ songs, selectedId, onSelect, preview, onPlay }: SongTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={i} className={styles.th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {songs.map((song, i) => (
            <SongRow
              key={song.id}
              index={i + 1}
              song={song}
              selected={song.id === selectedId}
              onSelect={onSelect}
              preview={preview}
              onPlay={onPlay}
            />
          ))}
        </tbody>
      </table>
      {songs.length === 0 && <p className={styles.empty}>No hay canciones que coincidan.</p>}
    </div>
  );
}
