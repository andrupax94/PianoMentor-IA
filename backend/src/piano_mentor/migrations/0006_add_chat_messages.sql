-- description: Migración del log de conversaciones del agente (B-012.8).
-- context: chat_messages guarda la ventana de memoria a corto plazo del chat
-- del agente. Es un log append-only sin claves foráneas, como el resto del
-- esquema; la ventana rodante se lee ordenada por id.

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages (chat_id, id);
