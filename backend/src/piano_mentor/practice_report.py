# description: Informe consolidado de práctica (B-033.3 + summary de B-033.4): función pura `build_report` que arma el JSON del informe (sesión con ventana derivada de las señales, agregación por compás con conteos por outcome, decisiones del agente en orden temporal, destacados `summary` deterministas que traduce la interpretación del chat y señales crudas truncadas) y `session_report` que reúne lo persistido por B-032.6.
# context: Solo lectura de lo ya persistido: no calcula métricas pedagógicas nuevas ni toca el transporte. La evaluación (B-032.3) la inyecta la API con la misma versión compacta que consume el agente, y el `summary` solo agrega lo servido (outcomes, compases a mejorar, fallo dominante, intervenciones). Determinista: el mismo id de sesión con los mismos datos devuelve el mismo informe (orden estable por `id`, desempates fijos); `generated_at` es el único campo volátil.

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


def build_summary(
    signals: list[dict[str, object]],
    decisions: list[Mapping[str, object]],
    evaluation: dict[str, object] | None,
    practiced_s: float | None,
) -> dict[str, object]:
    """Destacados deterministas de la práctica (B-033.4): la parte que el
    alumno lee.

    Solo agrega lo ya servido, sin métricas pedagógicas nuevas: conteos por
    outcome, los compases con peor proporción de aciertos, el fallo dominante,
    lo que el agente intervino y lo clave de la evaluación (B-032.3). Toda
    elección tiene desempate estable (orden de `OUTCOMES`, orden de llegada,
    orden por `id`) para que la misma sesión dé el mismo resumen.

    Sin señales devuelve su forma vacía: sin ratios (`None`), listas vacías y
    cero intervenciones — el front presenta «todavía no hay práctica que
    comentar».
    """
    outcomes = dict.fromkeys(OUTCOMES, 0)
    gates: set[str] = set()
    failed_gates: dict[str, int] = {}
    for signal in signals:
        outcome = str(signal.get("outcome"))
        outcomes[outcome] = int(outcomes.get(outcome, 0)) + 1
        gate = str(signal.get("gate"))
        gates.add(gate)
        if outcome != "hit":
            failed_gates[gate] = int(failed_gates.get(gate, 0)) + 1

    total = len(signals)
    # Ratio global de aciertos; None sin señales (no es 0: no hubo práctica).
    hit_ratio = round(outcomes["hit"] / total, 3) if total else None

    # Compases a mejorar: los 3 con peor proporción de aciertos. El desempate
    # es primero más intentos (más evidencia del fallo) y después orden de
    # llegada del agregado, de modo que el mismo informe los ordena igual.
    aggregate = aggregate_by_measure(signals)
    scored: list[tuple[float, int, int, dict[str, object]]] = []
    for index, group in enumerate(aggregate):
        counts = group["counts"]
        assert isinstance(counts, dict)
        attempts = sum(int(value) for value in counts.values())
        ratio = round(int(counts["hit"]) / attempts, 3) if attempts else None
        assert ratio is not None  # un compás del agregado tiene ≥ 1 señal
        scored.append((ratio, -attempts, index, group))
    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    worst_measures = [
        {
            "measure": group["measure"],
            "counts": group["counts"],
            "attempts": -neg_attempts,
            "hit_ratio": ratio,
        }
        for ratio, neg_attempts, _, group in scored[:3]
    ]

    # Fallo dominante entre los fallidos: el outcome más repetido (desempate
    # por el orden estable de `OUTCOMES`) y el gate con más fallos (desempate
    # por orden de llegada de las señales). El None es natural en sesiones
    # perfectas: nada falló, no hay «peor fallo».
    dominant_failure: dict[str, object] | None = None
    if total and total - outcomes["hit"] > 0:
        dominant_outcome = max(OUTCOMES[1:], key=lambda name: (outcomes[name], -OUTCOMES.index(name)))
        dominant_gate = max(failed_gates, key=lambda gate: (failed_gates[gate], str(gate))) if failed_gates else None
        dominant_failure = {
            "outcome": dominant_outcome,
            "count": outcomes[dominant_outcome],
            "gate": dominant_gate,
        }

    # Intervenciones: por acción y por razón (las razones estables de las
    # reglas, p. ej. `gate_repeated_strikes`), en orden temporal de llegada.
    by_action: dict[str, int] = {}
    by_reason: dict[str, int] = {}
    for decision in decisions:
        action = str(decision.get("action"))
        by_action[action] = int(by_action.get(action, 0)) + 1
        if reason := str(decision.get("reason") or ""):
            by_reason[reason] = int(by_reason.get(reason, 0)) + 1

    # Lo clave de la evaluación compacta (B-032.3), si la hay: nada de los
    # arrays pesados, solo los tres números que citan los destacados.
    evaluation_summary: dict[str, object] | None = None
    if evaluation:
        evaluation_summary = {
            "score_total": evaluation.get("score_total"),
            "error_type": evaluation.get("error_type"),
            "received_ratio": evaluation.get("received_ratio"),
        }

    return {
        "signals": total,
        "active_measures": len(aggregate),
        "distinct_gates": len(gates),
        "practiced_s": practiced_s,
        "outcomes": outcomes,
        "hit_ratio": hit_ratio,
        "worst_measures": worst_measures,
        "dominant_failure": dominant_failure,
        "interventions": {
            "count": len(decisions),
            "by_action": by_action,
            "by_reason": by_reason,
        },
        "evaluation": evaluation_summary,
    }


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
        "summary": build_summary(signals, decisions, evaluation, _seconds_between(first_ts, last_ts)),
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
    evaluation: dict[str, object] | None = None,
) -> dict[str, object]:
    """Reúne lo persistido de la sesión y monta el informe (B-033.3).

    Lanza `session_not_found` si la sesión no existe (la API la convierte en
    404 con código estable, igual que los demás endpoints de sesión). La
    evaluación compacta (B-032.3) le llega ya resuelta por la API para que el
    `summary` de B-033.4 la cite en su nacimiento.
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
    return build_report(session, piece, signals, decisions, capped, evaluation)
