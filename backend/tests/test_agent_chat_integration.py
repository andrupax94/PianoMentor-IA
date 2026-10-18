# description: Pruebas de integración del proveedor LLM real (B-012.8 bloque B).
# context: Marcadas como `integration`: necesitan red y una clave real en el
# entorno (.env), así que se omiten en CI. Ejecutar a mano con:
#   python -m pytest -q -m integration

from __future__ import annotations

import os
from pathlib import Path

import pytest

from piano_mentor.chat import ChatService
from piano_mentor.config import settings
from piano_mentor.llm import LLMProvider, OpenAICompatibleProvider
from piano_mentor.tools import list_tools

pytestmark = pytest.mark.integration

# `.env` de la raíz del repo: `Settings` carga `.env` relativo al cwd (backend/),
# así que en local las claves reales no llegan a `settings` y los tests se
# omitirían. Aquí se leen a mano SOLO para las pruebas de integración, que ya
# están marcadas y nunca corren en CI (donde no hay `.env` ni red).
_ENV_RAIZ = Path(__file__).resolve().parents[2] / ".env"


def _clave(nombre: str) -> str:
    """Lee la clave sin imprimirla; vacío si no está configurada.

    Busca primero en el entorno del proceso, luego en `settings` y por último en
    el `.env` de la raíz, que es donde el usuario local guarda sus claves.
    """
    valor = (os.getenv(nombre) or "").strip()
    if valor:
        return valor
    valor = str(getattr(settings, nombre.lower(), "") or "").strip()
    if valor:
        return valor
    if _ENV_RAIZ.exists():
        from dotenv import dotenv_values

        return (dotenv_values(_ENV_RAIZ).get(nombre) or "").strip()
    return ""


@pytest.fixture()
def groq_provider() -> OpenAICompatibleProvider:
    clave = _clave("GROQ_API_KEY") or settings.groq_api_key
    if not clave:
        pytest.skip("GROQ_API_KEY no configurada: prueba de integración omitida")
    return OpenAICompatibleProvider(
        base_url="https://api.groq.com/openai/v1",
        api_key=clave,
        model=settings.groq_model,
        provider_name="groq",
        timeout_s=30.0,
    )


def test_groq_elige_funcion_de_cliente(groq_provider: OpenAICompatibleProvider) -> None:
    """Groq reconoce una orden de navegador y propone `pausar`."""
    respuesta = groq_provider.chat(
        [{"role": "user", "content": "pon pausa"}], list_tools()
    )
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "pausar"


def test_groq_elige_funcion_de_servidor_con_argumentos(
    groq_provider: OpenAICompatibleProvider,
) -> None:
    """Groq propone `buscar_pieza` con el texto extraído de la orden."""
    respuesta = groq_provider.chat(
        [{"role": "user", "content": "busca una pieza de bach"}], list_tools()
    )
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "buscar_pieza"
    assert "bach" in str(respuesta.tool_call["arguments"]).lower()


def test_groq_responde_texto_cuando_no_hay_funcion(
    groq_provider: OpenAICompatibleProvider,
) -> None:
    """Sin tool_call, devuelve solo texto (pregunta abierta)."""
    respuesta = groq_provider.chat(
        [{"role": "user", "content": "¿qué puedes hacer?"}], list_tools()
    )
    assert respuesta.tool_call is None
    assert respuesta.text


def test_groq_bucle_completo_con_funcion_de_servidor(
    groq_provider: OpenAICompatibleProvider,
) -> None:
    """Turno completo de ChatService: función de servidor ejecutada y redactada.

    Es la prueba que descubrió el bug del dialecto OpenAI: sin el `id` del
    tool_call, Groq respondía 400 en este exacto camino.
    """
    servicio = ChatService(groq_provider)
    resultado = servicio.run("lista las piezas del catálogo", chat_id="integration-1")
    assert resultado.provider == "groq"
    assert resultado.reply
    assert any(t["name"] == "listar_piezas" for t in resultado.used_tools)


def test_groq_devuelve_accion_de_navegador(groq_provider: OpenAICompatibleProvider) -> None:
    """Una orden de cliente pura produce client_action y no la ejecuta el backend.

    "pon pausa" no necesita consultar la BD, así que Groq va directo a la
    función de navegador y el backend solo devuelve la intención. Nota: una
    orden como "reproduce X" empieza por buscar_pieza (función de servidor), no
    por una client_action, porque hay que localizar la pieza antes de reproducir.
    """
    servicio = ChatService(groq_provider)
    resultado = servicio.run("pon pausa", chat_id="integration-2")
    assert resultado.client_action is not None
    assert resultado.client_action["name"] == "pausar"


def test_gemini_elige_funcion() -> None:
    """Gemini (capa OpenAI-compatible) también hace tool calling."""
    clave = _clave("GEMINI_API_KEY") or settings.gemini_api_key
    if not clave:
        pytest.skip("GEMINI_API_KEY no configurada: prueba de integración omitida")
    proveedor = OpenAICompatibleProvider(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=clave,
        model=settings.gemini_model,
        provider_name="gemini",
        timeout_s=30.0,
    )
    respuesta = proveedor.chat([{"role": "user", "content": "pon pausa"}], list_tools())
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "pausar"


def test_cadena_fallback_cae_al_mock_si_falla_groq() -> None:
    """Con una clave de Groq inválida, la cadena no se rompe y llega al Mock."""

    class ProviderRoto(LLMProvider):
        """Proveedor que siempre falla, para simular Groq caído."""

        def chat(self, messages, tools):
            raise RuntimeError("proveedor caído")

    from piano_mentor.llm import FallbackProvider, MockProvider

    cadena = FallbackProvider([ProviderRoto(), MockProvider()])
    respuesta = cadena.chat([{"role": "user", "content": "pon pausa"}], list_tools())
    assert respuesta.provider == "mock"
    assert respuesta.used_fallback is True
    assert respuesta.tool_call is not None
