-- description: Migración de la tabla de usuarios (U-005).
-- context: users guarda lo mínimo que entrega Google OAuth (google_sub,
-- email, name y picture); el resto de datos personales se reserva vacío.
-- es la identidad que B-029 usará para el control de MIDIs por usuario.
-- schema: tabla única con índice natural por google_sub (UNIQUE), sin
-- claves foráneas, como el resto del esquema.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT,
    picture TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
