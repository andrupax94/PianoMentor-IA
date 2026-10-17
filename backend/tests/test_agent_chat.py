# description: Chat del agente: registro de funciones, MockProvider, memoria y endpoint (B-012.8).
# context: Todo probado con MockProvider (sin red ni clave); el proveedor real se prueba aparte.

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from piano_mentor.chat import ChatService, MockProvider
from piano_mentor.database import (
    connect,
    init_db,
    insert_piece,
)
from piano_mentor.llm import LLMProvider, LLMResponse
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
