import {
  DIFFICULTY_OPTIONS,
  DURATION_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TEMPO_OPTIONS,
  sortOptionValue,
  type LibraryToolbarProps,
} from "./LibraryToolbar.types";
import styles from "./LibraryToolbar.module.css";

interface SelectProps<T extends string> {
  /** Nombre accesible del desplegable. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Desplegable con el mismo aspecto que los botones de filtro; se resalta al estar activo. */
function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const active = value !== "all" && value !== "default";
  return (
    <span className={styles.selectWrap}>
      <select
        className={`${styles.select} ${active ? styles.selectActive : ""}`}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className={styles.caret} aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

export function LibraryToolbar({ filters, sort, onFiltersChange, onSortChange }: LibraryToolbarProps) {
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
          value={filters.query}
          onChange={(e) => onFiltersChange({ query: e.target.value })}
        />
      </label>

      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.filter} ${filters.status === opt.value ? styles.active : ""}`}
          aria-pressed={filters.status === opt.value}
          onClick={() => onFiltersChange({ status: opt.value })}
        >
          {opt.label}
        </button>
      ))}

      <Select
        label="Filtrar por dificultad"
        value={filters.difficulty}
        options={DIFFICULTY_OPTIONS}
        onChange={(value) => onFiltersChange({ difficulty: value })}
      />
      <Select
        label="Filtrar por duración"
        value={filters.duration}
        options={DURATION_OPTIONS}
        onChange={(value) => onFiltersChange({ duration: value })}
      />
      <Select
        label="Filtrar por tempo"
        value={filters.tempo}
        options={TEMPO_OPTIONS}
        onChange={(value) => onFiltersChange({ tempo: value })}
      />
      <Select
        label="Ordenar por"
        value={sortOptionValue(sort)}
        options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        onChange={(value) =>
          onSortChange(SORT_OPTIONS.find((option) => option.value === value)?.sort ?? null)
        }
      />
    </div>
  );
}
