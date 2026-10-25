# description: Máquina de estados, reglas, validación y propuesta LLM del agente (B-012.3/.4/.6).
# context: Confianza en el fallback sin LLM: cada regla, su prioridad, sus bordes, la validación y la propuesta.

"""Tests de B-012.3, B-012.4 y B-012.6: máquina de estados, reglas, validación y propuesta."""

from __future__ import annotations

from typing import Self

import pytest

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
from piano_mentor.llm import (
    FallbackProvider,
    MockProvider,
    OpenAICompatibleProvider,
    _esquema_de_acciones,
)
from piano_mentor.validators import ValidationError

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


# --- Validación de acciones (B-012.4) ---------------------------------------


class TestActionValidation:
    """Matriz acción × param inválido → código de error estable."""

    def setup_method(self) -> None:
        self.service = AgentService()

    # --- Whitelist ---

    def test_invalid_action_code(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("hack")
        assert exc_info.value.code == "invalid_action"

    def test_empty_action_code(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("")
        assert exc_info.value.code == "invalid_action"

    # --- return_control ---

    def test_return_control_with_params_rejected(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("return_control", {"tempo": 1.0})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_return_control_without_agent_control_rejected(self) -> None:
        state = {"control": "student"}
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("return_control", session_state=state)
        assert exc_info.value.code == "action_not_allowed_now"

    def test_return_control_with_agent_control_ok(self) -> None:
        state = {"control": "agent"}
        self.service.validate_action("return_control", session_state=state)

    # --- slow_down ---

    def test_slow_down_tempo_factor_low(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("slow_down", {"tempo_factor": 0.4})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_slow_down_tempo_factor_high(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("slow_down", {"tempo_factor": 0.95})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_slow_down_tempo_factor_valid(self) -> None:
        self.service.validate_action("slow_down", {"tempo_factor": 0.7})

    def test_slow_down_measures_too_many(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("slow_down", {"measures": 3})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_slow_down_non_numeric_tempo(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("slow_down", {"tempo_factor": "fast"})
        assert exc_info.value.code == "action_params_out_of_range"

    # --- demonstrate ---

    def test_demonstrate_tempo_factor_high(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("demonstrate", {"tempo_factor": 0.9})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_demonstrate_to_measure_before_from(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "demonstrate", {"from_measure": 5, "to_measure": 3}
            )
        assert exc_info.value.code == "action_params_out_of_range"

    def test_demonstrate_too_many_measures(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "demonstrate", {"from_measure": 0, "to_measure": 17}
            )
        assert exc_info.value.code == "action_params_out_of_range"

    def test_demonstrate_valid_range(self) -> None:
        self.service.validate_action(
            "demonstrate", {"from_measure": 0, "to_measure": 16, "tempo_factor": 0.7}
        )

    def test_demonstrate_negative_from_measure(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "demonstrate", {"from_measure": -1, "to_measure": 5}
            )
        assert exc_info.value.code == "action_params_out_of_range"

    def test_demonstrate_non_integer_measures(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "demonstrate", {"from_measure": "a", "to_measure": 5}
            )
        assert exc_info.value.code == "action_params_out_of_range"

    # --- accompany ---

    def test_accompany_invalid_hand(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("accompany", {"hand": "middle"})
        assert exc_info.value.code == "action_params_out_of_range"

    def test_accompany_valid_hand(self) -> None:
        self.service.validate_action(
            "accompany", {"hand": "left", "from_measure": 0, "to_measure": 8}
        )

    def test_accompany_too_many_measures(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "accompany", {"hand": "both", "from_measure": 0, "to_measure": 33}
            )
        assert exc_info.value.code == "action_params_out_of_range"

    # --- give_hint ---

    def test_give_hint_duplicate_measure_rejected(self) -> None:
        history = [{"action": "give_hint", "measure": 3}]
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action(
                "give_hint", {"measure": 3}, history=history
            )
        assert exc_info.value.code == "action_not_allowed_now"

    def test_give_hint_different_measure_ok(self) -> None:
        history = [{"action": "give_hint", "measure": 3}]
        self.service.validate_action("give_hint", {"measure": 5}, history=history)

    # --- wait chaining ---

    def test_wait_chaining_limit(self) -> None:
        history = [{"action": "wait"}, {"action": "wait"}]
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_action("wait", history=history)
        assert exc_info.value.code == "action_not_allowed_now"

    def test_wait_chaining_below_limit_ok(self) -> None:
        history = [{"action": "wait"}]
        self.service.validate_action("wait", history=history)

    def test_wait_after_other_action_ok(self) -> None:
        """Una acción distinta de wait reinicia el contador de encadenamiento."""
        history = [{"action": "give_hint"}, {"action": "wait"}]
        self.service.validate_action("wait", history=history)

    def test_wait_duration_s_range(self) -> None:
        self.service.validate_action("wait", {"duration_s": 15.0})
        with pytest.raises(ValidationError):
            self.service.validate_action("wait", {"duration_s": 31.0})
        with pytest.raises(ValidationError):
            self.service.validate_action("wait", {"duration_s": 0.0})

    # --- Validaciones válidas ---

    def test_all_valid_actions_pass(self) -> None:
        """Matriz de acciones válidas: ninguna lanza excepción."""
        valid_cases = [
            ("wait", {"duration_s": 10.0}, None, None),
            ("give_hint", {"measure": 2}, None, None),
            ("slow_down", {"tempo_factor": 0.7, "measures": 2}, None, None),
            (
                "demonstrate",
                {"from_measure": 0, "to_measure": 8, "tempo_factor": 0.6},
                None,
                None,
            ),
            (
                "accompany",
                {"hand": "right", "from_measure": 0, "to_measure": 16},
                None,
                None,
            ),
            ("return_control", None, {"control": "agent"}, None),
        ]
        for action, params, state, history in valid_cases:
            self.service.validate_action(action, params, session_state=state, history=history)


# --- Propuesta de acción con LLM (B-012.6) -----------------------------------


class TestProposeAction:
    """propose_action(): LLM si hay proveedor, fallback determinista si no."""

    def setup_method(self) -> None:
        self.service = AgentService()

    def test_without_provider_uses_deterministic(self) -> None:
        """Sin proveedor, la propuesta viene de las reglas deterministas."""
        ctx = _ctx()
        proposal = self.service.propose_action(ctx)
        assert proposal.action == "wait"
        assert proposal.provider == "deterministic"
        assert proposal.used_fallback is False

    def test_mock_provider_low_precision(self) -> None:
        """MockProvider propone demonstrate con precisión baja."""
        ctx = _ctx(evaluation=_eval(accuracy_pct=30.0))
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "demonstrate"
        assert proposal.provider == "mock"

    def test_mock_provider_repeated_errors(self) -> None:
        ctx = _ctx(evaluation=_eval(wrong_pitch=5))
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "give_hint"

    def test_mock_provider_timing_off(self) -> None:
        ctx = _ctx(evaluation=_eval(timing_ms=300.0))
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "slow_down"

    def test_mock_provider_all_good(self) -> None:
        ctx = _ctx(evaluation=_eval(accuracy_pct=95.0, timing_ms=50.0))
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "wait"

    def test_mock_provider_student_silent(self) -> None:
        ctx = _ctx(seconds_since_last_note=SILENCE_TIMEOUT_S + 1)
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "wait"
        assert "silen" in proposal.reason

    def test_mock_provider_agent_control(self) -> None:
        ctx = _ctx(control="agent", history=[{"action": "demonstrate", "measure": 0}])
        proposal = self.service.propose_action(ctx, provider=MockProvider())
        assert proposal.action == "wait"

    def test_fallback_provider_uses_mock_when_first_fails(self) -> None:
        """FallbackProvider salta al siguiente si el primero falla."""
        chain = FallbackProvider([MockProvider()])
        ctx = _ctx(evaluation=_eval(accuracy_pct=30.0))
        proposal = self.service.propose_action(ctx, provider=chain)
        assert proposal.action == "demonstrate"
        assert proposal.provider == "mock"

    def test_failing_provider_falls_back_to_deterministic(self) -> None:
        """Si el proveedor lanza excepción, se usa el fallback determinista."""

        class BrokenProvider(MockProvider):
            def propose_action(self, state):
                raise RuntimeError("red caída")

        ctx = _ctx(evaluation=_eval(accuracy_pct=30.0))
        proposal = self.service.propose_action(ctx, provider=BrokenProvider())
        assert proposal.action == "demonstrate"  # regla determinista
        assert proposal.provider == "deterministic"
        assert proposal.used_fallback is True

    def test_invalid_proposal_falls_back(self) -> None:
        """Si el LLM propone una acción inválida, se ignora y se usa decide()."""

        class BadProvider(MockProvider):
            def propose_action(self, state):
                from piano_mentor.llm import ActionProposal

                return ActionProposal("hack", provider="bad")

        ctx = _ctx()
        proposal = self.service.propose_action(ctx, provider=BadProvider())
        assert proposal.action == "wait"
        assert proposal.provider == "deterministic"
        assert proposal.used_fallback is True

    def test_proposal_always_in_whitelist(self) -> None:
        """La propuesta final siempre pasa la whitelist."""
        for eval_data in (None, _eval(), _eval(accuracy_pct=30.0), _eval(wrong_pitch=5)):
            ctx = _ctx(evaluation=eval_data)
            for provider in (None, MockProvider()):
                proposal = self.service.propose_action(ctx, provider=provider)
                assert proposal.action in ALLOWED_ACTIONS


# --- Salida estructurada del proveedor real (B-012.6) -------------------------


class _FakeResponse:
    """Respuesta HTTP mínima del proveedor OpenAI-compatible."""

    def __init__(self, content: str) -> None:
        self._content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return {"choices": [{"message": {"content": self._content}}]}


class _FakeClient:
    """Cliente httpx de mentira que devuelve siempre el mismo contenido."""

    content: str = ""

    def __init__(self, *args: object, **kwargs: object) -> None:
        return None

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *args: object) -> bool:
        return False

    def post(self, *args: object, **kwargs: object) -> _FakeResponse:
        return _FakeResponse(self.content)


class TestStructuredOutput:
    """propose_action() del proveedor real: JSON completo, cortado o inválido."""

    def _provider(self) -> OpenAICompatibleProvider:
        return OpenAICompatibleProvider(
            base_url="https://ejemplo.test/v1",
            api_key="clave-de-mentira",
            model="modelo-de-mentira",
            provider_name="groq",
        )

    def _patch_content(self, monkeypatch: pytest.MonkeyPatch, content: str) -> None:
        import httpx

        _FakeClient.content = content
        monkeypatch.setattr(httpx, "Client", _FakeClient)

    def test_valid_json_becomes_a_proposal(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_content(
            monkeypatch,
            '{"action": "slow_down", "params": {"tempo_factor": 0.7}, "reason": "va tarde"}',
        )
        proposal = self._provider().propose_action({"status": "playing"})
        assert proposal is not None
        assert proposal.action == "slow_down"
        assert proposal.params == {"tempo_factor": 0.7}
        assert proposal.provider == "groq"

    def test_json_wrapped_in_fence_is_parsed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_content(
            monkeypatch,
            '```json\n{"action": "wait", "params": {}, "reason": "todo bien"}\n```',
        )
        proposal = self._provider().propose_action({})
        assert proposal is not None
        assert proposal.action == "wait"

    def test_truncated_json_falls_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Una respuesta cortada por max_tokens no es propuesta: es un fallo."""
        self._patch_content(monkeypatch, '{"action": "slow_down", "tempo_')
        assert self._provider().propose_action({}) is None

    def test_action_outside_the_whitelist_is_rejected(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_content(
            monkeypatch, '{"action": "rm -rf", "params": {}, "reason": "motivo"}'
        )
        assert self._provider().propose_action({}) is None

    def test_proposal_of_real_provider_is_validated_by_the_service(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """El LLM propone fuera de rango → el servicio cae al fallback."""
        self._patch_content(
            monkeypatch,
            '{"action": "slow_down", "params": {"tempo_factor": 5.0}, "reason": "muy lento"}',
        )
        proposal = AgentService().propose_action(
            _ctx(), provider=self._provider()
        )
        assert proposal.provider == "deterministic"
        assert proposal.used_fallback is True


class TestEsquemaDeAcciones:
    """El esquema del prompt refleja los límites reales de validación."""

    def test_contiene_los_limites_reales(self) -> None:
        texto = _esquema_de_acciones()
        # slow_down: tempo entre 0.5 y 0.9 (PARAM_RANGES)
        assert '"tempo_factor": número entre 0.5 y 0.9' in texto
        # demonstrate: máx 16 compases (MAX_MEASURES)
        assert "máx 16 compases" in texto
        # accompany: enum de mano (ENUM_PARAMS)
        assert '"hand": both | left | right' in texto
        # todas las acciones de la whitelist aparecen
        for action in ALLOWED_ACTIONS:
            assert f"- {action}:" in texto

    def test_return_control_explica_su_condicion(self) -> None:
        """Evita que el modelo proponga devolver el control sin tenerlo."""
        assert "return_control" in _esquema_de_acciones()
        assert "control` = agent" in _esquema_de_acciones()
