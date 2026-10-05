ALLOWED_ACTIONS = {"wait", "give_hint", "slow_down", "demonstrate", "accompany", "return_control"}


class AgentService:
    """Agente determinista inicial; no controla MIDI ni ejecuta código externo."""

    def decide(self, session_state: dict[str, object]) -> dict[str, str]:
        return {"action": "wait", "reason": "deterministic_stub"}

    def validate(self, action: str) -> bool:
        return action in ALLOWED_ACTIONS
