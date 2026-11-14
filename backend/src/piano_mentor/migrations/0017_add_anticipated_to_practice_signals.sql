-- description: Migración de la bandera de gates pasados sin congelación (B-033.9).
-- context: B-033.9. Los gates que el transporte deja atrás sin congelarse (el bot
-- toca con el modo espera auto-apagado, o el paso por anticipado fuera de la
-- ventana de captura) emiten su señal con `anticipated: true` para que el
-- informe capture la ejecución COMPLETA — antes, esos gates no emitían nada y
-- el informe quedaba en 8-10 compases de una pieza de 16. La columna nace a 0:
-- una señal sin bandera es una resolución normal del modo espera.

ALTER TABLE practice_signals ADD COLUMN anticipated INTEGER NOT NULL DEFAULT 0;
