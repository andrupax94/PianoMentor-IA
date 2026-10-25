# description: Máquina de estados, reglas deterministas y validación del agente (B-012.3).
# context: Confianza en el fallback sin LLM: cada regla, su prioridad y sus bordes.

"""Tests de B-012.3: máquina de estados y reglas deterministas del agente."""

from __future__ import annotations

from piano_mentor.agent import (
    ALLOWED_ACTIONS,
    LOW_PRECISION_THRESHOLD,
    REPEATED_ERRORS_THRESHOLD,
    RETURN_CONTROL_AFTER_MEASURES,
    SILENCE_TIMEOUT_S,
    TIMING_THRESHOLD_MS,
    AgentService,
    DecisionContext,
)

# --- Helpers ----------------------------------------------------------------


def _ctx(
    *,
    control: str = "student",
    current_measure: int = 0,
    evaluation: dict | None = None,
    history: list | None = None,
    seconds_since_last_note: float = 0.0,
) -> DecisionContext:
    """Construye un DecisionContext mínimo para los tests."""
    return DecisionContext(
        session_state={
            "session_id": "s1",
            "piece_id": "p1",
            "status": "playing",
            "control": control,
            "current_measure": current_measure,
            "position_s": 0.0,
        },
        evaluation=evaluation,
        history=history or [],
        seconds_since_last_note=seconds_since_last_note,
    )


def _eval(
    *,
    accuracy_pct: float = 100.0,
    timing_ms: float = 0.0,
    wrong_pitch: int = 0,
    **extra: object,
) -> dict:
    """Construye un dict de evaluación mínimo para los tests."""
    return {
        "accuracy_pct": accuracy_pct,
        "timing_ms": timing_ms,
        "counts": {"wrong_pitch": wrong_pitch},
        **extra,
    }


# --- Transiciones de estado -------------------------------------------------


class TestStateTransitions:
    def test_default_is_wait(self) -> None:
        service = AgentService()
        decision = service.decide(_ctx())
        assert decision.action == "wait"
        assert decision.state == "waiting_for_student"
        assert decision.reason == "all_good"

    def test_agent_control_returns_control_after_measures(self) -> None:
        service = AgentService()
        ctx = _ctx(
            control="agent",
            current_measure=RETURN_CONTROL_AFTER_MEASURES,
            history=[{"action": "demonstrate", "measure": 0}],
        )
        decision = service.decide(ctx)
        assert decision.action == "return_control"
        assert decision.state == "returning_control"
        assert decision.reason == "demo_period_ended"

    def test_agent_control_before_measures_elapsed(self) -> None:
        service = AgentService()
        ctx = _ctx(
            control="agent",
            current_measure=RETURN_CONTROL_AFTER_MEASURES - 1,
            history=[{"action": "demonstrate", "measure": 0}],
        )
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "agent_has_control"

    def test_agent_control_slow_down_returns_control(self) -> None:
        service = AgentService()
        ctx = _ctx(
            control="agent",
            current_measure=5,
            history=[{"action": "slow_down", "measure": 2}],
        )
        decision = service.decide(ctx)
        assert decision.action == "return_control"

    def test_agent_control_without_history_waits(self) -> None:
        service = AgentService()
        ctx = _ctx(control="agent", history=[])
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "agent_has_control"


# --- Reglas -----------------------------------------------------------------


class TestRules:
    def test_student_silent(self) -> None:
        service = AgentService()
        ctx = _ctx(seconds_since_last_note=SILENCE_TIMEOUT_S + 1)
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "student_silent"

    def test_low_precision_demonstrate(self) -> None:
        service = AgentService()
        ctx = _ctx(evaluation=_eval(accuracy_pct=LOW_PRECISION_THRESHOLD - 1))
        decision = service.decide(ctx)
        assert decision.action == "demonstrate"
        assert decision.state == "demonstrating"
        assert "tempo_factor" in decision.params

    def test_repeated_errors_give_hint(self) -> None:
        service = AgentService()
        ctx = _ctx(evaluation=_eval(wrong_pitch=REPEATED_ERRORS_THRESHOLD))
        decision = service.decide(ctx)
        assert decision.action == "give_hint"
        assert decision.state == "giving_hint"

    def test_timing_off_slow_down(self) -> None:
        service = AgentService()
        ctx = _ctx(evaluation=_eval(timing_ms=TIMING_THRESHOLD_MS + 1))
        decision = service.decide(ctx)
        assert decision.action == "slow_down"
        assert decision.state == "slowing_down"
        assert decision.params["tempo_factor"] == 0.7

    def test_good_performance_waits(self) -> None:
        service = AgentService()
        ctx = _ctx(evaluation=_eval(accuracy_pct=95.0, timing_ms=50.0))
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "all_good"


# --- Prioridad entre reglas -------------------------------------------------


class TestRulePriority:
    def test_silent_beats_evaluation(self) -> None:
        """Silencio del estudiante tiene prioridad sobre cualquier evaluación."""
        service = AgentService()
        ctx = _ctx(
            evaluation=_eval(accuracy_pct=30.0, wrong_pitch=5),
            seconds_since_last_note=SILENCE_TIMEOUT_S + 1,
        )
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "student_silent"

    def test_low_precision_beats_repeated_errors(self) -> None:
        """Precisión baja gana a errores repetidos."""
        service = AgentService()
        ctx = _ctx(evaluation=_eval(accuracy_pct=50.0, wrong_pitch=5))
        decision = service.decide(ctx)
        assert decision.action == "demonstrate"

    def test_repeated_errors_beat_timing(self) -> None:
        """Errores repetidos ganan a timing malo."""
        service = AgentService()
        ctx = _ctx(evaluation=_eval(timing_ms=300.0, wrong_pitch=3))
        decision = service.decide(ctx)
        assert decision.action == "give_hint"

    def test_agent_control_beats_all(self) -> None:
        """Si el agente tiene el control, las reglas de evaluación no aplican."""
        service = AgentService()
        ctx = _ctx(
            control="agent",
            evaluation=_eval(accuracy_pct=30.0, wrong_pitch=5),
            history=[{"action": "demonstrate", "measure": 0}],
            current_measure=0,
        )
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "agent_has_control"


# --- Bordes -----------------------------------------------------------------


class TestEdgeCases:
    def test_no_evaluation_defaults_wait(self) -> None:
        """Sin evaluación, la respuesta por defecto es wait."""
        service = AgentService()
        ctx = _ctx(evaluation=None)
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "all_good"

    def test_empty_history_no_crash(self) -> None:
        service = AgentService()
        ctx = _ctx(control="agent", history=[])
        decision = service.decide(ctx)
        assert decision.action == "wait"

    def test_zero_silence_no_trigger(self) -> None:
        """0 segundos de silencio no activa la regla de silencio."""
        service = AgentService()
        ctx = _ctx(seconds_since_last_note=0.0, evaluation=_eval())
        decision = service.decide(ctx)
        assert decision.action == "wait"
        assert decision.reason == "all_good"

    def test_exact_threshold_not_triggered(self) -> None:
        """En el umbral exacto la regla no se activa (es estricto)."""
        service = AgentService()
        ctx = _ctx(evaluation=_eval(timing_ms=TIMING_THRESHOLD_MS))
        decision = service.decide(ctx)
        assert decision.action == "wait"

    def test_params_are_not_shared(self) -> None:
        """Cada decisión recibe su propio dict de params (no compartido)."""
        service = AgentService()
        d1 = service.decide(_ctx(evaluation=_eval(timing_ms=300.0)))
        d2 = service.decide(_ctx(evaluation=_eval(timing_ms=300.0)))
        assert d1.params is not d2.params


# --- Validación de acciones -------------------------------------------------


class TestValidation:
    def test_all_allowed_actions(self) -> None:
        service = AgentService()
        for action in ALLOWED_ACTIONS:
            assert service.validate(action) is True

    def test_unknown_action_rejected(self) -> None:
        service = AgentService()
        assert service.validate("hack") is False
        assert service.validate("") is False
        assert service.validate("WAIT") is False
