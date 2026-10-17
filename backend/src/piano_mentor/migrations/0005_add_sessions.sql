-- description: Migración del esquema de sesiones de práctica y su log de eventos (B-012.1).
-- context: sessions guarda el estado vivo; session_events es el log append-only que leerá la evaluación (B-012.2).

-- Estado vivo de una sesión de práctica. `status` recorre idle/playing/paused,
-- `control` indica quién tiene el piano (student/agent) y B-012.3/B-012.4 lo
-- consultan para decidir y validar acciones. No hay claves foráneas: el esquema
-- del proyecto no usa ninguna y la pieza se valida en el servicio.
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    piece_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    control TEXT NOT NULL DEFAULT 'student',
    current_measure INTEGER,
    position_s REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_piece ON sessions (piece_id);

-- Log append-only de la interpretación: una fila por evento MIDI recibido.
-- `t_s` es el reloj del estudiante (segundos desde el inicio de la
-- reproducción), que es el que comparará la evaluación (B-012.2);
-- `received_at` es solo diagnóstico del servidor.
CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    pitch INTEGER NOT NULL,
    velocity INTEGER NOT NULL DEFAULT 0,
    t_s REAL NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events (session_id, id);
