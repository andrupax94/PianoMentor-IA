# description: Instrumentación de pérdida de señales de práctica en el WebSocket (B-033.8): contadores en memoria por sesión de eventos `practice` recibidos por el canal vs persistidos de verdad en `practice_signals`; la diferencia («lost») es la evidencia que faltaba para cerrar la hipótesis 8 del diagnóstico de integridad (pérdida por desconexión/backpressure).
# context: B-033.8; el contador vive en el proceso de la API (no en la base de datos: es telemetría del canal vivo, no historia de práctica) y el informe final lo cita en `execution.signals_emitted_vs_persisted` cuando hay datos. Los eventos que fallan la validación cuentan como recibidos pero no como persistidos — ahí también se pierde señal, y ha de verse.

"""Contadores del canal de práctica (B-033.8).

`received` cuenta cada evento de tipo `practice` que entra por el WebSocket
de la sesión (válidos y no válidos); `persisted` cuenta los que de verdad
llegaron a `practice_signals` (validados y guardados). `lost` es la
diferencia: señales emitidas por el front que el informe nunca verá.

Es memoria del proceso: si la API reinicia, los contadores parten de cero
(son telemetría del canal vivo, no historia persistida). Por eso el bloque
solo se sirve cuando hay datos; una sesión nunca tocada no lleva bloque.
"""

_received: dict[str, int] = {}
_persisted: dict[str, int] = {}


def record_received(session_id: str) -> None:
    """Un evento `practice` entró por el WebSocket (validado o no)."""
    _received[session_id] = _received.get(session_id, 0) + 1


def record_persisted(session_id: str) -> None:
    """El evento pasó la validación y quedó en `practice_signals`."""
    _persisted[session_id] = _persisted.get(session_id, 0) + 1


def counters(session_id: str) -> dict[str, int] | None:
    """El bloque `signals_emitted_vs_persisted`, o None si nunca hubo eventos."""
    received = _received.get(session_id, 0)
    persisted = _persisted.get(session_id, 0)
    if received == 0 and persisted == 0:
        return None
    return {
        "received": received,
        "persisted": persisted,
        "lost": max(0, received - persisted),
    }


def reset() -> None:
    """Vuelta a cero (solo tests): el módulo es estado del proceso."""
    _received.clear()
    _persisted.clear()
