# description: Chat del agente: registro de funciones, MockProvider, memoria y endpoint (B-012.8).
# context: Todo probado con MockProvider (sin red ni clave), incluido su bucle de dos pasos
# (buscar -> decidir con el resultado -> acción del navegador); el proveedor real se prueba aparte.

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


def _registro_pieza(
    id_pieza: str, title: str, composer: str, content_hash: str
) -> dict[str, object]:
    """Registro mínimo para sembrar una pieza de mentira en los tests de búsqueda."""
    return {
        "id": id_pieza,
        "filename": f"{id_pieza}.mid",
        "stored_filename": f"{id_pieza}.mid",
        "size_bytes": 64,
        "extension": ".mid",
        "title": title,
        "composer": composer,
        "opus": None,
        "tracks": 2,
        "duration_s": 8.0,
        "notes_count": 22,
        "tempo": 120.0,
        "content_hash": content_hash,
        "source": "corpus",
        "owner_id": None,
        "license": "CC0-1.0",
        "source_url": None,
        "difficulty": "facil",
        "cover": None,
    }


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


def test_buscar_pieza_sin_coincidencias_devuelve_vacío() -> None:
    """Cero candidatos es una respuesta válida: de aquí sale la negación honesta."""
    with connect() as conn:
        init_db(conn)
        insert_piece(
            conn, _registro_pieza("p-test", "Phrase de prueba", "PianoMentor", "0" * 64)
        )
    resultado = execute_tool("buscar_pieza", {"texto": "bolero de ravel"})
    assert resultado == {"piezas": []}


def test_buscar_pieza_ordena_por_coincidencias() -> None:
    """«minueto bach» pone el Minueto antes, aunque el catálogo ordene otra pieza primero.

    Sin este orden el agente habría reproducido una Invention cuando el usuario
    pidió el minueto: la que encaja con dos palabras manda sobre la que encaja
    con una, y los empates se quedan en el orden del corpus.
    """
    with connect() as conn:
        init_db(conn)
        insert_piece(
            conn,
            _registro_pieza(
                "a-invention", "Invention No. 1 in C major", "Johann Sebastian Bach", "1" * 64
            ),
        )
        insert_piece(
            conn,
            _registro_pieza(
                "z-minuet", "Minuet in G major", "Johann Sebastian Bach", "2" * 64
            ),
        )
    resultado = execute_tool("buscar_pieza", {"texto": "minueto bach"})
    assert [p["id"] for p in resultado["piezas"]] == ["z-minuet", "a-invention"]


def test_buscar_pieza_compara_sin_acentos() -> None:
    """«fur elise» encuentra *Für Elise*: la normalización quita las tildes a los dos lados."""
    with connect() as conn:
        init_db(conn)
        insert_piece(
            conn, _registro_pieza("p-fur", "Für Elise", "Ludwig van Beethoven", "3" * 64)
        )
    resultado = execute_tool("buscar_pieza", {"texto": "fur elise"})
    assert [p["id"] for p in resultado["piezas"]] == ["p-fur"]


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
# MockProvider: el bucle de dos pasos (buscar -> decidir con el resultado)
# ---------------------------------------------------------------------------

def test_mock_extrae_las_palabras_clave_de_la_orden() -> None:
    """«pon el minueto de Bach» viaja como «minueto bach», igual que el contrato."""
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "pon el minueto de Bach"}],
        list_tools(),
    )
    assert respuesta.tool_call is not None
    assert respuesta.tool_call["name"] == "buscar_pieza"
    assert respuesta.tool_call["arguments"] == {"texto": "minueto bach"}


def test_mock_encadena_buscar_y_reproduce_con_el_primer_candidato() -> None:
    """Con candidatos en la mano cierra con la acción del navegador, no vuelve a buscar."""
    candidatos = json.dumps(
        {
            "piezas": [
                {"id": "p01", "title": "Minuet in G major"},
                {"id": "p03", "title": "Invention No. 1 in C major"},
            ]
        },
        ensure_ascii=False,
    )
    respuesta = MockProvider().chat(
        [
            {"role": "user", "content": "pon el minueto de Bach"},
            {"role": "tool", "name": "buscar_pieza", "content": candidatos},
        ],
        list_tools(),
    )
    assert respuesta.tool_call == {
        "name": "reproducir_pieza",
        "arguments": {"piece_id": "p01", "auto_play": True},
    }
    assert respuesta.text and "Minuet in G major" in respuesta.text


def test_mock_busca_sin_coincidencias_y_no_inventa_accion() -> None:
    """Sin candidatos la respuesta es honesta y `client_action` no llega a existir."""
    respuesta = MockProvider().chat(
        [
            {"role": "user", "content": "reproduce el bolero de Ravel"},
            {"role": "tool", "name": "buscar_pieza", "content": json.dumps({"piezas": []})},
        ],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.text and "No he encontrado" in respuesta.text
    assert "bolero ravel" in respuesta.text


def test_mock_negacion_honest_con_una_orden_imposible() -> None:
    """«tocar» no vale como «toca»: pedir el violín cae en el rechazo honesto."""
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "enséñame a tocar el violín"}],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.text and "todavía no sé hacerlo" in respuesta.text


def test_mock_no_confunde_para_con_comparacion() -> None:
    """«comparación» contiene «para», pero no es una orden de detención."""
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "compara las notas"}],
        list_tools(),
    )
    assert respuesta.tool_call is None


def test_mock_reconoce_detener() -> None:
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "detén la reproducción"}],
        list_tools(),
    )
    assert respuesta.tool_call == {"name": "parar", "arguments": {}}


def test_mock_practica_busca_antes_de_abrir() -> None:
    """«abre práctica del minueto» busca primero: `abrir_practica` exige un `piece_id`."""
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "abre práctica del minueto de Bach"}],
        list_tools(),
    )
    assert respuesta.tool_call == {
        "name": "buscar_pieza",
        "arguments": {"texto": "minueto bach"},
    }


def test_mock_practica_encadena_abrir_con_el_candidato() -> None:
    candidatos = json.dumps({"piezas": [{"id": "p01", "title": "Minuet in G major"}]})
    respuesta = MockProvider().chat(
        [
            {"role": "user", "content": "abre práctica del minueto de Bach"},
            {"role": "tool", "name": "buscar_pieza", "content": candidatos},
        ],
        list_tools(),
    )
    assert respuesta.tool_call == {"name": "abrir_practica", "arguments": {"piece_id": "p01"}}


def test_mock_practica_sin_titulo_pide_la_pieza() -> None:
    """Sin pieza nombrada no devuelve una acción muerta: pide el título."""
    respuesta = MockProvider().chat(
        [{"role": "user", "content": "abre práctica"}],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.text and "¿Sobre qué pieza?" in respuesta.text


def test_mock_lista_el_catalogo_y_lo_resume() -> None:
    """Tras `listar_piezas` resume el resultado en vez de pedir la lista otra vez."""
    catalogo = json.dumps(
        {"piezas": [{"id": f"p{i}", "title": f"Pieza {i}"} for i in range(7)]},
        ensure_ascii=False,
    )
    respuesta = MockProvider().chat(
        [
            {"role": "user", "content": "lista las piezas"},
            {"role": "tool", "name": "listar_piezas", "content": catalogo},
        ],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.text and "7 piezas en el catálogo" in respuesta.text


def test_mock_sin_intencion_no_manda_accion_al_navegador() -> None:
    """Si la búsqueda la pidió otro proveedor y el usuario no mandó reproducir, solo informa."""
    candidatos = json.dumps(
        {"piezas": [{"id": "p01", "title": "Minuet in G major"}]}, ensure_ascii=False
    )
    respuesta = MockProvider().chat(
        [
            {"role": "user", "content": "¿qué piezas de Bach tienes?"},
            {"role": "tool", "name": "buscar_pieza", "content": candidatos},
        ],
        list_tools(),
    )
    assert respuesta.tool_call is None
    assert respuesta.text and "He encontrado 1 coincidencia" in respuesta.text


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


def test_endpoint_agent_chat_encadena_buscar_y_reproduce(piece_id: str) -> None:
    """La orden de reproducción busca en el servidor y devuelve la acción al navegador.

    Era el camino roto de la demo: el Mock agotaba los pasos buscando la frase
    entera («pon la frase de prueba» no está en ningún título) y terminaba sin
    `client_action`, es decir, sin reproducir nada.
    """
    respuesta = client.post(
        "/api/v1/agent/chat",
        json={"message": "pon la frase de prueba", "chat_id": "chat-buscar"},
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [t["name"] for t in cuerpo["used_tools"]] == ["buscar_pieza", "reproducir_pieza"]
    assert cuerpo["client_action"]["name"] == "reproducir_pieza"
    assert cuerpo["client_action"]["arguments"] == {"piece_id": "p-test", "auto_play": True}
    assert cuerpo["client_action"]["rejected"] is False
    # La redacción es la del proveedor (contrato: respuesta natural), con el
    # título de la pieza elegida, no el id suelto.
    assert "Phrase de prueba" in cuerpo["reply"]
    assert cuerpo["provider"] == "mock"


def test_endpoint_agent_chat_sin_coincidencias_no_inventa_accion(piece_id: str) -> None:
    """Función de servidor sola: se ejecuta, no hay candidatos y no se inventa `client_action`."""
    respuesta = client.post(
        "/api/v1/agent/chat",
        json={"message": "reproduce el bolero de Ravel", "chat_id": "chat-sin-resultados"},
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["client_action"] is None
    assert [t["name"] for t in cuerpo["used_tools"]] == ["buscar_pieza"]
    assert "No he encontrado" in cuerpo["reply"]


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


def test_llmresponse_transporta_varias_funciones_en_paralelo() -> None:
    """Los modelos reales mandan varias tool_calls a la vez; no se descartan.

    Antes solo se ejecutaba la primera y el modelo repetía las demás en cada
    paso, agotando el tope de pasos con un 'límite de pasos' al usuario.
    """
    respuesta = LLMResponse(
        tool_calls=[
            {"id": "call_1", "name": "listar_piezas", "arguments": {}},
            {"id": "call_2", "name": "estado_sesion", "arguments": {}},
        ],
        provider="falso",
    )
    assert len(respuesta.tool_calls) == 2
    # `tool_call` sigue apuntando a la primera para compatibilidad con una por turno.
    assert respuesta.tool_call is respuesta.tool_calls[0]
    assert respuesta.tool_call["name"] == "listar_piezas"


def test_bucle_ejecuta_varias_funciones_paralelas_y_responde_texto() -> None:
    """Un turno con varias funciones en paralelo las ejecuta todas y termina en texto."""

    class ProviderParalelo(LLMProvider):
        """Primera llamada: dos funciones de servidor en paralelo; después, texto."""

        def __init__(self) -> None:
            self.primer_llamado = True

        def chat(self, messages, tools):
            if self.primer_llamado:
                self.primer_llamado = False
                return LLMResponse(
                    text="",
                    tool_calls=[
                        {"id": "call_a", "name": "listar_piezas", "arguments": {}},
                        {"id": "call_b", "name": "estado_sesion", "arguments": {}},
                    ],
                    provider="falso",
                )
            return LLMResponse(text="Aquí tienes el catálogo y tu sesión.", provider="falso")

    servicio = ChatService(ProviderParalelo())
    resultado = servicio.run("lista las piezas y dime mi sesión", chat_id="chat-paralelo")
    assert resultado.reply == "Aquí tienes el catálogo y tu sesión."
    nombres = {t["name"] for t in resultado.used_tools}
    assert nombres == {"listar_piezas", "estado_sesion"}
    # Ambas funciones se ejecutaron sin agotar el tope de pasos.
    assert resultado.client_action is None


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


def test_gating_groq_encadena_gemini_detras(monkeypatch: pytest.MonkeyPatch) -> None:
    """Con Groq elegido, Gemini queda detrás como respaldo y cierra el Mock.

    Motivado por la demo: Groq contesta muy bien pero de vez en cuando devuelve
    un turno vacío (sin texto ni funciones); en ese caso manda la petición a
    Gemini antes de rendirse.
    """
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_prueba")
    monkeypatch.setattr(settings, "gemini_api_key", "AIza_prueba")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, FallbackProvider)
    nombres = [getattr(p, "provider_name", "mock") for p in proveedor.providers]
    assert nombres == ["groq", "gemini", "mock"]


def test_gating_groq_sin_clave_de_gemini_va_directo_al_mock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sin clave de Gemini no se monta: la cadena es Groq → Mock."""
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_prueba")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, FallbackProvider)
    nombres = [getattr(p, "provider_name", "mock") for p in proveedor.providers]
    assert nombres == ["groq", "mock"]


def test_gating_gemini_encadena_groq_detras(monkeypatch: pytest.MonkeyPatch) -> None:
    """El orden es simétrico: si el elegido es Gemini, Groq pasa a ser respaldo."""
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_prueba")
    monkeypatch.setattr(settings, "gemini_api_key", "AIza_prueba")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, FallbackProvider)
    nombres = [getattr(p, "provider_name", "mock") for p in proveedor.providers]
    assert nombres == ["gemini", "groq", "mock"]


def test_gating_groq_sin_clave_cae_en_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sin clave del proveedor elegido, se salta directo al Mock."""
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "")
    proveedor = get_fallback_provider()
    assert isinstance(proveedor, MockProvider)


# ---------------------------------------------------------------------------
# Respaldos: respuesta vacía y burbuja sin blanco (B-012.8 bloque D)
# ---------------------------------------------------------------------------

def test_fallback_pasa_al_siguiente_si_la_respuesta_es_vacia() -> None:
    """Un turno sin texto ni funciones es un fallo del proveedor, no una respuesta.

    Es el fleco observado en vivo: Groq devolvía `content: ""` sin tool_calls y
    la burbuja del chat quedaba en blanco. Ahora sigue la cadena.
    """

    class ProviderEnVacio(LLMProvider):
        def chat(self, messages, tools):
            return LLMResponse(text="   ", tool_calls=[], provider="vacio")

    class ProviderBueno(LLMProvider):
        def chat(self, messages, tools):
            return LLMResponse(text="Contesto yo.", provider="bueno")

    cadena = FallbackProvider([ProviderEnVacio(), ProviderBueno()])
    respuesta = cadena.chat([{"role": "user", "content": "hola"}], [])

    assert respuesta.text == "Contesto yo."
    assert respuesta.provider == "bueno"
    assert respuesta.used_fallback is True


def test_fallback_no_marca_used_fallback_si_el_primero_contesta() -> None:
    class ProviderBueno(LLMProvider):
        def chat(self, messages, tools):
            return LLMResponse(text="Contesto yo.", provider="bueno")

    class ProviderIgnorado(LLMProvider):
        def chat(self, messages, tools):
            raise AssertionError("no debía llegarse al segundo proveedor")

    cadena = FallbackProvider([ProviderBueno(), ProviderIgnorado()])
    respuesta = cadena.chat([{"role": "user", "content": "hola"}], [])

    assert respuesta.text == "Contesto yo."
    assert respuesta.used_fallback is False


def test_turno_sin_texto_acaba_en_respuesta_honesta() -> None:
    """Un proveedor mudo no deja la burbuja en blanco: el turno se explica."""

    class ProviderMudo(LLMProvider):
        def chat(self, messages, tools):
            return LLMResponse(text="", tool_calls=[], provider="mudo")

    resultado = ChatService(ProviderMudo()).run("hola", chat_id="chat-vacio")

    assert resultado.reply == "No he podido preparar una respuesta para esa consulta."
    assert resultado.client_action is None
    assert resultado.used_fallback is True
