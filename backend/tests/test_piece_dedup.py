# description: Deduplicación por hash y procedencia (corpus vs upload) en POST /pieces.
# context: B-005.4+; una subida idéntica reutiliza la pieza existente en vez de duplicarla.

"""Tests de deduplicación por SHA-256 y marcado de procedencia."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.catalog import load_catalog
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage, content_hash

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
CATALOG_FILE = REPO_ROOT / "data" / "midi" / "catalog.json"
VALID_FIXTURE = REPO_ROOT / "data" / "midi" / "test_scale.mid"
CORPUS_FILE = REPO_ROOT / "data" / "midi" / "corpus" / "bach_minuet_g.mid"


def _upload(filename: str, content: bytes):
    return client.post(
        "/api/v1/pieces",
        files={"file": (filename, content, "audio/midi")},
    )


def _piece_count() -> int:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return conn.execute("SELECT COUNT(*) FROM pieces").fetchone()[0]
    finally:
        conn.close()


def _row(piece_id: str):
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return conn.execute("SELECT * FROM pieces WHERE id = ?", (piece_id,)).fetchone()
    finally:
        conn.close()


@pytest.fixture()
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalPieceStorage:
    """Apunta el storage a un temporal para no escribir en data/midi durante los tests."""
    isolated = LocalPieceStorage(tmp_path)
    monkeypatch.setattr(api, "storage", isolated)
    return isolated


def _files_on_disk(tmp_path: Path) -> list[Path]:
    """Archivos guardados por el storage, ignorando la base de datos del test."""
    return [entry for entry in tmp_path.iterdir() if entry.suffix != ".db"]


class TestDeduplicationByHash:
    def test_repeated_upload_returns_the_same_piece(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        content = VALID_FIXTURE.read_bytes()

        first = _upload("scale.mid", content)
        second = _upload("scale.mid", content)

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]
        assert _piece_count() == 1

    def test_duplicate_answer_is_marked_as_reused(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        content = VALID_FIXTURE.read_bytes()

        first = _upload("scale.mid", content)
        second = _upload("scale.mid", content)

        assert first.json()["deduplicated"] is False
        assert first.json()["status"] == "uploaded"
        assert second.json()["deduplicated"] is True
        assert second.json()["status"] == "existing"
        assert first.json()["metadata"] == second.json()["metadata"]

    def test_duplicate_does_not_write_a_second_file(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        content = VALID_FIXTURE.read_bytes()

        _upload("scale.mid", content)
        _upload("scale.mid", content)

        assert len(_files_on_disk(tmp_path)) == 1

    def test_new_upload_records_hash_and_source(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        content = VALID_FIXTURE.read_bytes()
        response = _upload("scale.mid", content)
        piece_id = response.json()["id"]

        assert response.json()["source"] == "upload"
        assert response.json()["deduplicated"] is False

        row = _row(piece_id)
        assert row["content_hash"] == content_hash(content)
        assert row["source"] == "upload"

    def test_different_content_creates_a_new_piece(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        first = _upload("scale.mid", VALID_FIXTURE.read_bytes())
        second = _upload("other.mid", CORPUS_FILE.read_bytes())

        assert first.json()["id"] != second.json()["id"]
        assert _piece_count() == 2


class TestCorpusProvenance:
    def test_catalog_rows_are_marked_as_corpus(self) -> None:
        load_catalog(CATALOG_FILE)

        row = _row("p01")
        assert row["source"] == "corpus"
        assert row["content_hash"] == content_hash(CORPUS_FILE.read_bytes())

    def test_upload_identical_to_corpus_reuses_the_catalog_piece(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        load_catalog(CATALOG_FILE)

        response = _upload("bach_minuet_g.mid", CORPUS_FILE.read_bytes())
        body = response.json()

        assert response.status_code == 200
        assert body["id"] == "p01"
        assert body["source"] == "corpus"
        assert body["deduplicated"] is True
        # No se crea una fila nueva: siguen siendo las 15 del catálogo.
        assert _piece_count() == 15
        assert _files_on_disk(tmp_path) == []

    def test_upload_identical_to_corpus_keeps_its_title(
        self, tmp_path: Path, isolated_storage: LocalPieceStorage
    ) -> None:
        load_catalog(CATALOG_FILE)

        row = _row(_upload("otro_nombre.mid", CORPUS_FILE.read_bytes()).json()["id"])
        assert row["title"] == "Minuet in G major"
        assert row["composer"] == "Johann Sebastian Bach"
