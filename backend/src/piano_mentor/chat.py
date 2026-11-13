# description: Orquestación de un turno del chat del agente (B-012.8). Desde B-036.3, si la cadena LLM se saturó (FallbackProvider.saturado) el caller puede pasar `aplazar` para encolar el trabajo: el turno responde igual con el fallback y la respuesta lleva `deferred`.
# context: Historial + contexto -> proveedor -> validación contra lista blanca ->
# ejecución de funciones de servidor o devolución de la intención al navegador ->
# redacción final. El LLM nunca toca MIDI ni el reloj de reproducción.

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Callable

from .config import settings
from .database import get_chat_history, save_chat_message
from .llm import FallbackProvider, LLMProvider, LLMResponse, MockProvider, OpenAICompatibleProvider
from .tools import REGISTRY, ToolError, execute_tool, list_tools, tool_names

logger = logging.getLogger("piano_mentor.chat")


def _assistant_tool_call_message(
    tool_call_id: str, nombre: str, argumentos: dict[str, object]
) -> dict[str, Any]:
    """Mensaje assistant que porta un tool_call, en dialecto OpenAI.

    El `id` es obligatorio: el mensaje tool de la respuesta debe referenciarlo
    con `tool_call_id`, y sin ese id Groq y Gemini rechazan la petición con 400.
    Los argumentos viajan como string JSON, no como objeto.
    """
    return {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": nombre,
                    "arguments": json.dumps(argumentos, ensure_ascii=False, default=str),
                },
            }
        ],
    }


def _tool_result_message(
    tool_call_id: str, nombre: str, contenido: str
) -> dict[str, Any]:
    """Mensaje `role: tool` con el resultado de una función, en dialecto OpenAI.

    Debe llevar `tool_call_id` (y no `name`) para emparejarse con el tool_call
    del mensaje assistant anterior.
    """
    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "name": nombre,
        "content": contenido,
    }


def _tool_call_id(respuesta: LLMResponse, fallback: str) -> str:
    """Id del tool_call para emparejar assistant <-> tool.

    Los proveedores reales devuelven su `id` en `LLMResponse.tool_call`; se usa
    si existe. MockProvider y los proveedores de test no lo traen, así que se
    recurre a un id sintético estable para que el formato siga siendo válido.
    """
    devuelto = (respuesta.tool_call or {}).get("id")
    return str(devuelto) if devuelto else fallback


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
        deferred: bool = False,
    ) -> None:
        self.chat_id = chat_id
        self.reply = reply
        self.provider = provider
        self.used_fallback = used_fallback
        self.client_action = client_action
        self.used_tools = used_tools
        # B-036.3: True si la cadena LLM se saturó y el trabajo quedó en la
        # cola de aplazados (el fallback determinista respondió igualmente).
        self.deferred = deferred


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
        user_name: str | None = None,
        ephemeral: bool = False,
        max_tokens: int | None = None,
        aplazar: Callable[[str, list[dict[str, str]], int | None], None] | None = None,
    ) -> ChatTurnResult:
        if not message or not message.strip():
            raise ValueError("message no puede estar vacío")
        chat_id = chat_id or str(uuid.uuid4())

        # B-033.4 revisión: presupuesto de la respuesta acotado al techo (el
        # peticionario pide, el sistema fija los límites), None = el default
        # del proveedor. Solo se pasa si llegó: así los proveedores de test
        # con firma corta siguen valiendo.
        if max_tokens is not None:
            max_tokens = max(1, min(int(max_tokens), settings.llm_max_tokens_techo))

        # Si es un chat nuevo y conocemos el nombre, dejamos el saludo de bienvenida.
        # Un turno efímero (B-033.4) no deja huella: ni saludo ni mensajes en la
        # memoria de la conversación (la interpretación no es conversación).
        is_new_chat = not get_chat_history(chat_id, limit=1)
        if not ephemeral:
            if is_new_chat and user_name:
                welcome = (
                    f"¡Hola {user_name}! Soy tu profesor de piano de PianoMentor AI. "
                    "Pregúntame lo que quieras sobre práctica, piezas o teoría musical."
                )
                save_chat_message(chat_id, "assistant", welcome)

        # 2. Construir historial (ventana rodante) + system prompt + usuario actual.
        history = get_chat_history(chat_id, limit=settings.chat_memory_window)
        messages = self._build_messages(history, message.strip(), context or {}, user_name)

        # 1. Guardar el mensaje del usuario (después de leer el historial para no duplicarlo).
        # Un turno efímero no lo graba: la interpretación nunca entra al historial.
        if not ephemeral:
            save_chat_message(chat_id, "user", message.strip())

        # 3. Bucle agente <-> herramientas (tope de pasos).
        client_action: dict[str, object] | None = None
        used_tools: list[dict[str, object]] = []
        final_text: str | None = None
        respuesta: LLMResponse | None = None

        for _step in range(self.MAX_STEPS):
            if max_tokens is not None:
                respuesta = self.provider.chat(messages, list_tools(), max_tokens=max_tokens)
            else:
                respuesta = self.provider.chat(messages, list_tools())

            if not respuesta.tool_calls:
                final_text = respuesta.text or ""
                break

            # Los modelos reales pueden proponer VARIAS funciones en paralelo en
            # una misma respuesta. Ejecutamos todas y devolvemos un tool result
            # por cada una: si descartáramos las demás el modelo las repetiría en
            # el siguiente paso y agotaría el tope de pasos.
            llamadas = respuesta.tool_calls
            mensajes_asistente: list[dict[str, Any]] = []
            mensajes_resultado: list[dict[str, Any]] = []
            hay_cliente = False

            for index, call in enumerate(llamadas):
                nombre = str(call.get("name") or "")
                argumentos = call.get("arguments") or {}

                if nombre not in tool_names():
                    # Función fuera de la lista blanca: no se ejecuta, se informa.
                    final_text = (
                        "Eso todavía no sé hacerlo. Puedo usar solo: "
                        + ", ".join(f"`{n}`" for n in tool_names())
                        + "."
                    )
                    used_tools.append({"name": nombre, "arguments": argumentos, "rejected": True})
                    hay_cliente = False
                    llamadas = []
                    break

                used_tools.append({"name": nombre, "arguments": argumentos})

                # Id para emparejar el tool_call con su resultado (dialecto OpenAI).
                tool_call_id = str(call.get("id") or f"call_{nombre}_{index}")

                # Las funciones del navegador no se ejecutan en el backend: se
                # devuelven al front para que él las aplique.
                if REGISTRY.get(nombre).side == "client":
                    if client_action is None:
                        client_action = {"name": nombre, "arguments": argumentos}
                    # Si el proveedor trae su propia redacción se usa (así dice
                    # el contrato: la respuesta es natural); solo si viene vacía
                    # se recurre a la frase determinista de respaldo.
                    final_text = respuesta.text or self._redactar_accion(
                        nombre, argumentos, {}
                    )
                    hay_cliente = True
                    continue

                mensajes_asistente.append(
                    _assistant_tool_call_message(tool_call_id, nombre, argumentos)
                )
                try:
                    resultado = execute_tool(nombre, argumentos)
                except ToolError as exc:
                    # Error de herramienta: se devuelve al modelo como resultado,
                    # él redacta la explicación final. El turno no se rompe.
                    mensajes_resultado.append(_tool_result_message(tool_call_id, nombre, str(exc)))
                    continue

                # Funciones del servidor: se ejecutan y se devuelven al modelo.
                mensajes_resultado.append(
                    _tool_result_message(tool_call_id, nombre, self._json_result(resultado))
                )

            if final_text is not None and not llamadas:
                break

            # Se añaden todos los tool results de la ronda de una vez, para que
            # el modelo vea el resultado de cada función que pidió.
            messages.extend(mensajes_asistente)
            messages.extend(mensajes_resultado)

            # Si ya hay una acción de navegador no hace falta seguir iterando:
            # el objetivo del turno es ejecutarla en el cliente.
            if hay_cliente:
                break

        if not (final_text or "").strip():
            # El turno no ha llegado a texto usable: ni el del modelo (que a
            # veces devuelve un string vacío) ni el de las funciones. Una última
            # llamada sin herramientas le obliga a redactar con lo que tiene, en
            # vez de mostrarle un mensaje técnico de "tope de pasos".
            try:
                if max_tokens is not None:
                    respuesta = self.provider.chat(messages, [], max_tokens=max_tokens)
                else:
                    respuesta = self.provider.chat(messages, [])
            except Exception:  # pylint: disable=broad-except  # noqa: BLE001
                respuesta = None
            if respuesta is not None and respuesta.text:
                final_text = respuesta.text

        if not (final_text or "").strip():
            # Ni el reintento ha servido: un turno en silencio no es una
            # respuesta, así que se explica honestamente (nunca burbuja vacía).
            final_text = "No he podido preparar una respuesta para esa consulta."
            if respuesta is not None:
                respuesta.used_fallback = True

        # 4. Guardar la respuesta del asistente (salvo en el turno efímero).
        if not ephemeral:
            save_chat_message(chat_id, "assistant", final_text)

        # 5. Aplazamiento (B-036.3): si la cadena se saturó (todos los reales
        # cayeron con 429/5xx/timeout), el turno queda «a por hacer» en la
        # cola — la respuesta del fallback ya está guardada arriba, nunca
        # burbuja vacía — y el front lo sabe con `deferred`. Solo turnos de
        # conversación: la interpretación efímera tiene sus bloques y su
        # botón de regenerar. El caller decide cómo persistir (api.py guarda
        # la fila con el correo del usuario si lo hay).
        deferred = False
        if (
            aplazar is not None
            and not ephemeral
            and getattr(self.provider, "saturado", False)
        ):
            try:
                aplazar(chat_id, messages, max_tokens)
                deferred = True
            except Exception:  # pylint: disable=broad-except  # noqa: BLE001
                # La cola no puede romper el turno: el fallback ya respondió.
                logger.exception("[chat] el aplazamiento del turno falló; se responde igual")

        return ChatTurnResult(
            chat_id=chat_id,
            reply=final_text,
            provider=getattr(respuesta, "provider", "mock") if respuesta else "mock",
            used_fallback=getattr(respuesta, "used_fallback", False)
            if respuesta
            else False,
            client_action=client_action,
            used_tools=used_tools,
            deferred=deferred,
        )

    def _build_messages(
        self,
        history: list[Any],
        user_message: str,
        context: dict[str, object],
        user_name: str | None = None,
    ) -> list[dict[str, str]]:
        """Construye la lista de mensajes que se envía al proveedor."""
        nombre_line = f" El usuario se llama {user_name}." if user_name else ""
        system_prompt = (
            "Eres el profesor de piano de PianoMentor AI. Respondes en español, de forma "
            "breve y directa. Escribes en TEXTO PLANO, sin markdown: nada de **asteriscos** "
            "de negrita, ni títulos con #, ni listas con - ni bloques de código; para "
            "estructurarte usa saltos de línea y frases cortas de conversación. El tono es "
            "el de las IA de chat actuales: cercano, de persona, y cuando ayude puedes echar "
            "algún icono (emoji) — siempre con moderación. "
            "Solo puedes invocar funciones de la lista blanca; si el "
            "usuario pide algo que no cubre ninguna función, diles que no puedes y recuérdale "
            "qué sí puedes hacer. Nunca toques MIDI ni el reloj de reproducción tú mismo: "
            "solo propones acciones y el sistema las ejecuta. "
            "Además, puedes responder preguntas teóricas de música y piano (qué es un compás, "
            "qué es un acorde, qué es el tempo, qué es una nota, qué es el ritmo, etc.) con "
            "explicaciones sencillas y pedagógicas, sin necesidad de invocar funciones. "
            "Si la pregunta no tiene relación con música, piano, práctica o las piezas del "
            "catálogo, no la respondas: di que solo puedes ayudar con temas musicales y de "
            "práctica, y ofrece responder una pregunta de ese tipo."
            + nombre_line
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
        return json.dumps(resultado, ensure_ascii=False, default=str)


def get_default_provider() -> LLMProvider:
    """Proveedor por defecto: MockProvider (hermético, sin clave ni red).

    Se usa en tests y desarrollo local. Para el endpoint real se usa
    `get_fallback_provider()`, que encadena Groq → Gemini → Mock.
    """
    return MockProvider()


def _groq_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url="https://api.groq.com/openai/v1",
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        provider_name="groq",
        timeout_s=settings.llm_timeout_s,
    )


def _gemini_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
        provider_name="gemini",
        timeout_s=settings.llm_timeout_s,
    )


def get_fallback_provider() -> LLMProvider:
    """Selecciona el proveedor según `settings.llm_provider`, con Mock al final.

    El gating es explícito porque debe ser hermético en desarrollo y CI aunque el
    `.env` tenga claves:

    - `mock`: solo MockProvider. Sin red ni clave, pase lo que pase.
    - `groq`: Groq → Gemini → Mock. Gemini entra solo si tiene clave y actúa de
      respaldo cuando Groq falla o devuelve el turno vacío; si no, se cae al
      Mock.
    - `gemini`: Gemini → Groq → Mock, con los mismos papeles cambiados.
    - cadena completa Groq → Gemini → Mock solo si `llm_provider` trae otro
      valor explícito (por ejemplo `fallback`). Un valor vacío o desconocido
      cae en `mock`, que es el más seguro: nunca gasta claves ni red por error.

    Un proveedor real solo entra si hay clave; sin clave se salta y se cae al
    siguiente, y el último es siempre MockProvider: el turno nunca se rompe.
    """
    modo = (settings.llm_provider or "mock").strip().lower()

    if modo == "mock":
        return MockProvider()

    if modo == "groq":
        cadena: list[LLMProvider] = [_groq_provider()] if settings.groq_api_key else []
        if settings.gemini_api_key:
            cadena.append(_gemini_provider())
    elif modo == "gemini":
        cadena = [_gemini_provider()] if settings.gemini_api_key else []
        if settings.groq_api_key:
            cadena.append(_groq_provider())
    else:
        cadena = []
        if settings.groq_api_key:
            cadena.append(_groq_provider())
        if settings.gemini_api_key:
            cadena.append(_gemini_provider())

    cadena.append(MockProvider())
    if len(cadena) == 1:
        # Solo quedó el Mock: no hay ninguna clave real configurada.
        return cadena[0]
    return FallbackProvider(cadena)
