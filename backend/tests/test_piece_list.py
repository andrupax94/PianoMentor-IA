# description: Endpoint GET /pieces del selector de catálogo (B-027.3).
# context: Listado de piezas para la Library; corpus primero y portada incluida.

"""Tests del listado de piezas que alimenta el selector del frontend."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.catalog import load_catalog
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
CATALOG_FILE = REPO_ROOT / "data" / "midi" / "catalog.json"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"
VALID_FIXTURE = FIXTURES_DIR / "test_scale.mid"

# Piezas que trae el catálogo: 15 de terceros (Mutopia) + la pieza de práctica
# propia (p16). Se cuenta del propio catálogo para que no haya números mágicos.
CATALOG_PIECES = len(json.loads(CATALOG_FILE.read_text(encoding="utf-8"))["pieces"])


def _point_to_corpus(monkeypatch: pytest.MonkeyPatch) -> None:
    """Apunta la ruta MIDI al corpus versionado del repositorio."""
    monkeypatch.setattr(settings, "midi_storage_path", str(REPO_ROOT / "data" / "midi"))


def _load_corpus(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catálogo y corpus bajo la misma raíz, como en producción."""
    _point_to_corpus(monkeypatch)
    load_catalog(CATALOG_FILE)


class TestPieceList:
    def test_empty_database_returns_empty_list(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        # Sin catálogo en la ruta MIDI la siembra no encuentra nada, avisa y no falla.
        monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))

        with caplog.at_level(logging.WARNING, logger="piano_mentor.catalog"):
            response = client.get("/api/v1/pieces")

        assert response.status_code == 200
        assert response.json() == []
        assert any(record.levelno == logging.WARNING for record in caplog.records)

    def test_corpus_listing_exposes_cover_and_metadata(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _load_corpus(monkeypatch)

        response = client.get("/api/v1/pieces", params={"source": "corpus"})

        assert response.status_code == 200
        pieces = response.json()
        assert len(pieces) == CATALOG_PIECES
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

        assert len(pieces) == CATALOG_PIECES + 1
        assert pieces[0]["source"] == "corpus"
        assert pieces[-1]["source"] == "upload"
        # Las subidas no tienen portada hasta que exista una generada.
        assert pieces[-1]["cover"] is None

    def test_unknown_source_returns_empty(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))

        response = client.get("/api/v1/pieces", params={"source": "nope"})

        assert response.status_code == 200
        assert response.json() == []


def _piece_count() -> int:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return conn.execute("SELECT COUNT(*) FROM pieces").fetchone()[0]
    finally:
        conn.close()


class TestCatalogSeeding:
    """GET /pieces siembra el corpus cuando la base no lo tiene (B-027.4)."""

    def test_seeds_corpus_when_database_is_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _point_to_corpus(monkeypatch)

        assert _piece_count() == 0

        response = client.get("/api/v1/pieces", params={"source": "corpus"})

        assert response.status_code == 200
        assert len(response.json()) == CATALOG_PIECES
        assert _piece_count() == CATALOG_PIECES

    def test_seeding_happens_once_and_not_on_every_request(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _point_to_corpus(monkeypatch)
        assert len(client.get("/api/v1/pieces").json()) == CATALOG_PIECES

        # Aunque el catálogo desaparezca, la base ya sembrada se sirve tal cual:
        # la segunda petición no vuelve a leer ni a vaciar la tabla.
        monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))

        assert len(client.get("/api/v1/pieces").json()) == CATALOG_PIECES

    def test_uploads_do_not_block_corpus_seeding(
        self, isolated_storage: LocalPieceStorage, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client.post(
            "/api/v1/pieces",
            files={"file": ("scale.mid", VALID_FIXTURE.read_bytes(), "audio/midi")},
        )
        # Hay una subida, pero ningún corpus: la primera lista lo siembra igual.
        _point_to_corpus(monkeypatch)

        pieces = client.get("/api/v1/pieces").json()

        assert len(pieces) == CATALOG_PIECES + 1
        assert pieces[0]["source"] == "corpus"
