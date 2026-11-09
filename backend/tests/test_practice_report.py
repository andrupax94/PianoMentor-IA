# description: Tests del informe consolidado de práctica (B-033.3 + summary de B-033.4): endpoint `GET /sessions/{id}/practice-report` (404 estable, informe vacío de sesión sin señales, agregación por compás con conteos por outcome y último outcome por gate, decisiones del agente en orden con params como objeto, truncado de `signals` con `limit`, determinismo, sección `evaluation` compacta de B-032.3 y destacados `summary` deterministas de B-033.4).
# context: La señales se insertan por el servicio (`receive_practice_event`, la vía del WS sin el bucle de strikes) para controlar el agregado; la correlación señal→decisión real se prueba una vez con el WebSocket (mismo patrón de `test_sessions.py`) y las decisiones fuera del bucle se insertan con `insert_agent_decision`. La BD queda aislada por `conftest.py`.

"""Tests del informe de práctica: endpoint B-033.3 sobre B-032.6/B-032.3."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor import database
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db
from piano_mentor.main import app
from piano_mentor.practice import PracticeService
from piano_mentor.storage import LocalPieceStorage

client = TestClient(app)
service = PracticeService()

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"


@pytest.fixture()
def piece_id(isolated_storage: LocalPieceStorage) -> str:
    """Una pieza persistida de verdad: la sesión valida que exista."""
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


def _insert_signal(
    session_id: str, gate: str, outcome: str, measure: int | None
) -> None:
    """Una señal por la vía real (validación + persistencia), sin bucle de strikes."""
    service.receive_practice_event(session_id, _practice(gate, outcome, measure))


def _insert_decision(
    session_id: str,
    index: int,
    **columns: object,
) -> None:
    """Una decisión del agente grabada en `agent_decisions` (fuera del bucle)."""
    record = {
        "session_id": session_id,
        "measure": 0,
        "action": "slow_down",
        "params_json": json.dumps({"tempo_factor": 0.7}),
        "reason": "gate_repeated_strikes",
        "provider": "deterministic",
        "baseline_signal_id": index,
    }
    record.update(columns)
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        database.insert_agent_decision(conn, record)
    finally:
        conn.close()


class TestReportBasics:
    def test_unknown_session_returns_404_with_stable_code(self) -> None:
        response = client.get("/api/v1/sessions/no-such-session/practice-report")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "session_not_found"

    def test_a_fresh_session_reports_empty_sections(self, session_id: str, piece_id: str) -> None:
        response = client.get(f"/api/v1/sessions/{session_id}/practice-report")

        assert response.status_code == 200
        report = response.json()
        assert report["session"] == {
            "session_id": session_id,
            "piece_id": piece_id,
            "piece_title": None,  # las subidas no llevan título (solo catálogo)
            "tempo": 120.0,
            "status": "idle",
            "control": "student",
            "mode": "observe",
            "hand": "both",
            "created_at": report["session"]["created_at"],
            "first_signal_at": None,
            "last_signal_at": None,
            "practiced_s": None,
            "signal_count": 0,
        }
        assert report["by_measure"] == []
        assert report["agent_decisions"] == []
        assert report["signals"] == {"total": 0, "returned": 0, "truncated": False, "items": []}
        assert report["evaluation"] is None  # sin notas tocadas no hay nada que evaluar
        assert report["generated_at"]


class TestAggregationByMeasure:
    def test_counts_outcomes_in_order_and_keeps_the_last_outcome_per_gate(self, session_id: str) -> None:
        # El compás 0 ve: g1 falla, g2 falla, g1 se recupera; el 1 ve g3 en silencio.
        _insert_signal(session_id, "g1", "wrong", 0)
        _insert_signal(session_id, "g2", "miss", 0)
        _insert_signal(session_id, "g1", "hit", 0)
        _insert_signal(session_id, "g3", "timeout", 1)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        assert report["session"]["signal_count"] == 4
        assert report["by_measure"] == [
            {
                "measure": 0,
                "counts": {"hit": 1, "miss": 1, "wrong": 1, "timeout": 0},
                "arrival": [1, 2, 3],
                "last_outcome_by_gate": {"g1": "hit", "g2": "miss"},
            },
            {
                "measure": 1,
                "counts": {"hit": 0, "miss": 0, "wrong": 0, "timeout": 1},
                "arrival": [4],
                "last_outcome_by_gate": {"g3": "timeout"},
            },
        ]

    def test_pieces_without_measures_group_under_null(self, session_id: str) -> None:
        # Piezas sin rejilla: `measure` es null y es un grupo como cualquier otro.
        _insert_signal(session_id, "g1", "hit", None)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        assert report["by_measure"] == [
            {
                "measure": None,
                "counts": {"hit": 1, "miss": 0, "wrong": 0, "timeout": 0},
                "arrival": [1],
                "last_outcome_by_gate": {"g1": "hit"},
            }
        ]

    def test_the_run_window_comes_from_the_signals(self, session_id: str) -> None:
        _insert_signal(session_id, "g1", "hit", 0)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
        session_block = report["session"]

        assert session_block["first_signal_at"] == session_block["last_signal_at"]
        assert session_block["practiced_s"] >= 0  # granularidad de segundo: puede dar 0
        assert session_block["signal_count"] == 1


class TestSignalsTruncation:
    def test_limit_truncates_the_raw_list_and_counts_the_rest(self, session_id: str) -> None:
        for index in range(5):
            _insert_signal(session_id, f"g{index}", "hit", 0)

        report = client.get(
            f"/api/v1/sessions/{session_id}/practice-report", params={"limit": 2}
        ).json()

        assert report["signals"]["total"] == 5
        assert report["signals"]["returned"] == 2
        assert report["signals"]["truncated"] is True
        assert [item["id"] for item in report["signals"]["items"]] == [1, 2]
        # Lo agregado no se trunca: ve la sesión entera aunque items venga corto.
        assert report["session"]["signal_count"] == 5
        assert len(report["by_measure"]) == 1

    def test_without_limit_it_brings_the_default_and_caps_the_parameter(self, session_id: str) -> None:
        for index in range(5):
            _insert_signal(session_id, f"g{index}", "hit", 0)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
        assert report["signals"]["truncated"] is False
        assert report["signals"]["returned"] == 5

        absurd = client.get(
            f"/api/v1/sessions/{session_id}/practice-report", params={"limit": 99_999}
        )
        assert absurd.status_code == 200

    def test_a_non_positive_limit_is_rejected(self, session_id: str) -> None:
        response = client.get(
            f"/api/v1/sessions/{session_id}/practice-report", params={"limit": 0}
        )

        assert response.status_code == 422


class TestAgentDecisions:
    def test_decisions_arrive_in_temporal_order_with_params_as_object(self, session_id: str) -> None:
        _insert_decision(session_id, 3, measure=0)
        _insert_decision(
            session_id,
            9,
            action="offer_demo",
            params_json=json.dumps({"from_measure": 0, "to_measure": 0, "tempo_factor": 1.0}),
            reason="gate_timeout_silence",
            measure=0,
        )

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        assert [item["id"] for item in report["agent_decisions"]] == [1, 2]
        first, second = report["agent_decisions"]
        assert first == {
            "id": 1,
            "measure": 0,
            "action": "slow_down",
            "params": {"tempo_factor": 0.7},
            "reason": "gate_repeated_strikes",
            "provider": "deterministic",
            "baseline_signal_id": 3,
            "created_at": first["created_at"],
        }
        assert second["action"] == "offer_demo"
        assert second["reason"] == "gate_timeout_silence"
        assert second["params"] == {"from_measure": 0, "to_measure": 0, "tempo_factor": 1.0}

    def test_the_loop_records_the_decision_and_the_report_shows_the_run(
        self, session_id: str
    ) -> None:
        # Integración con el bucle real (B-032.6): dos gates fallados del
        # compás 0 disparan `slow_down`; el informe lo cuenta tal como fue.
        with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
            websocket.receive_json()  # state inicial
            websocket.send_json(_practice("g1", "wrong", 0))
            websocket.send_json(_practice("g2", "wrong", 0))
            websocket.receive_json()  # agent_action slow_down
            websocket.receive_json()  # state

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        assert report["signals"]["total"] == 2
        assert [
            {"gate": item["gate"], "outcome": item["outcome"], "measure": item["measure"]}
            for item in report["signals"]["items"]
        ] == [
            {"gate": "g1", "outcome": "wrong", "measure": 0},
            {"gate": "g2", "outcome": "wrong", "measure": 0},
        ]
        assert report["by_measure"] == [
            {
                "measure": 0,
                "counts": {"hit": 0, "miss": 0, "wrong": 2, "timeout": 0},
                "arrival": [1, 2],
                "last_outcome_by_gate": {"g1": "wrong", "g2": "wrong"},
            }
        ]
        assert len(report["agent_decisions"]) == 1
        decision = report["agent_decisions"][0]
        assert decision["action"] == "slow_down"
        assert decision["reason"] == "gate_repeated_strikes"
        # El baseline se marca DESPUÉS de grabar la señal que motivó la
        # decisión: el bucle afina a partir de la última señal conocida.
        assert decision["baseline_signal_id"] == 2


class TestEvaluation:
    def test_a_session_with_notes_brings_a_compact_evaluation(self, session_id: str) -> None:
        service.receive_event(
            session_id, {"type": "note_on", "pitch": 72, "velocity": 80, "t_s": 0.0}
        )
        _insert_signal(session_id, "g1", "hit", 0)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        evaluation = report["evaluation"]
        assert evaluation is not None
        # La versión compacta del informe: nada de los arrays pesados.
        assert "notes" not in evaluation
        assert "extras" not in evaluation
        assert evaluation["counts"]["correct"] >= 0
        assert 0 <= evaluation["score_total"] <= 100


class TestSummary:
    """Destacados deterministas del informe (B-033.4)."""

    def test_a_fresh_session_has_the_empty_summary(self, session_id: str) -> None:
        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        assert report["summary"] == {
            "signals": 0,
            "active_measures": 0,
            "distinct_gates": 0,
            "practiced_s": None,
            "outcomes": {"hit": 0, "miss": 0, "wrong": 0, "timeout": 0},
            "hit_ratio": None,
            "worst_measures": [],
            "dominant_failure": None,
            "interventions": {"count": 0, "by_action": {}, "by_reason": {}},
            "evaluation": None,
        }

    def test_it_counts_outcomes_and_ranks_the_worst_measures(self, session_id: str) -> None:
        for gate, outcome, measure in [
            ("g1", "hit", 0),
            ("g1", "hit", 0),
            ("g1", "wrong", 0),
            ("g1", "wrong", 0),
            ("g2", "timeout", 1),
            ("g3", "miss", 1),
            ("g4", "wrong", 2),
            ("g5", "hit", 3),
            ("g6", "hit", 3),
        ]:
            _insert_signal(session_id, gate, outcome, measure)

        summary = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()["summary"]

        assert summary["signals"] == 9
        assert summary["active_measures"] == 4
        assert summary["distinct_gates"] == 6
        assert summary["outcomes"] == {"hit": 4, "miss": 1, "wrong": 3, "timeout": 1}
        assert summary["hit_ratio"] == 0.444  # 4 de 9
        assert summary["worst_measures"] == [
            # 0 de 2 (más evidencia del fallo), 0 de 1 y 2 de 4: los tres
            # primeros con peor ratio; el compás 3 (1.0) se queda fuera.
            {"measure": 1, "counts": {"hit": 0, "miss": 1, "wrong": 0, "timeout": 1}, "attempts": 2, "hit_ratio": 0.0},
            {"measure": 2, "counts": {"hit": 0, "miss": 0, "wrong": 1, "timeout": 0}, "attempts": 1, "hit_ratio": 0.0},
            {"measure": 0, "counts": {"hit": 2, "miss": 0, "wrong": 2, "timeout": 0}, "attempts": 4, "hit_ratio": 0.5},
        ]
        # El fallo dominante: `wrong` (3) sobre el gate que más falló (g1 ×2).
        assert summary["dominant_failure"] == {"outcome": "wrong", "count": 3, "gate": "g1"}

    def test_a_clean_session_has_no_dominant_failure(self, session_id: str) -> None:
        _insert_signal(session_id, "g1", "hit", 0)

        summary = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()["summary"]

        assert summary["hit_ratio"] == 1.0
        assert summary["dominant_failure"] is None

    def test_interventions_are_counted_by_action_and_reason(self, session_id: str) -> None:
        _insert_signal(session_id, "g1", "hit", 0)
        _insert_decision(session_id, 1, measure=0)
        _insert_decision(
            session_id,
            2,
            action="offer_demo",
            reason="gate_timeout_silence",
            measure=0,
        )

        summary = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()["summary"]

        assert summary["interventions"] == {
            "count": 2,
            "by_action": {"slow_down": 1, "offer_demo": 1},
            "by_reason": {"gate_repeated_strikes": 1, "gate_timeout_silence": 1},
        }

    def test_it_quotes_the_compact_evaluation(self, session_id: str) -> None:
        service.receive_event(
            session_id, {"type": "note_on", "pitch": 72, "velocity": 80, "t_s": 0.0}
        )
        _insert_signal(session_id, "g1", "hit", 0)

        report = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
        quoted = report["summary"]["evaluation"]

        assert quoted is not None
        # Exactamente los tres números clave, nada de los arrays pesados.
        assert set(quoted) == {"score_total", "error_type", "received_ratio"}
        assert quoted["score_total"] == report["evaluation"]["score_total"]
        assert quoted["error_type"] == report["evaluation"]["error_type"]
        assert quoted["received_ratio"] == report["evaluation"]["received_ratio"]


class TestDeterminism:
    def test_the_same_session_reports_the_same_lists_and_numbers(self, session_id: str) -> None:
        _insert_signal(session_id, "g1", "wrong", 0)
        _insert_signal(session_id, "g2", "wrong", 0)
        _insert_decision(session_id, 2, measure=0)

        first = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
        second = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

        first.pop("generated_at")
        second.pop("generated_at")
        assert first == second
