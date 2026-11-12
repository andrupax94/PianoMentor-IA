# description: Tests de la política de reintentos ante LLM saturado (B-036.1): transitorios (429/5xx/timeout) con espera corta respetando Retry-After y techo; 400/401 permanentes sin reintento; contexto desbordado (400 «too large») con recorte del historial a la mitad por turnos completos y un solo reintento; log del salto de proveedor en FallbackProvider.
# context: El httpx real con Client parcheado (patrón de test_agent.py): las respuestas son httpx.Response de verdad para que raise_for_status levante HTTPStatusError con headers y cuerpo. La espera pasa por llm._dormir, parcheada: los tests nunca duermen. settings se parchea por test (llm_retry_intentos, llm_retry_espera_max_s).

from __future__ import annotations

import httpx
import pytest

from piano_mentor import llm
from piano_mentor.config import settings
from piano_mentor.llm import FallbackProvider, MockProvider, OpenAICompatibleProvider

_PETICION = httpx.Request("POST", "https://ejemplo.test/v1/chat/completions")

_respuestas: list[object] = []
_peticiones: list[dict] = []
_esperas: list[float] = []


class _ClienteDeTanda:
    """httpx.Client de mentira: entrega las respuestas de la tanda en orden."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        return None

    def __enter__(self) -> "_ClienteDeTanda":
        return self

    def __exit__(self, *args: object) -> bool:
        return False

    def post(self, *args: object, **kwargs: object) -> httpx.Response:
        _peticiones.append(kwargs.get("json") or {})
        siguiente = _respuestas.pop(0)
        if isinstance(siguiente, Exception):
            raise siguiente
        return siguiente  # type: ignore[no-any-return]


def _provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url="https://ejemplo.test/v1",
        api_key="clave-de-mentira",
        model="modelo-de-mentira",
        provider_name="groq",
    )


def _ok(texto: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": texto}}]},
        request=_PETICION,
    )


def _error(
    status: int,
    cuerpo: str = "",
    retry_after: str | None = None,
) -> httpx.Response:
    headers = {"Retry-After": retry_after} if retry_after else {}
    return httpx.Response(
        status,
        text=cuerpo,
        headers=headers,
        request=_PETICION,
    )


def _mensajes_largos() -> list[dict[str, str]]:
    """6 mensajes: system + 2 turnos de historial + el turno del alumno."""
    return [
        {"role": "system", "content": "Eres el profesor."},
        {"role": "user", "content": "turno-1 del alumno"},
        {"role": "assistant", "content": "respuesta-1"},
        {"role": "user", "content": "turno-2 del alumno"},
        {"role": "assistant", "content": "respuesta-2"},
        {"role": "user", "content": "turno-3 (el de ahora)"},
    ]


@pytest.fixture(autouse=True)
def _tanda_limpia(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cada test arranca con tanda vacía, espera parcheada y settings fijos."""
    _respuestas.clear()
    _peticiones.clear()
    _esperas.clear()
    monkeypatch.setattr(httpx, "Client", _ClienteDeTanda)
    monkeypatch.setattr(llm, "_dormir", lambda segundos: _esperas.append(segundos))
    monkeypatch.setattr(settings, "llm_retry_intentos", 1)
    monkeypatch.setattr(settings, "llm_retry_espera_max_s", 8.0)


class TestReintentosTransitorios:
    def test_429_reintenta_respetando_retry_after(self) -> None:
        _respuestas.extend([_error(429, "rate limited", retry_after="2"), _ok("hola")])

        respuesta = _provider().chat([{"role": "user", "content": "hola"}], [])

        assert respuesta.text == "hola"
        assert len(_peticiones) == 2
        assert _esperas == [2.0]

    def test_429_sin_retry_after_espera_progresiva(self) -> None:
        monkeypatch_setting = pytest.MonkeyPatch()
        monkeypatch_setting.setattr(settings, "llm_retry_intentos", 2)
        try:
            _respuestas.extend([_error(429), _error(429), _ok("hola")])
            respuesta = _provider().chat([{"role": "user", "content": "hola"}], [])
            assert respuesta.text == "hola"
            assert _esperas == [1.0, 2.0]
        finally:
            monkeypatch_setting.undo()

    def test_techo_de_espera_recorta_un_retry_after_absurdo(self) -> None:
        _respuestas.extend([_error(429, "x", retry_after="600"), _ok("hola")])

        _provider().chat([{"role": "user", "content": "hola"}], [])

        assert _esperas == [8.0]

    def test_timeout_reintenta_y_exito(self) -> None:
        _respuestas.extend(
            [httpx.TimeoutException("se agotó la espera"), _ok("hola")]
        )

        respuesta = _provider().chat([{"role": "user", "content": "hola"}], [])

        assert respuesta.text == "hola"
        assert len(_peticiones) == 2
        assert _esperas == [1.0]

    def test_429_persistente_agota_los_reintentos_y_propaga(self) -> None:
        _respuestas.extend([_error(429), _error(429)])

        with pytest.raises(httpx.HTTPStatusError):
            _provider().chat([{"role": "user", "content": "hola"}], [])

        assert len(_peticiones) == 2  # 1 intento + 1 reintento, nada más


class TestPermanentesSinReintento:
    def test_400_sin_marcas_no_reintenta(self) -> None:
        _respuestas.extend([_error(400, "bad request: model not found")])

        with pytest.raises(httpx.HTTPStatusError):
            _provider().chat([{"role": "user", "content": "hola"}], [])

        assert len(_peticiones) == 1
        assert _esperas == []

    def test_401_no_reintenta(self) -> None:
        _respuestas.extend([_error(401, "invalid api key")])

        with pytest.raises(httpx.HTTPStatusError):
            _provider().chat([{"role": "user", "content": "hola"}], [])

        assert len(_peticiones) == 1

    def test_429_persistente_hace_saltara_la_cadena_al_mock(self) -> None:
        _respuestas.extend([_error(429), _error(429)])

        cadena = FallbackProvider([_provider(), MockProvider()])
        respuesta = cadena.chat([{"role": "user", "content": "hola"}], [])

        assert respuesta.provider == "mock"
        assert respuesta.used_fallback is True


class TestContextoDesbordado:
    def test_recorta_el_historial_a_la_mitad_y_reintenta(self) -> None:
        _respuestas.extend(
            [
                _error(400, "This model's maximum context length is 8192 tokens"),
                _ok("hola"),
            ]
        )
        mensajes = _mensajes_largos()

        respuesta = _provider().chat(mensajes, [])

        assert respuesta.text == "hola"
        assert len(_peticiones) == 2
        # La segunda petición lleva el historial recortado (system + el turno
        # del alumno; 6 mensajes no-system → se suelta el turno-1 completo).
        enviados = _peticiones[1]["messages"]
        assert enviados[0]["role"] == "system"
        assert enviados[-1]["content"] == "turno-3 (el de ahora)"
        assert len(enviados) < len(mensajes)
        assert not any(m["role"] == "tool" and i == 0 for i, m in enumerate(enviados[1:]))

    def test_solo_se_recorta_una_vez(self) -> None:
        _respuestas.extend(
            [
                _error(400, "This model's maximum context length is 8192 tokens"),
                _error(400, "This model's maximum context length is 8192 tokens"),
            ]
        )

        with pytest.raises(httpx.HTTPStatusError):
            _provider().chat(_mensajes_largos(), [])

        assert len(_peticiones) == 2

    def test_sin_historial_que_recortar_propaga(self) -> None:
        _respuestas.extend([_error(400, "This model's maximum context length is 8")])

        with pytest.raises(httpx.HTTPStatusError):
            _provider().chat(
                [
                    {"role": "system", "content": "Eres el profesor."},
                    {"role": "user", "content": "pregunta"},
                ],
                [],
            )

        assert len(_peticiones) == 1


class TestRecortarHistorial:
    def test_halza_por_turnos_completos_y_protege_el_ultimo(self) -> None:
        historial = [
            {"role": "system", "content": "s"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
            {"role": "user", "content": "u3"},
        ]

        recortado = llm._recortar_historial(historial)

        assert recortado[0]["role"] == "system"
        assert recortado[-1]["content"] == "u3"
        assert len(recortado) == 4  # system + u2 + a2 + u3: el turno-1 fuera

    def test_no_deja_tool_huerfano(self) -> None:
        historial = [
            {"role": "system", "content": "s"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "c1"}]},
            {"role": "tool", "content": "resultado", "tool_call_id": "c1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "user", "content": "u3"},
        ]

        recortado = llm._recortar_historial(historial)

        # Ningún `tool` en primera posición del resto (el dialecto OpenAI
        # rechazaría un tool sin su assistant tool_call delante).
        assert recortado[1]["role"] == "user"
        for mensaje in recortado[2:]:
            if mensaje["role"] == "tool":
                assert recortado[recortado.index(mensaje) - 1]["role"] == "assistant"

    def test_poco_historial_devuelve_igual(self) -> None:
        mensajes = [
            {"role": "system", "content": "s"},
            {"role": "user", "content": "u"},
        ]
        assert llm._recortar_historial(mensajes) == mensajes


class TestLogDelSalto:
    def test_el_salto_de_proveedor_queda_en_el_log(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        class _Roto:
            provider_name = "groq"

            def chat(self, messages, tools, max_tokens=None):
                raise RuntimeError("429 saturado")

        with caplog.at_level("WARNING", logger="piano_mentor.llm"):
            cadena = FallbackProvider([_Roto(), MockProvider()])
            respuesta = cadena.chat([{"role": "user", "content": "hola"}], [])

        assert respuesta.provider == "mock"
        assert any(
            "[llm] groq falló (429 saturado)" in registro.message
            for registro in caplog.records
        )
