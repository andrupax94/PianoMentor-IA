# description: Tests de practice_rules.py (B-032.6): agregación por compás con el último outcome por gate, escalera 2/3/silencio, topes anti-bucle y decisiones completas.
# context: módulo puro: los tests no tocan SQLite ni WebSocket.

"""Tests de las reglas deterministas de strikes del modo espera (B-032.6)."""

from __future__ import annotations

from piano_mentor.practice_rules import (
    FAILED_OUTCOMES,
    MAX_DEMOS_PER_MEASURE,
    MAX_HINTS_PER_MEASURE,
    MAX_SLOWDOWNS_PER_MEASURE,
    STRIKES_FOR_HINT,
    STRIKES_FOR_SLOW_DOWN,
    InterventionLimits,
    PracticeMeasure,
    StrikeContext,
    decide_strikes,
    decide_strike_actions,
    measure_state,
)

NO_LIMITS = InterventionLimits()


def _signal(gate: str, outcome: str, *, measure: int | None = 0, wait_ms: int = 0) -> dict[str, object]:
    """Señal de práctica como llega al backend, ya validada (B-032.5)."""
    return {"gate": gate, "measure": measure, "outcome": outcome, "wait_ms": wait_ms, "hand": "both"}


# --- Agregación ---------------------------------------------------------------


class TestMeasureState:
    """El grano es el gate: se cuentan gates distintos fallados."""

    def test_two_distinct_failed_gates_count_two(self) -> None:
        state = measure_state(
            [
                _signal("g1", "wrong"),
                _signal("g2", "wrong"),
                _signal("g3", "hit"),
            ],
            0,
        )
        assert state.strikes == 2
        assert state.timed_out is False

    def test_same_gate_repeated_counts_once(self) -> None:
        # Un reintento del front (repetir `wrong` del mismo gate) no es un segundo strike.
        state = measure_state([_signal("g1", "wrong"), _signal("g1", "wrong")], 0)
        assert state.strikes == 1

    def test_a_later_hit_resets_that_gate(self) -> None:
        # El último outcome de cada gate manda: fallé y luego acerté el gate.
        state = measure_state([_signal("g1", "wrong"), _signal("g1", "hit")], 0)
        assert state.strikes == 0
        assert state.timed_out is False

    def test_timeout_marks_the_measure(self) -> None:
        state = measure_state([_signal("g1", "timeout", wait_ms=2000)], 0)
        assert state.timed_out is True
        assert state.strikes == 1

    def test_signals_of_other_measures_are_ignored(self) -> None:
        state = measure_state([_signal("g1", "wrong", measure=3), _signal("g2", "wrong", measure=None)], 0)
        assert state.strikes == 0

    def test_hands_are_collected(self) -> None:
        signal = _signal("g1", "wrong")
        signal["hand"] = "left"
        state = measure_state([signal], 0)
        assert state.hands == {"left"}


# --- Escalera ----------------------------------------------------------------


class TestDecideStrikeActions:
    """2 fallos → slow_down; 3 → give_hint; silencio del gate → demonstrate."""

    def test_two_strikes_ask_for_slow_down(self) -> None:
        state = PracticeMeasure(measure=2, strikes=2)
        action, params, reason = decide_strike_actions(state, NO_LIMITS)
        assert (action, reason) == ("slow_down", "gate_repeated_strikes")
        assert params["tempo_factor"] == 0.7

    def test_three_strikes_ask_for_hint(self) -> None:
        state = PracticeMeasure(measure=2, strikes=3)
        action, params, _ = decide_strike_actions(state, NO_LIMITS)
        assert action == "give_hint"

    def test_timeout_asks_for_demonstration_of_that_measure(self) -> None:
        state = PracticeMeasure(measure=5, timed_out=True, strikes=1)
        action, params, reason = decide_strike_actions(state, NO_LIMITS)
        assert (action, reason) == ("demonstrate", "gate_timeout_silence")
        assert params["from_measure"] == 5
        assert params["to_measure"] == 5  # exactamente el compás problemático

    def test_demo_without_measures_covers_the_whole_piece(self) -> None:
        # Sin rejilla no hay compás: la demo sale sin sección y toca la pieza entera.
        state = PracticeMeasure(measure=None, timed_out=True)
        action, params, _ = decide_strike_actions(state, NO_LIMITS)
        assert action == "demonstrate"
        assert "from_measure" not in params

    def test_hints_have_a_cap_per_measure(self) -> None:
        state = PracticeMeasure(measure=2, strikes=3)
        limits = InterventionLimits(
            hints_in_measure=MAX_HINTS_PER_MEASURE,
            slow_downs_in_measure=MAX_SLOWDOWNS_PER_MEASURE,
        )
        assert decide_strike_actions(state, limits) is None

    def test_with_the_hint_spent_the_ladder_falls_to_slow_down(self) -> None:
        # La pista ya se dio (cap): si el compás sigue fallando, queda bajar el tempo.
        state = PracticeMeasure(measure=2, strikes=3)
        limits = InterventionLimits(hints_in_measure=MAX_HINTS_PER_MEASURE)
        outcome = decide_strike_actions(state, limits)
        assert outcome is not None and outcome[0] == "slow_down"

    def test_slow_downs_have_a_cap_per_measure(self) -> None:
        state = PracticeMeasure(measure=2, strikes=2)
        limits = InterventionLimits(slow_downs_in_measure=MAX_SLOWDOWNS_PER_MEASURE)
        assert decide_strike_actions(state, limits) is None

    def test_demos_have_a_cap_per_measure(self) -> None:
        state = PracticeMeasure(measure=2, timed_out=True)
        limits = InterventionLimits(demos_in_measure=MAX_DEMOS_PER_MEASURE)
        assert decide_strike_actions(state, limits) is None

    def test_the_session_has_a_global_cap(self) -> None:
        state = PracticeMeasure(measure=2, timed_out=True)
        limits = InterventionLimits(session_actions=10**9)
        assert decide_strike_actions(state, limits) is None

    def test_a_clean_measure_asks_for_nothing(self) -> None:
        state = PracticeMeasure(measure=2, strikes=0)
        assert decide_strike_actions(state, NO_LIMITS) is None

    def test_one_strike_is_not_enough(self) -> None:
        state = PracticeMeasure(measure=2, strikes=1)
        assert decide_strike_actions(state, NO_LIMITS) is None

    def test_the_thresholds_are_the_documented_ladder(self) -> None:
        assert STRIKES_FOR_SLOW_DOWN == 2
        assert STRIKES_FOR_HINT == 3


# --- Conexión con el agente ---------------------------------------------------


class TestDecideStrikes:
    """La decisión completa del agente sale de aquí."""


def test_decide_strikes_returns_a_full_decision() -> None:
    decision = decide_strikes(
        StrikeContext(
            window=[
                {"gate": "g1", "measure": 4, "outcome": "timeout", "wait_ms": 2500, "hand": "both"},
                {"gate": "g2", "measure": 4, "outcome": "hit", "wait_ms": 0, "hand": "both"},
            ],
            measure=4,
        )
    )
    assert decision is not None
    assert decision.action == "demonstrate"
    assert decision.state == "demonstrating"
    assert decision.params["from_measure"] == 4
    assert decision.reason == "gate_timeout_silence"


def test_decide_strikes_is_none_when_the_measure_is_clean() -> None:
    assert decide_strikes(StrikeContext(window=[_signal("g1", "hit")], measure=0)) is None


def test_failed_outcomes_are_the_three_failures() -> None:
    # `hit` resetea; el resto (incluido `miss`) cuenta como fallo del gate.
    assert FAILED_OUTCOMES == frozenset(("miss", "wrong", "timeout"))
