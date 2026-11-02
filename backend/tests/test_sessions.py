# description: Sesiones de práctica: creación, estado, eventos y WebSocket en tiempo real (B-012.1), con el bucle de strikes del modo espera (B-032.6) y la oferta de demostración por consentimiento con «Sí, muéstralo»/«Sigo yo»/«Otra vez» (B-032.7).
# context: Contrato REST y push por WS sin evaluación ni agente todavía; el bucle y la oferta se prueban con el WebSocket de TestClient, y las decisiones se comprueban leyendo agent_decisions.

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
from piano_mentor import practice_rules
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
            # B-032.4: el modo y la mano nacen en observar/both.
            "mode": "observe",
            "hand": "both",
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


class TestPracticeMode:
    """Modos de práctica (B-032.4): estado de la sesión, no evento."""

    def test_the_mode_starts_in_observe(self, session_id: str) -> None:
        response = client.get(f"/api/v1/sessions/{session_id}/state")

        assert response.status_code == 200
        assert response.json()["mode"] == "observe"
        assert response.json()["hand"] == "both"

    def test_the_mode_can_be_changed_and_is_persisted(self, session_id: str) -> None:
        response = client.patch(
            f"/api/v1/sessions/{session_id}", json={"mode": "one_hand", "hand": "left"}
        )

        assert response.status_code == 200
        assert response.json()["mode"] == "one_hand"
        assert response.json()["hand"] == "left"

        state = client.get(f"/api/v1/sessions/{session_id}/state").json()
        assert state["mode"] == "one_hand"
        assert state["hand"] == "left"

    def test_both_hands_normalises_the_hand(self, session_id: str) -> None:
        client.patch(f"/api/v1/sessions/{session_id}", json={"mode": "one_hand", "hand": "left"})

        response = client.patch(
            f"/api/v1/sessions/{session_id}", json={"mode": "both_hands", "hand": "left"}
        )

        assert response.status_code == 200
        assert response.json()["mode"] == "both_hands"
        assert response.json()["hand"] == "both"

    def test_an_invalid_mode_is_rejected(self, session_id: str) -> None:
        response = client.patch(f"/api/v1/sessions/{session_id}", json={"mode": "tocando"})

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_mode"

    def test_an_invalid_hand_is_rejected(self, session_id: str) -> None:
        response = client.patch(f"/api/v1/sessions/{session_id}", json={"hand": "middle"})

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_hand"

    def test_an_unknown_session_returns_404(self) -> None:
        response = client.patch("/api/v1/sessions/no-existe", json={"mode": "observe"})

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "session_not_found"

    def test_the_new_mode_is_broadcast_by_the_websocket(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            client.patch(f"/api/v1/sessions/{session_id}", json={"mode": "both_hands"})
            message = websocket.receive_json()

        assert message["type"] == "state"
        assert message["mode"] == "both_hands"
        assert message["hand"] == "both"


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


class TestPosition:
    """Posición del transporte (B-032.2): estado vivo, no log de eventos."""

    def test_updates_measure_and_position(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 2.5, "measure": 1})

            message = websocket.receive_json()

        assert message["type"] == "state"
        assert message["position_s"] == 2.5
        assert message["current_measure"] == 1

        state = client.get(f"/api/v1/sessions/{session_id}/state").json()
        assert state["position_s"] == 2.5
        assert state["current_measure"] == 1

    def test_measure_can_be_null(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 0.5, "measure": None})

            message = websocket.receive_json()

        assert message["position_s"] == 0.5
        assert message["current_measure"] is None

    def test_position_is_not_stored_as_an_event(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 1.0, "measure": 0})
            websocket.receive_json()

        assert _stored_events(session_id) == []

    def test_position_does_not_change_the_status(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 1.0, "measure": 0})

            assert websocket.receive_json()["status"] == "idle"

    @pytest.mark.parametrize(
        "message",
        [
            {"type": "position", "t_s": -1, "measure": 0},
            {"type": "position", "t_s": "luego", "measure": 0},
            {"type": "position", "t_s": True, "measure": 0},
            {"type": "position", "measure": 0},
            {"type": "position", "t_s": 1.0, "measure": -1},
            {"type": "position", "t_s": 1.0, "measure": 1.5},
            {"type": "position", "t_s": 1.0, "measure": "uno"},
            {"type": "position", "t_s": 1.0, "measure": True},
        ],
    )
    def test_invalid_position_is_rejected_without_closing(
        self, session_id: str, message: dict[str, object]
    ) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(message)

            error = websocket.receive_json()

            assert error["type"] == "error"
            assert error["code"] == "invalid_event_payload"

            # La sesión sigue viva: una posición buena después de la mala funciona.
            websocket.send_json({"type": "position", "t_s": 0.0, "measure": 0})
            assert websocket.receive_json()["position_s"] == 0.0

    def test_same_measure_inside_the_window_is_not_broadcast(self, session_id: str) -> None:
        """Dos posiciones seguidas del mismo compás solo emiten un `state`.

        Se comprueba por orden: si la segunda también se difundiera, el segundo
        mensaje sería su `state` (idle) y no el del `note_on` (playing).
        """
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 1.0, "measure": 0})
            websocket.send_json({"type": "position", "t_s": 1.2, "measure": 0})
            websocket.send_json({"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 1.2})

            first = websocket.receive_json()
            second = websocket.receive_json()

        assert (first["status"], first["position_s"]) == ("idle", 1.0)
        assert second["status"] == "playing"
        # La posición sí se guardó aunque no se difundiera.
        assert second["position_s"] == 1.2

    def test_a_measure_change_is_broadcast_immediately(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "position", "t_s": 1.0, "measure": 0})
            websocket.send_json({"type": "position", "t_s": 1.1, "measure": 1})

            first = websocket.receive_json()
            second = websocket.receive_json()

        assert first["current_measure"] == 0
        assert second["current_measure"] == 1


class TestPositionPushThrottle:
    """Umbral del broadcast, puro y con el instante inyectado."""

    def test_first_position_always_pushes(self) -> None:
        assert api.position_push_due(None, 0, 10.0) is True

    def test_same_measure_inside_the_window_does_not_push(self) -> None:
        assert api.position_push_due((10.0, 2), 2, 10.2) is False

    def test_same_measure_after_the_window_pushes(self) -> None:
        assert api.position_push_due((10.0, 2), 2, 10.5) is True
        assert api.position_push_due((10.0, 2), 2, 11.0) is True

    def test_a_new_measure_pushes_immediately(self) -> None:
        assert api.position_push_due((10.0, 2), 3, 10.01) is True
        assert api.position_push_due((10.0, 2), None, 10.01) is True

    def test_a_null_measure_repeated_does_not_push(self) -> None:
        assert api.position_push_due((10.0, None), None, 10.1) is False



def _stored_signals(session_id: str) -> list[dict[str, object]]:
    """Lee las señales de práctica persistidas (B-032.5)."""
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return [
            dict(row)
            for row in conn.execute(
                "SELECT gate, measure, outcome, wait_ms, hand FROM practice_signals WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
        ]
    finally:
        conn.close()


class TestPracticeSignals:
    """Eventos de práctica del modo espera (B-032.5)."""

    def test_hit_is_persisted(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "practice",
                    "gate": "gate-1.0000",
                    "measure": 2,
                    "outcome": "hit",
                    "wait_ms": 120,
                    "hand": "left",
                }
            )

        assert _stored_signals(session_id) == [
            {
                "gate": "gate-1.0000",
                "measure": 2,
                "outcome": "hit",
                "wait_ms": 120,
                "hand": "left",
            }
        ]

    @pytest.mark.parametrize(
        "message",
        [
            {"type": "practice", "gate": "", "outcome": "hit"},
            {"type": "practice", "gate": "g1", "outcome": "casi"},
            {"type": "practice", "gate": "g1", "outcome": "hit", "wait_ms": -1},
            {"type": "practice", "gate": "g1", "outcome": "hit", "hand": "middle"},
        ],
    )
    def test_invalid_practice_event_is_rejected(
        self, session_id: str, message: dict[str, object]
    ) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()
            websocket.send_json(message)

            error = websocket.receive_json()

            assert error["type"] == "error"
            assert error["code"] == "invalid_event_payload"

        assert _stored_signals(session_id) == []


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
    api._last_position_push.clear()
    api._auto_return_tasks.clear()


def _stored_decisions(session_id: str) -> list[dict[str, object]]:
    """Lee las decisiones ejecutadas del agente (B-032.6)."""
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return [
            dict(row)
            for row in conn.execute(
                "SELECT measure, action, reason, baseline_signal_id FROM agent_decisions"
                " WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
        ]
    finally:
        conn.close()


def _practice(gate: str, outcome: str, measure: int | None) -> dict[str, object]:
    """Sobre `practice` como lo manda el gate-controller del navegador."""
    return {
        "type": "practice",
        "gate": gate,
        "measure": measure,
        "outcome": outcome,
        "wait_ms": 0,
        "hand": "both",
    }


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


class TestStrikeLoop:
    """El bucle completo: señales del navegador → decisión determinista → `agent_action` (B-032.6)."""

    def _connect(self, session_id: str):
        """Contexto de WebSocket ya con el primer `state` recibido (usar `with`)."""
        return client.websocket_connect(f"/api/v1/ws/sessions/{session_id}")

    def test_two_failed_gates_slow_down_the_tempo(self, session_id: str) -> None:
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g2", "wrong", 0))

            action = websocket.receive_json()
            assert action["type"] == "agent_action"
            assert action["action"] == "slow_down"
            assert action["reason"] == "gate_repeated_strikes"
            assert action["tempo_factor"] == 0.7

            state = websocket.receive_json()
            assert state["type"] == "state"
            assert state["control"] == "student"  # el tempo baja sin quitar el control

    def test_a_repeated_gate_does_not_count_twice(self, session_id: str) -> None:
        # Tres señales del mismo gate fallado: el reintento del front no es strike nuevo.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g1", "wrong", 0))

        assert _stored_decisions(session_id) == []  # un solo gate distinto: sin intervención

    def test_three_failed_gates_ask_for_a_hint(self, session_id: str) -> None:
        # La escalera completa: con dos fallos baja el tempo y con tres da una pista.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g2", "wrong", 0))
            websocket.receive_json()  # slow_down (2 fallos)
            websocket.receive_json()  # state

            websocket.send_json(_practice("g3", "wrong", 0))
            hint = websocket.receive_json()
            assert hint["action"] == "give_hint"
            assert hint["reason"] == "gate_repeated_strikes"
            assert hint["hint_type"] == "measure_focus"
            websocket.receive_json()  # state del evento

    def test_a_timeout_offers_the_demostration(self, session_id: str) -> None:
        # B-032.7: el silencio ya no toma el piano. Llega una oferta con los
        # params de la demo, sin cambiar el control ni bloquear nada.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "timeout", 0))

            offer = websocket.receive_json()
            assert offer["type"] == "agent_action"
            assert offer["action"] == "offer_demo"
            assert offer["from_measure"] == 0
            assert offer["to_measure"] == 0
            assert offer["reason"] == "gate_timeout_silence"

            state = websocket.receive_json()
            assert state["control"] == "student"  # el alumno sigue al piano

        decisions = _stored_decisions(session_id)
        assert [decision["action"] for decision in decisions] == ["offer_demo"]
        assert decisions[0]["baseline_signal_id"] > 0

    def test_accepting_the_offer_demonstrates_and_returns_the_control(
        self, session_id: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # «Sí, muéstralo»: la demo se ejecuta con los parámetros guardados y
        # la devolución de control queda programada como en B-032.6.
        monkeypatch.setattr(api, "demo_return_delay_s", lambda *args, **kwargs: 0.1)

        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "timeout", 0))
            websocket.receive_json()  # agent_action offer_demo
            websocket.receive_json()  # state

            websocket.send_json({"type": "offer_accept"})

            demo = websocket.receive_json()
            assert demo["type"] == "agent_action"
            assert demo["action"] == "demonstrate"
            assert demo["from_measure"] == 0
            assert demo["to_measure"] == 0
            assert demo["tempo_factor"] == 0.8

            state = websocket.receive_json()
            assert state["control"] == "agent"

            return_action = websocket.receive_json()
            assert return_action["action"] == "return_control"
            return_state = websocket.receive_json()
            assert return_state["control"] == "student"

        decisions = _stored_decisions(session_id)
        assert [decision["action"] for decision in decisions] == [
            "offer_demo",
            "demonstrate",
            "return_control",
        ]
        assert decisions[1]["reason"] == "offer_accepted"

    def test_dismissing_the_offer_stops_repeating_it(self, session_id: str) -> None:
        # «Sigo yo»: la oferta se cierra y el mismo compás no vuelve a ofrecer;
        # un segundo timeout cuenta como strike, así que no hay segunda oferta.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "timeout", 0))
            websocket.receive_json()  # agent_action offer_demo
            websocket.receive_json()  # state

            websocket.send_json({"type": "offer_dismiss"})
            dismissed = websocket.receive_json()
            assert dismissed["type"] == "agent_action"
            assert dismissed["action"] == "offer_dismiss"
            websocket.receive_json()  # state

            websocket.send_json(_practice("g2", "timeout", 0))

        decisions = _stored_decisions(session_id)
        assert [decision["action"] for decision in decisions] == [
            "offer_demo",
            "offer_dismiss",
        ]

    def test_an_offer_without_a_pending_one_is_rejected(self, session_id: str) -> None:
        # El orga de una pestaña vieja no debe poder aceptar ofertas inventadas.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "offer_accept"})

            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "action_not_allowed_now"

    def test_repeat_replays_the_last_demostration_within_the_caps(
        self, session_id: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # «Otra vez» repite la demo ya ejecutada (una por compás), grabándose
        # como repeat_demo; una segunda pide ya no cabe y llega un error.
        monkeypatch.setattr(api, "demo_return_delay_s", lambda *args, **kwargs: 0.1)

        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "timeout", 0))
            websocket.receive_json()  # offer_demo
            websocket.receive_json()  # state
            websocket.send_json({"type": "offer_accept"})
            websocket.receive_json()  # demonstrate
            websocket.receive_json()  # state control=agent
            websocket.receive_json()  # return_control
            websocket.receive_json()  # state control=student

            websocket.send_json({"type": "offer_repeat"})

            repeat = websocket.receive_json()
            assert repeat["type"] == "agent_action"
            assert repeat["action"] == "demonstrate"
            assert repeat["from_measure"] == 0
            assert repeat["tempo_factor"] == 0.8
            websocket.receive_json()  # state
            websocket.receive_json()  # return_control de la repetición
            websocket.receive_json()  # state

            websocket.send_json({"type": "offer_repeat"})
            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "action_not_allowed_now"

        repeats = [
            decision for decision in _stored_decisions(session_id)
            if decision["action"] == "repeat_demo"
        ]
        assert len(repeats) == 1

    def test_repeat_without_a_previous_demostration_is_rejected(self, session_id: str) -> None:
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "offer_repeat"})

            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "action_not_allowed_now"

    def test_a_hint_after_a_struck_measure_resets_the_ladder(self, session_id: str) -> None:
        # Se interviene; desde entonces el contador de ese compás parte de cero
        # (baseline), y hasta que vuelvan a fallar gates no hay segunda acción.
        with self._connect(session_id) as websocket:
            websocket.receive_json()
            # El compás vivo manda dónde se cuenta: sin posición no hay baseline.
            websocket.send_json({"type": "position", "t_s": 0.0, "measure": 0})
            websocket.receive_json()  # el cambio de compás difunde el estado
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g2", "wrong", 0))
            websocket.receive_json()  # slow_down
            websocket.receive_json()  # state

        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g3", "wrong", 0))

        actions = [decision["action"] for decision in _stored_decisions(session_id)]
        assert actions == ["slow_down"]  # un solo gate nuevo: no llega al umbral 2

    def test_the_session_has_a_global_cap(
        self, session_id: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Con el tope de sesión a 1, la segunda escalera de fallos ya no interviene.
        monkeypatch.setattr(practice_rules, "MAX_STRIKE_ACTIONS_PER_SESSION", 1)

        with self._connect(session_id) as websocket:
            websocket.receive_json()
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g2", "wrong", 0))
            websocket.receive_json()  # agent_action slow_down
            websocket.receive_json()  # state

            websocket.send_json(_practice("g3", "wrong", 0))
            websocket.send_json(_practice("g4", "wrong", 0))
            # Sin cabos colgando: ningún agente_action nuevo (tope de sesión).

        decisions = _stored_decisions(session_id)
        interventions = [
            decision for decision in decisions if decision["action"] == "slow_down"
        ]
        assert len(interventions) == 1
