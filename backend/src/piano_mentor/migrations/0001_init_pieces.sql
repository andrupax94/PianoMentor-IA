-- description: Migración inicial del esquema de piezas (B-003.1).
-- context: Tabla pieces con metadatos de carga y de catálogo; vectores quedan para B-005/B-013.

-- Metadatos de piezas MIDI. Los bytes viven en filesystem (MIDI_STORAGE_PATH);
-- esta tabla solo persiste metadatos consultables.
-- Campos musicales opcionales hasta que B-005 (normalización) los rellene;
-- el catálogo del corpus (B-003.3) ya aporta título, compositor y licencia.
CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    stored_filename TEXT,
    midi_path TEXT,
    size_bytes INTEGER,
    extension TEXT,
    title TEXT,
    composer TEXT,
    opus TEXT,
    tracks INTEGER,
    duration_s REAL,
    notes_count INTEGER,
    license TEXT,
    source_url TEXT,
    difficulty TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pieces_composer ON pieces (composer);
