import type { SortDirection } from "../LibraryPage/LibraryPage.types";
import { SongRow } from "./SongRow/SongRow";
import { SONG_COLUMNS, type SongTableProps } from "./SongTable.types";
import styles from "./SongTable.module.css";

/** Flecha del orden: hacia arriba para ascendente y hacia abajo para descendente. */
function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg className={styles.arrow} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {direction === "asc" ? (
        <path d="M5 1l4 7H1z" fill="currentColor" />
      ) : (
        <path d="M5 9L1 2h8z" fill="currentColor" />
      )}
    </svg>
  );
}

export function SongTable({ songs, selectedId, onSelect, preview, onPlay, sort, onSort }: SongTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {SONG_COLUMNS.map((column) => {
              const field = column.field;
              const active = field !== undefined && sort !== null && sort.field === field;
              const ariaSort: "ascending" | "descending" | "none" | undefined =
                field === undefined
                  ? undefined
                  : sort && sort.field === field
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
              return (
                <th key={column.key} className={styles.th} aria-sort={ariaSort}>
                  {field ? (
                    <button
                      type="button"
                      className={`${styles.thButton} ${active ? styles.thActive : ""}`}
                      onClick={() => onSort(field)}
                    >
                      {column.label}
                      {active && sort ? <SortArrow direction={sort.direction} /> : null}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
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
