# description: Orquestación de un turno del chat del agente (B-012.8).
# context: Historial + contexto -> proveedor -> validación contra lista blanca ->
# ejecución de funciones de servidor o devolución de la intención al navegador ->
# redacción final. El LLM nunca toca MIDI ni el reloj de reproducción.

from __future__ import annotations

import uuid
from typing import Any

from .config import settings
from .database import get_chat_history, save_chat_message
from .llm import FallbackProvider, LLMProvider, LLMResponse, MockProvider, OpenAICompatibleProvider
from .tools import REGISTRY, ToolError, execute_tool, list_tools, tool_names


class ChatTurnResult:
    """Resultado completo de un turno de chat."""

    def __init__(
        self,
        chat_id: str,
        reply: str,
        provider: str,
        used_fallback: bool,
        client_action: dict[str, object] | None,
        used_tools: list[dict[str, object]],
    ) -> None:
        self.chat_id = chat_id
        self.reply = reply
        self.provider = provider
        self.used_fallback = used_fallback
        self.client_action = client_action
        self.used_tools = used_tools


class ChatService:
    """Un turno de conversación con memoria a corto plazo."""

    MAX_STEPS = 3  # bucle acotado: una función por turno, tope de pasos

    def __init__(self, provider: LLMProvider | None = None) -> None:
        self.provider = provider or MockProvider()

    def run(
        self,
        message: str,
        *,
        chat_id: str | None = None,
        context: dict[str, object] | None = None,
    ) -> ChatTurnResult:
        if not message or not message.strip():
            raise ValueError("message no puede estar vacío")
        chat_id = chat_id or str(uuid.uuid4())

        # 1. Guardar el mensaje del usuario.
        save_chat_message(chat_id, "user", message.strip())

        # 2. Construir historial (ventana rodante) + system prompt + usuario actual.
        history = get_chat_history(chat_id, limit=settings.chat_memory_window)
        messages = self._build_messages(history, message.strip(), context or {})

        # 3. Bucle agente <-> herramientas (tope de pasos).
        client_action: dict[str, object] | None = None
        used_tools: list[dict[str, object]] = []
        final_text: str | None = None
        respuesta: LLMResponse | None = None

        for _step in range(self.MAX_STEPS):
            respuesta = self.provider.chat(messages, list_tools())
            if respuesta.tool_call is None:
                final_text = respuesta.text or ""
                break

            nombre = str(respuesta.tool_call["name"])
            argumentos = respuesta.tool_call.get("arguments") or {}

            if nombre not in tool_names():
                # Función fuera de la lista blanca: no se ejecuta, se informa.
                final_text = (
                    "Eso todavía no sé hacerlo. Puedo usar solo: "
                    + ", ".join(f"`{n}`" for n in tool_names())
                    + "."
                )
                used_tools.append({"name": nombre, "arguments": argumentos, "rejected": True})
                break

            tool = {"name": nombre, "arguments": argumentos}
            used_tools.append(tool)

            # Las funciones del navegador no se ejecutan en el backend: se
            # devuelven al front para que él las aplique.
            if REGISTRY.get(nombre).side == "client":
                client_action = {"name": nombre, "arguments": argumentos}
                final_text = self._redactar_accion(nombre, argumentos, {})
                break

            try:
                resultado = execute_tool(nombre, argumentos)
            except ToolError as exc:
                # Error de herramienta: se devuelve al modelo como resultado,
                # él redacta la explicación final. El turno no se rompe.
                messages.append(
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [{"name": nombre, "arguments": argumentos}],
                    }
                )
                messages.append({"role": "tool", "name": nombre, "content": str(exc)})
                continue

            # Funciones del servidor: se ejecutan y se devuelven al modelo.
            messages.append(
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [{"name": nombre, "arguments": argumentos}],
                }
            )
            messages.append(
                {"role": "tool", "name": nombre, "content": self._json_result(resultado)}
            )

        if final_text is None:
            final_text = (
                "He llegado al límite de pasos. Dime qué necesitas y lo intento de nuevo."
            )
            if respuesta is not None:
                respuesta.used_fallback = True

        # 4. Guardar la respuesta del asistente.
        save_chat_message(chat_id, "assistant", final_text)

        return ChatTurnResult(
            chat_id=chat_id,
            reply=final_text,
            provider=getattr(respuesta, "provider", "mock") if respuesta else "mock",
            used_fallback=getattr(respuesta, "used_fallback", False)
            if respuesta
            else False,
            client_action=client_action,
            used_tools=used_tools,
        )

    def _build_messages(
        self,
        history: list[Any],
        user_message: str,
        context: dict[str, object],
    ) -> list[dict[str, str]]:
        """Construye la lista de mensajes que se envía al proveedor."""
        system_prompt = (
            "Eres el profesor de piano de PianoMentor AI. Respondes en español, de forma "
            "breve y directa. Solo puedes invocar funciones de la lista blanca; si el "
            "usuario pide algo que no cubre ninguna función, diles que no puedes y recuérdale "
            "qué sí puedes hacer. Nunca toques MIDI ni el reloj de reproducción tú mismo: "
            "solo propones acciones y el sistema las ejecuta."
        )
        context_line = ""
        if context:
            partes = [f"{clave}={valor}" for clave, valor in context.items() if valor is not None]
            if partes:
                context_line = "Contexto: " + ", ".join(partes) + ".\n"

        mensajes: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        if context_line:
            mensajes.append({"role": "system", "content": context_line})
        for row in history:
            if isinstance(row, dict):
                role, content = row["role"], row["content"]
            else:
                role, content = row["role"], row["content"]
            mensajes.append({"role": role, "content": content})
        mensajes.append({"role": "user", "content": user_message})
        return mensajes

    @staticmethod
    def _redactar_accion(
        nombre: str, argumentos: dict[str, object], resultado: dict[str, object]
    ) -> str:
        if nombre == "reproducir_pieza":
            return f"Cargando '{argumentos.get('piece_id')}' en el piano y reproduciéndolo."
        if nombre == "pausar":
            return "Pausando la reproducción."
        if nombre == "reanudar":
            return "Reanudando la reproducción."
        if nombre == "parar":
            return "Deteniendo la reproducción."
        if nombre == "abrir_practica":
            return f"Abriendo la sesión de práctica para '{argumentos.get('piece_id')}'."
        return f"Acción '{nombre}' lista para ejecutar."

    @staticmethod
    def _json_result(resultado: dict[str, object]) -> str:
        import json

        return json.dumps(resultado, ensure_ascii=False, default=str)


def get_default_provider() -> LLMProvider:
    """Proveedor por defecto: MockProvider (hermético, sin clave ni red).

    Se usa en tests y desarrollo local. Para el endpoint real se usa
    `get_fallback_provider()`, que encadena Groq → Gemini → Mock.
    """
    return MockProvider()


def get_fallback_provider() -> FallbackProvider:
    """Cadena de proveedores reales con MockProvider al final como red de seguridad.

    Orden: Groq (si hay clave), Gemini (si hay clave), MockProvider (siempre).
    Elegir proveedor es solo configuración: misma interfaz OpenAI-compatible.
    """
    from .config import settings

    proveedores: list[LLMProvider] = []
    if settings.groq_api_key:
        proveedores.append(
            OpenAICompatibleProvider(
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.groq_api_key,
                model=settings.groq_model,
                provider_name="groq",
                timeout_s=settings.llm_timeout_s,
            )
        )
    if settings.gemini_api_key:
        proveedores.append(
            OpenAICompatibleProvider(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
                provider_name="gemini",
                timeout_s=settings.llm_timeout_s,
            )
        )
    proveedores.append(MockProvider())
    return FallbackProvider(proveedores)
