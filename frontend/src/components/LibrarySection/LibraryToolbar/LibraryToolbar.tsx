import { FILTER_OPTIONS, type LibraryToolbarProps } from "./LibraryToolbar.types";
import styles from "./LibraryToolbar.module.css";

export function LibraryToolbar({
  query,
  filter,
  onQueryChange,
  onFilterChange,
}: LibraryToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          type="search"
          className={styles.input}
          placeholder="Buscar canción o compositor…"
          aria-label="Buscar"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>

      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.filter} ${filter === opt.value ? styles.active : ""}`}
          aria-pressed={filter === opt.value}
          onClick={() => onFilterChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}

      <button type="button" className={styles.filter}>
        Dificultad ▾
      </button>
    </div>
  );
}
