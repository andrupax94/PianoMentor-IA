# description: Worker de la cola de respuestas aplazadas del chat (B-036.3): `procesar_pendientes` recoge los pendientes vencidos (next_attempt_at pasado), reintenta el turno GUARDADO con la cadena LLM, guarda la redacción lograda como mensaje del mentor en el historial del chat y la manda por correo si hay dirección asociada (status enviada; sin correo queda lista para asociarse en B-036.4). El fallo reprograma con backoff exponencial (1 min → 5 → 15 → 1 h) y el tope de intentos cierra en fallida. `iniciar_worker` arranca el bucle en un hilo daemon (config llm_retry_worker/llm_retry_worker_intervalo_s).
# context: La cola vive en pending_llm_replies (migración 0015); el encolado lo hace api.py vía el callback `aplazar` de ChatService cuando el FallbackProvider reporta saturación. Sin clave de Resend el envío queda en el log (patrón del mailer) y el estado queda 'lista', sin romper. Tests: llaman a procesar_pendientes con proveedor/envío/fecha inyectados (reloj falso); el hilo real no corre en la suite (conftest apaga llm_retry_worker).

from __future__ import annotations

import json
import logging
import threading
from datetime import UTC, datetime, timedelta
from typing import Callable

from . import database
from .config import settings
from .database import (
    complete_pending_llm_reply,
    fail_pending_llm_reply,
    insert_chat_message,
    list_due_pending_llm_replies,
    open_db,
    update_pending_llm_reply_retry,
)
from .llm import LLMProvider
from .mailer import send_llm_reply_email

logger = logging.getLogger("piano_mentor.llm_aplazados")

#: Backoff entre reintento fallidos (segundos): 1 min → 5 → 15 → 1 h → 1 h.
BACKOFF_S = (60, 300, 900, 3600)

#: Tope de intentos del worker: agotados, el pendiente queda 'fallida'.
TOPE_INTENTOS = 6


def procesar_pendientes(
    provider: LLMProvider | None = None,
    ahora: datetime | None = None,
    enviar: Callable[[str, str], None] | None = None,
    guardar: Callable[[str, str], None] | None = None,
) -> list[int]:
    """Reintenta los pendientes vencidos y entrega lo logrado (B-036.3).

    - `provider`: cadena con la que se reintenta (default: la del chat).
    - `ahora`: reloj inyectable para los tests (default: UTC real).
    - `enviar`: entrega del correo (default: mailer.send_llm_reply_email).
    - `guardar`: la redacción lograda al historial del chat (default: la BD).

    Devuelve los ids procesados (los que estaban vencidos, hayan mejorado o
    empeorado). Un turno que el LLM responde vacío cuenta como fallo del
    reintento (backoff), no como éxito: burbuja en blanco no es redacción.
    """
    proveedor = provider if provider is not None else _proveedor_del_chat()
    entrega = enviar if enviar is not None else send_llm_reply_email
    persistir = guardar if guardar is not None else _guardar_en_historial
    momento = ahora if ahora is not None else datetime.now(UTC)
    ahora_iso = momento.isoformat(timespec="seconds")

    procesados: list[int] = []
    with open_db() as conn:
        vencidos = list_due_pending_llm_replies(conn, ahora_iso)
    for fila in vencidos:
        reply_id = int(fila["id"])
        procesados.append(reply_id)
        chat_id = str(fila["chat_id"])
        try:
            mensajes = json.loads(str(fila["messages"]))
        except (json.JSONDecodeError, TypeError):
            logger.exception("[aplazados] #%d: messages ilegible; se da por fallida", reply_id)
            with open_db() as conn:
                fail_pending_llm_reply(conn, reply_id)
            continue
        presupuesto = fila["max_tokens"]
        try:
            if presupuesto is not None:
                respuesta = proveedor.chat(mensajes, [], max_tokens=int(presupuesto))
            else:
                respuesta = proveedor.chat(mensajes, [])
        except Exception as exc:  # pylint: disable=broad-except  # noqa: BLE001
            _reprogramar(reply_id, int(fila["attempts"]), momento, exc)
            continue

        texto = (respuesta.text or "").strip() if respuesta is not None else ""
        if not texto:
            _reprogramar(reply_id, int(fila["attempts"]), momento, None)
            continue

        # Redacción lograda: entra en la conversación (al volver a la app, la
        # burbuja la muestra en su sitio) y por correo si hay dirección.
        persistir(chat_id, texto)
        correo = fila["email"]
        with open_db() as conn:
            if correo:
                entrega(str(correo), texto)
                complete_pending_llm_reply(
                    conn, reply_id, "enviada", momento.isoformat(timespec="seconds")
                )
            else:
                # Sin correo: queda 'lista' — B-036.4 lo asocia y lo manda.
                complete_pending_llm_reply(
                    conn, reply_id, "lista", momento.isoformat(timespec="seconds")
                )
        logger.info(
            "[aplazados] #%d: redacción lograda y guardada en el chat %s%s",
            reply_id,
            chat_id,
            f" y enviada a {correo}" if correo else " (sin correo: queda lista)",
        )
    return procesados


def _reprogramar(reply_id: int, attempts: int, momento: datetime, exc: BaseException | None) -> None:
    """Fallo del reintento: backoff o, agotados los intentos, 'fallida'."""
    nuevo = attempts + 1
    if nuevo >= TOPE_INTENTOS:
        with open_db() as conn:
            fail_pending_llm_reply(conn, reply_id)
        logger.warning("[aplazados] #%d: tope de %d intentos; queda 'fallida'", reply_id, TOPE_INTENTOS)
        return
    espera = BACKOFF_S[min(nuevo - 1, len(BACKOFF_S) - 1)]
    siguiente = (momento + timedelta(seconds=espera)).isoformat(timespec="seconds")
    with open_db() as conn:
        update_pending_llm_reply_retry(conn, reply_id, nuevo, siguiente)
    logger.warning(
        "[aplazados] #%d: reintento falló (%s); siguiente intento en %d s",
        reply_id,
        type(exc).__name__ if exc is not None else "respuesta vacía",
        espera,
    )


def _proveedor_del_chat() -> LLMProvider:
    """La cadena de la casa, construida perezosamente (evita ciclo de imports)."""
    from .chat import get_fallback_provider

    return get_fallback_provider()


def _guardar_en_historial(chat_id: str, texto: str) -> None:
    """La respuesta aplazada entra como mensaje del mentor en su conversación."""
    with open_db() as conn:
        insert_chat_message(
            conn, {"chat_id": chat_id, "role": "assistant", "content": texto}
        )


def _bucle(intervalo_s: float) -> None:
    while True:
        try:
            procesar_pendientes()
        except Exception:  # pylint: disable=broad-except  # noqa: BLE001
            logger.exception("[aplazados] el pase del worker falló; sigue el bucle")
        threading.Event().wait(intervalo_s)


def iniciar_worker(intervalo_s: float | None = None) -> threading.Thread | None:
    """Arranca el bucle en un hilo daemon (main.py, al levantar la app).

    Respeta `llm_retry_worker` (los tests lo apagan): sin la bandera no crea
    el hilo y devuelve None. En un MVP de un worker, un solo hilo basta."""
    if not settings.llm_retry_worker:
        return None
    hilo = threading.Thread(
        target=_bucle,
        args=(intervalo_s if intervalo_s is not None else settings.llm_retry_worker_intervalo_s,),
        name="llm-aplazados",
        daemon=True,
    )
    hilo.start()
    logger.info("[aplazados] worker iniciado (cada %.0f s)", settings.llm_retry_worker_intervalo_s)
    return hilo
