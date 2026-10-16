# description: Endpoint GET /pieces del selector de catálogo (B-027.3).
# context: Listado de piezas para la Library; corpus primero y portada incluida.

"""Tests del listado de piezas que alimenta el selector del frontend."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.catalog import load_catalog
from piano_mentor.config import settings
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
CATALOG_FILE = REPO_ROOT / "data" / "midi" / "catalog.json"
VALID_FIXTURE = REPO_ROOT / "data" / "midi" / "test_scale.mid"


@pytest.fixture()
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalPieceStorage:
    """Apunta el storage a un temporal para no escribir en data/midi durante los tests."""
    isolated = LocalPieceStorage(tmp_path)
    monkeypatch.setattr(api, "storage", isolated)
    return isolated


def _load_corpus(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catálogo y corpus bajo la misma raíz, como en producción."""
    monkeypatch.setattr(settings, "midi_storage_path", str(REPO_ROOT / "data" / "midi"))
    load_catalog(CATALOG_FILE)


class TestPieceList:
    def test_empty_database_returns_empty_list(self) -> None:
        response = client.get("/api/v1/pieces")

        assert response.status_code == 200
        assert response.json() == []

    def test_corpus_listing_exposes_cover_and_metadata(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _load_corpus(monkeypatch)

        response = client.get("/api/v1/pieces", params={"source": "corpus"})

        assert response.status_code == 200
        pieces = response.json()
        assert len(pieces) == 15
        by_id = {piece["id"]: piece for piece in pieces}
        assert by_id["p01"]["cover"] == "/assets/covers/bach.jpg"
        assert by_id["p12"]["cover"] == "/assets/covers/chopin.jpg"
        assert by_id["p01"]["composer"] == "Johann Sebastian Bach"
        assert by_id["p01"]["duration_seconds"] is not None
        assert by_id["p01"]["tempo"] is not None
        assert by_id["p01"]["difficulty"] == "principiante"

    def test_order_puts_corpus_before_uploads(
        self, isolated_storage: LocalPieceStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _load_corpus(monkeypatch)
        client.post(
            "/api/v1/pieces",
            files={"file": ("scale.mid", VALID_FIXTURE.read_bytes(), "audio/midi")},
        )

        pieces = client.get("/api/v1/pieces").json()

        assert len(pieces) == 16
        assert pieces[0]["source"] == "corpus"
        assert pieces[-1]["source"] == "upload"
        # Las subidas no tienen portada hasta que exista una generada.
        assert pieces[-1]["cover"] is None

    def test_unknown_source_returns_empty(self) -> None:
        response = client.get("/api/v1/pieces", params={"source": "nope"})

        assert response.status_code == 200
        assert response.json() == []
