# description: Conexión SQLite + sqlite-vec (DATABASE_URL), migraciones SQL versionadas e inserción de metadatos de piezas.
# context: Persistencia de piezas (B-003.2/B-003.3); reutilizable por B-012.

"""Conexión reutilizable a SQLite con sqlite-vec y migraciones SQL versionadas."""

from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from pathlib import Path

import sqlite_vec

from .config import settings

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
    """Abre una conexión SQLite con sqlite-vec cargado y filas como `sqlite3.Row`."""
    path = _database_path(database_url or settings.database_url)
    if path != ":memory:":
        Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    try:
        sqlite_vec.load(conn)
    finally:
        conn.enable_load_extension(False)
    return conn


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
    "license",
    "source_url",
    "difficulty",
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


def get_piece(conn: sqlite3.Connection, piece_id: str) -> sqlite3.Row | None:
    """Lee una pieza persistida por su id."""
    return conn.execute("SELECT * FROM pieces WHERE id = ?", (piece_id,)).fetchone()


def save_piece(record: Mapping[str, object]) -> None:
    """Persiste metadatos en `DATABASE_URL` creando el esquema si hace falta (B-003.2)."""
    conn = connect()
    try:
        init_db(conn)
        insert_piece(conn, record)
    finally:
        conn.close()


def init_db(conn: sqlite3.Connection) -> list[str]:
    """Aplica las migraciones pendientes y devuelve sus versiones aplicadas."""
    applied: list[str] = []
    for script in pending_migrations(conn):
        conn.executescript(script.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (script.stem,))
        conn.commit()
        applied.append(script.stem)
    return applied
