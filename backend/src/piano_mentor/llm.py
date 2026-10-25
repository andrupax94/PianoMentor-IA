# description: Proveedores de LLM para el chat del agente (B-012.8).
# context: Interfaz intercambiable (OpenAI-compatible) y MockProvider determinista.
# Los proveedores reales (Groq, Gemini) se configuran por base_url y clave; nunca
# controlan MIDI ni el reloj de reproducción: solo proponen funciones del registro.
# El Mock no es un espejo de juguete: encadena buscar -> decidir con el resultado
# (misma forma de dos pasos que un modelo real) para que la demo funcione sin red.

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Any


class LLMResponse:
    """Resultado de un turno: texto final y, opcionalmente, funciones a invocar.

    Los modelos reales (Groq/Gemini) pueden proponer VARIAS funciones en paralelo
    en una misma respuesta, así que se transporta la lista completa en
    `tool_calls`. `tool_call` se mantiene como alias del primero para no romper
    el contrato de una-función-por-turno de las pruebas y del MockProvider.
    """

    def __init__(
        self,
        text: str | None = None,
        tool_call: dict[str, object] | None = None,
        provider: str = "mock",
        used_fallback: bool = False,
        tool_calls: list[dict[str, object]] | None = None,
    ) -> None:
        self.text = text
        # Si llega una lista, `tool_call` apunta a la primera para compatibilidad.
        if tool_calls:
            self.tool_calls = list(tool_calls)
            self.tool_call = self.tool_calls[0]
        else:
            self.tool_calls = [tool_call] if tool_call else []
            self.tool_call = tool_call
        self.provider = provider
        self.used_fallback = used_fallback


class ActionProposal:
    """Propuesta de acción pedagógica del LLM (B-012.6).

    El LLM propone; el sistema valida contra la whitelist y los límites
    antes de ejecutar. Si la propuesta no pasa la validación, se usa
    el fallback determinista (`AgentService.decide`).
    """

    def __init__(
        self,
        action: str,
        params: dict[str, Any] | None = None,
        reason: str = "",
        provider: str = "mock",
        used_fallback: bool = False,
    ) -> None:
        self.action = action
        self.params = params or {}
        self.reason = reason
        self.provider = provider
        self.used_fallback = used_fallback


class LLMProvider(ABC):
    """Contrato de proveedor: dada una conversación y las herramientas, propone."""

    @abstractmethod
    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        """Devuelve texto y, opcionalmente, una llamada a función del registro."""

    def propose_action(self, state: dict[str, Any]) -> ActionProposal | None:
        """Propone una acción pedagógica dado el estado de la sesión (B-012.6).

        Devuelve `None` si el proveedor no implementa esto o si la propuesta
        no es válida; el caller usa las reglas deterministas como fallback.
        """
        return None


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

    Actúa como un modelo real de dos pasos: propone una función, recibe su
    resultado y cierra la orden —«buscar» seguido de «reproducir» o «abrir
    práctica»— o explica honestamente que no ha encontrado nada. Reconoce
    patrones en español: «pausa», «reproduce/pon X», «abre práctica», «lista las
    piezas», «qué puedes hacer». Siempre responde sin red ni clave.

    Antes de buscar quita verbos y palabras de relleno, así «pon el minueto de
    Bach» viaja como «minueto bach»: el mismo formato del contrato del endpoint
    y el que espera `buscar_pieza`.
    """

    # Verbos de orden: dicen qué quiere el usuario, no qué buscar.
    VERBOS = frozenset({
        "pon", "pone", "ponme", "ponle", "reproduce", "toca",
        "tocar", "suena", "sonar", "escucha", "dime", "busca", "buscar",
        "quiero", "dame", "hazme", "abre", "abrir",
    })

    # Palabras sin contenido que solo ensucian una búsqueda.
    RELLENO = frozenset({
        "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del",
        "al", "a", "en", "y", "o", "u", "por", "para", "con", "sin", "sobre",
        "que", "se", "mi", "tu", "su", "sus", "es", "lo", "le", "les", "nos",
        "favor", "porfa", "pieza", "piezas", "vez", "ahora", "después", "luego",
    })

    # En «abre práctica del minueto» la práctica es parte de la orden, no del título.
    RELLENO_PRACTICA = frozenset({"practica", "práctica", "sesion", "sesión"})

    def __init__(self) -> None:
        self.provider = "mock"

    # -- Utilidades de lectura -------------------------------------------------

    @staticmethod
    def _palabra(texto: str, palabra: str) -> bool:
        """¿Aparece `palabra` como palabra suelta? Evita que «tocar» suene a «toca»."""
        return re.search(rf"\b{re.escape(palabra)}\b", texto) is not None

    @classmethod
    def _claves_de(cls, texto: str, extra: frozenset[str] = frozenset()) -> str:
        """Palabras con las que buscar: sin verbos, sin relleno y de 3 letras o más."""
        palabras = re.findall(r"\w+", texto.lower())
        return " ".join(
            p
            for p in palabras
            if len(p) >= 3
            and p not in cls.VERBOS
            and p not in cls.RELLENO
            and p not in extra
        )

    @classmethod
    def _intencion(cls, texto: str) -> str:
        """«practica», «reproducir» o «» según lo que pidió el usuario."""
        if (cls._palabra(texto, "abre") or cls._palabra(texto, "abrir")) and (
            "practica" in texto or "práctica" in texto
        ):
            return "practica"
        if any(
            cls._palabra(texto, palabra)
            for palabra in (
                "pon", "pone", "ponme", "reproduce", "reproduce",
                "toca", "suena", "escucha",
            )
        ):
            return "reproducir"
        return ""

    @staticmethod
    def _json_de(contenido: str) -> dict[str, Any]:
        """El resultado llega como string JSON; un error de herramienta no lo es."""
        try:
            datos = json.loads(contenido)
        except (json.JSONDecodeError, TypeError):
            return {}
        return datos if isinstance(datos, dict) else {}

    # -- Respuesta -------------------------------------------------------------

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        user_text = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                user_text = str(message.get("content", ""))
                break
        texto = user_text.lower().strip()

        # Segundo paso del bucle: hay un resultado de función esperando decisión.
        if messages and messages[-1].get("role") == "tool":
            return self._sobre_resultado(messages[-1], texto)

        if "qué puedes hacer" in texto or "qué sabes hacer" in texto:
            return LLMResponse(
                text=(
                    "Puedo buscar piezas del catálogo, reproducirlas en el piano, "
                    "pausar, reanudar, parar y abrir una sesión de práctica. "
                    "Dime qué necesitas."
                ),
                provider="mock",
            )

        if self._palabra(texto, "pausa") or self._palabra(texto, "pausar"):
            return LLMResponse(
                text="Pausando la reproducción.",
                tool_call={"name": "pausar", "arguments": {}},
                provider="mock",
            )

        if self._palabra(texto, "reanuda") or self._palabra(texto, "reanudar") or self._palabra(texto, "sigue"):
            return LLMResponse(
                text="Reanudando la reproducción.",
                tool_call={"name": "reanudar", "arguments": {}},
                provider="mock",
            )

        # La práctica y la reproducción se miran antes que «para»: en
        # «abre práctica para el minueto» prima la apertura, no la detención.
        intencion = self._intencion(texto)

        if intencion == "practica":
            claves = self._claves_de(texto, self.RELLENO_PRACTICA)
            if not claves:
                return LLMResponse(
                    text=(
                        "¿Sobre qué pieza? Di el título, por ejemplo «abre práctica "
                        "del minueto de Bach»."
                    ),
                    provider="mock",
                )
            return LLMResponse(
                text=f"Buscando «{claves}» para abrir la práctica.",
                tool_call={"name": "buscar_pieza", "arguments": {"texto": claves}},
                provider="mock",
            )

        if intencion == "reproducir":
            claves = self._claves_de(texto)
            if not claves:
                return LLMResponse(
                    text=(
                        "¿Qué pieza? Di el título o el compositor, por ejemplo "
                        "«reproduce el minueto de Bach»."
                    ),
                    provider="mock",
                )
            return LLMResponse(
                text=f"Buscando «{claves}» en el catálogo.",
                tool_call={"name": "buscar_pieza", "arguments": {"texto": claves}},
                provider="mock",
            )

        if any(
            self._palabra(texto, palabra)
            for palabra in ("para", "parar", "detén", "deten", "detente", "detener")
        ):
            return LLMResponse(
                text="Deteniendo la reproducción.",
                tool_call={"name": "parar", "arguments": {}},
                provider="mock",
            )

        if (
            any(self._palabra(texto, palabra) for palabra in ("lista", "listar"))
            or "catálogo" in texto
            or "catalogo" in texto
        ):
            return LLMResponse(
                text="",
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

    def _sobre_resultado(self, mensaje: dict[str, str], texto: str) -> LLMResponse:
        """Segundo paso: decidir con el resultado de la función que se pidió.

        Un modelo real lee el resultado antes de actuar; aquí se hace lo mismo de
        forma determinista, para que la demo encadene buscar → reproducir sin red
        y para que una búsqueda sin coincidencias termine en una negación honesta
        en vez de una acción inventada.
        """
        nombre = str(mensaje.get("name") or "")
        contenido = str(mensaje.get("content") or "")
        datos = self._json_de(contenido)

        if nombre == "listar_piezas":
            return LLMResponse(text=self._resumen_catalogo(datos), provider="mock")

        if nombre == "buscar_pieza":
            candidatos = [c for c in (datos.get("piezas") or []) if isinstance(c, dict)]
            if not candidatos:
                claves = self._claves_de(texto, self.RELLENO_PRACTICA) or texto
                return LLMResponse(
                    text=(
                        f"No he encontrado ninguna pieza con «{claves}». Prueba con otra "
                        "palabra (título o compositor) o di «lista las piezas» para ver "
                        "el catálogo."
                    ),
                    provider="mock",
                )
            pieza = candidatos[0]
            piece_id = str(pieza.get("id") or "")
            titulo = str(pieza.get("title") or piece_id)
            intencion = self._intencion(texto)
            if intencion == "practica":
                return LLMResponse(
                    text=f"Abro la práctica de «{titulo}».",
                    tool_call={"name": "abrir_practica", "arguments": {"piece_id": piece_id}},
                    provider="mock",
                )
            if intencion == "reproducir":
                return LLMResponse(
                    text=f"Reproduciendo «{titulo}».",
                    tool_call={
                        "name": "reproducir_pieza",
                        "arguments": {"piece_id": piece_id, "auto_play": True},
                    },
                    provider="mock",
                )
            # La búsqueda no la pidió este proveedor (por ejemplo Groq) y el
            # usuario no pidió reproducir: se informa sin mandar nada al navegador.
            return LLMResponse(text=self._resumen_candidatos(candidatos), provider="mock")

        # Otra función de servidor (info_pieza, estado_sesion…): se redacta el
        # resultado tal cual, sin repetir la llamada ni inventar nada.
        return LLMResponse(
            text=f"Resultado de «{nombre}»: {contenido[:300]}",
            provider="mock",
        )

    @staticmethod
    def _resumen_catalogo(datos: dict[str, Any]) -> str:
        piezas = [p for p in (datos.get("piezas") or []) if isinstance(p, dict)]
        if not piezas:
            return "El catálogo está vacío."
        etiqueta = "pieza" if len(piezas) == 1 else "piezas"
        nombradas = ", ".join(f"«{p.get('title')}»" for p in piezas[:5])
        resto = f" y otras {len(piezas) - 5} más" if len(piezas) > 5 else ""
        return (
            f"{len(piezas)} {etiqueta} en el catálogo: {nombradas}{resto}. "
            "Di «reproduce <título>» para escuchar alguna."
        )

    @staticmethod
    def _resumen_candidatos(candidatos: list[dict[str, Any]]) -> str:
        plural = "coincidencia" if len(candidatos) == 1 else "coincidencias"
        nombradas = ", ".join(f"«{c.get('title')}»" for c in candidatos[:3])
        resto = f" y otras {len(candidatos) - 3}" if len(candidatos) > 3 else ""
        return (
            f"He encontrado {len(candidatos)} {plural}: {nombradas}{resto}. "
            "Di «reproduce <título>» si quieres escuchar alguna."
        )

    def propose_action(self, state: dict[str, Any]) -> ActionProposal:
        """Propone una acción pedagógica determinista (B-012.6).

        Usa las mismas reglas simples que `AgentService.decide()`: el Mock
        no es un espejo de juguete, es el fallback que garantiza que la
        demo funciona sin red ni clave.
        """
        evaluation = state.get("evaluation") or {}
        control = state.get("control", "student")
        seconds_silent = float(state.get("seconds_since_last_note", 0.0) or 0.0)

        if control == "agent":
            return ActionProposal("wait", reason="mock_agent_control", provider="mock")

        if seconds_silent > 10.0:
            return ActionProposal("wait", reason="mock_student_silent", provider="mock")

        accuracy = float(evaluation.get("accuracy_pct", 100.0) or 0.0)
        counts = evaluation.get("counts") or {}
        wrong_pitch = int(counts.get("wrong_pitch", 0) or 0)
        timing_ms = float(evaluation.get("timing_ms", 0.0) or 0.0)

        if accuracy < 60.0:
            return ActionProposal(
                "demonstrate",
                params={"tempo_factor": 0.8},
                reason="mock_low_precision",
                provider="mock",
            )
        if wrong_pitch >= 3:
            return ActionProposal(
                "give_hint",
                params={"hint_type": "measure_focus"},
                reason="mock_repeated_errors",
                provider="mock",
            )
        if timing_ms > 200.0:
            return ActionProposal(
                "slow_down",
                params={"tempo_factor": 0.7},
                reason="mock_timing_off",
                provider="mock",
            )
        return ActionProposal("wait", reason="mock_all_good", provider="mock")


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
            "max_tokens": 400,
        }
        # Sin herramientas (última llamada para forzar texto) se omiten las claves
        # `tools`/`tool_choice`: algunos proveedores rechazan un `tools: []`.
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
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
        tool_calls: list[dict[str, object]] = []
        for call in choice.get("tool_calls") or []:
            if call.get("type") != "function":
                continue
            function = call["function"]
            # El `id` es obligatorio al reenviar el tool_call al proveedor
            # (dialecto OpenAI): sin él Groq/Gemini devuelven 400.
            tool_calls.append({
                "id": call.get("id"),
                "name": function["name"],
                "arguments": _parse_arguments(function.get("arguments")),
            })

        return LLMResponse(
            text=text,
            tool_calls=tool_calls,
            provider=self.provider_name,
        )

    def propose_action(self, state: dict[str, Any]) -> ActionProposal | None:
        """Pide al LLM una acción pedagógica en JSON estructurado (B-012.6).

        El prompt incluye el estado de la sesión y pide JSON con
        `action`, `params` y `reason`. Si la respuesta no es JSON válido
        o la acción no está en la whitelist, devuelve `None` y el caller
        usa el fallback determinista.
        """
        import httpx

        from .agent import ALLOWED_ACTIONS  # import local para evitar ciclo

        prompt = (
            "Eres un profesor de piano. Dado el estado de la sesión, propón UNA acción pedagógica.\n"
            f"Acciones permitidas: {', '.join(sorted(ALLOWED_ACTIONS))}.\n"
            "Devuelve SOLO JSON, sin texto adicional:\n"
            '{"action": "...", "params": {...}, "reason": "..."}\n\n'
            f"Estado de la sesión:\n{json.dumps(state, ensure_ascii=False, default=str)}"
        )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
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
        content = data["choices"][0]["message"].get("content") or ""

        # Parse JSON: el modelo puede envolverlo en ```json ... ```
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return None
        try:
            parsed = json.loads(match.group())
        except json.JSONDecodeError:
            return None

        action = str(parsed.get("action") or "")
        if action not in ALLOWED_ACTIONS:
            return None

        return ActionProposal(
            action=action,
            params=parsed.get("params") or {},
            reason=str(parsed.get("reason") or ""),
            provider=self.provider_name,
        )


class FallbackProvider(LLMProvider):
    """Encadena proveedores hasta que uno responde; el último es siempre MockProvider.

    Cuenta como fallo tanto una excepción (timeout, 401, red caída) como una
    respuesta en balde: los modelos reales dejan de contestar de vez en cuando
    con un turno sin texto ni funciones, y eso llegaría a la interfaz como una
    burbuja en blanco. Ante cualquiera de los dos casos sigue el siguiente de la
    cadena, y solo entonces se marca `used_fallback`.
    """

    def __init__(self, providers: list[LLMProvider]) -> None:
        self.providers = providers

    @staticmethod
    def _es_vacia(respuesta: LLMResponse) -> bool:
        """Un turno sin texto ni funciones no es una respuesta, es un fallo."""
        return not (respuesta.text or "").strip() and not respuesta.tool_calls

    def chat(self, messages: list[dict[str, str]], tools: list[dict[str, Any]]) -> LLMResponse:
        motivo: str | None = None
        for provider in self.providers:
            try:
                respuesta = provider.chat(messages, tools)
            except Exception as exc:  # pylint: disable=broad-except  # noqa: BLE001
                motivo = str(exc)
                continue
            if self._es_vacia(respuesta):
                motivo = "respuesta vacía (sin texto ni funciones)"
                continue
            if motivo:
                respuesta.used_fallback = True
            return respuesta
        # Salida del bucle: no debería ocurrir porque el Mock siempre contesta,
        # pero el contrato es que un turno nunca se quede sin respuesta.
        respuesta = self.providers[-1].chat(messages, tools)
        respuesta.used_fallback = True
        return respuesta

    def propose_action(self, state: dict[str, Any]) -> ActionProposal | None:
        """Prueba cada proveedor hasta que uno propone una acción válida (B-012.6)."""
        for provider in self.providers:
            try:
                proposal = provider.propose_action(state)
            except Exception:  # noqa: BLE001, S112
                # Un proveedor caído no debe romper la cadena: se salta al siguiente.
                continue
            if proposal is not None:
                if provider is not self.providers[0]:
                    proposal.used_fallback = True
                return proposal
        return None
