# description: Conexión SQLite, carga de sqlite-vec, esquema pieces e idempotencia de migraciones.
# context: Confianza en la persistencia de metadatos.

"""Tests de conexión, extensión sqlite-vec y esquema de piezas."""

from __future__ import annotations

import sqlite3

import pytest

from piano_mentor.config import settings
from piano_mentor.database import (
    MIGRATIONS_DIR,
    _database_path,
    connect,
    init_db,
    pending_migrations,
)


class TestConnection:
    def test_connect_uses_settings_url(self, tmp_path, monkeypatch) -> None:
        db_file = tmp_path / "settings.db"
        monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_file.as_posix()}")
        conn = connect()
        try:
            assert isinstance(conn, sqlite3.Connection)
            assert db_file.exists()
            assert conn.execute("SELECT 1").fetchone()[0] == 1
        finally:
            conn.close()

    def test_sqlite_vec_extension_loaded(self) -> None:
        conn = connect("sqlite:///:memory:")
        try:
            version = conn.execute("SELECT vec_version()").fetchone()[0]
            assert version.startswith("v")
        finally:
            conn.close()

    def test_rows_returned_as_dict_like(self) -> None:
        conn = connect("sqlite:///:memory:")
        try:
            row = conn.execute("SELECT 1 AS value").fetchone()
            assert row["value"] == 1
        finally:
            conn.close()

    def test_creates_parent_directory(self, tmp_path) -> None:
        db_file = tmp_path / "nested" / "piano.db"
        conn = connect(f"sqlite:///{db_file.as_posix()}")
        try:
            assert db_file.exists()
        finally:
            conn.close()

    def test_rejects_non_sqlite_url(self) -> None:
        with pytest.raises(ValueError, match="DATABASE_URL"):
            _database_path("postgresql://localhost/piano")


class TestSchema:
    def test_pieces_table_created(self, tmp_path) -> None:
        conn = connect(f"sqlite:///{(tmp_path / 'pieces.db').as_posix()}")
        try:
            init_db(conn)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(pieces)").fetchall()}
            expected = {
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
                "created_at",
            }
            assert expected <= columns
        finally:
            conn.close()

    def test_musical_metadata_is_nullable(self, tmp_path) -> None:
        conn = connect(f"sqlite:///{(tmp_path / 'nullable.db').as_posix()}")
        try:
            init_db(conn)
            conn.execute(
                "INSERT INTO pieces (id, filename) VALUES (?, ?)",
                ("abc123", "scale.mid"),
            )
            conn.commit()
            row = conn.execute(
                "SELECT title, tracks, duration_s, created_at FROM pieces WHERE id = ?",
                ("abc123",),
            ).fetchone()
            assert row["title"] is None
            assert row["tracks"] is None
            assert row["duration_s"] is None
            assert row["created_at"]
        finally:
            conn.close()

    def test_no_session_tables(self, tmp_path) -> None:
        conn = connect(f"sqlite:///{(tmp_path / 'sessions.db').as_posix()}")
        try:
            init_db(conn)
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            assert "sessions" not in tables
            assert "events" not in tables
        finally:
            conn.close()

    def test_init_db_is_reproducible_and_idempotent(self, tmp_path) -> None:
        url = f"sqlite:///{(tmp_path / 'idempotent.db').as_posix()}"
        conn = connect(url)
        try:
            first = init_db(conn)
            second = init_db(conn)
            # Se aplican todas las migraciones versionadas, en orden.
            assert first == sorted(script.stem for script in MIGRATIONS_DIR.glob("*.sql"))
            assert second == []
            applied = conn.execute(
                "SELECT version FROM schema_migrations ORDER BY version"
            ).fetchall()
            assert [row["version"] for row in applied] == first
        finally:
            conn.close()

    def test_pending_migrations_lists_unapplied(self, tmp_path) -> None:
        conn = connect(f"sqlite:///{(tmp_path / 'pending.db').as_posix()}")
        try:
            assert len(pending_migrations(conn)) >= 1
            init_db(conn)
            assert pending_migrations(conn) == []
        finally:
            conn.close()


class TestDefaultConfiguration:
    def test_default_url_is_sqlite(self) -> None:
        assert _database_path(settings.database_url)
