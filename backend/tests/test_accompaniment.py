# description: Acompañamiento del agente (B-012.7): recorte por mano y sección, plan, difusión WS y medida de latencia.
# context: La IA toca una mano mientras el estudiante la otra; cubre el motor puro, el servicio con dependencias inyectadas y el endpoint (control intacto, notas relativas, ping/pong y rechazos).

"""Tests de B-012.7: acompañamiento determinista y su ejecución por la API."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.accompaniment import (
    ACCOMPANY_MAX_RTT_MS,
    AccompanimentService,
    build_accompaniment,
    student_hand_for,
)
from piano_mentor.main import app
from piano_mentor.midi import MidiParseError, NormalizedNote
from piano_mentor.storage import LocalPieceStorage
from piano_mentor.validators import ValidationError

client = TestClient(app)

FIXTURES = Path(__file__).parent / "fixtures" / "midi"


def note(
    pitch: int,
    *,
    track: int,
    start: float = 0.0,
    duration: float = 0.5,
    velocity: int = 64,
) -> NormalizedNote:
    """Nota normalizada de laboratorio con tiempo explícito."""
    return NormalizedNote(
        pitch=pitch,
        start_seconds=start,
        duration_seconds=duration,
        velocity=velocity,
        channel=0,
        track=track,
    )


# Dos pistas: la grave (2) es la izquierda y la aguda (1) la derecha (B-009.2).
TWO_HANDS = [
    note(48, track=2, start=0.0, duration=2.0),
    note(55, track=2, start=0.0, duration=2.0),
    note(72, track=1, start=0.0),
    note(74, track=1, start=0.5),
    note(45, track=2, start=2.0, duration=2.0),
    note(77, track=1, start=2.5),
]


class TestBuildAccompaniment:
    def test_filters_the_hand_and_shifts_to_the_section_start(self) -> None:
        plan = build_accompaniment(
            TWO_HANDS,
            "left",
            from_s=2.0,
            to_s=4.0,
            from_measure=1,
            to_measure=2,
        )

        assert [n.pitch for n in plan.notes] == [45]
        # El tiempo es relativo al inicio de la sección, no de la pieza.
        assert plan.notes[0].start_s == 0.0
        assert plan.notes[0].duration_s == 2.0
        assert plan.duration_s == 2.0
        assert plan.student_hand == "right"

    def test_right_hand_leaves_the_left_to_the_student(self) -> None:
        plan = build_accompaniment(
            TWO_HANDS, "right", from_s=0.0, to_s=4.0, from_measure=0, to_measure=2
        )

        assert [n.pitch for n in plan.notes] == [72, 74, 77]
        assert plan.student_hand == "left"

    def test_both_hands_plays_everything(self) -> None:
        plan = build_accompaniment(
            TWO_HANDS, "both", from_s=0.0, to_s=4.0, from_measure=0, to_measure=2
        )

        assert [n.pitch for n in plan.notes] == [48, 55, 72, 74, 45, 77]
        assert plan.student_hand is None

    def test_notes_starting_after_the_section_are_left_out(self) -> None:
        plan = build_accompaniment(
            TWO_HANDS, "right", from_s=0.0, to_s=1.0, from_measure=0, to_measure=1
        )

        # 72 (0.0) y 74 (0.5) caen dentro; 77 (2.5) no.
        assert [n.pitch for n in plan.notes] == [72, 74]

    def test_a_hand_without_notes_is_rejected(self) -> None:
        # Una sola pista con notas queda en `unknown`: no hay mano que acompañar.
        with pytest.raises(ValidationError) as error:
            build_accompaniment(
                [note(60, track=0)],
                "left",
                from_s=0.0,
                to_s=1.0,
                from_measure=0,
                to_measure=1,
            )

        assert error.value.code == "action_not_allowed_now"

    def test_an_unknown_hand_is_rejected(self) -> None:
        with pytest.raises(ValidationError) as error:
            build_accompaniment(
                TWO_HANDS, "middle", from_s=0.0, to_s=1.0, from_measure=0, to_measure=1
            )

        assert error.value.code == "action_params_out_of_range"

    def test_payload_carries_the_section_and_the_notes(self) -> None:
        plan = build_accompaniment(
            TWO_HANDS, "left", from_s=0.0, to_s=2.0, from_measure=0, to_measure=1, tempo_factor=0.9
        )
        payload = plan.as_payload()

        assert payload["hand"] == "left"
        assert payload["student_hand"] == "right"
        assert payload["from_measure"] == 0
        assert payload["to_measure"] == 1
        assert payload["from_s"] == 0.0
        assert payload["duration_s"] == 2.0
        assert payload["tempo_factor"] == 0.9
        assert payload["notes"] == [
            {"pitch": 48, "start_s": 0.0, "duration_s": 2.0, "velocity": 64},
            {"pitch": 55, "start_s": 0.0, "duration_s": 2.0, "velocity": 64},
        ]


class TestStudentHand:
    def test_the_student_plays_the_other_hand(self) -> None:
        assert student_hand_for("left") == "right"
        assert student_hand_for("right") == "left"
        assert student_hand_for("both") is None


class TestAccompanimentService:
    """El servicio resuelve sesión, pieza y sección con dependencias inyectadas."""

    def _service(self, grid_count: int = 4, session: object | None = None) -> AccompanimentService:
        class Grid:
            count = grid_count

            def resolve_range(self, start: int, end: int) -> tuple[float, float]:
                if not 0 <= start < end <= self.count:
                    raise MidiParseError(
                        "invalid_measure_range", f"Rango fuera de límites: {start}..{end}"
                    )
                return (float(start * 2), float(end * 2))

        def read_session(session_id: str) -> object:
            if session is not None:
                return session
            return {
                "session_id": session_id,
                "piece_id": "p1",
                "current_measure": 1,
            }

        return AccompanimentService(
            session_reader=read_session,
            piece_lookup=lambda piece_id: {"id": piece_id},
            note_reader=lambda row: TWO_HANDS,
            grid_reader=lambda row: Grid(),
        )

    def test_defaults_to_the_current_measure_and_four_measures(self) -> None:
        plan = self._service().plan("s1", hand="left")

        assert plan.from_measure == 1
        assert plan.to_measure == 4  # 1 + 4, recortado al final de la pieza
        assert (plan.from_s, plan.to_s) == (2.0, 8.0)

    def test_reads_the_session_row_as_sqlite_returns_it(self) -> None:
        """`read_session` devuelve `sqlite3.Row`, que no tiene `.get()` (regresión)."""
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.execute(
            "CREATE TABLE sessions (id TEXT, piece_id TEXT, current_measure INTEGER)"
        )
        connection.execute("INSERT INTO sessions VALUES ('s1', 'p1', 1)")
        row = connection.execute("SELECT * FROM sessions").fetchone()

        plan = self._service(session=row).plan("s1", hand="left")

        assert (plan.from_measure, plan.to_measure) == (1, 4)

    def test_caps_the_default_section_at_the_last_measure(self) -> None:
        plan = self._service(grid_count=2).plan("s1", hand="left")

        assert (plan.from_measure, plan.to_measure) == (1, 2)

    def test_rejects_a_section_beyond_the_piece(self) -> None:
        with pytest.raises(ValidationError) as error:
            self._service().plan("s1", hand="left", from_measure=2, to_measure=9)

        assert error.value.code == "invalid_measure_range"

    def test_unknown_piece_is_not_found(self) -> None:
        service = AccompanimentService(
            session_reader=lambda session_id: {"piece_id": "nope", "current_measure": 0},
            piece_lookup=lambda piece_id: None,
            note_reader=lambda row: TWO_HANDS,
            grid_reader=lambda row: None,  # nunca se llega
        )

        with pytest.raises(ValidationError) as error:
            service.plan("s1")

        assert error.value.code == "piece_not_found"


# --- Ejecución por la API -----------------------------------------------------


@pytest.fixture()
def piece_id(isolated_storage: LocalPieceStorage) -> str:
    """Pieza de práctica con dos pistas: izquierda (2) y derecha (1)."""
    response = client.post(
        "/api/v1/pieces",
        files={
            "file": (
                "practice_phrase.mid",
                (FIXTURES / "practice_phrase.mid").read_bytes(),
                "audio/midi",
            )
        },
    )
    assert response.status_code == 200
    return response.json()["id"]


@pytest.fixture()
def session_id(piece_id: str) -> str:
    response = client.post("/api/v1/sessions", json={"piece_id": piece_id})
    assert response.status_code == 201
    return response.json()["id"]


def _control(session_id: str) -> str:
    response = client.get(f"/api/v1/sessions/{session_id}/state")
    assert response.status_code == 200
    return response.json()["control"]


class TestAccompanyEndpoint:
    def test_accompany_keeps_the_student_in_control(self, session_id: str) -> None:
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={
                "action": "accompany",
                "params": {"hand": "left", "from_measure": 0, "to_measure": 2},
            },
        )

        assert response.status_code == 200
        assert response.json()["action"] == "accompany"
        assert _control(session_id) == "student"

    def test_accompany_without_measures_uses_the_current_one(self, session_id: str) -> None:
        """Sin compases la sección sale de la sesión: con `sqlite3.Row` daba 500."""
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            response = client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "accompany", "params": {"hand": "left"}},
            )
            message = websocket.receive_json()

        assert response.status_code == 200
        assert message["action"] == "accompany"
        # La pieza de práctica tiene 4 compases: 0 → 4 (fin exclusivo).
        assert (message["from_measure"], message["to_measure"]) == (0, 4)

    def test_accompany_broadcasts_the_hand_and_its_notes(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={
                    "action": "accompany",
                    "params": {
                        "hand": "left",
                        "from_measure": 0,
                        "to_measure": 2,
                        "tempo_factor": 0.9,
                    },
                },
            )
            message = websocket.receive_json()

        assert message["type"] == "agent_action"
        assert message["action"] == "accompany"
        assert message["hand"] == "left"
        assert message["student_hand"] == "right"
        assert message["from_measure"] == 0
        assert message["to_measure"] == 2
        assert message["from_s"] == 0.0
        assert message["duration_s"] == 4.0
        assert message["tempo_factor"] == 0.9
        # Solo las notas graves de la pista 2 (la mano izquierda).
        assert [n["pitch"] for n in message["notes"]] == [48, 55, 45, 52]
        assert all(n["start_s"] >= 0 for n in message["notes"])

    def test_accompany_defaults_to_the_left_hand(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "accompany", "params": {"from_measure": 0, "to_measure": 1}},
            )
            message = websocket.receive_json()

        assert message["hand"] == "left"
        assert message["notes"]

    def test_a_hand_without_notes_is_rejected(self, isolated_storage: LocalPieceStorage) -> None:
        """Una pieza de una sola pista no tiene mano izquierda que acompañar."""
        response = client.post(
            "/api/v1/pieces",
            files={
                "file": (
                    "single_track.mid",
                    (FIXTURES / "single_track.mid").read_bytes(),
                    "audio/midi",
                )
            },
        )
        assert response.status_code == 200
        session = client.post("/api/v1/sessions", json={"piece_id": response.json()["id"]})
        session_id = session.json()["id"]

        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={
                "action": "accompany",
                "params": {"hand": "left", "from_measure": 0, "to_measure": 1},
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_not_allowed_now"

    def test_a_section_beyond_the_piece_is_rejected(self, session_id: str) -> None:
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={
                "action": "accompany",
                "params": {"hand": "left", "from_measure": 0, "to_measure": 40},
            },
        )

        # 40 compases superan el máximo de la acción antes de mirar la pieza.
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_params_out_of_range"

    def test_section_inside_the_max_but_outside_the_piece_is_rejected(
        self, session_id: str
    ) -> None:
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={
                "action": "accompany",
                "params": {"hand": "left", "from_measure": 3, "to_measure": 5},
            },
        )

        # La pieza tiene 4 compases: el 5 no existe aunque quepa en el máximo.
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_measure_range"

    def test_an_unknown_hand_is_rejected(self, session_id: str) -> None:
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={
                "action": "accompany",
                "params": {"hand": "middle", "from_measure": 0, "to_measure": 1},
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_params_out_of_range"


class TestLatencyPing:
    """El canal mide su latencia para decidir si el acompañamiento es viable."""

    def test_ping_is_answered_without_touching_the_session(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            websocket.send_json({"type": "ping", "t_s": 1234.5})
            message = websocket.receive_json()

            assert message == {"type": "pong", "t_s": 1234.5}
            # La sesión sigue en su sitio: un ping no es un evento MIDI.
            assert _control(session_id) == "student"

    def test_the_threshold_is_fifty_milliseconds(self) -> None:
        assert ACCOMPANY_MAX_RTT_MS == 50.0
