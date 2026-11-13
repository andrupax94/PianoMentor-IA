-- description: Migración de la cola de respuestas aplazadas del chat (B-036.3).
-- context: Cuando el turno falla por saturación del proveedor LLM (429/5xx/timeout
-- tras agotar la cadena), el fallback determinista responde igual (nunca burbuja
-- vacía) pero el trabajo queda aquí «a por hacer»: un worker reintenta el turno
-- con los `messages` guardados (JSON del turno completo, para reintentarlo fiel),
-- guarda la redacción lograda en el historial del chat y la manda por correo.
-- `email` nace NULL en anónimos y se asocia después (B-036.4). Los estados:
-- pendiente (esperando reintento), lista (redacción lograda, sin correo asociado),
-- enviada (correo mandado) y fallida (tope de intentos).

CREATE TABLE IF NOT EXISTS pending_llm_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    email TEXT,
    messages TEXT NOT NULL,
    max_tokens INTEGER,
    status TEXT NOT NULL DEFAULT 'pendiente',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    answered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_llm_due
    ON pending_llm_replies (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_pending_llm_chat
    ON pending_llm_replies (chat_id);
