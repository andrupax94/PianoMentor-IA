// description: Paginación de la tabla de piezas: contador de elementos y botones anterior/siguiente.
// context: B-027.4; componente de paginación de la Library.

import type { TablePaginationProps } from "./TablePagination.types";
import styles from "./TablePagination.module.css";

export function TablePagination({ page, totalPages, shown, total, onPageChange }: TablePaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className={styles.pager}>
      <span>Mostrando {shown} de {total}</span>
      <div className={styles.pages}>
        <button type="button" className={styles.btn} aria-label="Anterior" disabled={page === 1} onClick={() => onPageChange(page - 1)}>‹</button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.btn} ${p === page ? styles.active : ""}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button type="button" className={styles.btn} aria-label="Siguiente" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>›</button>
      </div>
    </div>
  );
}
