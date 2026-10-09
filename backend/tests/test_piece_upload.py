# description: Integración del endpoint POST /pieces.
# context: Contrato de carga extremo a extremo.

"""Tests de integración para la carga de piezas MIDI (B-002.4)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.main import app

client = TestClient(app)

FIXTURE_PATH = Path(__file__).parent.parent.parent / "data" / "midi" / "test_scale.mid"


class TestHealthRegression:
    def test_health_still_works(self) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestPieceUpload:
    def test_upload_valid_midi(self) -> None:
        content = FIXTURE_PATH.read_bytes()
        response = client.post(
            "/api/v1/pieces",
            files={"file": ("test_scale.mid", content, "audio/midi")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_scale.mid"
        assert data["extension"] == ".mid"
        assert data["size_bytes"] == len(content)
        assert data["status"] == "uploaded"
        assert "id" in data

    def test_upload_invalid_extension(self) -> None:
        response = client.post(
            "/api/v1/pieces",
            files={"file": ("song.mp3", b"fake audio", "audio/mpeg")},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_extension"

    def test_upload_empty_file(self) -> None:
        response = client.post(
            "/api/v1/pieces",
            files={"file": ("empty.mid", b"", "audio/midi")},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "empty_file"

    def test_upload_path_traversal_rejected(self) -> None:
        response = client.post(
            "/api/v1/pieces",
            files={"file": ("../etc/passwd", b"fake", "audio/midi")},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_filename"
