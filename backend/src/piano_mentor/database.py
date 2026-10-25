# description: Conexión SQLite + sqlite-vec (DATABASE_URL), migraciones SQL versionadas, metadatos de piezas, sesiones de práctica y usuarios (U-005).
# context: Persistencia de piezas (B-003.2/B-003.3), de sesiones y eventos (B-012.1) y de usuarios (auth con Google y contraseña).

"""Conexión reutilizable a SQLite con sqlite-vec y migraciones SQL versionadas."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path

import sqlite_vec

from .config import settings
from .passwords import random_bubble_color

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
SQLITE_PREFIX = "sqlite:///"


def _database_path(database_url: str) -> str:
    """Traduce `DATABASE_URL` (`sqlite:///ruta`) a una ruta que entiende sqlite3."""
    if not database_url.startswith(SQLITE_PREFIX):
        raise ValueError(f"DATABASE_URL no soportada (se espera sqlite:///...): {database_url}")
    target = database_url[len(SQLITE_PREFIX) :]
    if not target:
        raise ValueError("DATABASE_URL sin ruta de base de datos")
    if target.endswith(":memory:"):
        return ":memory:"
    return target


def connect(database_url: str | None = None) -> sqlite3.Connection:
    """Abre una conexión SQLite con sqlite-vec cargado y filas como `sqlite3.Row`.

    Activa **WAL** para que lectores y escritor no se esperen entre sí (B-012.1:
    el WebSocket inserta eventos mientras se consulta el estado) y un
    `busy_timeout` corto como red de seguridad. Si el sistema de archivos no
    admite WAL (por ejemplo una unidad de red), SQLite devuelve el modo anterior
    en lugar de fallar, así que el PRAGMA no rompe el arranque.
    """
    path = _database_path(database_url or settings.database_url)
    if path != ":memory:":
        Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=3000")
    conn.enable_load_extension(True)
    try:
        sqlite_vec.load(conn)
    finally:
        conn.enable_load_extension(False)
    return conn


@contextmanager
def open_db(database_url: str | None = None) -> Iterator[sqlite3.Connection]:
    """Abre una conexión con el esquema al día y la cierra al salir del bloque."""
    conn = connect(database_url)
    try:
        init_db(conn)
        yield conn
    finally:
        conn.close()


def pending_migrations(conn: sqlite3.Connection) -> list[Path]:
    """Devuelve los scripts de migración aún no aplicados, en orden."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version TEXT PRIMARY KEY,"
        " applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
        ")"
    )
    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
    scripts = sorted(MIGRATIONS_DIR.glob("*.sql"))
    return [script for script in scripts if script.stem not in applied]


PIECE_COLUMNS = (
    "id",
    "filename",
    "stored_filename",
    "midi_path",
    "size_bytes",
    "extension",
    "title",
    "composer",
    "opus",
    "tracks",
    "duration_s",
    "notes_count",
    "tempo",
    "content_hash",
    "source",
    "owner_id",
    "license",
    "source_url",
    "difficulty",
    "cover",
)


def insert_piece(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta metadatos de una pieza; las columnas ausentes quedan NULL."""
    columns = [name for name in PIECE_COLUMNS if name in record]
    if "id" not in columns:
        raise ValueError("insert_piece requiere al menos el campo 'id'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO pieces ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def upsert_piece(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta o actualiza metadatos por id (carga idempotente del catálogo, B-003.3)."""
    columns = [name for name in PIECE_COLUMNS if name in record]
    if "id" not in columns:
        raise ValueError("upsert_piece requiere al menos el campo 'id'")
    updated = [name for name in columns if name != "id"]
    assignments = ", ".join(f"{name} = excluded.{name}" for name in updated)
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO pieces ({', '.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {assignments}",
        [record[name] for name in columns],
    )
    conn.commit()


def get_piece(conn: sqlite3.Connection, piece_id: str) -> sqlite3.Row | None:
    """Lee una pieza persistida por su id."""
    return conn.execute("SELECT * FROM pieces WHERE id = ?", (piece_id,)).fetchone()


def find_piece_by_hash(conn: sqlite3.Connection, content_hash: str) -> sqlite3.Row | None:
    """Busca una pieza por el SHA-256 de su contenido (deduplicación).

    Si varias filas compartieran hash, se prioriza la del corpus por encima de
    las subidas: el corpus es la referencia canónica de la pieza.
    """
    return conn.execute(
        "SELECT * FROM pieces WHERE content_hash = ?"
        " ORDER BY CASE WHEN source = 'corpus' THEN 0 ELSE 1 END, created_at"
        " LIMIT 1",
        (content_hash,),
    ).fetchone()


def save_piece(record: Mapping[str, object]) -> None:
    """Persiste metadatos en `DATABASE_URL` creando el esquema si hace falta (B-003.2)."""
    with open_db() as conn:
        insert_piece(conn, record)


def find_existing_piece(content_hash: str) -> sqlite3.Row | None:
    """Busca una pieza ya persistida por hash, gestionando su propia conexión.

    Es el paso previo a la deduplicación de subidas.
    """
    with open_db() as conn:
        return find_piece_by_hash(conn, content_hash)


def find_piece_by_id(piece_id: str) -> sqlite3.Row | None:
    """Lee una pieza por su id, gestionando su propia conexión (B-006.1)."""
    with open_db() as conn:
        return get_piece(conn, piece_id)


def _user_row(conn: sqlite3.Connection, google_sub: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()


def find_user_by_google_sub(
    conn: sqlite3.Connection, google_sub: str
) -> sqlite3.Row | None:
    """Lee un usuario por su identificador estable de Google (U-005)."""
    return _user_row(conn, google_sub)


def find_user_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    """Lee un usuario por su correo, sin distinguir mayúsculas (U-005)."""
    if not email or not email.strip():
        return None
    return conn.execute(
        "SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),)
    ).fetchone()


def new_user_google(
    conn: sqlite3.Connection, google_sub: str, email: str | None, name: str | None, picture: str | None
) -> sqlite3.Row:
    """Inserta un usuario nuevo con color de burbuja aleatorio (U-005)."""
    conn.execute(
        "INSERT INTO users (google_sub, email, name, picture, bubble_color) VALUES (?, ?, ?, ?, ?)",
        (google_sub, email, name, picture, random_bubble_color()),
    )
    conn.commit()
    return _user_row(conn, google_sub)  # type: ignore[return-value]


def upsert_user(
    conn: sqlite3.Connection, record: Mapping[str, object]
) -> sqlite3.Row:
    """Inserta o actualiza el usuario del id_token de Google (U-005).

    Tres casos:
    - `google_sub` ya conocido: actualiza lo que Google puede haber cambiado
      (email, nombre, foto); `created_at`, el `id` interno y `bubble_color`
      quedan intactos.
    - Correo ya registrado sin ese `google_sub` (cuenta manual con contraseña
      o correo que llegó antes por otro camino): vincula el sub de Google a la
      fila existente y refresca el perfil, sin duplicar ni tocar el color.
    - Resto: fila nueva con `bubble_color` asignado al azar.
    """
    sub = str(record.get("google_sub") or "")
    if not sub:
        raise ValueError("upsert_user requiere el campo 'google_sub'")
    email = record.get("email")

    existing = _user_row(conn, sub)
    if existing:
        conn.execute(
            "UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), "
            "picture = COALESCE(?, picture), updated_at = datetime('now') "
            "WHERE google_sub = ?",
            (email, record.get("name"), record.get("picture"), sub),
        )
        conn.commit()
        return _user_row(conn, sub)  # type: ignore[return-value]

    if email:
        by_email = find_user_by_email(conn, str(email))
        if by_email:
            conn.execute(
                "UPDATE users SET google_sub = ?, name = COALESCE(?, name), "
                "picture = COALESCE(?, picture), updated_at = datetime('now') "
                "WHERE google_sub = ?",
                (sub, record.get("name"), record.get("picture"), by_email["google_sub"]),
            )
            conn.commit()
            return _user_row(conn, sub)  # type: ignore[return-value]

    return new_user_google(conn, sub, email, record.get("name"), record.get("picture"))


def upsert_manual_user(
    conn: sqlite3.Connection, record: Mapping[str, object]
) -> sqlite3.Row:
    """Inserta o actualiza al usuario con contraseña de la vía manual (U-005).

    Es la variante para las cuentas creadas sin Google (scripts, administrador):
    `google_sub` queda con el centinela `manual:<email en minúsculas>` hasta
    que el usuario vincule una cuenta de Google por correo. Si ya existe una
    fila con ese correo (Google, por ejemplo), solo le fija la contraseña.
    """
    email = str(record.get("email") or "").strip().lower()
    if not email:
        raise ValueError("upsert_manual_user requiere el campo 'email'")
    password_hash = record.get("password_hash")
    if not password_hash:
        raise ValueError("upsert_manual_user requiere 'password_hash'")
    sub = f"manual:{email}"

    existing = _user_row(conn, sub)
    if not existing:
        by_email = find_user_by_email(conn, email)
        if by_email:
            sub = str(by_email["google_sub"])
            existing = by_email

    if existing:
        conn.execute(
            "UPDATE users SET password_hash = ?, name = COALESCE(?, name), "
            "updated_at = datetime('now') WHERE google_sub = ?",
            (password_hash, record.get("name"), sub),
        )
        conn.commit()
        return _user_row(conn, sub)  # type: ignore[return-value]

    conn.execute(
        "INSERT INTO users (google_sub, email, name, password_hash, bubble_color) "
        "VALUES (?, ?, ?, ?, ?)",
        (sub, email, record.get("name"), password_hash, random_bubble_color()),
    )
    conn.commit()
    return _user_row(conn, sub)  # type: ignore[return-value]


def list_pieces(
    conn: sqlite3.Connection, source: str | None = None
) -> list[sqlite3.Row]:
    """Lista las piezas persistidas (B-027.3).

    Ordena el corpus antes que las subidas y, dentro de cada grupo, por
    compositor, opus e id, que es el orden natural del selector del frontend.
    """
    sql = "SELECT * FROM pieces"
    params: tuple[object, ...] = ()
    if source is not None:
        sql += " WHERE source = ?"
        params = (source,)
    sql += " ORDER BY CASE WHEN source = 'corpus' THEN 0 ELSE 1 END, composer, opus, id"
    return conn.execute(sql, params).fetchall()


def find_pieces(source: str | None = None) -> list[sqlite3.Row]:
    """Lista las piezas gestionando su propia conexión (B-027.3)."""
    with open_db() as conn:
        return list_pieces(conn, source)


SESSION_COLUMNS = (
    "id",
    "piece_id",
    "status",
    "control",
    "current_measure",
    "position_s",
    "created_at",
    "updated_at",
)

# Campos que el servicio puede cambiar una vez creada la sesión (B-012.1).
SESSION_UPDATABLE = ("status", "control", "current_measure", "position_s")

SESSION_EVENT_COLUMNS = ("session_id", "type", "pitch", "velocity", "t_s")


def insert_session(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Inserta una sesión de práctica; las columnas ausentes quedan NULL."""
    columns = [name for name in SESSION_COLUMNS if name in record]
    if "id" not in columns or "piece_id" not in columns:
        raise ValueError("insert_session requiere al menos 'id' y 'piece_id'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO sessions ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def get_session(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row | None:
    """Lee una sesión por su id."""
    return conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()


def update_session_state(conn: sqlite3.Connection, session_id: str, **fields: object) -> None:
    """Actualiza el estado vivo de una sesión (solo `SESSION_UPDATABLE`)."""
    invalid = set(fields) - set(SESSION_UPDATABLE)
    if invalid:
        raise ValueError(f"Campos de sesión no actualizables: {', '.join(sorted(invalid))}")
    if not fields:
        return
    assignments = ", ".join(f"{name} = ?" for name in fields)
    conn.execute(
        f"UPDATE sessions SET {assignments}, updated_at = datetime('now') WHERE id = ?",
        [*fields.values(), session_id],
    )
    conn.commit()


def insert_session_event(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Añade un evento MIDI al log de una sesión."""
    columns = [name for name in SESSION_EVENT_COLUMNS if name in record]
    if "session_id" not in columns or "type" not in columns:
        raise ValueError("insert_session_event requiere al menos 'session_id' y 'type'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO session_events ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def list_session_events(conn: sqlite3.Connection, session_id: str) -> list[sqlite3.Row]:
    """Devuelve los eventos de una sesión en orden de llegada."""
    return conn.execute(
        "SELECT * FROM session_events WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()


CHAT_MESSAGE_COLUMNS = ("chat_id", "role", "content", "tool_name")


def insert_chat_message(conn: sqlite3.Connection, record: Mapping[str, object]) -> None:
    """Añade un mensaje al log de una conversación (B-012.8)."""
    columns = [name for name in CHAT_MESSAGE_COLUMNS if name in record]
    if "chat_id" not in columns or "role" not in columns:
        raise ValueError("insert_chat_message requiere al menos 'chat_id' y 'role'")
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO chat_messages ({', '.join(columns)}) VALUES ({placeholders})",
        [record[name] for name in columns],
    )
    conn.commit()


def list_chat_messages(conn: sqlite3.Connection, chat_id: str, limit: int = 20) -> list[sqlite3.Row]:
    """Devuelve los últimos `limit` mensajes de una conversación, más recientes primero."""
    return conn.execute(
        "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
        (chat_id, limit),
    ).fetchall()


def save_chat_message(chat_id: str, role: str, content: str, tool_name: str | None = None) -> None:
    """Guarda un mensaje de conversación gestionando su propia conexión (B-012.8)."""
    with open_db() as conn:
        insert_chat_message(
            conn,
            {"chat_id": chat_id, "role": role, "content": content, "tool_name": tool_name},
        )


def get_chat_history(chat_id: str, limit: int = 20) -> list[sqlite3.Row]:
    """Lee el historial de una conversación en orden cronológico (B-012.8)."""
    with open_db() as conn:
        rows = list_chat_messages(conn, chat_id, limit)
        return list(reversed(rows))


def init_db(conn: sqlite3.Connection) -> list[str]:
    """Aplica las migraciones pendientes y devuelve sus versiones aplicadas."""
    applied: list[str] = []
    for script in pending_migrations(conn):
        conn.executescript(script.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (script.stem,))
        conn.commit()
        applied.append(script.stem)
    return applied
