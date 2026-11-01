-- description: Migración de señales de práctica del modo espera (B-032.5).
-- context: `practice_signals` guarda el resultado de cada gate (hit/miss/wrong/timeout)
-- para que B-032.6 aplique reglas deterministas por compás. No se mezcla con
-- `session_events` porque el evaluador de B-012.2 solo mira note_on/note_off.

CREATE TABLE IF NOT EXISTS practice_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    gate TEXT NOT NULL,
    measure INTEGER,
    outcome TEXT NOT NULL,
    wait_ms INTEGER NOT NULL DEFAULT 0,
    hand TEXT NOT NULL DEFAULT 'both',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_signals_session
    ON practice_signals (session_id, measure);
