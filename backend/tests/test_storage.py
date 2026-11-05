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

from piano_mentor.storage import R2PieceStorage


class _FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body):
        self.objects[Key] = Body
        return {}

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise Exception("404")
        return {}

    def download_file(self, Bucket, Key, Filename):
        if Key not in self.objects:
            raise FileNotFoundError(Key)
        Path(Filename).write_bytes(self.objects[Key])

    def delete_object(self, *, Bucket, Key):
        self.objects.pop(Key, None)
        return {}


def test_r2_save_get_delete(tmp_path: Path) -> None:
    fake = _FakeS3()
    storage = R2PieceStorage(
        bucket="b",
        endpoint_url="https://example.r2",
        access_key_id="k",
        secret_access_key="s",
        client=fake,
        cache_dir=tmp_path / "cache",
    )
    piece_id = storage.save("test.mid", b"midi bytes")
    assert storage.exists(piece_id)
    path = storage.get_path(piece_id)
    assert path.read_bytes() == b"midi bytes"
    storage.delete(piece_id)
    assert not storage.exists(piece_id)
