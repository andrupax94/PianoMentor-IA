<!-- description: ADR 0005: persistencia con SQLite + sqlite-vec en el MVP, con migraciones SQL versionadas. -->
<!-- context: Explica WAL, busy_timeout, el worker único y por qué no hay Postgres todavía. -->

# 0005 — SQLite + sqlite-vec como persistencia del MVP

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · registrada a posteriori (decisión de la semana 1)
- **Ámbito:** B-003 (carga y almacenamiento), B-012.1 (sesiones y eventos)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

El MVP es de un solo usuario y un solo proceso: metadatos de piezas, log de eventos de una sesión y, más adelante, búsqueda por similitud. El corpus son unas dieciséis piezas y del orden de dieciséis mil notas. El despliegue es un contenedor en Render, sin presupuesto para una base gestionada, y los tests tienen que correr sin infraestructura.

## Opciones consideradas

1. **PostgreSQL + pgvector gestionado:** camino natural a multiusuario, pero coste, latencia de red y una dependencia externa en cada test.
2. **SQLite + sqlite-vec en proceso:** un fichero, cero operaciones y la extensión vectorial cargada en la misma conexión.

## Decisión

Opción 2. La base vive en `data/` (`DATABASE_URL=sqlite:///...`), con migraciones SQL versionadas (`0001`–`0006`) aplicadas al arrancar. Se activa WAL y un `busy_timeout` de 3 s para que el WebSocket escriba mientras los endpoints leen. El catálogo es idempotente y se siembra de forma perezosa.

## Consecuencias

- No hay servidor de base de datos que operar: el despliegue es un contenedor y un volumen.
- Los tests usan `:memory:` o un fichero temporal; nada depende de la red.
- SQLite tiene un solo escritor: la app se despliega con un worker documentado y el estado en memoria del WebSocket asume ese proceso único.
- `piece_vectors` queda declarada pero vacía hasta que lleguen los embeddings (B-005/B-013); la migración a Postgres es posible sin tocar el dominio porque el acceso está aislado en `database.py`.

## Referencias

`backend/src/piano_mentor/database.py`, `backend/src/piano_mentor/migrations/`, `README.md` §6.
