# description: Endpoint GET /pieces/{id}/notes de B-006.1 (partitura ordenada con ventana).
# context: Contrato de la partitura reproducible; base del transporte de B-006.2.

"""Tests del endpoint de notas reproducibles de una pieza."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.catalog import load_catalog
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db, insert_piece
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
CATALOG_FILE = REPO_ROOT / "data" / "midi" / "catalog.json"
VALID_FIXTURE = REPO_ROOT / "data" / "midi" / "test_scale.mid"
CORRUPT_FIXTURE = REPO_ROOT / "backend" / "tests" / "fixtures" / "midi" / "corrupt.mid"


def _notes(piece_id: str, **params):
    return client.get(f"/api/v1/pieces/{piece_id}/notes", params=params)


def _upload(filename: str, content: bytes):
    return client.post(
        "/api/v1/pieces",
        files={"file": (filename, content, "audio/midi")},
    )


@pytest.fixture()
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalPieceStorage:
    """Apunta el storage a un temporal para no escribir en data/midi durante los tests."""
    isolated = LocalPieceStorage(tmp_path)
    monkeypatch.setattr(api, "storage", isolated)
    return isolated


def _insert_row(piece_id: str, stored_filename: str, size_bytes: int) -> None:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        insert_piece(
            conn,
            {
                "id": piece_id,
                "filename": "corrupt.mid",
                "stored_filename": stored_filename,
                "size_bytes": size_bytes,
                "extension": ".mid",
            },
        )
    finally:
        conn.close()


class TestPieceNotes:
    def test_upload_then_notes_are_ordered_by_time(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload("scale.mid", VALID_FIXTURE.read_bytes()).json()["id"]

        body = _notes(piece_id).json()

        assert body["piece_id"] == piece_id
        assert body["notes_total"] == len(body["notes"]) > 0
        starts = [note["start_seconds"] for note in body["notes"]]
        assert starts == sorted(starts)
        assert body["from_s"] is None
        assert body["to_s"] is None

    def test_repeated_calls_return_identical_scores(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload("scale.mid", VALID_FIXTURE.read_bytes()).json()["id"]

        assert _notes(piece_id).json() == _notes(piece_id).json()

    def test_window_filters_by_note_start(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload("scale.mid", VALID_FIXTURE.read_bytes()).json()["id"]
        full = _notes(piece_id).json()["notes"]
        from_s = full[0]["start_seconds"]
        to_s = full[-1]["start_seconds"]

        body = _notes(piece_id, from_s=from_s, to_s=to_s).json()

        assert body["from_s"] == from_s
        assert body["to_s"] == to_s
        assert body["notes_total"] == len(full)
        assert [n["start_seconds"] for n in body["notes"]] == [
            n["start_seconds"] for n in full if from_s <= n["start_seconds"] <= to_s
        ]

    def test_invalid_window_returns_stable_400(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload("scale.mid", VALID_FIXTURE.read_bytes()).json()["id"]

        reversed_response = _notes(piece_id, from_s=10.0, to_s=1.0)
        assert reversed_response.status_code == 400
        assert reversed_response.json()["detail"]["code"] == "invalid_window"

        negative_response = _notes(piece_id, from_s=-1.0)
        assert negative_response.status_code == 400
        assert negative_response.json()["detail"]["code"] == "invalid_window"

    def test_unknown_piece_returns_stable_404(self) -> None:
        response = _notes("no-existe")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "piece_not_found"

    def test_unreadable_midi_returns_stable_400(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        stored = isolated_storage.save("corrupt.mid", CORRUPT_FIXTURE.read_bytes())
        _insert_row("rota", stored, CORRUPT_FIXTURE.stat().st_size)

        response = _notes("rota")

        assert response.status_code == 400
        assert "code" in response.json()["detail"]

    def test_corpus_piece_resolves_through_catalog(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Entorno coherente como en producción: catálogo y corpus bajo la misma raíz.
        monkeypatch.setattr(settings, "midi_storage_path", str(REPO_ROOT / "data" / "midi"))
        load_catalog(CATALOG_FILE)

        response = _notes("p01")

        assert response.status_code == 200
        body = response.json()
        assert body["notes_total"] == len(body["notes"]) > 0
        assert body["tempo"] is not None
