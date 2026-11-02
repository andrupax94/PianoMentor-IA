# description: Casos de uso de sesión de práctica: crear sesión, estado, eventos MIDI, posición del transporte, modos de práctica (B-032.4) y eventos de práctica del modo espera (B-032.5: validación `_validate_practice_event` y persistencia en `practice_signals`). Con B-032.6 arma el contexto de strikes (build_strike_context: señales desde el baseline de la última decisión, dedup por gate y límites ya consumidos) y con B-032.7 el recuento de ofertas del compás (offers_in_measure).
# context: Coordina pieza + interpretación + estado persistido en SQLite (B-012.1); las señales de práctica no se mezclan con session_events porque el evaluador solo mira note_on/note_off.

"""Servicio de sesiones de práctica: crea, consulta estado y registra eventos."""

from __future__ import annotations

import math
import sqlite3
from collections.abc import Callable, Mapping
from uuid import uuid4

from . import database
from .database import insert_practice_signal
from .practice_rules import InterventionLimits, StrikeContext
from .validators import ValidationError

# Estados permitidos de una sesión (B-012.1). `paused` lo alcanzará el
# transporte de reproducción; hoy `note_on` lleva la sesión a `playing`.
SESSION_STATUSES = ("idle", "playing", "paused")

# Modos de práctica (B-032.4): observar (solo escuchar), una mano (el alumno
# toca una y suena la otra) y dos manos (el alumno toca las dos y el
# transporte calla). El modo gobierna la cascada, el audio y la evaluación.
PRACTICE_MODES = ("observe", "one_hand", "both_hands")

# Mano que practica el alumno (B-032.4). `both` solo tiene sentido en
# `both_hands`; en `one_hand` es la mano que el alumno toca y se evalúa.
PRACTICE_HANDS = ("left", "right", "both")

EVENT_TYPES = ("note_on", "note_off")
PRACTICE_TYPE = "practice"

# Mensaje de posición del transporte (B-032.2): no es un evento MIDI y no entra
# en `session_events`, solo actualiza el estado vivo de la sesión.
POSITION_TYPE = "position"

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
        "mode": row["mode"],
        "hand": row["hand"],
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


def _validate_practice_event(event: object) -> dict[str, object]:
    """Normaliza y valida un evento de práctica del modo espera (B-032.5).

    El contrato es `{type: "practice", gate, measure, outcome, wait_ms, hand}`.
    Hoy solo se valida y se guarda en `session_events`; B-032.6 lo consumirá
    para las reglas deterministas del agente.
    """
    if not isinstance(event, Mapping):
        raise ValidationError("invalid_event_payload", "El evento debe ser un objeto JSON")

    event_type = event.get("type")
    if event_type != PRACTICE_TYPE:
        raise ValidationError(
            "invalid_event_payload",
            f"Tipo de evento no soportado: {event_type!r}; se espera {PRACTICE_TYPE!r}",
        )

    gate = event.get("gate")
    if not isinstance(gate, str) or not gate:
        raise ValidationError("invalid_event_payload", "`gate` debe ser un string no vacío")

    measure = event.get("measure")
    if measure is not None and (not _is_int(measure) or measure < 0):
        raise ValidationError("invalid_event_payload", "`measure` debe ser un entero no negativo o null")

    outcome = event.get("outcome")
    if outcome not in ("hit", "miss", "wrong", "timeout"):
        raise ValidationError("invalid_event_payload", "`outcome` debe ser hit, miss, wrong o timeout")

    wait_ms = event.get("wait_ms", 0)
    if isinstance(wait_ms, bool) or not isinstance(wait_ms, (int, float)) or not math.isfinite(wait_ms):
        raise ValidationError("invalid_event_payload", "`wait_ms` debe ser un número finito")
    if wait_ms < 0:
        raise ValidationError("invalid_event_payload", "`wait_ms` no puede ser negativo")

    hand = event.get("hand", "both")
    if hand not in PRACTICE_HANDS:
        raise ValidationError("invalid_event_payload", f"`hand` inválida: {hand!r}")

    return {
        "type": PRACTICE_TYPE,
        "gate": gate,
        "measure": measure,
        "outcome": outcome,
        "wait_ms": float(wait_ms),
        "hand": hand,
    }


def _validate_position(message: object) -> dict[str, object]:
    """Normaliza y valida un mensaje `position`; lanza `invalid_event_payload` si no lo es.

    El contrato (B-032.2) es `{type: "position", t_s, measure}`: `t_s` son
    segundos de partitura **sin escalar** por el tempo (la misma línea temporal
    que la rejilla y la evaluación) y `measure` es el índice 0-based del compás
    o `None` si la pieza no trae rejilla.

    El límite superior del compás no se puede validar aquí: la rejilla vive en
    el navegador, que es quien la obtuvo de `GET /pieces/{id}/notes`. Se exige
    que sea un entero no negativo y se confía en el cliente, igual que con el
    `t_s` de las notas.
    """
    if not isinstance(message, Mapping):
        raise ValidationError("invalid_event_payload", "La posición debe ser un objeto JSON")

    t_s = message.get("t_s")
    if isinstance(t_s, bool) or not isinstance(t_s, (int, float)) or not math.isfinite(t_s):
        raise ValidationError(
            "invalid_event_payload", "`t_s` de la posición debe ser un número finito de segundos"
        )
    if t_s < 0:
        raise ValidationError(
            "invalid_event_payload", "`t_s` de la posición no puede ser negativo"
        )

    measure = message.get("measure")
    if measure is not None and (not _is_int(measure) or measure < 0):
        raise ValidationError(
            "invalid_event_payload",
            "`measure` debe ser un entero no negativo o null",
        )

    return {"t_s": float(t_s), "measure": measure}


def _latest_outcome_per_gate(
    signals: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Una entrada por gate con su último outcome (id con más prioridad)."""
    latest: dict[str, dict[str, object]] = {}
    for signal in signals:  # llegan ordenadas por id
        latest[str(signal["gate"])] = signal
    return list(latest.values())


def _hand_for_mode(mode: str, hand: object) -> str:
    """Mano coherente con el modo (B-032.4).

    En `one_hand` manda la mano del alumno (`left` o `right`); en `both_hands`
    es `both`; en `observe` no se evalúa nada, así que la mano no dice nada y
    se deja en `both`.
    """
    if mode == "one_hand":
        return hand if hand in ("left", "right") else "right"
    if mode == "both_hands":
        return "both"
    return "both"


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

    def set_practice_mode(
        self, session_id: str, mode: str | None = None, hand: str | None = None
    ) -> dict[str, object]:
        """Cambia el modo de práctica (y la mano) de la sesión (B-032.4).

        El modo es estado, no un evento: no entra en `session_events` ni viaja
        por `agent_action`. Solo se guarda lo que el cliente manda; el resto
        conserva su valor vigente.

        La mano se normaliza al modo: en `one_hand` la del alumno (por defecto
        `right`), en `both_hands` `both` y en `observe` se deja en `both` porque
        no se evalúa nada (es el modo de escuchar).
        """
        if mode is not None and mode not in PRACTICE_MODES:
            raise ValidationError("invalid_mode", f"Modo de práctica inválido: {mode!r}")
        if hand is not None and hand not in PRACTICE_HANDS:
            raise ValidationError("invalid_hand", f"Mano inválida: {hand!r}")

        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")

            new_mode = mode if mode is not None else str(row["mode"] or "observe")
            if new_mode not in PRACTICE_MODES:
                new_mode = "observe"
            new_hand = _hand_for_mode(new_mode, hand if hand is not None else row["hand"])
            database.update_session_state(conn, session_id, mode=new_mode, hand=new_hand)
            row = database.get_session(conn, session_id)

        assert row is not None
        return _session_state(row)

    def set_control(self, session_id: str, control: str) -> dict[str, object]:
        """Actualiza quién tiene el control del piano (B-012.5)."""
        if control not in ("student", "agent"):
            raise ValidationError("invalid_control", f"Control inválido: {control!r}")
        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")
            database.update_session_state(conn, session_id, control=control)
            row = database.get_session(conn, session_id)
        assert row is not None
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

    def receive_practice_event(self, session_id: str, event: object) -> dict[str, object]:
        """Valida y persiste un evento de práctica del modo espera (B-032.5).

        Guarda la señal en `practice_signals` para que B-032.6 aplique reglas
        deterministas por compás sin mezclarla con `session_events`, que solo
        contiene eventos MIDI.
        """
        payload = _validate_practice_event(event)

        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")

            insert_practice_signal(conn, {"session_id": session_id, **payload})
            row = database.get_session(conn, session_id)

        assert row is not None
        return _session_state(row)

    def build_strike_context(
        self, session_id: str, measure: int | None
    ) -> StrikeContext | None:
        """Contexto de strikes de un compás: señales nuevas + límites (B-032.6).

        - Solo cuenta señales posteriores a la última decisión del agente para
          ese compás: una intervención reinicia el contador de fallos.
        - Deduplica por `gate`: un reintento del front, o un `wrong` seguido de
          `hit`, suman como sí y como no. El último outcome de cada gate manda,
          que es el reseteo al acertar.
        - Con el control en manos del agente no hay reglas que ejecutar: llama
          aquí mientras él interviene, y `decide()` lo confirma con sus reglas 1-2.
        Devuelve `None` si la sesión no existe.
        """
        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                return None
            if row["control"] == "agent":
                return None

            baseline = database.last_strikes_baseline(conn, session_id, measure)
            signals = [
                dict(signal)
                for signal in database.list_practice_signals_since(conn, session_id, baseline)
            ]
            counts = database.count_agent_actions(conn, session_id, measure)

        limits = InterventionLimits(
            slow_downs_in_measure=counts.get("slow_down", 0),
            hints_in_measure=counts.get("give_hint", 0),
            # B-032.7: las ofertas ya lanzadas en el compás las acota la regla 1.
            offers_in_measure=counts.get("offer_demo", 0),
            session_actions=counts.get("__session__", 0),
        )
        return StrikeContext(
            window=_latest_outcome_per_gate(signals),
            measure=measure,
            limits=limits,
        )

    def receive_position(self, session_id: str, message: object) -> dict[str, object]:
        """Valida la posición del transporte y la guarda en el estado de la sesión (B-032.2).

        No escribe en `session_events` (no es una nota) ni cambia `status`: el
        reloj es del navegador y esto solo mantiene al día `position_s` y
        `current_measure`, que es lo que leen el panel, `accompany` sin compases
        y la regla de `return_control` del agente.

        Devuelve el estado actualizado. La decisión de difundirlo o no, para no
        inundar el canal, es del WebSocket, no del servicio.
        """
        payload = _validate_position(message)

        with database.open_db() as conn:
            row = database.get_session(conn, session_id)
            if row is None:
                raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")

            database.update_session_state(
                conn,
                session_id,
                position_s=payload["t_s"],
                current_measure=payload["measure"],
            )
            row = database.get_session(conn, session_id)

        assert row is not None
        return _session_state(row)
