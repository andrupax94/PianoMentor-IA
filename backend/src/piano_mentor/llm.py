# description: Proveedores de LLM para el chat del agente (B-012.8).
# context: Interfaz intercambiable (OpenAI-compatible) y MockProvider determinista.
# Los proveedores reales (Groq, Gemini) se configuran por base_url y clave; nunca
# controlan MIDI ni el reloj de reproducción: solo proponen funciones del registro.

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any


class LLMResponse:
    """Resultado de un turno: texto final y, opcionalmente, la función a invocar."""

    def __init__(
        self,
        text: str | None = None,
        tool_call: dict[str, object] | None = None,
        provider: str = "mock",
        used_fallback: bool = False,
    ) -> None:
        self.text = text
        self.tool_call = tool_call
        self.provider = provider
        self.used_fallback = used_fallback


class LLMProvider(ABC):
    """Contrato de proveedor: dada una conversación y las herramientas, propone."""

    @abstractmethod
    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        """Devuelve texto y, opcionalmente, una llamada a función del registro."""


def _parse_arguments(raw: Any) -> dict[str, Any]:
    """Normaliza los argumentos de un tool_call a dict, tolerando JSON roto.

    El proveedor los envía como string JSON; una cadena vacía o malformada no
    debe romper el turno, así que se degrada a argumentos vacíos y la
    validación de la función se encarga del resto.
    """
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


class MockProvider(LLMProvider):
    """Proveedor determinista para tests/CI y red de seguridad si fallan todos los reales.

    Reconoce patrones en español: 'pausa', 'reproduce/pon X', 'abre práctica',
    'qué puedes hacer'. Siempre responde sin red ni clave.
    """

    def __init__(self) -> None:
        self.provider = "mock"

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        user_text = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                user_text = str(message.get("content", ""))
                break
        texto = user_text.lower().strip()

        if "qué puedes hacer" in texto or "qué sabes hacer" in texto:
            return LLMResponse(
                text=(
                    "Puedo buscar piezas del catálogo, reproducirlas en el piano, "
                    "pausar, reanudar, parar y abrir una sesión de práctica. "
                    "Dime qué necesitas."
                ),
                provider="mock",
            )

        if "pausa" in texto:
            return LLMResponse(
                text="Pausando la reproducción.",
                tool_call={"name": "pausar", "arguments": {}},
                provider="mock",
            )

        if "reanuda" in texto or "sigue" in texto:
            return LLMResponse(
                text="Reanudando la reproducción.",
                tool_call={"name": "reanudar", "arguments": {}},
                provider="mock",
            )

        if "para" in texto or "detén" in texto:
            return LLMResponse(
                text="Deteniendo la reproducción.",
                tool_call={"name": "parar", "arguments": {}},
                provider="mock",
            )

        if "abre" in texto and ("practica" in texto or "práctica" in texto):
            return LLMResponse(
                text="Abriendo la sesión de práctica.",
                tool_call={"name": "abrir_practica", "arguments": {}},
                provider="mock",
            )

        if any(palabra in texto for palabra in ("pon", "reproduce", "toca", "suena")):
            return LLMResponse(
                text=f"Buscando '{user_text}' en el catálogo para reproducirlo.",
                tool_call={"name": "buscar_pieza", "arguments": {"texto": user_text}},
                provider="mock",
            )

        if any(palabra in texto for palabra in ("lista", "catálogo", "catalogo")):
            return LLMResponse(
                text="Cargando el catálogo de piezas disponibles.",
                tool_call={"name": "listar_piezas", "arguments": {}},
                provider="mock",
            )

        return LLMResponse(
            text=(
                "Eso todavía no sé hacerlo. Puedo buscar piezas, reproducir, pausar, "
                "reanudar, parar y abrir una sesión de práctica."
            ),
            provider="mock",
        )


class OpenAICompatibleProvider(LLMProvider):
    """Proveedor compatible con OpenAI (Groq, Gemini, OpenCode Console).

    Se instancia con base_url, clave y modelo. El `tool_choice` es `"auto"` para
    que el modelo decida si usa una función o responde solo texto.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        provider_name: str,
        timeout_s: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.provider_name = provider_name
        self.timeout_s = timeout_s

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        import httpx

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": 400,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        with httpx.Client(timeout=self.timeout_s) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
        response.raise_for_status()
        data = response.json()
        choice = data["choices"][0]["message"]

        text = choice.get("content")
        tool_call = None
        for call in choice.get("tool_calls") or []:
            if call.get("type") != "function":
                continue
            function = call["function"]
            # El `id` es obligatorio al reenviar el tool_call al proveedor
            # (dialecto OpenAI): sin él Groq/Gemini devuelven 400.
            tool_call = {
                "id": call.get("id"),
                "name": function["name"],
                "arguments": _parse_arguments(function.get("arguments")),
            }
            break

        return LLMResponse(
            text=text,
            tool_call=tool_call,
            provider=self.provider_name,
        )


class FallbackProvider(LLMProvider):
    """Encadena proveedores hasta que uno responde; el último es siempre MockProvider."""

    def __init__(self, providers: list[LLMProvider]) -> None:
        self.providers = providers

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        last_error: str | None = None
        for provider in self.providers[:-1]:
            try:
                return provider.chat(messages, tools)
            except Exception as exc:  # pylint: disable=broad-except  # noqa: BLE001
                last_error = str(exc)
        # El proveedor final es siempre el Mock: nunca se cae la demo.
        respuesta = self.providers[-1].chat(messages, tools)
        if last_error:
            respuesta.used_fallback = True
        return respuesta
