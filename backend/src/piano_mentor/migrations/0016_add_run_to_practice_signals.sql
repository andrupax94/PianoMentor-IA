-- description: Migración de integridad del informe (B-033.8): run_id por señal y current_run por sesión.
-- context: B-033.8 (con el diseño de B-033.7). Las señales de práctica de una sesión
-- eran un saco append-only sin distinguir pasadas: reiniciar la pieza mezclaba la
-- nueva pasada con las anteriores y el informe crecía sin separar. `run_id` marca
-- la pasada de cada señal (1 para todo lo anterior — compatibilidad con sesiones
-- viejas sin columna) y `sessions.current_run` guarda la pasada vigente: solo un
-- reinicio explícito la incrementa (POST /sessions/{id}/runs), nunca el avance
-- normal del transporte.

ALTER TABLE practice_signals ADD COLUMN run_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN current_run INTEGER NOT NULL DEFAULT 1;
