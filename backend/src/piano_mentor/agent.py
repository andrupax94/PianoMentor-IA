# description: Máquina de estados y reglas deterministas del agente (B-012.3).
# context: decide() recibe estado + evaluación + historial y devuelve acción. Sin LLM.

"""Máquina de estados y reglas deterministas del agente pedagógico (B-012.3).

El agente decide qué hacer con la sesión a partir de la evaluación de la
interpretación (B-012.2), el estado de la sesión (B-012.1) y su propio
historial. No controla MIDI ni ejecuta código externo: solo emite una acción
estructurada que el sistema valida y ejecuta.

Estados de la máquina (B-012.3):

    OBSERVING → EVALUATING → DECIDE_ACTION → uno de:
      WAITING_FOR_STUDENT | GIVING_HINT | SLOWING_DOWN |
      DEMONSTRATING | ACCOMPANYING | RETURNING_CONTROL

Reglas deterministas (por prioridad, de mayor a menor):

    1. Agente tiene control + periodo demonstrate/slow_down terminado → return_control
    2. Agente tiene control → wait (no interferir)
    3. Estudiante silencioso > SILENCE_TIMEOUT_S → wait
    4. Precisión < LOW_PRECISION_THRESHOLD → demonstrate
    5. wrong_pitch >= REPEATED_ERRORS_THRESHOLD → give_hint
    6. timing_ms > TIMING_THRESHOLD_MS → slow_down
    7. Default → wait

El LLM (B-012.6/B-012.8) puede proponer acciones, pero estas reglas son el
fallback obligatorio que garantiza que el flujo funciona sin red.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .validators import ValidationError

if TYPE_CHECKING:
    from .llm import ActionProposal, LLMProvider

# Lista blanca de acciones (B-012.3). El agente solo puede emitir estas.
ALLOWED_ACTIONS = {"wait", "give_hint", "slow_down", "demonstrate", "accompany", "return_control"}

# --- Estados de la máquina de decisión ---

STATE_OBSERVING = "observing"
STATE_EVALUATING = "evaluating"
STATE_DECIDE_ACTION = "decide_action"
STATE_WAITING = "waiting_for_student"
STATE_GIVING_HINT = "giving_hint"
STATE_SLOWING_DOWN = "slowing_down"
STATE_DEMONSTRATING = "demonstrating"
STATE_ACCOMPANYING = "accompanying"
STATE_RETURNING_CONTROL = "returning_control"

ACTION_TO_STATE: dict[str, str] = {
    "wait": STATE_WAITING,
    "give_hint": STATE_GIVING_HINT,
    "slow_down": STATE_SLOWING_DOWN,
    "demonstrate": STATE_DEMONSTRATING,
    "accompany": STATE_ACCOMPANYING,
    "return_control": STATE_RETURNING_CONTROL,
}

# --- Umbrales de las reglas (B-012.3) ---

# Compases tras los que el agente devuelve el control automáticamente.
RETURN_CONTROL_AFTER_MEASURES = 2
# Segundos sin que el estudiante toque nada antes de pasar a wait.
SILENCE_TIMEOUT_S = 10.0
# accuracy_pct por debajo de este umbral → demonstrate.
LOW_PRECISION_THRESHOLD = 60.0
# Nº mínimo de notas con wrong_pitch para considerar error repetido → give_hint.
REPEATED_ERRORS_THRESHOLD = 3
# timing_ms (desviación media absoluta) por encima → slow_down.
TIMING_THRESHOLD_MS = 200.0

# --- Params por defecto por acción ---

DEFAULT_PARAMS: dict[str, dict[str, object]] = {
    "wait": {},
    "give_hint": {"hint_type": "measure_focus"},
    "slow_down": {"tempo_factor": 0.7},
    "demonstrate": {"tempo_factor": 0.8},
    "accompany": {"tempo_factor": 0.9},
    "return_control": {},
}

# --- Límites de validación de acciones (B-012.4) ---

# Rangos numéricos permitidos: acción -> {param: (mín, máx)}
PARAM_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "wait": {"duration_s": (0.1, 30.0)},
    "slow_down": {"tempo_factor": (0.5, 0.9), "measures": (1, 2)},
    "demonstrate": {"tempo_factor": (0.5, 0.8)},
    "accompany": {"tempo_factor": (0.5, 1.0)},
}

# Valores permitidos por enum: acción -> {param: conjunto}
ENUM_PARAMS: dict[str, dict[str, set[str]]] = {
    "accompany": {"hand": {"left", "right", "both"}},
}

# Máximo de compases por acción (sección from_measure/to_measure)
MAX_MEASURES: dict[str, int] = {
    "slow_down": 2,
    "demonstrate": 16,
    "accompany": 32,
}

# Máximo de `wait` encadenados seguidos
MAX_CONSECUTIVE_WAIT = 2

# Máximo de `give_hint` por compás
MAX_HINTS_PER_MEASURE = 1


@dataclass
class AgentDecision:
    """Decisión del agente: acción, parámetros, motivo y estado resultante."""

    action: str
    params: dict[str, object] = field(default_factory=dict)
    reason: str = ""
    state: str = ""


@dataclass
class DecisionContext:
    """Todo lo que `decide()` necesita para tomar una decisión.

    - `session_state`: estado de la sesión (B-012.1): control, compás actual, etc.
    - `evaluation`: resultado de la evaluación (B-012.2); `None` si aún no hay.
    - `history`: decisiones previas del agente (cada entrada con `action` y `measure`).
    - `seconds_since_last_note`: segundos desde la última nota del estudiante.
    """

    session_state: dict[str, object]
    evaluation: dict[str, object] | None = None
    history: list[dict[str, object]] = field(default_factory=list)
    seconds_since_last_note: float = 0.0


class AgentService:
    """Máquina de estados y reglas deterministas del agente (B-012.3).

    No controla MIDI ni ejecuta código externo. El LLM puede proponer
    acciones, pero estas reglas son el fallback obligatorio.
    """

    def decide(self, context: DecisionContext) -> AgentDecision:
        """Aplica la máquina de estados y devuelve la acción decidida.

        El orden de las reglas es la prioridad: la primera que coincide gana.
        """
        session = context.session_state
        control = session.get("control", "student")
        current_measure = int(session.get("current_measure", 0) or 0)

        # --- Regla 1 y 2: el agente tiene el control ---
        if control == "agent":
            last = context.history[-1] if context.history else None
            if last and last.get("action") in ("demonstrate", "slow_down"):
                start_measure = int(last.get("measure", 0) or 0)
                if current_measure - start_measure >= RETURN_CONTROL_AFTER_MEASURES:
                    return self._decide("return_control", "demo_period_ended")
            return self._decide("wait", "agent_has_control")

        # --- Regla 3: estudiante silencioso ---
        if context.seconds_since_last_note > SILENCE_TIMEOUT_S:
            return self._decide("wait", "student_silent")

        # --- Reglas 4-6: dependen de la evaluación ---
        evaluation = context.evaluation
        if evaluation is not None:
            accuracy = float(evaluation.get("accuracy_pct", 100.0) or 0.0)
            counts = evaluation.get("counts", {}) or {}
            wrong_pitch = int(counts.get("wrong_pitch", 0) or 0)
            timing_ms = float(evaluation.get("timing_ms", 0.0) or 0.0)

            # Regla 4: precisión muy baja → demonstrate
            if accuracy < LOW_PRECISION_THRESHOLD:
                return self._decide("demonstrate", "low_precision")

            # Regla 5: errores repetidos (wrong_pitch) → give_hint
            if wrong_pitch >= REPEATED_ERRORS_THRESHOLD:
                return self._decide("give_hint", "repeated_errors")

            # Regla 6: timing medio fuera de tolerancia → slow_down
            if timing_ms > TIMING_THRESHOLD_MS:
                return self._decide("slow_down", "timing_off")

        # --- Default: todo bien, esperar ---
        return self._decide("wait", "all_good")

    def _decide(self, action: str, reason: str) -> AgentDecision:
        """Construye la decisión a partir de la acción y el motivo."""
        return AgentDecision(
            action=action,
            params=DEFAULT_PARAMS.get(action, {}).copy(),
            reason=reason,
            state=ACTION_TO_STATE.get(action, STATE_WAITING),
        )

    def validate(self, action: str) -> bool:
        """True si la acción pertenece a la lista blanca."""
        return action in ALLOWED_ACTIONS

    def propose_action(
        self,
        context: DecisionContext,
        provider: LLMProvider | None = None,
    ) -> ActionProposal:
        """Propone una acción: LLM si hay proveedor, si no, reglas deterministas (B-012.6).

        El LLM propone; el sistema valida contra la whitelist y los límites.
        Si la propuesta no pasa la validación o el proveedor falla, se usa
        el fallback determinista (`decide()`), que nunca falla.
        """
        from .llm import ActionProposal  # import local para evitar ciclo

        # 1. Intentar con el proveedor LLM
        if provider is not None:
            state = {
                **context.session_state,
                "evaluation": context.evaluation,
                "seconds_since_last_note": context.seconds_since_last_note,
            }
            try:
                proposal = provider.propose_action(state)
            except Exception:  # noqa: BLE001
                proposal = None

            if proposal is not None and self.validate(proposal.action):
                try:
                    self.validate_action(
                        proposal.action, proposal.params,
                        session_state=context.session_state,
                    )
                    return proposal
                except ValidationError:
                    pass  # propuesta inválida: cae al fallback

        # 2. Fallback determinista (B-012.3): siempre funciona
        decision = self.decide(context)
        return ActionProposal(
            action=decision.action,
            params=decision.params,
            reason=decision.reason,
            provider="deterministic",
            used_fallback=provider is not None,
        )

    def validate_action(
        self,
        action: str,
        params: dict[str, object] | None = None,
        *,
        session_state: dict[str, object] | None = None,
        history: list[dict[str, object]] | None = None,
    ) -> None:
        """Valida una acción completa: whitelist, params, límites y estado.

        Lanza `ValidationError` con código estable si algo falla:
        - `invalid_action`: acción fuera de la lista blanca.
        - `action_params_out_of_range`: param fuera de rango o formato inválido.
        - `action_not_allowed_now`: acción válida pero no permitida en el estado actual.
        """
        # 1. Whitelist
        if action not in ALLOWED_ACTIONS:
            raise ValidationError("invalid_action", f"Acción desconocida: {action!r}")

        params = params or {}

        # 2. return_control: sin params y solo si el agente tiene el control
        if action == "return_control":
            if params:
                raise ValidationError(
                    "action_params_out_of_range", "return_control no admite parámetros"
                )
            if session_state and session_state.get("control") != "agent":
                raise ValidationError(
                    "action_not_allowed_now",
                    "return_control solo cuando el agente tiene el control",
                )
            return

        # 3. Rangos numéricos
        for param, (lo, hi) in PARAM_RANGES.get(action, {}).items():
            if param not in params:
                continue
            try:
                value = float(params[param])
            except (TypeError, ValueError):
                raise ValidationError(
                    "action_params_out_of_range", f"{param} debe ser numérico"
                ) from None
            if not lo <= value <= hi:
                raise ValidationError(
                    "action_params_out_of_range",
                    f"{param} debe estar entre {lo} y {hi} (recibido: {value})",
                )

        # 4. Enums
        for param, allowed in ENUM_PARAMS.get(action, {}).items():
            if param in params and params[param] not in allowed:
                raise ValidationError(
                    "action_params_out_of_range",
                    f"{param} debe ser uno de {sorted(allowed)} (recibido: {params[param]!r})",
                )

        # 5. Sección de compases (demonstrate/accompany): to > from y máx compases
        if action in ("demonstrate", "accompany"):
            self._validate_measure_range(action, params)

        # 6. wait: no encadenar más de MAX_CONSECUTIVE_WAIT seguidos
        if action == "wait" and history:
            consecutive = 0
            for entry in reversed(history):
                if entry.get("action") == "wait":
                    consecutive += 1
                else:
                    break
            if consecutive >= MAX_CONSECUTIVE_WAIT:
                raise ValidationError(
                    "action_not_allowed_now",
                    f"No se pueden encadenar más de {MAX_CONSECUTIVE_WAIT} wait seguidos",
                )

        # 7. give_hint: máximo MAX_HINTS_PER_MEASURE por compás
        if action == "give_hint" and history:
            measure = params.get("measure")
            if measure is not None:
                used = sum(
                    1
                    for entry in history
                    if entry.get("action") == "give_hint"
                    and entry.get("measure") == measure
                )
                if used >= MAX_HINTS_PER_MEASURE:
                    raise ValidationError(
                        "action_not_allowed_now",
                        f"Ya se dio un hint para el compás {measure}",
                    )

    @staticmethod
    def _validate_measure_range(action: str, params: dict[str, object]) -> None:
        """Valida from_measure/to_measure y el máximo de compases de la sección."""
        max_measures = MAX_MEASURES[action]
        try:
            frm = int(params.get("from_measure", 0))
            to = int(params.get("to_measure", frm + 1))
        except (TypeError, ValueError):
            raise ValidationError(
                "action_params_out_of_range",
                "from_measure y to_measure deben ser enteros",
            ) from None
        if frm < 0:
            raise ValidationError(
                "action_params_out_of_range", "from_measure no puede ser negativo"
            )
        if to <= frm:
            raise ValidationError(
                "action_params_out_of_range",
                f"to_measure ({to}) debe ser mayor que from_measure ({frm})",
            )
        if to - frm > max_measures:
            raise ValidationError(
                "action_params_out_of_range",
                f"La sección no puede superar {max_measures} compases (recibido: {to - frm})",
            )
