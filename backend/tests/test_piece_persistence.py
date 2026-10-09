# description: Persistencia de POST /pieces: carga válida guardada, inválida sin escrituras y error de BD → 500.
# context: Confianza en la persistencia del endpoint (B-003.2).

"""Tests de integración de persistencia de metadatos de piezas."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.config import settings
from piano_mentor.database import connect, get_piece, init_db
from piano_mentor.main import app

client = TestClient(app)

FIXTURE_PATH = Path(__file__).parent.parent.parent / "data" / "midi" / "test_scale.mid"


def _upload(filename: str = "test_scale.mid", content: bytes | None = None):
    body = FIXTURE_PATH.read_bytes() if content is None else content
    return client.post(
        "/api/v1/pieces",
        files={"file": (filename, body, "audio/midi")},
    )


class TestPersistedUpload:
    def test_valid_upload_persists_metadata(self) -> None:
        response = _upload()
        assert response.status_code == 200
        piece_id = response.json()["id"]

        conn = connect(settings.database_url)
        try:
            row = get_piece(conn, piece_id)
        finally:
            conn.close()
        assert row is not None
        assert row["filename"] == "test_scale.mid"
        assert row["stored_filename"] == piece_id
        assert row["extension"] == ".mid"
        assert row["size_bytes"] == FIXTURE_PATH.stat().st_size
        assert row["created_at"]

    def test_persisted_id_matches_response(self) -> None:
        data = _upload().json()
        conn = connect(settings.database_url)
        try:
            row = get_piece(conn, data["id"])
        finally:
            conn.close()
        assert row["id"] == data["id"]

    def test_invalid_upload_writes_nothing(self) -> None:
        response = _upload("song.mp3", b"fake audio")
        assert response.status_code == 400

        conn = connect(settings.database_url)
        try:
            init_db(conn)
            count = conn.execute("SELECT COUNT(*) FROM pieces").fetchone()[0]
        finally:
            conn.close()
        assert count == 0

    def test_health_still_works_after_persistence(self) -> None:
        _upload()
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestPersistenceFailure:
    def test_database_failure_returns_500(self, monkeypatch) -> None:
        def broken_save(record):
            raise sqlite3.OperationalError("disk I/O error")

        monkeypatch.setattr(api, "save_piece", broken_save)
        response = _upload()
        assert response.status_code == 500
        assert response.json()["detail"]["code"] == "persistence_error"
