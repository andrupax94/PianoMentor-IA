"""Tests de integridad de data/midi/catalog.json (B-027.2)."""

import json
from pathlib import Path

import mido

CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "midi" / "catalog.json"
MIDI_ROOT = CATALOG_PATH.parent

REQUIRED_FIELDS = {"id", "title", "composer", "file", "source_url", "license", "difficulty"}
ALLOWED_DIFFICULTIES = {"principiante", "intermedio", "avanzado"}
ALLOWED_LICENSES = {"Public Domain", "CC BY-SA 3.0", "CC BY-SA 2.5"}


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def count_notes(path: Path) -> int:
    mid = mido.MidiFile(path)
    return sum(
        1
        for track in mid.tracks
        for msg in track
        if msg.type == "note_on" and msg.velocity > 0
    )


def test_catalog_has_15_pieces() -> None:
    catalog = load_catalog()
    assert len(catalog["pieces"]) == 15


def test_piece_ids_unique_and_ordered() -> None:
    catalog = load_catalog()
    ids = [p["id"] for p in catalog["pieces"]]
    assert len(set(ids)) == 15
    assert ids == [f"p{i:02d}" for i in range(1, 16)]


def test_each_piece_has_required_metadata() -> None:
    catalog = load_catalog()
    for piece in catalog["pieces"]:
        missing = REQUIRED_FIELDS - set(piece.keys())
        assert not missing, f"{piece.get('id')}: faltan campos {missing}"
        assert piece["difficulty"] in ALLOWED_DIFFICULTIES
        assert piece["license"] in ALLOWED_LICENSES
        assert piece["source_url"].startswith("https://")


def test_referenced_midi_files_exist_and_parse() -> None:
    catalog = load_catalog()
    for piece in catalog["pieces"]:
        path = MIDI_ROOT / piece["file"]
        assert path.exists(), f"{piece['id']}: no existe {path}"
        assert count_notes(path) > 0, f"{piece['id']}: sin notas"


def test_catalog_note_counts_match_files() -> None:
    catalog = load_catalog()
    for piece in catalog["pieces"]:
        path = MIDI_ROOT / piece["file"]
        assert piece["notes"] == count_notes(path), f"{piece['id']}: campo notes no coincide"
