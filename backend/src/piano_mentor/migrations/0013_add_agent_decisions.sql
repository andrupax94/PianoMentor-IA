-- description: Migración de decisiones del agente (B-032.6).
-- context: `agent_decisions` registra cada intervención ejecutada (acción, params, motivo)
-- y fija el reinicio del contador de strikes por compás (`baseline_signal_id` es la
-- última señal vista al ejecutar la decisión): las reglas de B-032.6 cuentan fallos
-- nuevos desde ahí, sin borrar el historial de `practice_signals`.

CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    measure INTEGER,
    action TEXT NOT NULL,
    params_json TEXT NOT NULL DEFAULT '{}',
    reason TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'deterministic',
    baseline_signal_id INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_session
    ON agent_decisions (session_id, measure);
