# description: Notas correctas, omitidas, adicionales y timing (B-012.2).
# context: Confianza en el evaluador determinista, sin LLM ni UI.

"""Tests del evaluador: matching por nota/acorde, timing y ventana de práctica."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.evaluation import (
    DEFAULT_TOLERANCE_MS,
    EvaluationService,
    PerformanceEvaluator,
)
from piano_mentor.main import app
from piano_mentor.midi import MidiService, NormalizedNote
from piano_mentor.storage import LocalPieceStorage
from piano_mentor.validators import ValidationError

client = TestClient(app)

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"
TEMPO_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "tempo_change.mid"

EMPTY_COUNTS = {
    "correct": 0,
    "early": 0,
    "late": 0,
    "wrong_pitch": 0,
    "omitted": 0,
    "extra": 0,
}


def _note(pitch: int, start: float, *, duration: float = 0.5) -> NormalizedNote:
    """Nota esperada de partida; el resto de campos no entran en la comparación."""
    return NormalizedNote(
        pitch=pitch,
        start_seconds=start,
        duration_seconds=duration,
        velocity=80,
        channel=0,
        track=0,
    )


def _on(pitch: int, t_s: float) -> dict[str, object]:
    return {"type": "note_on", "pitch": pitch, "velocity": 80, "t_s": t_s}


def _off(pitch: int, t_s: float) -> dict[str, object]:
    return {"type": "note_off", "pitch": pitch, "velocity": 0, "t_s": t_s}


def _perfect_take(path: Path = PRACTICE_FIXTURE) -> list[dict[str, object]]:
    """La pieza entera, exacta y a tiempo, en el orden en que la toca un teclado."""
    events: list[dict[str, object]] = []
    for note in MidiService().normalize(path):
        events.append(_on(note.pitch, note.start_seconds))
        events.append(_off(note.pitch, round(note.start_seconds + note.duration_seconds, 6)))
    events.sort(key=lambda event: (event["t_s"], 0 if event["type"] == "note_off" else 1))
    return events


class TestEvaluator:
    """La comparación pura: partitura y eventos entran, métricas salen."""

    def test_without_interpretation_there_is_no_score(self) -> None:
        result = PerformanceEvaluator().evaluate([], [])

        assert result["status"] == "computed"
        assert result["tolerance_ms"] == DEFAULT_TOLERANCE_MS
        assert result["expected_total"] == 0
        assert result["received_total"] == 0
        assert result["counts"] == EMPTY_COUNTS
        assert result["notes_score"] == 0.0
        assert result["timing_score"] == 0.0
        assert result["score_total"] == 0.0
        assert result["notes"] == []
        assert result["extras"] == []

    def test_exact_performance_scores_one_hundred(self) -> None:
        expected = [_note(60, 0.0), _note(62, 1.0)]
        received = [_on(60, 0.0), _on(62, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 2}
        assert result["notes_score"] == 1.0
        assert result["timing_score"] == 1.0
        assert result["accuracy_pct"] == 100.0
        assert result["timing_ms"] == 0.0
        assert result["drift_ms"] == 0.0
        assert result["score_total"] == 100.0

    def test_releasing_a_key_is_not_an_extra(self) -> None:
        expected = [_note(60, 0.0), _note(62, 1.0)]
        received = [_on(60, 0.0), _off(60, 0.5), _on(62, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert result["received_total"] == 2
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 2}

    def test_note_inside_the_tolerance_is_correct(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 1.0)], [_on(60, 1.05)])

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1}
        assert result["timing_ms"] == 50.0
        assert result["timing_score"] == 0.5
        assert result["score_total"] == 85.0

    def test_late_note_is_classified_as_late(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 1.0)], [_on(60, 1.15)])

        assert result["counts"] == {**EMPTY_COUNTS, "late": 1}
        assert result["timing_ms"] == 150.0
        assert result["drift_ms"] == 150.0
        assert result["timing_score"] == 0.0
        assert result["notes"] == [
            {
                "start_seconds": 1.0,
                "expected_pitches": [60],
                "status": "late",
                "received_pitches": [60],
                "deviation_ms": 150.0,
            }
        ]
        # La tecla es correcta: mitad de crédito de nota, nada de tiempo.
        assert result["notes_score"] == 0.5
        assert result["score_total"] == 35.0

    def test_early_note_is_classified_as_early(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 1.0)], [_on(60, 0.7)])

        assert result["counts"] == {**EMPTY_COUNTS, "early": 1}
        assert result["drift_ms"] == -300.0
        assert result["notes"][0]["status"] == "early"

    def test_wrong_pitch_in_the_right_moment_is_not_an_extra(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 1.0)], [_on(61, 1.0)])

        assert result["counts"] == {**EMPTY_COUNTS, "wrong_pitch": 1}
        assert result["notes"][0]["received_pitches"] == [61]
        assert result["extras"] == []

    def test_omitted_note_is_not_charged_twice(self) -> None:
        expected = [_note(60, 0.0), _note(62, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, [_on(60, 0.0)])

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1, "omitted": 1}
        assert result["notes_score"] == 0.5
        assert result["extras"] == []

    def test_extra_note_costs_two_points(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 0.0)], [_on(60, 0.0), _on(72, 3.0)])

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1, "extra": 1}
        assert result["extras"] == [{"pitch": 72, "t_s": 3.0, "status": "extra"}]
        assert result["score_total"] == 98.0

    def test_a_repeated_pitch_needs_one_press_per_note(self) -> None:
        expected = [_note(60, 0.0), _note(60, 1.0)]
        received = [_on(60, 0.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert [note["status"] for note in result["notes"]] == ["correct", "omitted"]


class TestChords:
    """Un acorde es una unidad (B-009): o suenan todas las teclas o falla entero."""

    def test_chord_counts_as_a_single_unit(self) -> None:
        expected = [_note(67, 1.0), _note(60, 1.0), _note(64, 1.0)]
        received = [_on(60, 1.0), _on(64, 1.0), _on(67, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert len(result["notes"]) == 1
        assert result["expected_total"] == 1
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1}

    def test_chord_with_a_missing_key_fails_as_a_whole(self) -> None:
        expected = [_note(60, 1.0), _note(64, 1.0), _note(67, 1.0)]
        received = [_on(60, 1.0), _on(64, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert result["counts"] == {**EMPTY_COUNTS, "omitted": 1}
        assert result["notes"][0]["received_pitches"] == [60, 64]

    def test_chord_with_a_wrong_key_is_wrong_pitch(self) -> None:
        expected = [_note(60, 1.0), _note(64, 1.0), _note(67, 1.0)]
        received = [_on(60, 1.0), _on(64, 1.0), _on(68, 1.0)]

        result = PerformanceEvaluator().evaluate(expected, received)

        assert result["counts"] == {**EMPTY_COUNTS, "wrong_pitch": 1}
        assert result["notes"][0]["received_pitches"] == [60, 64, 68]


class TestTolerance:
    """La tolerancia es configurable y sus límites se comprueban."""

    def test_wider_tolerance_accepts_a_slower_note(self) -> None:
        result = PerformanceEvaluator().evaluate([_note(60, 1.0)], [_on(60, 1.15)], 200)

        assert result["tolerance_ms"] == 200
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1}
        assert result["timing_score"] == 0.25

    @pytest.mark.parametrize("tolerance_ms", [0, -5, 5000])
    def test_out_of_range_tolerance_is_rejected(self, tolerance_ms: int) -> None:
        with pytest.raises(ValidationError) as excinfo:
            PerformanceEvaluator().evaluate([], [], tolerance_ms)

        assert excinfo.value.code == "invalid_tolerance"


class TestVariableTempoPiece:
    """La pieza de tempo cambia a mitad de frase; se evalúa en segundos (B-012.2)."""

    def test_perfect_take_of_the_tempo_change_piece(self) -> None:
        notes = MidiService().normalize(TEMPO_FIXTURE)

        result = PerformanceEvaluator().evaluate(notes, _perfect_events(notes))

        assert result["expected_total"] == 2
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 2}
        assert result["score_total"] == 100.0

    def test_a_late_note_after_the_tempo_change_is_late(self) -> None:
        notes = MidiService().normalize(TEMPO_FIXTURE)
        events = [_on(notes[0].pitch, notes[0].start_seconds)]
        events.append(_on(notes[1].pitch, notes[1].start_seconds + 0.3))

        result = PerformanceEvaluator().evaluate(notes, events)

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 1, "late": 1}
        assert result["notes"][1]["deviation_ms"] == 300.0


def _perfect_events(notes: list[NormalizedNote]) -> list[dict[str, object]]:
    return [_on(note.pitch, note.start_seconds) for note in notes]


def _service(
    notes: list[NormalizedNote],
    events: list[Mapping[str, object]],
    *,
    piece_id: str = "p1",
    window: tuple[float, float] | None = None,
) -> EvaluationService:
    """Servicio con las dependencias sustituidas: mismas reglas, sin disco."""
    return EvaluationService(
        session_reader=lambda session_id: {"piece_id": piece_id},
        piece_lookup=lambda pid: (
            {"id": pid, "midi_path": None, "stored_filename": "x"} if pid == piece_id else None
        ),
        event_reader=lambda session_id: events,
        note_reader=lambda row: notes,
        window_resolver=lambda row, from_measure, to_measure: (
            window or (float(from_measure), float(to_measure))
        ),
    )


class TestEvaluationService:
    """El caso de uso: sesión, pieza, ventana y log antes de comparar."""

    def test_unknown_session_is_reported(self) -> None:
        def _no_session(session_id: str) -> Mapping[str, object]:
            raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")

        service = EvaluationService(session_reader=_no_session, piece_lookup=lambda pid: None)

        with pytest.raises(ValidationError) as excinfo:
            service.evaluate("s1")

        assert excinfo.value.code == "session_not_found"

    def test_unknown_piece_is_reported(self) -> None:
        service = EvaluationService(
            session_reader=lambda session_id: {"piece_id": "borrada"},
            piece_lookup=lambda pid: None,
            event_reader=lambda session_id: [],
            note_reader=lambda row: [],
        )

        with pytest.raises(ValidationError) as excinfo:
            service.evaluate("s1")

        assert excinfo.value.code == "piece_not_found"

    def test_seconds_window_ignores_the_rest_of_the_piece(self) -> None:
        notes = [_note(60, 0.0), _note(62, 1.0), _note(64, 2.0), _note(66, 3.0)]
        events = [_on(60, 0.0), _on(62, 1.0), _on(64, 2.0), _on(66, 3.0), _on(90, 9.0)]

        result = _service(notes, events).evaluate("s1", from_s=0.0, to_s=1.0)

        assert result["expected_total"] == 2
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 2}
        assert result["from_s"] == 0.0
        assert result["to_s"] == 1.0

    def test_a_note_beyond_the_window_is_not_an_extra(self) -> None:
        """Tocar más allá de la ventana pedida no se penaliza: solo se pidió un trozo."""
        notes = [_note(60, 1.0), _note(62, 2.0)]
        events = [_on(60, 1.0), _on(62, 2.0), _on(90, 2.4)]

        result = _service(notes, events).evaluate("s1", from_s=0.0, to_s=2.0)

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 2}
        assert result["extras"] == []
        assert result["score_total"] == 100.0

    def test_measure_window_is_resolved_to_seconds(self) -> None:
        notes = [_note(60, 0.0), _note(62, 1.0), _note(64, 2.0), _note(66, 3.0)]
        events = [_on(note.pitch, note.start_seconds) for note in notes]

        result = _service(notes, events, window=(2.0, 3.0)).evaluate(
            "s1", from_measure=1, to_measure=3
        )

        assert result["expected_total"] == 2
        assert result["from_s"] == 2.0
        assert result["to_s"] == 3.0

    @pytest.mark.parametrize(
        ("kwargs", "code"),
        [
            ({"from_measure": 1}, "invalid_measure_range"),
            ({"from_measure": 3, "to_measure": 1}, "invalid_measure_range"),
            ({"from_measure": 1, "to_measure": 2, "from_s": 0.0}, "invalid_window"),
            ({"from_s": -1.0}, "invalid_window"),
            ({"from_s": 2.0, "to_s": 1.0}, "invalid_window"),
        ],
    )
    def test_invalid_windows_are_rejected(self, kwargs: dict[str, object], code: str) -> None:
        with pytest.raises(ValidationError) as excinfo:
            _service([], []).evaluate("s1", **kwargs)  # type: ignore[arg-type]

        assert excinfo.value.code == code


@pytest.fixture()
def piece_id(isolated_storage: LocalPieceStorage) -> str:
    """La frase de práctica subida de verdad: la sesión exige que exista."""
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


def _play(events: list[dict[str, object]], session_id: str) -> None:
    with client.websocket_connect(f"/api/v1/ws/sessions/{session_id}") as websocket:
        websocket.receive_json()
        for event in events:
            websocket.send_json(event)
            websocket.receive_json()


class TestEvaluationEndpoint:
    """El endpoint une la sesión de B-012.1 con el motor de B-012.2."""

    def test_perfect_take_scores_one_hundred(self, session_id: str) -> None:
        _play(_perfect_take(), session_id)

        response = client.post(f"/api/v1/sessions/{session_id}/evaluation")

        assert response.status_code == 200
        result = response.json()
        assert result["session_id"] == session_id
        assert result["expected_total"] == 12  # 22 notas agrupadas en 12 acordes
        assert result["received_total"] == 22
        assert result["counts"] == {**EMPTY_COUNTS, "correct": 12}
        assert result["notes_score"] == 1.0
        assert result["score_total"] == 100.0
        assert result["extras"] == []

    def test_a_session_without_events_scores_zero(self, session_id: str) -> None:
        response = client.post(f"/api/v1/sessions/{session_id}/evaluation")

        assert response.status_code == 200
        result = response.json()
        assert result["counts"] == {**EMPTY_COUNTS, "omitted": 12}
        assert result["score_total"] == 0.0

    def test_a_skipped_chord_note_marks_the_chord_as_omitted(self, session_id: str) -> None:
        # Del acorde del compás 2 (69, 72 y 76 a la vez) se pierde el 69.
        events = [
            event
            for event in _perfect_take()
            if not (event["pitch"] == 69 and event["type"] == "note_on" and event["t_s"] == 3.0)
        ]
        _play(events, session_id)

        result = client.post(f"/api/v1/sessions/{session_id}/evaluation").json()

        assert result["counts"] == {**EMPTY_COUNTS, "correct": 11, "omitted": 1}
        assert 0.0 < result["score_total"] < 100.0

    def test_evaluation_can_be_limited_to_a_measure_range(self, session_id: str) -> None:
        _play(_perfect_take(), session_id)

        response = client.post(
            f"/api/v1/sessions/{session_id}/evaluation?from_measure=0&to_measure=2"
        )

        assert response.status_code == 200
        result = response.json()
        assert result["from_s"] == 0.0
        assert result["expected_total"] < 12
        assert result["counts"]["correct"] == result["expected_total"]
        assert result["score_total"] == 100.0

    def test_evaluation_can_be_limited_to_a_window_of_seconds(self, session_id: str) -> None:
        _play(_perfect_take(), session_id)

        result = client.post(f"/api/v1/sessions/{session_id}/evaluation?from_s=0&to_s=2").json()

        assert result["from_s"] == 0.0
        assert result["to_s"] == 2.0
        assert result["expected_total"] == 5  # los cuatro ataques del compás 1 + el del 2
        assert result["score_total"] == 100.0

    def test_tolerance_is_configurable_per_request(self, session_id: str) -> None:
        events = _perfect_take()
        delayed = [dict(event) for event in events]
        for event in delayed:
            if event["type"] == "note_on":
                event["t_s"] = round(float(event["t_s"]) + 0.15, 6)
        _play(delayed, session_id)

        strict = client.post(f"/api/v1/sessions/{session_id}/evaluation").json()
        lenient = client.post(f"/api/v1/sessions/{session_id}/evaluation?tolerance_ms=200").json()

        assert strict["counts"]["late"] == 12
        assert strict["notes_score"] == 0.5
        assert strict["score_total"] == 35.0
        assert lenient["counts"]["correct"] == 12
        assert lenient["notes_score"] == 1.0
        assert lenient["score_total"] > strict["score_total"]

    def test_unknown_session_returns_404(self) -> None:
        response = client.post("/api/v1/sessions/no-existe/evaluation")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "session_not_found"

    @pytest.mark.parametrize(
        ("query", "code"),
        [
            ("?from_measure=1", "invalid_measure_range"),
            ("?from_measure=3&to_measure=1", "invalid_measure_range"),
            ("?from_measure=0&to_measure=1&from_s=0", "invalid_window"),
            ("?from_s=-1", "invalid_window"),
            ("?tolerance_ms=0", "invalid_tolerance"),
            ("?tolerance_ms=5000", "invalid_tolerance"),
        ],
    )
    def test_invalid_parameters_return_400(self, session_id: str, query: str, code: str) -> None:
        response = client.post(f"/api/v1/sessions/{session_id}/evaluation{query}")

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == code


def test_the_service_accepts_injected_dependencies() -> None:
    """El servicio se puede cablear con callables simples, sin disco ni red."""

    def _session(session_id: str) -> Mapping[str, object]:
        return {"piece_id": "p1"}

    service = EvaluationService(
        session_reader=_session,
        piece_lookup=lambda pid: {"id": pid, "midi_path": None, "stored_filename": "x"},
        event_reader=lambda session_id: [_on(60, 0.0)],
        note_reader=lambda row: [_note(60, 0.0)],
    )

    result = service.evaluate("s1")

    assert result["counts"]["correct"] == 1
