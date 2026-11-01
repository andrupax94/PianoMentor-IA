-- description: Migración de recuperación de contraseña (U-007).
-- context: Nueva tabla auth_tokens para tokens de un solo uso (verify/reset)
-- con hash SHA-256, y columna password_changed_at en users para invalidar
-- JWTs previos tras cambio de contraseña.

CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
    token_hash TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_sub, purpose, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_sub, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens (token_hash);

-- password_changed_at: marca cuándo cambió la contraseña; verify_pm_token
-- coteja iat del JWT contra esta fecha para invalidar sesiones previas.
ALTER TABLE users ADD COLUMN password_changed_at TEXT;