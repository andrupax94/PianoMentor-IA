// description: Hueco decorativo del panel del mentor (B-023): ocupa el sitio de la pestaña «Carga pieza» cuando la subida de MIDI está deshabilitada para la prueba pública (flag NEXT_PUBLIC_ENABLE_MIDI_UPLOAD=false). Puramente estético: un dibujo de teclas de piano en CSS con la identidad de la casa (navy profundo + acento dorado) y una frase corta; sin lógica, sin acciones, sin peticiones.
// context: El espacio lo deja MentorPanel al quitar la pestaña de carga; este bloque lo rellena para que la columna no quede vacía sin inventar funcionalidad nueva. Cuando la subida vuelva a probarse (flag reencendido), MentorPanel vuelve a montar MentorTabs y este componente no se renderiza. CSS Modules con tokens de globals.css; nada de Bootstrap.

import styles from "./MentorDecor.module.css";

export function MentorDecor() {
  return (
    <section className={styles.decor} aria-hidden="true">
      <div className={styles.card}>
        {/* Teclas estilizadas en CSS: siete blancas con tres negras superpuestas. */}
        <div className={styles.keys}>
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className={styles.teclaBlanca} />
          ))}
          <span className={`${styles.teclaNegra} ${styles.negra1}`} />
          <span className={`${styles.teclaNegra} ${styles.negra2}`} />
          <span className={`${styles.teclaNegra} ${styles.negra3}`} />
        </div>
        <p className={styles.melodia}>♪ &nbsp; ♫ &nbsp; ♩ &nbsp; ♬</p>
        <p className={styles.frase}>La práctica lenta es la más rápida.</p>
      </div>
    </section>
  );
}
