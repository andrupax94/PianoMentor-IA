-- description: Migración del login simple con contraseña y color de burbuja (U-005).
-- context: password_hash guarda el hash PBKDF2 de la contraseña (NULL para
-- usuarios que solo entran con Google y aún no la tienen); bubble_color es el
-- color del avatar asignado aleatoriamente al crear la cuenta y nunca cambia.

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN bubble_color TEXT;
