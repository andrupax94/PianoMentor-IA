-- description: Biblioteca de piezas por usuario (U-008.2).
-- context: Piezas adicionales visibles para un usuario además de las por defecto (principiante).
CREATE TABLE IF NOT EXISTS user_piece_library (
    user_sub TEXT NOT NULL,
    piece_id TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_sub, piece_id),
    FOREIGN KEY (user_sub) REFERENCES users(google_sub) ON DELETE CASCADE,
    FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_piece_library_user ON user_piece_library (user_sub);