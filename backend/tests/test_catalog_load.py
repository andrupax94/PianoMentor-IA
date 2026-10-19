# description: Carga del catálogo: 17 piezas, idempotencia, licencia/fuente y fallo si falta algún MIDI.
# context: Confianza en el corpus cargado en SQLite (B-003.3); p16 es la pieza propia de B-012.1.

"""Tests de la carga del catálogo del corpus en SQLite."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from piano_mentor.catalog import CatalogError, ensure_catalog_loaded, load_catalog
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db

REPO_DATA_MIDI = Path(__file__).parent.parent.parent / "data" / "midi"
CATALOG_FILE = REPO_DATA_MIDI / "catalog.json"

# 16 piezas del corpus de terceros (Mutopia) + la pieza de práctica propia (p16).
CATALOG_PIECES = 17


def _count_pieces() -> int:
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
def catalog_dir(tmp_path: Path) -> Path:
    """Copia catalog.json y el corpus a un temporal para no tocar el repo."""
    shutil.copy(CATALOG_FILE, tmp_path / "catalog.json")
    shutil.copytree(REPO_DATA_MIDI / "corpus", tmp_path / "corpus")
    return tmp_path


class TestCatalogLoad:
    def test_catalog_file_has_the_expected_pieces(self) -> None:
        payload = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))

        assert len(payload["pieces"]) == CATALOG_PIECES

    def test_loads_all_versioned_pieces(self) -> None:
        assert load_catalog(CATALOG_FILE) == CATALOG_PIECES
        assert _count_pieces() == CATALOG_PIECES

    def test_load_is_idempotent(self) -> None:
        load_catalog(CATALOG_FILE)
        load_catalog(CATALOG_FILE)
        assert _count_pieces() == CATALOG_PIECES

    def test_license_and_source_are_registered(self) -> None:
        load_catalog(CATALOG_FILE)
        row = _row("p01")
        assert row["license"]
        assert row["source_url"].startswith("https://")
        assert row["difficulty"]
        assert row["title"] == "Minuet in G major"

    def test_own_practice_piece_is_registered(self) -> None:
        """p16 es nuestra (B-012.1): CC0, sin fuente externa y con las cuentas del fixture."""
        load_catalog(CATALOG_FILE)

        row = _row("p16")

        assert row["source"] == "corpus"
        assert row["license"] == "CC0-1.0"
        assert row["source_url"] is None
        assert row["difficulty"] == "principiante"
        assert row["notes_count"] == 22
        assert row["duration_s"] == 8.0
        assert row["tempo"] == 120.0  # calculado del propio MIDI

    def test_tempo_is_computed_from_the_midi(self) -> None:
        load_catalog(CATALOG_FILE)

        row = _row("p01")

        assert row["tempo"] is not None
        assert 20 <= row["tempo"] <= 240

    def test_referenced_midi_files_exist(self) -> None:
        payload = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
        missing = [
            e["file"] for e in payload["pieces"] if not (REPO_DATA_MIDI / e["file"]).is_file()
        ]
        assert missing == []

    def test_catalog_with_missing_file_writes_nothing(self, catalog_dir: Path) -> None:
        (catalog_dir / "corpus" / "bach_minuet_g.mid").unlink()
        with pytest.raises(CatalogError):
            load_catalog(catalog_dir / "catalog.json")
        assert _count_pieces() == 0

    def test_missing_catalog_raises(self, tmp_path: Path) -> None:
        with pytest.raises(CatalogError):
            load_catalog(tmp_path / "nope.json")


class TestEnsureCatalogLoaded:
    """Siembra perezosa del corpus al listar (B-027.4)."""

    def test_seeds_when_database_has_no_corpus(
        self, catalog_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "midi_storage_path", str(catalog_dir))

        assert ensure_catalog_loaded() == CATALOG_PIECES
        assert _count_pieces() == CATALOG_PIECES

    def test_is_noop_when_corpus_is_already_loaded(
        self, catalog_dir: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "midi_storage_path", str(catalog_dir))
        load_catalog(catalog_dir / "catalog.json")

        assert ensure_catalog_loaded() == 0
        assert _count_pieces() == CATALOG_PIECES

    def test_missing_catalog_returns_zero_and_writes_nothing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))

        assert ensure_catalog_loaded() == 0
        assert _count_pieces() == 0
