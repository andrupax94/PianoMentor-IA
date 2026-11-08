# description: Informe consolidado de práctica (B-033.3): función pura `build_report` que arma el JSON del informe (sesión con ventana derivada de las señales, agregación por compás con conteos por outcome, decisiones del agente en orden temporal y señales crudas truncadas) y `session_report` que reúne lo persistido por B-032.6.
# context: Solo lectura de lo ya persistido: no calcula métricas pedagógicas nuevas ni toca el transporte. La evaluación (B-032.3) la inyecta la API con la misma versión compacta que consume el agente. Determinista: el mismo id de sesión con los mismos datos devuelve el mismo informe en cuanto a listas y números (orden estable por `id`); `generated_at` es el único campo volátil.

"""Informe consolidado de una sesión de práctica (B-033.3).

El pipeline de práctica (puerto de nota → señales → reglas → intervenciones)
deja su materia prima en `practice_signals` y `agent_decisions` (B-032.6); este
módulo la consolida en un documento único para poder mirarla completa, copiarla
y descargarla desde el modo informe del chat.

Truncado: `signals.items` lleva como mucho `limit` señales (con `total` y
`truncated` para saber cuántas quedan fuera); las decisiones del agente y el
agregado por compás no se truncan, que son poco numerosas por los topes.
La ventana y la duración prácticas se derivan de las marcas de tiempo de las
señales (primera/última), porque la práctica «activa» de la sesión no está
persistida —es lo honesto y barato, y `null` si no hay señales.
"""

from __future__ import annotations

import json
from collections.abc import Mapping

from datetime import datetime, timezone

from . import database
from .validators import ValidationError

# Truncado por defecto de `signals.items`: un informe no puede desbordar el
# chat; la descarga (`.json`) del front siempre descargará el informe servido,
# y el endpoint acota `limit` con el mismo techo.
REPORT_SIGNAL_LIMIT_DEFAULT = 200
# Techo duro del parámetro `limit` de la petición.
REPORT_SIGNAL_LIMIT_MAX = 1000

# Orden estable de los conteos por compás, incluidos los ceros: el mismo
# compás se imprime siempre igual.
OUTCOMES = ("hit", "miss", "wrong", "timeout")


def normalize_limit(limit: int | None) -> int:
    """`limit` acotado al techo del informe (y el default si no viene)."""
    if limit is None:
        return REPORT_SIGNAL_LIMIT_DEFAULT
    return max(1, min(int(limit), REPORT_SIGNAL_LIMIT_MAX))


def _parse_ts(value: object) -> datetime | None:
    """Fecha de SQLite (`datetime('now')`, naive) a `datetime`, o None."""
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _seconds_between(start: datetime | None, end: datetime | None) -> float | None:
    """Segundos entre dos instantes (última señal − primera señal), o None."""
    if start is None or end is None:
        return None
    return round((end - start).total_seconds(), 3)


def aggregate_by_measure(
    signals: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Agregación por compás: conteos por outcome, orden de llegada y último outcome de cada gate.

    Los compases salen en el orden en que se les oyó por primera vez y las
    señales de cada uno van en el orden en que llegaron (viejas primero, como
    las emite el bucle de strikes). `measure` puede ser `null` en piezas sin
    rejilla: es un grupo más, primero si la práctica empezó sin rejilla.
    """
    groups: dict[object, dict[str, object]] = {}
    order: list[object] = []
    for signal in signals:  # llegan ordenadas por id
        measure = signal.get("measure")
        if measure not in groups:
            groups[measure] = {
                "measure": measure,
                "counts": dict.fromkeys(OUTCOMES, 0),
                "arrival": [],
                "last_outcome_by_gate": {},
            }
            order.append(measure)
        group = groups[measure]
        outcome = str(signal.get("outcome"))
        counts = group["counts"]
        assert isinstance(counts, dict)
        counts[outcome] = int(counts[outcome]) + 1
        group["arrival"] = [*group["arrival"], signal["id"]]
        group["last_outcome_by_gate"][str(signal.get("gate"))] = outcome
    return [groups[measure] for measure in order]


def decision_block(row: Mapping[str, object]) -> dict[str, object]:
    """Fila de `agent_decisions` al dict del informe, con sus params como objeto."""
    params: dict[str, object] = {}
    raw_params = row["params_json"]
    if raw_params:
        try:
            parsed = json.loads(str(raw_params))
            if isinstance(parsed, dict):
                params = parsed
            else:
                params = {"raw": parsed}
        except (TypeError, ValueError):
            params = {"raw": str(raw_params)}
    return {
        "id": row["id"],
        "measure": row["measure"],
        "action": row["action"],
        "params": params,
        "reason": row["reason"] or "",
        "provider": row["provider"] or "deterministic",
        "baseline_signal_id": row["baseline_signal_id"],
        "created_at": row["created_at"],
    }


def build_report(
    session: Mapping[str, object],
    piece: Mapping[str, object] | None,
    signals: list[dict[str, object]],
    decisions: list[Mapping[str, object]],
    limit: int,
    evaluation: dict[str, object] | None = None,
) -> dict[str, object]:
    """Informe completo a partir de los datos ya leídos (función pura).

    `session` es la fila de `sessions`, `piece` la fila de `pieces`,
    `signals` la lista completa de señales de la sesión y `decisions` la de
    `agent_decisions`, ambas ordenadas por `id`. Devuelve el dict que sirve
    `GET /sessions/{id}/practice-report`; `evaluation` llega ya resuelta por
    la API (versión compacta, `None` si no hay nada que evaluar).
    """
    first_ts = _parse_ts(signals[0].get("created_at") if signals else None)
    last_ts = _parse_ts(signals[-1].get("created_at") if signals else None)

    returned = signals[:limit]
    return {
        "session": {
            "session_id": session.get("id"),
            "piece_id": session.get("piece_id"),
            "piece_title": piece["title"] if piece else None,
            "tempo": piece["tempo"] if piece else None,
            "status": session.get("status") or "idle",
            "control": session.get("control") or "student",
            "mode": session.get("mode") or "observe",
            "hand": session.get("hand") or "both",
            "created_at": session.get("created_at"),
            # Ventana y duración prácticas: derivadas de las señales (no hay
            # tabla de práctica «activa»), None si la sesión no tiene señales.
            "first_signal_at": signals[0].get("created_at") if signals else None,
            "last_signal_at": signals[-1].get("created_at") if signals else None,
            "practiced_s": _seconds_between(first_ts, last_ts),
            "signal_count": len(signals),
        },
        "by_measure": aggregate_by_measure(signals),
        "agent_decisions": [decision_block(row) for row in decisions],
        "signals": {
            "total": len(signals),
            "returned": len(returned),
            "truncated": len(signals) > len(returned),
            "items": returned,
        },
        "evaluation": evaluation,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def session_report(
    session_id: str,
    limit: int = REPORT_SIGNAL_LIMIT_DEFAULT,
) -> dict[str, object]:
    """Reúne lo persistido de la sesión y monta el informe (B-033.3).

    Lanza `session_not_found` si la sesión no existe (la API la convierte en
    404 con código estable, igual que los demás endpoints de sesión).
    """
    capped = normalize_limit(limit)
    with database.open_db() as conn:
        row = database.get_session(conn, session_id)
        if row is None:
            raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")
        piece_row = database.get_piece(conn, str(row["piece_id"]))
        signal_rows = database.list_practice_signals(conn, session_id)
        decision_rows = database.list_agent_decisions(conn, session_id)

    session = {name: row[name] for name in database.SESSION_COLUMNS}
    piece = dict(piece_row) if piece_row is not None else None
    signals = [dict(signal) for signal in signal_rows]
    decisions = [dict(decision) for decision in decision_rows]
    return build_report(session, piece, signals, decisions, capped)
