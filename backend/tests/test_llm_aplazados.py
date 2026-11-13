# description: Tests de la cola de respuestas aplazadas del chat (B-036.3): detección de saturación en FallbackProvider (todos los reales caen con 429/timeout → sí; 401 o respuesta vacía → no), el aplazamiento de ChatService (callback con chat_id/messages/max_tokens, deferred solo en turnos de conversación), la persistencia en pending_llm_replies (encolado, vencidos, backoff, cierre) y el worker (reintento con éxito → historial del chat + correo + enviada/lista; fallo → backoff; tope → fallida; sin Resend queda en el log).
# context: Reloj falso (datetime fijo) y proveedores/envío inyectados: nada duerme ni llama a la red. El hilo del worker no corre en la suite (conftest apaga llm_retry_worker). El endpoint real se prueba con el caos «siempre» de B-036.1: el 429 simulado satura la cadena sin red.

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from piano_mentor import llm, mailer
from piano_mentor.chat import ChatService, MockProvider
from piano_mentor.config import settings
from piano_mentor.database import (
    complete_pending_llm_reply,
    count_pending_llm_replies,
    fail_pending_llm_reply,
    find_pending_llm_reply,
    get_chat_history,
    insert_pending_llm_reply,
    list_due_pending_llm_replies,
    open_db,
    update_pending_llm_reply_retry,
)
from piano_mentor.llm import FallbackProvider, LLMProvider, LLMResponse
from piano_mentor.llm_aplazados import (
    BACKOFF_S,
    TOPE_INTENTOS,
    procesar_pendientes,
)

_FIJO = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)


class _CaeCon:
    """Proveedor de test que lanza el error que se le configure."""

    def __init__(self, exc: BaseException, nombre: str = "real") -> None:
        self.exc = exc
        self.provider_name = nombre

    def chat(self, messages, tools, max_tokens=None) -> LLMResponse:
        raise self.exc


def _429() -> httpx.HTTPStatusError:
    respuesta = httpx.Response(
        429,
        text="rate limit",
        headers={"Retry-After": "1"},
        request=httpx.Request("POST", "https://x.test"),
    )
    return _lanzar(respuesta)


def _401() -> httpx.HTTPStatusError:
    respuesta = httpx.Response(401, text="bad key", request=httpx.Request("POST", "https://x.test"))
    return _lanzar(respuesta)


def _lanzar(respuesta: httpx.Response) -> httpx.HTTPStatusError:
    try:
        respuesta.raise_for_status()
    except httpx.HTTPStatusError as exc:
        return exc
    raise AssertionError("la respuesta debería haber levantado HTTPStatusError")


def _encolar(
    chat_id: str = "chat-1",
    email: str | None = None,
    messages: list | None = None,
    next_attempt_at: str | None = None,
    max_tokens: int | None = None,
) -> int:
    """Encola un pendiente con la ventana que pide el test."""
    mensajes = messages if messages is not None else [
        {"role": "system", "content": "Eres el profesor."},
        {"role": "user", "content": "¿qué es un compás?"},
    ]
    with open_db() as conn:
        return insert_pending_llm_reply(
            conn,
            chat_id=chat_id,
            messages=json.dumps(mensajes, ensure_ascii=False),
            email=email,
            max_tokens=max_tokens,
            created_at=(_FIJO - timedelta(minutes=5)).isoformat(timespec="seconds"),
            next_attempt_at=next_attempt_at
            or (_FIJO - timedelta(seconds=1)).isoformat(timespec="seconds"),
        )


class TestSaturacionDeCadena:
    def test_todos_los_reales_caidos_con_429_es_saturacion(self) -> None:
        cadena = FallbackProvider([_CaeCon(_429(), "groq"), MockProvider()])
        cadena.chat([{"role": "user", "content": "hola"}], [])
        assert cadena.saturado is True
        assert cadena.motivo_saturacion is not None

    def test_timeout_tambien_satura(self) -> None:
        cadena = FallbackProvider(
            [_CaeCon(httpx.TimeoutException("se agotó"), "groq"), MockProvider()]
        )
        cadena.chat([{"role": "user", "content": "hola"}], [])
        assert cadena.saturado is True

    def test_un_401_no_satura(self) -> None:
        cadena = FallbackProvider([_CaeCon(_401(), "groq"), MockProvider()])
        cadena.chat([{"role": "user", "content": "hola"}], [])
        assert cadena.saturado is False

    def test_respuesta_vacia_no_satura(self) -> None:
        class _Vacio:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                return LLMResponse(text="", provider="groq")

        cadena = FallbackProvider([_Vacio(), MockProvider()])
        cadena.chat([{"role": "user", "content": "hola"}], [])
        assert cadena.saturado is False

    def test_respuesta_real_no_consulta_saturacion(self) -> None:
        class _Vivo:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                return LLMResponse(text="listo", provider="groq")

        cadena = FallbackProvider([_CaeCon(_429(), "gemini"), _Vivo(), MockProvider()])
        respuesta = cadena.chat([{"role": "user", "content": "hola"}], [])
        assert respuesta.text == "listo"
        assert cadena.saturado is False


class TestAplazamientoDeChatService:
    def _servicio_saturado(self) -> ChatService:
        class _Saturado(MockProvider):
            saturado = True

        return ChatService(_Saturado())

    def test_turno_aplazado_llama_al_callback_y_marca_deferred(self) -> None:
        vistos: list[tuple[str, list, int | None]] = []

        def aplazar(chat_id, messages, max_tokens):
            vistos.append((chat_id, messages, max_tokens))

        servicio = self._servicio_saturado()
        resultado = servicio.run("¿qué es un compás?", chat_id="chat-a", aplazar=aplazar)

        assert resultado.deferred is True
        assert len(vistos) == 1
        assert vistos[0][0] == "chat-a"
        assert any(m.get("content") == "¿qué es un compás?" for m in vistos[0][1])

    def test_ephemeral_no_se_aplaza(self) -> None:
        llamadas: list[int] = []
        servicio = self._servicio_saturado()
        resultado = servicio.run(
            "interpreta", chat_id="chat-b", ephemeral=True, aplazar=lambda *a: llamadas.append(1)
        )
        assert resultado.deferred is False
        assert llamadas == []

    def test_sin_callback_no_aplaza(self) -> None:
        servicio = self._servicio_saturado()
        resultado = servicio.run("hola", chat_id="chat-c")
        assert resultado.deferred is False

    def test_la_cola_rota_no_rompe_el_turno(self) -> None:
        servicio = self._servicio_saturado()

        def aplazar_roto(chat_id, messages, max_tokens):
            raise RuntimeError("bd caída")

        resultado = servicio.run("hola", chat_id="chat-d", aplazar=aplazar_roto)
        assert resultado.deferred is False
        assert resultado.reply.strip() != ""


class TestColaEnBD:
    def test_encolado_vencidos_y_backoff(self) -> None:
        reply_id = _encolar(next_attempt_at=(_FIJO + timedelta(minutes=1)).isoformat(timespec="seconds"))
        with open_db() as conn:
            assert list_due_pending_llm_replies(conn, _FIJO.isoformat(timespec="seconds")) == []

            _encolar(chat_id="chat-2")
            vencidos = list_due_pending_llm_replies(conn, _FIJO.isoformat(timespec="seconds"))
            assert [int(f["id"]) for f in vencidos] != [] and reply_id not in [
                int(f["id"]) for f in vencidos
            ]

            update_pending_llm_reply_retry(
                conn, int(vencidos[0]["id"]), 1, (_FIJO + timedelta(seconds=BACKOFF_S[0])).isoformat(timespec="seconds")
            )
            fila = find_pending_llm_reply(conn, int(vencidos[0]["id"]))
            assert fila["attempts"] == 1
            assert fila["status"] == "pendiente"

            complete_pending_llm_reply(conn, int(vencidos[0]["id"]), "enviada", _FIJO.isoformat(timespec="seconds"))
            assert find_pending_llm_reply(conn, int(vencidos[0]["id"]))["status"] == "enviada"

    def test_anti_abuso_cuenta_solo_sin_entregar(self) -> None:
        _encolar(email="a@x.com")
        with open_db() as conn:
            assert count_pending_llm_replies(conn, "a@x.com") == 1
            reply_id = _encolar(email="a@x.com", chat_id="chat-3")
            fail_pending_llm_reply(conn, reply_id)
            assert count_pending_llm_replies(conn, "a@x.com") == 1  # la fallida no cuenta


class TestWorker:
    def test_exito_guarda_en_historial_y_manda_correo(self) -> None:
        reply_id = _encolar(email="alumno@x.com")
        enviados: list[tuple[str, str]] = []

        class _Vivo:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                assert any(m.get("content") == "¿qué es un compás?" for m in messages)
                return LLMResponse(text="Un compás es la división del tiempo en partes iguales. 🎼", provider="groq")

        procesados = procesar_pendientes(
            provider=_Vivo(),
            ahora=_FIJO,
            enviar=lambda correo, texto: enviados.append((correo, texto)),
        )

        assert procesados == [reply_id]
        assert enviados == [("alumno@x.com", "Un compás es la división del tiempo en partes iguales. 🎼")]
        # La redacción entra en la conversación: al volver a la app aparece.
        historial = [m["role"] for m in get_chat_history("chat-1", limit=10)]
        assert "assistant" in historial
        with open_db() as conn:
            fila = find_pending_llm_reply(conn, reply_id)
            assert fila["status"] == "enviada"
            assert fila["answered_at"] is not None

    def test_exito_sin_correo_queda_lista(self) -> None:
        reply_id = _encolar(email=None, chat_id="chat-4")
        correos: list[str] = []

        class _Vivo:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                return LLMResponse(text="respuesta tardía", provider="groq")

        procesar_pendientes(
            provider=_Vivo(), ahora=_FIJO, enviar=lambda correo, texto: correos.append(correo)
        )
        assert correos == []
        with open_db() as conn:
            assert find_pending_llm_reply(conn, reply_id)["status"] == "lista"
        assert "assistant" in [m["role"] for m in get_chat_history("chat-4", limit=10)]

    def test_fallo_reprograma_con_backoff(self) -> None:
        reply_id = _encolar(chat_id="chat-5")

        class _Cae:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                raise httpx.TimeoutException("sigue saturado")

        procesar_pendientes(provider=_Cae(), ahora=_FIJO)
        with open_db() as conn:
            fila = find_pending_llm_reply(conn, reply_id)
            assert fila["status"] == "pendiente"
            assert fila["attempts"] == 1
            esperado = (_FIJO + timedelta(seconds=BACKOFF_S[0])).isoformat(timespec="seconds")
            assert fila["next_attempt_at"] == esperado

    def test_respuesta_vacia_cuenta_como_fallo(self) -> None:
        reply_id = _encolar(chat_id="chat-6")

        class _Vacio:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                return LLMResponse(text="", provider="groq")

        procesar_pendientes(provider=_Vacio(), ahora=_FIJO)
        with open_db() as conn:
            assert find_pending_llm_reply(conn, reply_id)["status"] == "pendiente"

    def test_tope_de_intentos_cierra_en_fallida(self) -> None:
        reply_id = _encolar(chat_id="chat-7")
        with open_db() as conn:
            # Ya ha fallado TOPE-1 veces: este reintento es el último.
            update_pending_llm_reply_retry(
                conn,
                reply_id,
                TOPE_INTENTOS - 1,
                (_FIJO - timedelta(seconds=1)).isoformat(timespec="seconds"),
            )

        class _Cae:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                raise httpx.TimeoutException("nunca")

        procesar_pendientes(provider=_Cae(), ahora=_FIJO)
        with open_db() as conn:
            assert find_pending_llm_reply(conn, reply_id)["status"] == "fallida"


class TestCorreoDeAplazado:
    def test_sin_clave_de_resend_queda_en_el_log(self, caplog: pytest.LogCaptureFixture) -> None:
        sin_clave = pytest.MonkeyPatch()
        sin_clave.setattr(settings, "resend_api_key", "")
        try:
            with caplog.at_level("INFO", logger="piano_mentor.mailer"):
                mailer.send_llm_reply_email("alumno@x.com", "Un compás es…")
            assert any("Email para alumno@x.com" in r.message for r in caplog.records)
        finally:
            sin_clave.undo()

    def test_con_clave_el_correo_lleva_la_respuesta_y_el_enlace(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        capturadas: list[dict] = []
        monkeypatch.setattr(settings, "resend_api_key", "re_test_x")
        monkeypatch.setattr(settings, "app_public_url", "https://app.test")
        monkeypatch.setattr(mailer.resend.Emails, "send", lambda params: capturadas.append(params))

        mailer.send_llm_reply_email("alumno@x.com", "Un compás es…\n\nCuéntalo en voz alta.")

        assert len(capturadas) == 1
        assert capturadas[0]["subject"] == "Tu respuesta está lista · PianoMentor AI"
        assert capturadas[0]["to"] == ["alumno@x.com"]
        assert "Un compás es…" in capturadas[0]["html"]
        assert "https://app.test" in capturadas[0]["html"]


class TestEndpointAplaza:
    def test_el_chat_saturado_responde_y_encola(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from fastapi.testclient import TestClient

        from piano_mentor.main import app

        monkeypatch.setattr(settings, "llm_provider", "groq")
        monkeypatch.setattr(settings, "groq_api_key", "gsk_prueba")
        monkeypatch.setattr(settings, "gemini_api_key", "")
        llm.fijar_llm_chaos("siempre")  # 429 simulado en todos los intentos: saturación sin red
        client = TestClient(app)
        try:
            respuesta = client.post("/api/v1/agent/chat", json={"message": "hola"})
            assert respuesta.status_code == 200
            cuerpo = respuesta.json()
            assert cuerpo["deferred"] is True
            assert cuerpo["reply"].strip() != ""  # el fallback responde igualmente
            with open_db() as conn:
                vencidos = list_due_pending_llm_replies(
                    conn, (datetime.now(UTC) + timedelta(minutes=1)).isoformat(timespec="seconds")
                )
            assert len(vencidos) == 1
            assert vencidos[0]["email"] is None  # anónimo: B-036.4 pedirá el correo
        finally:
            llm.fijar_llm_chaos("")
