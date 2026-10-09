# description: Guardado y recuperación local de piezas.
# context: Confianza en el filesystem del MVP.

"""Tests del almacenamiento local de piezas MIDI (B-002.2)."""

from pathlib import Path

from piano_mentor.storage import LocalPieceStorage


def test_save_and_exists(tmp_path: Path) -> None:
    storage = LocalPieceStorage(tmp_path)
    piece_id = storage.save("test.mid", b"fake midi content")
    assert storage.exists(piece_id)


def test_save_creates_directory(tmp_path: Path) -> None:
    target = tmp_path / "new_folder"
    storage = LocalPieceStorage(target)
    piece_id = storage.save("test.mid", b"content")
    assert target.exists()
    assert storage.exists(piece_id)


def test_get_path(tmp_path: Path) -> None:
    storage = LocalPieceStorage(tmp_path)
    piece_id = storage.save("test.mid", b"content")
    path = storage.get_path(piece_id)
    assert path.parent == tmp_path
    assert path.name == piece_id


def test_not_exists(tmp_path: Path) -> None:
    storage = LocalPieceStorage(tmp_path)
    assert not storage.exists("nonexistent")


def test_save_generates_unique_ids(tmp_path: Path) -> None:
    storage = LocalPieceStorage(tmp_path)
    id1 = storage.save("test1.mid", b"content1")
    id2 = storage.save("test2.mid", b"content2")
    assert id1 != id2
