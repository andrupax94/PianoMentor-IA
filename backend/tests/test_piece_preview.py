# description: Integración del endpoint efímero POST /pieces/preview.
# context: B-027.3; un MIDI subido a mano se escucha sin persistirse.

"""Tests del previsualizador de MIDI para el piano (B-027.3)."""

from pathlib import Path

from fastapi.testclient import TestClient

from piano_mentor.config import settings
from piano_mentor.database import find_pieces
from piano_mentor.main import app

client = TestClient(app)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "midi" / "test_scale.mid"
PREVIEW_URL = "/api/v1/pieces/preview"


def storage_files() -> set[Path]:
    """Ficheros presentes en el almacén MIDI; base para comprobar que no crece."""
    root = Path(settings.midi_storage_path)
    if not root.is_dir():
        return set()
    return {path for path in root.rglob("*") if path.is_file()}


class TestPiecePreview:
    def test_devuelve_la_partitura_lista_para_reproducir(self) -> None:
        content = FIXTURE_PATH.read_bytes()

        response = client.post(PREVIEW_URL, files={"file": ("test_scale.mid", content, "audio/midi")})

        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_scale.mid"
        assert data["notes_total"] > 0
        assert len(data["notes"]) == data["notes_total"]
        assert data["tempo"] is not None
        assert data["duration_seconds"] > 0
        assert data["measures"]["count"] > 0
        # Ordenadas por tiempo: es el contrato que consume el transporte.
        starts = [note["start_seconds"] for note in data["notes"]]
        assert starts == sorted(starts)

    def test_no_deja_fila_ni_archivo(self) -> None:
        before = storage_files()
        content = FIXTURE_PATH.read_bytes()

        response = client.post(PREVIEW_URL, files={"file": ("test_scale.mid", content, "audio/midi")})

        assert response.status_code == 200
        assert find_pieces(None) == []
        assert storage_files() == before

    def test_rechaza_extension_no_permitida(self) -> None:
        response = client.post(PREVIEW_URL, files={"file": ("song.mp3", b"fake audio", "audio/mpeg")})

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_extension"

    def test_rechaza_archivo_vacio(self) -> None:
        response = client.post(PREVIEW_URL, files={"file": ("empty.mid", b"", "audio/midi")})

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "empty_file"

    def test_rechaza_contenido_ilegible(self) -> None:
        response = client.post(
            PREVIEW_URL, files={"file": ("roto.mid", b"no soy un midi", "audio/midi")}
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_midi_content"
