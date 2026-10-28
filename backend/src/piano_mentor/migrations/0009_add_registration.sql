-- description: Migración del registro abierto por pasos (U-006).
-- context: level lleva el nivel de piano elegido en el paso 2, genres la
-- selección JSON del paso 3, terms_version/terms_accepted_at la aceptación del
-- paso 4 (P-001 dará la versión, hoy quedan NULL si el paso está inactivo o
-- con el marcador PRE-P001 si el usuario aceptó), email_verified el centinela
-- de alta activada y verification_token/verification_expires_at el token del
-- email de comprobación del paso 5. Google verifica el correo por su cuenta,
-- así que las filas existentes nacen verificadas.

ALTER TABLE users ADD COLUMN level TEXT;
ALTER TABLE users ADD COLUMN genres TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_expires_at TEXT;

-- Toda cuenta anterior (admin por script, registros de Google) se considera
-- verificada: solo las que nazcan del registro nuevo empiezan sin activar.
UPDATE users SET email_verified = 1;
