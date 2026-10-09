# description: Reglas, validación de acciones y devolución del control.
# context: Confianza en el agente determinista.

from piano_mentor.agent import AgentService


def test_agent_uses_deterministic_fallback() -> None:
    service = AgentService()
    assert service.decide({})["action"] == "wait"
    assert service.validate("demonstrate") is True
    assert service.validate("unknown") is False
