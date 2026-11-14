# description: Tests de integridad del informe de práctica (B-033.8): estado terminal `finished` (cierre de sesión idempotente y note_on que no resucita), informe final `?final=true` (409 session_not_finished con la sesión viva, 200 al cerrarla, on-demand intacto sin `final`), bloque `execution` (último gate/compás alcanzados, duración de audio opcional, contadores del canal), instrumentación received/persisted/lost del módulo `practice_channel`, y pasadas (runs): señales con `run_id` vigente, informe de UNA pasada con `session.signal_count` global, bloque `runs` comprimido, sesiones viejas → run 1 y POST /sessions/{id}/runs.
# context: B-033.8. La BD queda aislada por `conftest.py` (las migraciones corren solas al abrir: la 0016 añade `run_id`/`current_run`). Las señales se insertan por la vía real del servicio o con `run_id` directo (equivalente a lo que hará el reinicio explícito de B-033.7); una señal «de antes de la migración» se inserta sin `run_id` para probar el DEFAULT 1.

"""Tests de integridad del informe: cierre, informe final, execution y runs (B-033.8)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor import database, practice_channel
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db
from piano_mentor.main import app
from piano_mentor.practice import PracticeService

client = TestClient(app)
service = PracticeService()

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"


@pytest.fixture()
def piece_id() -> str:
    """Una pieza persistida de verdad (con MIDI): la evaluación del informe la lee."""
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


def _insert_signal(
    session_id: str,
    gate: str,
    outcome: str,
    measure: int | None,
    run_id: int | None = 1,
) -> None:
    """Una señal con la pasada que toca (`run_id` None = señal anterior a la migración)."""
    record: dict[str, object] = {
        "session_id": session_id,
        "gate": gate,
        "measure": measure,
        "outcome": outcome,
        "wait_ms": 0,
        "hand": "both",
    }
    if run_id is not None:
        record["run_id"] = run_id
    with connect(settings.database_url) as conn:
        init_db(conn)
        database.insert_practice_signal(conn, record)


# -- Estado terminal y cierre de sesión -------------------------------------


def test_finished_es_el_estado_terminal() -> None:
    from piano_mentor.practice import SESSION_STATUSES, TERMINAL_STATUSES

    assert "finished" in SESSION_STATUSES
    assert TERMINAL_STATUSES == ("finished",)


def test_finish_cierra_la_sesion_y_es_idempotente(session_id: str) -> None:
    assert client.post(f"/api/v1/sessions/{session_id}/finish").status_code == 200
    estado = client.get(f"/api/v1/sessions/{session_id}/state").json()
    assert estado["status"] == "finished"
    # Segunda pasada del cierre: misma respuesta, sin error.
    assert client.post(f"/api/v1/sessions/{session_id}/finish").status_code == 200
    assert client.get(f"/api/v1/sessions/{session_id}/state").json()["status"] == "finished"


def test_finish_de_sesion_inexistente_es_404() -> None:
    response = client.post("/api/v1/sessions/no-existe/finish")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "session_not_found"


def test_note_on_no_resucita_una_sesion_terminada(session_id: str) -> None:
    client.post(f"/api/v1/sessions/{session_id}/finish")
    state = service.receive_event(
        session_id,
        {"type": "note_on", "pitch": 60, "velocity": 64, "t_s": 0.0},
    )
    # La sesión sigue terminada: `finished` es terminal (B-033.8).
    assert state["status"] == "finished"


# -- Informe final ?final=true ----------------------------------------------


def test_informe_final_con_sesion_viva_es_409(session_id: str) -> None:
    _insert_signal(session_id, "gate-1", "hit", 0)
    response = client.get(f"/api/v1/sessions/{session_id}/practice-report?final=true")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "session_not_finished"


def test_informe_final_con_sesion_cerrada_es_200(session_id: str) -> None:
    _insert_signal(session_id, "gate-1", "hit", 0)
    client.post(f"/api/v1/sessions/{session_id}/finish")
    response = client.get(f"/api/v1/sessions/{session_id}/practice-report?final=true")
    assert response.status_code == 200
    assert response.json()["session"]["status"] == "finished"


def test_informe_sin_final_sigue_on_demand(session_id: str) -> None:
    # Compatibilidad con B-033.3: sin `final`, la sesión viva se informa igual.
    _insert_signal(session_id, "gate-1", "hit", 0)
    response = client.get(f"/api/v1/sessions/{session_id}/practice-report")
    assert response.status_code == 200
    assert response.json()["session"]["status"] == "idle"


def test_informe_final_de_sesion_inexistente_es_404() -> None:
    response = client.get("/api/v1/sessions/no-existe/practice-report?final=true")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "session_not_found"


# -- Bloque execution --------------------------------------------------------


def test_execution_cuenta_la_cola_de_la_pasada(session_id: str) -> None:
    _insert_signal(session_id, "gate-0.0000", "hit", 3)
    _insert_signal(session_id, "gate-4.5000", "wrong", 7)
    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    ejecucion = informe["execution"]
    assert ejecucion["run"] == 1
    assert ejecucion["last_gate_reached"] == "gate-4.5000"
    assert ejecucion["last_measure_reached"] == 7
    assert ejecucion["duration_audio_s"] is None  # el WAV aún no se pasa
    assert ejecucion["signals_emitted_vs_persisted"] is None  # sin eventos por WS


def test_execution_de_sesion_sin_senales_es_todo_none(session_id: str) -> None:
    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    ejecucion = informe["execution"]
    assert ejecucion["last_gate_reached"] is None
    assert ejecucion["last_measure_reached"] is None


def test_execution_con_duracion_audio_y_contadores(session_id: str) -> None:
    _insert_signal(session_id, "g1", "hit", 0)
    from piano_mentor.practice_report import session_report

    informe = session_report(
        session_id,
        execution={
            "duration_audio_s": 62.5,
            "signals_emitted_vs_persisted": {"received": 10, "persisted": 9, "lost": 1},
        },
    )
    assert informe["execution"]["duration_audio_s"] == 62.5
    assert informe["execution"]["signals_emitted_vs_persisted"] == {
        "received": 10,
        "persisted": 9,
        "lost": 1,
    }


def test_contadores_del_canal_reciben_persisten_y_cuentan_perdidas() -> None:
    practice_channel.reset()
    assert practice_channel.counters("s-canal") is None  # sin eventos, sin bloque
    practice_channel.record_received("s-canal")
    practice_channel.record_received("s-canal")
    practice_channel.record_persisted("s-canal")
    assert practice_channel.counters("s-canal") == {
        "received": 2,
        "persisted": 1,
        "lost": 1,
    }
    practice_channel.reset()
    assert practice_channel.counters("s-canal") is None


# -- Pasadas (runs) -----------------------------------------------------------


def test_senal_nueva_lleva_la_pasada_vigente(session_id: str) -> None:
    service.receive_practice_event(
        session_id,
        {"type": "practice", "gate": "g1", "measure": 0, "outcome": "hit", "wait_ms": 0},
    )
    with connect(settings.database_url) as conn:
        init_db(conn)
        señal = conn.execute(
            "SELECT run_id FROM practice_signals WHERE session_id = ?", (session_id,)
        ).fetchone()
    assert señal["run_id"] == 1  # sesión nueva: run 1


def test_runs_endpoint_abre_pasada_y_las_senales_la_llevan(session_id: str) -> None:
    response = client.post(f"/api/v1/sessions/{session_id}/runs")
    assert response.status_code == 200
    assert response.json() == {"run": 2}

    service.receive_practice_event(
        session_id,
        {"type": "practice", "gate": "g2", "measure": 1, "outcome": "hit", "wait_ms": 0},
    )
    with connect(settings.database_url) as conn:
        init_db(conn)
        señal = conn.execute(
            "SELECT run_id FROM practice_signals WHERE session_id = ?", (session_id,)
        ).fetchone()
    assert señal["run_id"] == 2


def test_runs_endpoint_de_sesion_inexistente_es_404() -> None:
    response = client.post("/api/v1/sessions/no-existe/runs")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "session_not_found"


def test_informe_informa_la_ultima_pasada_con_senales_y_resume_todas(session_id: str) -> None:
    # Pasada 1: dos señales (una fallida). Pasada 2 (reinicio explícito): una.
    _insert_signal(session_id, "g1", "miss", 0, run_id=1)
    _insert_signal(session_id, "g2", "hit", 1, run_id=1)
    _insert_signal(session_id, "g3", "hit", 2, run_id=2)
    client.post(f"/api/v1/sessions/{session_id}/runs")  # abre la pasada 3, aún sin señales
    _insert_signal(session_id, "g4", "hit", 0, run_id=3)

    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()

    # La última pasada CON señales es la 3: solo sus señales en el agregado.
    assert informe["execution"]["run"] == 3
    assert informe["session"]["signal_count"] == 4  # GLOBAL (compatibilidad B-033.3)
    assert [grupo["measure"] for grupo in informe["by_measure"]] == [0]
    assert informe["summary"]["signals"] == 1
    assert informe["signals"]["total"] == 1  # el conteo de la pasada informada

    # execution habla de la pasada informada.
    assert informe["execution"]["last_gate_reached"] == "g4"

    # El bloque runs resume TODAS las pasadas, comprimido y en orden.
    assert [entrada["run"] for entrada in informe["runs"]] == [1, 2, 3]
    assert [entrada["signal_count"] for entrada in informe["runs"]] == [2, 1, 1]
    assert informe["runs"][0]["outcomes"] == {"hit": 1, "miss": 1, "wrong": 0, "timeout": 0}
    assert informe["runs"][0]["hit_ratio"] == 0.5
    assert informe["runs"][2]["hit_ratio"] == 1.0


def test_informe_por_lib_puede_pedir_una_pasada_concreta(session_id: str) -> None:
    _insert_signal(session_id, "g1", "miss", 0, run_id=1)
    _insert_signal(session_id, "g2", "hit", 1, run_id=2)

    from piano_mentor.practice_report import session_report

    directa = session_report(session_id, run=1)
    assert directa["execution"]["run"] == 1
    assert directa["summary"]["signals"] == 1
    assert directa["session"]["signal_count"] == 2  # global intacto


def test_sesiones_viejas_sin_run_id_son_pasada_1(session_id: str) -> None:
    # Una señal «de antes de la migración»: la columna lleva DEFAULT 1.
    record: dict[str, object] = {
        "session_id": session_id,
        "gate": "g-viejo",
        "measure": 0,
        "outcome": "hit",
        "wait_ms": 0,
        "hand": "both",
    }
    with connect(settings.database_url) as conn:
        init_db(conn)
        conn.execute(
            "INSERT INTO practice_signals (session_id, gate, measure, outcome, wait_ms, hand, created_at)"
            " VALUES (?, ?, 0, 'hit', 0, 'both', '2026-01-01 00:00:00')",
            (session_id, "g-viejo"),
        )
        conn.commit()

    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    assert informe["execution"]["run"] == 1
    assert informe["summary"]["signals"] == 1
    assert [entrada["run"] for entrada in informe["runs"]] == [1]


# -- Señales anticipadas (B-033.9) --------------------------------------------


def test_senal_anticipada_se_persiste_y_llega_al_informe(session_id: str) -> None:
    service.receive_practice_event(
        session_id,
        {
            "type": "practice",
            "gate": "g-ant",
            "measure": 0,
            "outcome": "hit",
            "wait_ms": 0,
            "anticipated": True,
        },
    )
    with connect(settings.database_url) as conn:
        init_db(conn)
        row = conn.execute(
            "SELECT anticipated FROM practice_signals WHERE session_id = ?", (session_id,)
        ).fetchone()
    assert row["anticipated"] == 1

    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    assert informe["signals"]["items"][0]["anticipated"] is True


def test_senal_sin_bandera_es_una_resolucion_normal(session_id: str) -> None:
    service.receive_practice_event(
        session_id,
        {"type": "practice", "gate": "g-normal", "measure": 0, "outcome": "hit", "wait_ms": 0},
    )
    informe = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    assert informe["signals"]["items"][0]["anticipated"] is False


def test_anticipated_no_booleano_se_rechaza(session_id: str) -> None:
    from piano_mentor.validators import ValidationError

    with pytest.raises(ValidationError) as fallo:
        service.receive_practice_event(
            session_id,
            {
                "type": "practice",
                "gate": "g-malo",
                "measure": 0,
                "outcome": "hit",
                "wait_ms": 0,
                "anticipated": "sí",
            },
        )
    assert fallo.value.code == "invalid_event_payload"


def test_el_informe_sigue_determinista_con_runs(session_id: str) -> None:
    _insert_signal(session_id, "g1", "miss", 0, run_id=1)
    _insert_signal(session_id, "g2", "hit", 1, run_id=2)
    informe_1 = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    informe_2 = client.get(f"/api/v1/sessions/{session_id}/practice-report").json()
    # `generated_at` es el único campo volátil; todo lo demás es igual.
    assert informe_1.pop("generated_at") is not None
    assert informe_2.pop("generated_at") is not None
    assert informe_1 == informe_2
