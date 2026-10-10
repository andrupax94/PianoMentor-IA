# description: Integración de metadatos musicales en POST /pieces (B-005.4).
# context: Confirma que la carga rellena, persiste y devuelve tracks, duración, tempo y notas.

"""Tests de integración del cable motor MIDI -> carga de piezas."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.config import settings
from piano_mentor.database import connect, get_piece, init_db
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
VALID_FIXTURE = REPO_ROOT / "data" / "midi" / "test_scale.mid"
CORRUPT_FIXTURE = REPO_ROOT / "backend" / "tests" / "fixtures" / "midi" / "corrupt.mid"


def _upload(filename: str, content: bytes):
    return client.post(
        "/api/v1/pieces",
        files={"file": (filename, content, "audio/midi")},
    )


class TestMusicalMetadataInUpload:
    def _isolated_storage(self, tmp_path: Path, monkeypatch) -> LocalPieceStorage:
        """Apunta el storage a un directorio temporal para poder contar huérfanos."""
        isolated = LocalPieceStorage(tmp_path)
        monkeypatch.setattr(api, "storage", isolated)
        return isolated

    def test_upload_returns_real_musical_metadata(self) -> None:
        response = _upload("test_scale.mid", VALID_FIXTURE.read_bytes())
        assert response.status_code == 200
        metadata = response.json()["metadata"]
        assert metadata["tracks"] == 1
        assert metadata["notes_count"] == 3
        assert metadata["tempo"] == 120.0
        assert metadata["duration_seconds"] == 1.5

    def test_upload_persists_musical_metadata_in_database(self) -> None:
        response = _upload("test_scale.mid", VALID_FIXTURE.read_bytes())
        piece_id = response.json()["id"]

        conn = connect(settings.database_url)
        try:
            row = get_piece(conn, piece_id)
        finally:
            conn.close()

        assert row is not None
        assert row["tracks"] == 1
        assert row["notes_count"] == 3
        assert row["tempo"] == 120.0
        assert row["duration_s"] == 1.5

    def test_unreadable_midi_returns_400_with_stable_code(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        self._isolated_storage(tmp_path, monkeypatch)
        response = _upload("corrupt.mid", CORRUPT_FIXTURE.read_bytes())
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_midi_content"

    def test_unreadable_midi_leaves_no_orphan_file(self, tmp_path: Path, monkeypatch) -> None:
        self._isolated_storage(tmp_path, monkeypatch)
        response = _upload("corrupt.mid", CORRUPT_FIXTURE.read_bytes())
        assert response.status_code == 400
        # No debe quedar el archivo MIDI que se guardó antes de fallar el parsing.
        # test.db es la base aislada del test, que la búsqueda de duplicados crea
        # al inicio; no cuenta como huérfano.
        leftovers = [entry.name for entry in tmp_path.iterdir() if entry.suffix != ".db"]
        assert leftovers == []

    def test_unreadable_midi_writes_no_database_row(self, tmp_path: Path, monkeypatch) -> None:
        self._isolated_storage(tmp_path, monkeypatch)
        _upload("corrupt.mid", CORRUPT_FIXTURE.read_bytes())

        conn = connect(settings.database_url)
        try:
            init_db(conn)
            count = conn.execute("SELECT COUNT(*) FROM pieces").fetchone()[0]
        finally:
            conn.close()
        assert count == 0

    def test_health_still_works_after_musical_metadata(self) -> None:
        _upload("test_scale.mid", VALID_FIXTURE.read_bytes())
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
