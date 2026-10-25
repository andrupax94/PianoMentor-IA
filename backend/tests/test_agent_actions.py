# description: Acciones demonstrate y return_control: control del piano y notificación WS (B-012.5).
# context: La demo reproduce una sección y devuelve el control automáticamente al estudiante.

"""Tests de B-012.5: demostración y devolución automática del control."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.main import app
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"


@pytest.fixture()
def piece_id(isolated_storage: LocalPieceStorage) -> str:
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


def _get_control(session_id: str) -> str:
    response = client.get(f"/api/v1/sessions/{session_id}/state")
    assert response.status_code == 200
    return response.json()["control"]


# --- demonstrate --------------------------------------------------------------


class TestDemonstrate:
    def test_demonstrate_takes_control(self, session_id: str) -> None:
        assert _get_control(session_id) == "student"
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4, "tempo_factor": 0.7}},
        )
        assert response.status_code == 200
        assert _get_control(session_id) == "agent"

    def test_demonstrate_broadcasts_ws(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4, "tempo_factor": 0.7}},
            )
            message = websocket.receive_json()

        assert message["type"] == "agent_action"
        assert message["action"] == "demonstrate"
        assert message["from_measure"] == 0
        assert message["to_measure"] == 4
        assert message["tempo_factor"] == 0.7

    def test_demonstrate_rejects_invalid_params(self, session_id: str) -> None:
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 100}},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_params_out_of_range"
        assert _get_control(session_id) == "student"


# --- return_control -----------------------------------------------------------


class TestReturnControl:
    def test_return_control_restores_student(self, session_id: str) -> None:
        client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4}},
        )
        assert _get_control(session_id) == "agent"

        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "return_control"},
        )
        assert response.status_code == 200
        assert _get_control(session_id) == "student"

    def test_return_control_broadcasts_ws(self, session_id: str) -> None:
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4}},
            )
            websocket.receive_json()  # agent_action demonstrate

            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "return_control"},
            )
            message = websocket.receive_json()

        assert message["type"] == "agent_action"
        assert message["action"] == "return_control"

    def test_return_control_without_agent_rejected(self, session_id: str) -> None:
        """return_control solo es válido si el agente tiene el control."""
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "return_control"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_not_allowed_now"

    def test_return_control_with_params_rejected(self, session_id: str) -> None:
        client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4}},
        )
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "return_control", "params": {"tempo": 1.0}},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "action_params_out_of_range"


# --- Flujo completo demo → return_control -------------------------------------


class TestDemoFlow:
    def test_full_demo_cycle(self, session_id: str) -> None:
        """Secuencia completa: demonstrate → return_control → estudiante juega."""
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial

            # 1. Agente toma el control con demonstrate
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4}},
            )
            msg_demo = websocket.receive_json()
            assert msg_demo["type"] == "agent_action"
            assert msg_demo["action"] == "demonstrate"
            assert _get_control(session_id) == "agent"

            # 2. Agente devuelve el control
            client.post(
                f"/api/v1/sessions/{session_id}/actions",
                json={"action": "return_control"},
            )
            msg_return = websocket.receive_json()
            assert msg_return["type"] == "agent_action"
            assert msg_return["action"] == "return_control"
            assert _get_control(session_id) == "student"

            # 3. El estudiante puede tocar de nuevo
            websocket.send_json({"type": "note_on", "pitch": 60, "velocity": 80, "t_s": 0.0})
            msg_state = websocket.receive_json()
            assert msg_state["type"] == "state"
            assert msg_state["status"] == "playing"


# --- agent-step con proveedor LLM (B-012.6) -----------------------------------


class TestAgentStepEndpoint:
    def test_returns_proposal_with_provider(self, session_id: str) -> None:
        response = client.post(f"/api/v1/sessions/{session_id}/agent-step")
        assert response.status_code == 200
        body = response.json()
        assert body["action"] in ("wait", "give_hint", "slow_down", "demonstrate")
        # En CI el proveedor es MockProvider (aislamiento de conftest).
        assert body["provider"] == "mock"
        assert isinstance(body["used_fallback"], bool)

    def test_agent_control_makes_it_wait(self, session_id: str) -> None:
        client.post(
            f"/api/v1/sessions/{session_id}/actions",
            json={"action": "demonstrate", "params": {"from_measure": 0, "to_measure": 4}},
        )
        response = client.post(f"/api/v1/sessions/{session_id}/agent-step")
        assert response.status_code == 200
        assert response.json()["action"] == "wait"

    def test_unknown_session_returns_404(self) -> None:
        response = client.post("/api/v1/sessions/no-existe/agent-step")
        assert response.status_code == 404

    def test_execute_action_still_validates_before_running(self, session_id: str) -> None:
        """El paso propone y la ejecución sigue pasando por la validación."""
        step = client.post(f"/api/v1/sessions/{session_id}/agent-step")
        action = step.json()["action"]
        response = client.post(
            f"/api/v1/sessions/{session_id}/actions", json={"action": action}
        )
        assert response.status_code == 200

    def test_playing_session_feeds_the_evaluation(self, session_id: str) -> None:
        """Con el estudiante tocando mal, el paso propone demostrar (B-012.6)."""
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # estado inicial
            for index in range(6):  # 6 notas fuera de sitio seguidas
                websocket.send_json(
                    {"type": "note_on", "pitch": 60, "velocity": 80, "t_s": index * 0.5}
                )
                websocket.receive_json()

        response = client.post(f"/api/v1/sessions/{session_id}/agent-step")
        assert response.status_code == 200
        assert response.json()["action"] == "demonstrate"
        assert response.json()["provider"] == "mock"
