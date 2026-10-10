-- description: Añade detección de duplicados por hash y procedencia (source/owner_id).
-- context: B-005.4+ deduplica subidas por SHA-256 y marca corpus vs uploads.

-- content_hash: SHA-256 del contenido MIDI; permite reutilizar una pieza ya
--   guardada en vez de duplicarla (base futura de la cache).
-- source: 'corpus' (catálogo data/midi) o 'upload' (subida por el usuario).
-- owner_id: reservedo para la futura issue de usuarios; NULL = anónimo por ahora.
ALTER TABLE pieces ADD COLUMN content_hash TEXT;
ALTER TABLE pieces ADD COLUMN source TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE pieces ADD COLUMN owner_id TEXT;

-- Índice NO único: la deduplicación se resuelve en la capa de servicio antes de
-- insertar; un índice único rompería con datos legados (filas sin hash) y con
-- cualquier duplicado legítimo futuro, lanzando IntegrityError sin capturar.
CREATE INDEX IF NOT EXISTS idx_pieces_content_hash ON pieces (content_hash);

-- Clasifica las filas ya existentes: solo el catálogo establece midi_path,
-- las subidas de usuario lo dejan en NULL.
UPDATE pieces SET source = 'corpus' WHERE midi_path IS NOT NULL;
