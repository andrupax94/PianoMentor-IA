# description: Carga del catálogo: 15 piezas, idempotencia, licencia/fuente y fallo si falta algún MIDI.
# context: Confianza en el corpus cargado en SQLite (B-003.3).

"""Tests de la carga del catálogo del corpus en SQLite."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from piano_mentor.catalog import CatalogError, load_catalog
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db

REPO_DATA_MIDI = Path(__file__).parent.parent.parent / "data" / "midi"
CATALOG_FILE = REPO_DATA_MIDI / "catalog.json"


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
    def test_loads_all_versioned_pieces(self) -> None:
        expected = len(json.loads(CATALOG_FILE.read_text(encoding="utf-8"))["pieces"])
        assert expected == 15
        assert load_catalog(CATALOG_FILE) == expected
        assert _count_pieces() == expected

    def test_load_is_idempotent(self) -> None:
        load_catalog(CATALOG_FILE)
        load_catalog(CATALOG_FILE)
        assert _count_pieces() == 15

    def test_license_and_source_are_registered(self) -> None:
        load_catalog(CATALOG_FILE)
        row = _row("p01")
        assert row["license"]
        assert row["source_url"].startswith("https://")
        assert row["difficulty"]
        assert row["title"] == "Minuet in G major"

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
