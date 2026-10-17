# description: Acordes y manos en el contrato de la API (/notes y /preview) de B-009.3.
# context: Sin pedirlo la respuesta es la de hoy; con with_hands/with_chords llega la mano y el acorde.

"""Tests de los campos opcionales de pistas, manos y acordes del contrato (B-009.3)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.catalog import load_catalog
from piano_mentor.config import settings
from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

REPO_ROOT = Path(__file__).parent.parent.parent
CATALOG_FILE = REPO_ROOT / "data" / "midi" / "catalog.json"
MIXED_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "mixed_problems.mid"

# Contrato de antes de B-009.3: la respuesta sin pedir nada debe traer estas claves y ni una más.
NOTES_KEYS = {
    "piece_id",
    "tempo",
    "duration_seconds",
    "notes_total",
    "from_s",
    "to_s",
    "from_measure",
    "to_measure",
    "measures",
    "notes",
}
NOTE_KEYS = {"pitch", "start_seconds", "duration_seconds", "velocity", "channel", "track"}
PREVIEW_KEYS = {"filename", "tempo", "duration_seconds", "notes_total", "measures", "notes"}


def _upload_mixed_problems() -> str:
    """Sube el fixture que trae acorde, dos manos y cambio de tempo; devuelve su id."""
    response = client.post(
        "/api/v1/pieces",
        files={"file": ("mixed.mid", MIXED_FIXTURE.read_bytes(), "audio/midi")},
    )
    assert response.status_code == 200
    return response.json()["id"]


def _notes(piece_id: str, **params):
    return client.get(f"/api/v1/pieces/{piece_id}/notes", params=params)


def _preview(**params):
    return client.post(
        "/api/v1/pieces/preview",
        params=params,
        files={"file": ("mixed.mid", MIXED_FIXTURE.read_bytes(), "audio/midi")},
    )


class TestNotesContract:
    def test_without_flags_the_payload_is_the_one_from_before(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id).json()

        assert set(body) == NOTES_KEYS
        assert set(body["notes"][0]) == NOTE_KEYS

    def test_with_hands_adds_the_hand_of_each_note_and_the_tracks(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload_mixed_problems()
        plain = _notes(piece_id).json()

        body = _notes(piece_id, with_hands="true").json()

        assert set(body) == NOTES_KEYS | {"tracks"}
        assert body["notes"][0]["hand"] == "left"
        # 36 (izquierda) abre la pieza; 43 (izquierda) entra en el segundo compás.
        assert [note["hand"] for note in body["notes"]] == [
            "left",
            "right",
            "right",
            "right",
            "right",
            "left",
            "right",
        ]
        # Las notas siguen siendo las mismas: solo se les añade la mano.
        assert [
            {key: value for key, value in note.items() if key != "hand"} for note in body["notes"]
        ] == plain["notes"]
        tracks = body["tracks"]
        assert [track["track"] for track in tracks] == [1, 2]
        assert [track["hand"] for track in tracks] == ["right", "left"]
        assert [track["note_count"] for track in tracks] == [5, 2]
        assert [track["channels"] for track in tracks] == [[0], [9]]
        assert [(track["lowest_pitch"], track["highest_pitch"]) for track in tracks] == [
            (72, 84),
            (36, 43),
        ]

    def test_with_chords_groups_the_simultaneous_notes(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id, with_chords="true").json()

        assert set(body) == NOTES_KEYS | {"chords"}
        # El fixture abre con el acorde de la derecha y el bajo de la izquierda a la vez.
        assert body["chords"][0] == {"start_seconds": 0.0, "pitches": [36, 72, 76, 79]}
        assert [(chord["start_seconds"], chord["pitches"]) for chord in body["chords"][1:]] == [
            (0.5, [81]),
            (1.0, [43]),
            (1.5, [84]),
        ]

    def test_with_hands_and_chords_together(self, isolated_storage: LocalPieceStorage) -> None:
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id, with_hands="true", with_chords="true").json()

        assert set(body) == NOTES_KEYS | {"tracks", "chords"}
        assert all(note["hand"] in {"left", "right", "unknown"} for note in body["notes"])

    def test_window_keeps_the_chords_inside_it(self, isolated_storage: LocalPieceStorage) -> None:
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id, from_s=0.5, to_s=1.0, with_chords="true").json()

        assert [note["start_seconds"] for note in body["notes"]] == [0.5, 1.0]
        assert [chord["start_seconds"] for chord in body["chords"]] == [0.5, 1.0]

    def test_window_with_one_hand_keeps_its_hand(
        self, isolated_storage: LocalPieceStorage
    ) -> None:
        # La mano se decide sobre la pieza entera: una ventana con una sola mano no la vuelve `unknown`.
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id, from_s=1.0, to_s=1.05, with_hands="true").json()

        assert [note["pitch"] for note in body["notes"]] == [43]
        assert body["notes"][0]["hand"] == "left"
        assert [track["note_count"] for track in body["tracks"]] == [5, 2]

    def test_window_by_measure_also_accepts_hands(self, isolated_storage: LocalPieceStorage) -> None:
        piece_id = _upload_mixed_problems()

        body = _notes(piece_id, from_measure=0, to_measure=1, with_hands="true").json()

        assert body["from_measure"] == 0
        assert body["to_measure"] == 1
        assert "hand" in body["notes"][0]

    def test_corpus_piece_reports_the_two_hands(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "midi_storage_path", str(REPO_ROOT / "data" / "midi"))
        load_catalog(CATALOG_FILE)

        body = _notes("p01", with_hands="true").json()

        tracks = body["tracks"]
        assert [track["hand"] for track in tracks] == ["right", "left"]
        counts = {track["hand"]: track["note_count"] for track in tracks}
        hands = [note["hand"] for note in body["notes"]]
        assert hands.count("left") == counts["left"] > 0
        assert hands.count("right") == counts["right"] > 0


class TestPreviewContract:
    def test_without_flags_the_payload_is_the_one_from_before(self) -> None:
        body = _preview().json()

        assert set(body) == PREVIEW_KEYS
        assert set(body["notes"][0]) == NOTE_KEYS

    def test_with_hands_and_chords_serves_the_same_extra_fields(self) -> None:
        body = _preview(with_hands="true", with_chords="true").json()

        assert set(body) == PREVIEW_KEYS | {"tracks", "chords"}
        assert [track["hand"] for track in body["tracks"]] == ["right", "left"]
        assert body["chords"][0]["pitches"] == [36, 72, 76, 79]
