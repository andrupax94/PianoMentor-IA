# description: Reglas deterministas de strikes del modo espera (B-032.6): agrega señales de práctica por compás y decide si el agente actúa (slow_down, give_hint, demonstrate).
# context: Puro y sin E/S: recibe la ventana de señales (una entrada por gate con su último outcome) y los recuentos de intervenciones ya ejecutadas, y devuelve una decisión del agente o None. El encadenado de `return_control` y las E/S viven fuera de aquí. Importa de `agent` a nivel de módulo; `agent.py` solo importa este módulo dentro de `decide()` para no partir el ciclo.

"""Reglas deterministas de strikes del modo espera (B-032.6).

El navegador mide (gate por gate) y aquí se decide por compás. Un compás con
ocho notas no puede dar ocho strikes: se cuentan **gates distintos** fallados,
y el último outcome de cada gate manda — un `hit` posterior borra el fallo,
que es el reseteo al acertar.

Reglas (por prioridad; si ninguna aplica, no hay intervención):

    1. `timeout` en la ventana de señales (silencio del alumno) → `demonstrate`
       del compás.
    2. 3 gates distintos fallados → `give_hint` (como mucho uno por compás).
    3. 2 gates distintos fallados → `slow_down` (factor ya validado por B-012.4).

Topes para no crear bucles de intervención: por compás hay un máximo de
demostraciones, pistas y bajadas de tempo, y la sesión entera tiene tope. Al
llegar a un tope las reglas callan y queda la recuperación manual del gate
(saltarlo), además de las reglas batch de B-012.2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .agent import ACTION_TO_STATE, DEFAULT_PARAMS, AgentDecision

if TYPE_CHECKING:
    from collections.abc import Iterable

# Outcomes que cuentan como fallo del gate. `hit` resetea a ese gate.
FAILED_OUTCOMES = frozenset(("miss", "wrong", "timeout"))

# Umbrales de la escalera (B-032.6): 2 fallos → slow_down; 3 → give_hint.
STRIKES_FOR_SLOW_DOWN = 2
STRIKES_FOR_HINT = 3

# Motivos estables de las decisiones; viajan en `agent_action.reason`.
REASON_TIMEOUT_SILENCE = "gate_timeout_silence"
REASON_STRIKES = "gate_repeated_strikes"

# --- Topes anti-bucle (por compás y por sesión) ------------------------------

# Máximo de `slow_down` por compás.
MAX_SLOWDOWNS_PER_MEASURE = 2
# Máximo de `give_hint` por compás (coherente con agent.MAX_HINTS_PER_MEASURE).
MAX_HINTS_PER_MEASURE = 1
# Máximo de `demonstrate` por compás.
MAX_DEMOS_PER_MEASURE = 3
# Máximo de intervenciones de strikes en toda la sesión.
MAX_STRIKE_ACTIONS_PER_SESSION = 8


@dataclass
class PracticeMeasure:
    """Estado de práctica de un compás, listo para las reglas.

    - `strikes`: gates distintos cuyo último outcome en el compás es un fallo.
    - `timed_out`: True si algún gate agotó su margen (silencio del alumno).
    - `hands`: manos presentes en las señales del compás.
    """

    measure: int | None
    strikes: int = 0
    timed_out: bool = False
    hands: set[str] = field(default_factory=set)


@dataclass
class InterventionLimits:
    """Recuentos de intervenciones ya ejecutadas, que acotan las reglas."""

    slow_downs_in_measure: int = 0
    hints_in_measure: int = 0
    demos_in_measure: int = 0
    session_actions: int = 0


def measure_state(
    window: Iterable[dict[str, object]],
    measure: int | None,
) -> PracticeMeasure:
    """Resumen de un compás a partir de su ventana de señales.

    El último outcome de cada gate manda: un mismo gate repetido (reintento del
    front, o un `wrong` antes del `hit`) no suma dos strikes, y un `hit`
    posterior al fallo lo anula. Es el dedup por `gate` del contrato B-032.6.
    """
    latest: dict[str, str] = {}
    hands: set[str] = set()
    for signal in window:
        if signal.get("measure") != measure:
            continue
        outcome = str(signal.get("outcome"))
        latest[str(signal.get("gate"))] = outcome
        hands.add(str(signal.get("hand", "both")))
    state = PracticeMeasure(measure=measure, hands=hands)
    for outcome in latest.values():
        if outcome == "timeout":
            state.timed_out = True
        if outcome in FAILED_OUTCOMES:
            state.strikes += 1
    return state


def _demo_params(measure: int | None) -> dict[str, object]:
    """Parámetros de `demonstrate` de un compás (o de la pieza entera sin rejilla)."""
    params: dict[str, object] = {**DEFAULT_PARAMS["demonstrate"]}
    if measure is not None:
        params["from_measure"] = measure
        params["to_measure"] = measure
    return params


@dataclass
class StrikeContext:
    """Todo lo que las reglas de strikes deciden: señales, compás y límites.

    - `window`: señales del compás, una por gate con su último outcome (la
      deduplicación por `gate` ya la hizo quien llegó aquí).
    - `measure`: compás en curso; `None` si la pieza no trae rejilla.
    - `limits`: intervenciones ya ejecutadas, para acotar el bucle.
    """

    window: list[dict[str, object]] = field(default_factory=list)
    measure: int | None = None
    limits: InterventionLimits = field(default_factory=InterventionLimits)


def decide_strike_actions(
    state: PracticeMeasure,
    limits: InterventionLimits,
) -> tuple[str, dict[str, object], str] | None:
    """Devuelve (acción, params, motivo) si las reglas piden intervención.

    Es la parte pura que `decide()` del agente consume: sin estado de sesión ni
    persistencia, solo señales y límites ya computados.
    """
    # Tope global de la sesión: sin intervenciones, la sesión no es un castigo.
    if limits.session_actions >= MAX_STRIKE_ACTIONS_PER_SESSION:
        return None

    # Regla 1: silencio del alumno (timeout del gate) → demuestro el compás.
    if state.timed_out and limits.demos_in_measure < MAX_DEMOS_PER_MEASURE:
        return ("demonstrate", _demo_params(state.measure), REASON_TIMEOUT_SILENCE)

    # Regla 2: tres fallos del compás → pista (como mucho una por compás).
    if state.strikes >= STRIKES_FOR_HINT and limits.hints_in_measure < MAX_HINTS_PER_MEASURE:
        return ("give_hint", {**DEFAULT_PARAMS["give_hint"]}, REASON_STRIKES)

    # Regla 3: dos fallos del compás → bajar el tempo.
    if (
        state.strikes >= STRIKES_FOR_SLOW_DOWN
        and limits.slow_downs_in_measure < MAX_SLOWDOWNS_PER_MEASURE
    ):
        return ("slow_down", {**DEFAULT_PARAMS["slow_down"]}, REASON_STRIKES)

    return None


def decide_strikes(context: StrikeContext) -> AgentDecision | None:
    """Decisión del agente a partir de las señales de práctica, o `None`.

    Es el punto único donde las señales del navegador se convierten en acción
    del agente: `decide()` del agente la consume (B-032.6) y aquí no se toca
    ni el reloj ni el MIDI.
    """
    state = measure_state(context.window, context.measure)
    outcome = decide_strike_actions(state, context.limits)
    if outcome is None:
        return None
    action, params, reason = outcome
    return AgentDecision(
        action=action,
        params=params,
        reason=reason,
        state=ACTION_TO_STATE[action],
    )
