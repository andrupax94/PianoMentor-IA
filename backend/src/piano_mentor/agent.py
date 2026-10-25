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
