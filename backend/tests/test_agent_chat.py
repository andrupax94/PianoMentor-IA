# description: Chat del agente: registro de funciones, MockProvider, memoria y endpoint (B-012.8).
# context: Todo probado con MockProvider (sin red ni clave); el proveedor real se prueba aparte.

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.chat import (
    ChatService,
    MockProvider,
    _assistant_tool_call_message,
    _tool_call_id,
    _tool_result_message,
    get_fallback_provider,
)
from piano_mentor.config import settings
from piano_mentor.database import (
    connect,
    init_db,
    insert_piece,
)
from piano_mentor.llm import FallbackProvider, LLMProvider, LLMResponse
from piano_mentor.main import app
from piano_mentor.tools import REGISTRY, ToolError, execute_tool, list_tools, tool_names

client = TestClient(app)

PRACTICE_FIXTURE = Path(__file__).parent / "fixtures" / "midi" / "practice_phrase.mid"


@pytest.fixture()
def piece_id(isolated_storage: None) -> str:
    """Una pieza persistida de verdad para probar funciones del servidor."""
    with connect() as conn:
        init_db(conn)
        insert_piece(
            conn,
            {
                "id": "p-test",
                "filename": "practice_phrase.mid",
                "stored_filename": "practice_phrase.mid",
                "size_bytes": PRACTICE_FIXTURE.stat().st_size,
                "extension": ".mid",
                "title": "Phrase de prueba",
                "composer": "PianoMentor",
                "opus": None,
                "tracks": 2,
                "duration_s": 8.0,
                "notes_count": 22,
                "tempo": 120.0,
                "content_hash": "0000000000000000000000000000000000000000000000000000000000000000",
                "source": "corpus",
                "owner_id": None,
                "license": "CC0-1.0",
                "source_url": None,
                "difficulty": "facil",
                "cover": None,
            },
        )
    return "p-test"


# ---------------------------------------------------------------------------
# Registro de funciones (lista blanca)
# ---------------------------------------------------------------------------

def test_registro_solo_funciones_conocidas() -> None:
    nombres = set(tool_names())
    esperadas = {
        "listar_piezas",
        "buscar_pieza",
        "info_pieza",
        "estado_sesion",
        "reproducir_pieza",
        "pausar",
        "reanudar",
        "parar",
        "abrir_practica",
    }
    assert esperadas <= nombres


def test_ejecutar_funcion_desconocida_lanza_error() -> None:
    with pytest.raises(ToolError):
        execute_tool("funcion_inexistente", {})


def test_funciones_servidor_y_cliente() -> None:
    assert REGISTRY.get("listar_piezas").side == "server"
    assert REGISTRY.get("pausar").side == "client"
    assert REGISTRY.get("reproducir_pieza").side == "client"


def test_listar_piezas_devuelve_catalogo(piece_id: str) -> None:
    resultado = execute_tool("listar_piezas", {})
    ids = {p["id"] for p in resultado["piezas"]}
    assert piece_id in ids


def test_buscar_pieza_por_titulo(piece_id: str) -> None:
    resultado = execute_tool("buscar_pieza", {"texto": "prueba"})
    assert len(resultado["piezas"]) == 1
    assert resultado["piezas"][0]["id"] == piece_id


def test_buscar_pieza_sin_texto_lanza_error() -> None:
    with pytest.raises(ToolError):
        execute_tool("buscar_pieza", {"texto": ""})


# ---------------------------------------------------------------------------
# MockProvider (sin red ni clave)
# ---------------------------------------------------------------------------

def test_mock_provoder_responde_sin_herramienta() -> None:
    proveedor = MockProvider()
    respuesta = proveedor.chat(
        [{"role": "user", "content": "hola, ¿qué tal?"}],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.provider == "mock"
    assert respuesta.text and "sé hacerlo" in respuesta.text


def test_mock_provoder_reconoce_pausa() -> None:
    proveedor = MockProvider()
    respuesta = proveedor.chat(
        [{"role": "user", "content": "pon pausa"}],
        list_tools(),
    )
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "pausar"
    assert respuesta.tool_call["arguments"] == {}


def test_mock_provoder_reconoce_reproduce() -> None:
    proveedor = MockProvider()
    respuesta = proveedor.chat(
        [{"role": "user", "content": "reproduce el minuto de bach"}],
        list_tools(),
    )
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "buscar_pieza"
    assert "bach" in str(respuesta.tool_call["arguments"]).lower()


# ---------------------------------------------------------------------------
# ChatService con MockProvider
# ---------------------------------------------------------------------------

class FuncionInexistenteProvider(LLMProvider):
    """Provider falso que pide una función fuera de la lista blanca."""

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, object]]) -> LLMResponse:
        return LLMResponse(
            text="",
            tool_call={"name": "funcion_inexistente", "arguments": {}},
            provider="falso",
        )


def test_chat_funcion_desconocida_responde_honestamente() -> None:
    servicio = ChatService(FuncionInexistenteProvider())
    resultado = servicio.run("haz algo raro", chat_id="chat-1")
    assert resultado.client_action is None
    assert "todavía no sé hacerlo" in resultado.reply
    assert resultado.used_tools[0]["rejected"] is True


def test_chat_pausa_devuelve_accion_de_navegador() -> None:
    servicio = ChatService(MockProvider())
    resultado = servicio.run("pon pausa", chat_id="chat-2")
    assert resultado.client_action is not None
    assert resultado.client_action["name"] == "pausar"
    assert resultado.provider == "mock"


def test_chat_memoria_guarda_ambos_mensajes() -> None:
    servicio = ChatService(MockProvider())
    servicio.run("pon pausa", chat_id="chat-3")
    servicio.run("ahora reanuda", chat_id="chat-3")
    from piano_mentor.database import get_chat_history

    mensajes = get_chat_history("chat-3", limit=20)
    roles = [m["role"] for m in mensajes]
    assert roles.count("user") == 2
    assert roles.count("assistant") == 2


# ---------------------------------------------------------------------------
# Endpoint POST /agent/chat
# ---------------------------------------------------------------------------

def test_endpoint_agent_chat_pausa() -> None:
    respuesta = client.post(
        "/api/v1/agent/chat",
        json={"message": "pon pausa", "chat_id": "chat-e2e"},
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["chat_id"] == "chat-e2e"
    assert cuerpo["provider"] == "mock"
    assert cuerpo["used_fallback"] is False
    assert cuerpo["client_action"] is not None
    assert cuerpo["client_action"]["name"] == "pausar"


def test_endpoint_agent_chat_mensaje_vacio_422() -> None:
    respuesta = client.post(
        "/api/v1/agent/chat",
        json={"message": ""},
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"]["code"] == "invalid_chat_payload"


def test_endpoint_agent_chat_buscar_pieza(piece_id: str) -> None:
    """buscar_pieza es de servidor: se ejecuta y no devuelve client_action."""
    respuesta = client.post(
        "/api/v1/agent/chat",
        json={"message": "pon la frase de prueba", "chat_id": "chat-buscar"},
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["client_action"] is None
    assert any(t["name"] == "buscar_pieza" for t in cuerpo["used_tools"])


# ---------------------------------------------------------------------------
# Dialecto OpenAI del bucle de herramientas (B-012.8 bloque B)
# ---------------------------------------------------------------------------

def test_tool_call_message_lleva_id_y_funcion_anidada() -> None:
    """El mensaje assistant debe llevar id, type y function anidado.

    Sin `id`, Groq y Gemini rechazan la petición con 400 al reenviar el
    tool_call. Es el bug que rompía cualquier función de servidor con el
    proveedor real.
    """
    mensaje = _assistant_tool_call_message("call_abc", "listar_piezas", {})
    assert mensaje["role"] == "assistant"
    assert mensaje["tool_calls"][0]["id"] == "call_abc"
    assert mensaje["tool_calls"][0]["type"] == "function"
    assert mensaje["tool_calls"][0]["function"]["name"] == "listar_piezas"


def test_tool_call_arguments_viajan_como_string_json() -> None:
    """Los argumentos van serializados como string, no como objeto."""
    mensaje = _assistant_tool_call_message("call_abc", "buscar_pieza", {"texto": "Bach"})
    argumentos = mensaje["tool_calls"][0]["function"]["arguments"]
    assert isinstance(argumentos, str)
    assert json.loads(argumentos) == {"texto": "Bach"}


def test_tool_result_message_usa_tool_call_id() -> None:
    """El mensaje tool empareja por `tool_call_id`, no por `name`."""
    mensaje = _tool_result_message("call_abc", "listar_piezas", "{}")
    assert mensaje["role"] == "tool"
    assert mensaje["tool_call_id"] == "call_abc"


def test_tool_call_id_usa_el_id_del_proveedor() -> None:
    """Si el proveedor trae id, se usa; si no, se recurre al sintético."""
    respuesta_con_id = LLMResponse(tool_call={"id": "call_real", "name": "pausar"})
    assert _tool_call_id(respuesta_con_id, "call_sintetico") == "call_real"

    respuesta_sin_id = LLMResponse(tool_call={"name": "pausar"})
    assert _tool_call_id(respuesta_sin_id, "call_sintetico") == "call_sintetico"


def test_bucle_servidor_construye_mensajes_validos() -> None:
    """Un turno con función de servidor deja mensajes bien emparejados.

    Simula la cadena que ve el proveedor: el assistant con su tool_call (id,
    type, function) seguido del tool con el mismo tool_call_id.
    """

    class ProviderQueEjecutaYResponde(LLMProvider):
        """Devuelve una función de servidor y luego texto final."""

        def __init__(self) -> None:
            self.primer_llamado = True

        def chat(self, messages, tools):
            if self.primer_llamado:
                self.primer_llamado = False
                return LLMResponse(
                    text="",
                    tool_call={"id": "call_serv", "name": "listar_piezas", "arguments": {}},
                    provider="falso",
                )
            return LLMResponse(text="Aquí tienes el catálogo.", provider="falso")

    provider = ProviderQueEjecutaYResponde()
    servicio = ChatService(provider)
    resultado = servicio.run("lista las piezas", chat_id="chat-dialecto")
    assert resultado.reply == "Aquí tienes el catálogo."

    # Reejecutar el mismo provider pero inspeccionando los mensajes enviados.
    capturado: list[dict] = []

    class ProviderQueCaptura(LLMProvider):
        def chat(self, messages, tools):
            capturado.extend(messages)
            return LLMResponse(
                text="",
                tool_call={"id": "call_x", "name": "listar_piezas", "arguments": {}},
                provider="falso",
            )

    ChatService(ProviderQueCaptura()).run("lista", chat_id="chat-dialecto-2")

    tool_messages = [m for m in capturado if m.get("role") == "tool"]
    assert tool_messages, "debió enviarse un mensaje role:tool al proveedor"
    assert tool_messages[0]["tool_call_id"] == "call_x"


# ---------------------------------------------------------------------------
# Gating de llm_provider (B-012.8 bloque B)
# ---------------------------------------------------------------------------

def test_gating_mock_es_hermetico_con_claves(monkeypatch: pytest.MonkeyPatch) -> None:
    """Con llm_provider=mock no se monta ningún proveedor real, aunque haya claves."""
    monkeypatch.setattr(settings, "llm_provider", "mock")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_no_deberia_usarse")
    monkeypatch.setattr(settings, "gemini_api_key", "AIza_no_deberia_usarse")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, MockProvider)


def test_gating_groq_montasolo_groq_y_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_prueba")
    monkeypatch.setattr(settings, "gemini_api_key", "AIza_prueba")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, FallbackProvider)
    nombres = [getattr(p, "provider_name", "mock") for p in proveedor.providers]
    assert nombres == ["groq", "mock"]


def test_gating_groq_sin_clave_cae_en_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sin clave del proveedor elegido, se salta directo al Mock."""
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, MockProvider)
