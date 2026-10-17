# description: Sesiones de práctica: creación, estado, eventos y WebSocket en tiempo real (B-012.1).
# context: Contrato REST y push por WS sin evaluación ni agente todavía.

"""Tests de la sesión de práctica: persistencia, estado y eventos por WebSocket."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from piano_mentor import api
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db
from piano_mentor.main import app
from piano_mentor.midi import MidiService
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"

# Frase de práctica (`practice_phrase.mid`): (inicio, fin, altura, velocity) en
# pulsaciones de negra. A 120 BPM cada pulsación son 0,5 s, así que la pulsación
# `b` empieza en `b / 2` segundos. Es la tabla que enviaría un estudiante que
# toca la pieza sin un solo error, y la que documenta el propio generador.
PHRASE_NOTES: list[tuple[float, float, int, int]] = [
    (0, 1, 72, 80),
    (1, 2, 74, 80),
    (2, 3, 76, 80),
    (3, 4, 77, 80),
    (4, 6, 79, 100),
    (6, 7, 69, 90),  # ┐
    (6, 7, 72, 90),  # ├ acorde de tres notas en la derecha
    (6, 7, 76, 90),  # ┘
    (8, 9, 76, 80),
    (9, 10, 77, 80),
    (10, 12, 79, 90),
    (12, 13, 69, 80),
    (13, 14, 67, 80),
    (14, 16, 72, 95),
    (0, 4, 48, 60),  # ┐
    (0, 4, 55, 60),  # ┘
    (4, 8, 45, 60),  # ┐
    (4, 8, 52, 60),  # ┘
    (8, 12, 41, 65),  # ┐
    (8, 12, 48, 65),  # ┘
    (12, 16, 43, 60),  # ┐
    (12, 16, 50, 60),  # ┘
]


def _perfect_performance() -> list[dict[str, object]]:
    """La frase tocada entera y a tiempo, en el orden en que la manda un teclado."""
    events: list[tuple[float, int, dict[str, object]]] = []
    for start, end, pitch, velocity in PHRASE_NOTES:
        events.append(
            (
                start / 2,
                1,
                {"type": "note_on", "pitch": pitch, "velocity": velocity, "t_s": start / 2},
            )
        )
        # En el mismo instante se suelta antes de volver a pulsar.
        events.append(
            (end / 2, 0, {"type": "note_off", "pitch": pitch, "velocity": 0, "t_s": end / 2})
        )
    events.sort(key=lambda item: (item[0], item[1]))
    return [event for _, _, event in events]


@pytest.fixture()
def piece_id(isolated_storage: LocalPieceStorage) -> str:
    """Una pieza persistida de verdad: las sesiones validan que exista.

    Se sube la frase de práctica versionada (B-012.1) en lugar de un MIDI del
    catálogo, para que el test no dependa de ficheros que no viajan en git.
    """
    response = client.post(
        "/api/v1/pieces",
        files={"file": ("practice_phrase.mid", PRACTICE_FIXTURE.read_bytes(), "audio/midi")},
    )
    assert response.status_code == 200
    return response.json()["id"]


@pytest.fixture()
def session_id(piece_id: str) -> str:
    response = client.post("/api/v1/sessions", json={"piece_id": piece_id})
    assert response.status_code == 201
    return response.json()["id"]


def _stored_events(session_id: str) -> list[dict[str, object]]:
    """Lee el log persistido, que es lo que consumirá la evaluación (B-012.2)."""
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return [
            dict(row)
            for row in conn.execute(
                "SELECT type, pitch, velocity, t_s FROM session_events WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
        ]
    finally:
        conn.close()


class TestCreateSession:
    def test_returns_id_and_starts_idle(self, session_id: str, piece_id: str) -> None:
        response = client.get(f"/api/v1/sessions/{session_id}/state")

        assert response.status_code == 200
        state = response.json()
        assert state == {
            "session_id": session_id,
            "piece_id": piece_id,
            "status": "idle",
            "control": "student",
            "current_measure": None,
            "position_s": 0.0,
        }

    def test_persists_the_session(self, session_id: str) -> None:
        conn = connect(settings.database_url)
        try:
            init_db(conn)
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        finally:
            conn.close()

        assert row is not None
        assert row["status"] == "idle"

    def test_unknown_piece_is_rejected(self) -> None:
        response = client.post("/api/v1/sessions", json={"piece_id": "no-existe"})

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "piece_not_found"


class TestGetState:
    def test_unknown_session_returns_404(self) -> None:
        response = client.get("/api/v1/sessions/no-existe/state")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "session_not_found"


class TestPracticeFixture:
    """La tabla de notas del test y el MIDI versionado tienen que ser la misma frase."""

    def test_the_table_matches_the_fixture(self) -> None:
        notes = MidiService().normalize(PRACTICE_FIXTURE)

        assert len(notes) == len(PHRASE_NOTES)
        assert sorted(
            (start / 2, round((end - start) / 2, 6), pitch, velocity)
            for start, end, pitch, velocity in PHRASE_NOTES
        ) == sorted(
            (
                note.start_seconds,
                round(note.duration_seconds, 6),
                note.pitch,
                note.velocity,
            )
            for note in notes
        )


class TestWebSocket:
    def test_sends_state_on_connect(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            message = websocket.receive_json()

        assert message["type"] == "state"
        assert message["session_id"] == session_id
        assert message["status"] == "idle"

    def test_note_on_moves_to_playing_and_is_persisted(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 1.5})

            message = websocket.receive_json()

        assert message["type"] == "state"
        assert message["status"] == "playing"
        assert _stored_events(session_id) == [
            {"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 1.5}
        ]

    def test_note_off_is_persisted_and_keeps_playing(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 1.0})
            websocket.receive_json()
            websocket.send_json({"type": "note_off", "pitch": 60, "t_s": 1.5})

            message = websocket.receive_json()

        assert message["status"] == "playing"
        assert [event["type"] for event in _stored_events(session_id)] == ["note_on", "note_off"]

    def test_event_order_is_preserved(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            for pitch in (60, 64, 67):
                websocket.send_json({"type": "note_on", "pitch": pitch, "velocity": 70, "t_s": 0.5})
                websocket.receive_json()

        assert [event["pitch"] for event in _stored_events(session_id)] == [60, 64, 67]

    def test_stores_the_whole_practice_phrase(self, session_id: str) -> None:
        """La frase entera (22 notas, 44 eventos) llega completa, ordenada y con su tiempo.

        Es el ensayo general de B-012.1 con material real: acordes de dos y tres
        notas, un silencio, tres niveles de velocity y las dos manos.
        """
        performance = _perfect_performance()

        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            for event in performance:
                websocket.send_json(event)
            states = [websocket.receive_json() for _ in performance]

        assert len(performance) == 44
        assert {message["type"] for message in states} == {"state"}
        assert states[-1]["status"] == "playing"
        assert [
            (stored["type"], stored["pitch"], stored["velocity"], stored["t_s"])
            for stored in _stored_events(session_id)
        ] == [
            (event["type"], event["pitch"], event["velocity"], event["t_s"])
            for event in performance
        ]

    @pytest.mark.parametrize(
        "event",
        [
            {"type": "control_change", "pitch": 60, "velocity": 80, "t_s": 1.0},
            {"type": "note_on", "pitch": 200, "velocity": 80, "t_s": 1.0},
            {"type": "note_on", "pitch": 60.5, "velocity": 80, "t_s": 1.0},
            {"type": "note_on", "pitch": 60, "velocity": 0, "t_s": 1.0},
            {"type": "note_on", "pitch": 60, "velocity": 80},
            {"type": "note_on", "pitch": 60, "velocity": 80, "t_s": -1},
            {"type": "note_on", "pitch": 60, "velocity": 80, "t_s": "luego"},
        ],
    )
    def test_invalid_event_is_rejected_without_closing(
        self, session_id: str, event: dict[str, object]
    ) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(event)

            error = websocket.receive_json()

            assert error["type"] == "error"
            assert error["code"] == "invalid_event_payload"

            # La sesión sigue viva: un evento bueno después del malo funciona.
            websocket.send_json({"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 0.0})
            assert websocket.receive_json()["status"] == "playing"

        # El evento inválido no se persiste: en el log solo está el bueno.
        assert [stored["type"] for stored in _stored_events(session_id)] == ["note_on"]

    def test_invalid_json_is_rejected_without_closing(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_text("{no es json")

            error = websocket.receive_json()

            assert error["code"] == "invalid_event_payload"

            websocket.send_json({"type": "note_on", "pitch": 62, "velocity": 80, "t_s": 0.0})
            assert websocket.receive_json()["status"] == "playing"

    def test_unknown_session_is_closed_with_4404(self) -> None:
        with client.websocket_connect("/api/v1/ws/sessions/no-existe") as websocket:
            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "session_not_found"

            with pytest.raises(WebSocketDisconnect) as excinfo:
                websocket.receive_json()

        assert excinfo.value.code == api.WS_CLOSE_SESSION_NOT_FOUND

    def test_disconnect_releases_the_connection(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            assert session_id in api._session_sockets

        assert session_id not in api._session_sockets


class _RecordingSocket:
    """Doble de WebSocket que solo apunta lo que le llega."""

    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def send_json(self, message: dict[str, object]) -> None:
        self.messages.append(message)


class _BrokenSocket:
    """Doble de un socket ya cerrado: enviar revienta."""

    async def send_json(self, message: dict[str, object]) -> None:
        raise RuntimeError("socket cerrado")


@pytest.fixture(autouse=True)
def clean_registry() -> None:
    """El registro de conexiones es estado de módulo: cada test parte vacío."""
    api._session_sockets.clear()


class TestBroadcast:
    async def test_reaches_every_connection_of_the_session(self) -> None:
        first, second = _RecordingSocket(), _RecordingSocket()
        api._register_socket("s1", first)  # type: ignore[arg-type]
        api._register_socket("s1", second)  # type: ignore[arg-type]

        await api._broadcast_state("s1", {"session_id": "s1", "status": "playing"})

        expected = [{"type": "state", "session_id": "s1", "status": "playing"}]
        assert first.messages == expected
        assert second.messages == expected

    async def test_ignores_other_sessions(self) -> None:
        mine, other = _RecordingSocket(), _RecordingSocket()
        api._register_socket("s1", mine)  # type: ignore[arg-type]
        api._register_socket("s2", other)  # type: ignore[arg-type]

        await api._broadcast_state("s1", {"session_id": "s1", "status": "playing"})

        assert len(mine.messages) == 1
        assert other.messages == []

    async def test_forgets_a_socket_that_fails(self) -> None:
        api._register_socket("s1", _BrokenSocket())  # type: ignore[arg-type]

        await api._broadcast_state("s1", {"session_id": "s1", "status": "playing"})

        assert "s1" not in api._session_sockets
