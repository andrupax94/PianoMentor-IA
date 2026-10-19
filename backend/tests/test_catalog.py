# description: Catálogo o listado base de piezas.
# context: Orden y acceso a piezas de demo.

"""Tests de integridad de data/midi/catalog.json (B-027.2)."""

import json
from pathlib import Path

import mido

CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "midi" / "catalog.json"
MIDI_ROOT = CATALOG_PATH.parent
COVERS_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "assets" / "covers"
)

# El catálogo mezcla dos cosas y cada una cumple reglas distintas:
#  - las 17 piezas de terceros (Mutopia) llevan fuente, licencia y portada;
#  - p16 es la pieza de práctica propia (B-012.1, CC0): no viene de fuera ni
#    tiene retrato que enseñar, así que no declara `source_url` ni `cover`.
THIRD_PARTY_PIECES = 17
OWN_PIECE_IDS = {"p16"}
TOTAL_PIECES = THIRD_PARTY_PIECES + len(OWN_PIECE_IDS)

REQUIRED_FIELDS = {"id", "title", "composer", "file", "license", "difficulty"}
THIRD_PARTY_ONLY_FIELDS = {"source_url", "cover"}
ALLOWED_DIFFICULTIES = {"principiante", "intermedio", "avanzado"}
ALLOWED_LICENSES = {"Public Domain", "CC BY-SA 3.0", "CC BY-SA 2.5", "CC0-1.0"}


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def third_party_pieces() -> list[dict]:
    return [piece for piece in load_catalog()["pieces"] if piece["id"] not in OWN_PIECE_IDS]


def own_pieces() -> list[dict]:
    return [piece for piece in load_catalog()["pieces"] if piece["id"] in OWN_PIECE_IDS]


def count_notes(path: Path) -> int:
    mid = mido.MidiFile(path)
    return sum(
        1
        for track in mid.tracks
        for msg in track
        if msg.type == "note_on" and msg.velocity > 0
    )


def test_catalog_has_third_party_pieces_and_own_pieces() -> None:
    catalog = load_catalog()
    assert len(catalog["pieces"]) == TOTAL_PIECES
    assert len(third_party_pieces()) == THIRD_PARTY_PIECES
    assert {piece["id"] for piece in own_pieces()} == OWN_PIECE_IDS


def test_piece_ids_unique_and_ordered() -> None:
    catalog = load_catalog()
    ids = [p["id"] for p in catalog["pieces"]]
    assert len(set(ids)) == TOTAL_PIECES
    assert ids == [f"p{i:02d}" for i in range(1, TOTAL_PIECES + 1)]


def test_each_piece_has_required_metadata() -> None:
    for piece in load_catalog()["pieces"]:
        missing = REQUIRED_FIELDS - set(piece.keys())
        assert not missing, f"{piece.get('id')}: faltan campos {missing}"
        assert piece["difficulty"] in ALLOWED_DIFFICULTIES
        assert piece["license"] in ALLOWED_LICENSES


def test_third_party_pieces_declare_source_and_cover() -> None:
    for piece in third_party_pieces():
        missing = THIRD_PARTY_ONLY_FIELDS - set(piece.keys())
        assert not missing, f"{piece['id']}: faltan campos {missing}"
        assert piece["source_url"].startswith("https://")


def test_own_pieces_do_not_claim_a_source() -> None:
    for piece in own_pieces():
        assert "source_url" not in piece, f"{piece['id']}: una pieza propia no tiene fuente externa"


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


def test_third_party_covers_point_to_public_assets() -> None:
    for piece in third_party_pieces():
        cover = piece["cover"]
        assert cover.startswith("/assets/covers/"), f"{piece['id']}: portada fuera de /assets/covers"
        assert cover.endswith(".jpg"), f"{piece['id']}: la portada no es un .jpg"


def test_referenced_covers_exist() -> None:
    # Las piezas sin portada (la propia y las subidas) las pinta el frontend con
    # las iniciales del título, así que aquí solo se comprueban las que la declaran.
    for piece in load_catalog()["pieces"]:
        cover = piece.get("cover")
        if cover is None:
            continue
        name = Path(cover).name
        assert (COVERS_ROOT / name).is_file(), f"{piece['id']}: no existe la portada {name}"
