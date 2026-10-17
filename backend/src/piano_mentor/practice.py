# description: Casos de uso de sesión de práctica: crear sesión, estado y eventos MIDI.
# context: Coordina pieza + interpretación + estado persistido en SQLite (B-012.1).

"""Servicio de sesiones de práctica: crea, consulta estado y registra eventos."""

from __future__ import annotations

import math
import sqlite3
from collections.abc import Callable, Mapping
from uuid import uuid4

from . import database
from .validators import ValidationError

# Estados permitidos de una sesión (B-012.1). `paused` lo alcanzará el
# transporte de reproducción; hoy `note_on` lleva la sesión a `playing`.
SESSION_STATUSES = ("idle", "playing", "paused")

EVENT_TYPES = ("note_on", "note_off")

PITCH_MIN = 0
PITCH_MAX = 127
VELOCITY_MIN = 1
VELOCITY_MAX = 127


def _session_response(row: sqlite3.Row) -> dict[str, object]:
    """Respuesta de creación: lo justo para que el front navegue a la sesión."""
    return {"id": row["id"], "piece_id": row["piece_id"], "status": row["status"]}


def _session_state(row: sqlite3.Row) -> dict[str, object]:
    """Estado completo de la sesión, que es lo que viaja por WebSocket."""
    return {
        "session_id": row["id"],
        "piece_id": row["piece_id"],
        "status": row["status"],
        "control": row["control"],
        "current_measure": row["current_measure"],
        "position_s": row["position_s"],
    }


def _is_int(value: object) -> bool:
    """True para enteros reales: `bool` también es `int` en Python, y aquí no vale."""
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_event(event: object) -> dict[str, object]:
    """Normaliza y valida un evento MIDI; lanza `invalid_event_payload` si no lo es.

    El contrato (B-012.1) es `{type, pitch, velocity, t_s}` con `t_s` relativo al
    inicio de la reproducción: es el reloj que comparará la evaluación, así que
    sin él el evento se rechaza en vez de inventarse uno.
    """
    if not isinstance(event, Mapping):
        raise ValidationError("invalid_event_payload", "El evento debe ser un objeto JSON")

    event_type = event.get("type")
    if event_type not in EVENT_TYPES:
        raise ValidationError(
            "invalid_event_payload",
            f"Tipo de evento no soportado: {event_type!r}; se espera {' o '.join(EVENT_TYPES)}",
        )

    pitch = event.get("pitch")
    if not _is_int(pitch) or not PITCH_MIN <= pitch <= PITCH_MAX:
        raise ValidationError(
            "invalid_event_payload",
            f"`pitch` debe ser un entero entre {PITCH_MIN} y {PITCH_MAX}",
        )

    velocity = event.get("velocity", 0)
    if not _is_int(velocity) or not 0 <= velocity <= VELOCITY_MAX:
        raise ValidationError(
            "invalid_event_payload", f"`velocity` debe ser un entero entre 0 y {VELOCITY_MAX}"
        )
    if event_type == "note_on" and velocity < VELOCITY_MIN:
        raise ValidationError("invalid_event_payload", "Un `note_on` necesita `velocity` >= 1")

    t_s = event.get("t_s")
    if isinstance(t_s, bool) or not isinstance(t_s, (int, float)) or not math.isfinite(t_s):
        raise ValidationError(
            "invalid_event_payload", "`t_s` debe ser un número finito de segundos"
        )
    if t_s < 0:
        raise ValidationError(
            "invalid_event_payload",
            "`t_s` es relativo al inicio de la reproducción y no puede ser negativo",
        )

    return {"type": event_type, "pitch": pitch, "velocity": velocity, "t_s": float(t_s)}


class PracticeService:
    """Casos de uso de una sesión: crear, consultar estado y registrar eventos."""

    def __init__(self, piece_lookup: Callable[[str], object] | None = None) -> None:
        self._piece_lookup = piece_lookup or database.find_piece_by_id

    def create_session(self, piece_id: str) -> dict[str, object]:
        """Crea la sesión de una pieza existente y la persiste."""
        if self._piece_lookup(piece_id) is None:
            raise ValidationError("piece_not_found", f"No existe la pieza: {piece_id}")

        session_id = str(uuid4())
        with database.open_db() as conn:
            database.insert_session(conn, {"id": session_id, "piece_id": piece_id})
            row = database.get_session(conn, session_id)
        assert row is not None  # recién insertada
        return _session_response(row)

    def get_state(self, session_id: str) -> dict[str, object]:
        """Devuelve el estado vivo de la sesión."""
        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
        if row is None:
            raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")
        return _session_state(row)

    def receive_event(self, session_id: str, event: object) -> dict[str, object]:
        """Valida el evento, lo persiste, actualiza el estado y lo devuelve.

        El evento se guarda en `session_events` (log append-only) y su llegada
        lleva la sesión a `playing`: es el primer latido del estudiante.
        """
        payload = _validate_event(event)

        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")

            database.insert_session_event(conn, {"session_id": session_id, **payload})
            if payload["type"] == "note_on" and row["status"] != "playing":
                database.update_session_state(conn, session_id, status="playing")
                row = database.get_session(conn, session_id)

        assert row is not None
        return _session_state(row)
