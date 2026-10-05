from uuid import uuid4


class PracticeService:
    """Casos de uso mínimos para sesiones de práctica."""

    def create_session(self, piece_id: str) -> dict[str, str]:
        return {"id": str(uuid4()), "piece_id": piece_id, "status": "created"}

    def get_state(self, session_id: str) -> dict[str, object]:
        return {"session_id": session_id, "status": "idle", "control": "student"}

    def receive_event(self, session_id: str, event: dict[str, object]) -> dict[str, object]:
        return {"session_id": session_id, "event": event, "status": "received"}
