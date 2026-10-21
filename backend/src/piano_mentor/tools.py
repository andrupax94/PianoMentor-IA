# description: Registro de funciones del agente (B-012.8).
# context: Lista blanca de órdenes que el modelo puede elegir. Cada función
# declara nombre, descripción (en español, es lo que lee el modelo), parámetros
# (JSON Schema) y si su ejecución es del servidor (lectura de catálogo/estado) o
# del navegador (reproducción, pausa, abrir práctica). Solo el servidor ejecuta.

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from typing import Any

from .database import find_pieces, get_piece, get_session


def _sin_acentos(texto: str) -> str:
    """Minúsculas y sin tildes para comparar «Für» con «fur» y «práctica» con «practica»."""
    base = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in base if unicodedata.category(c) != "Mn")


def _tokeniza(texto: str) -> list[str]:
    """Trocea una frase de búsqueda en palabras («minueto de bach» → 3 tokens)."""
    return [token for token in re.split(r"[^a-z0-9]+", texto) if token]


def _coincide(token: str, palabras: set[str]) -> bool:
    """¿Casa `token` con alguna palabra del título o del compositor?

    Igualdad exacta a cualquier longitud y, además, prefijo cuando el lado corto
    llega a 4 letras: así «minueto» encuentra *Minuet in G major* (mismo pie de
    palabra, otro idioma) sin caer en falsos positivos como «be» por *Beethoven*.
    """
    for palabra in palabras:
        if token == palabra:
            return True
        if min(len(token), len(palabra)) >= 4 and (
            token.startswith(palabra) or palabra.startswith(token)
        ):
            return True
    return False


class ToolError(Exception):
    """Una función registrada no pudo ejecutarse; se informa al modelo y el turno sigue."""


class FunctionTool:
    """Una función del registro: descripción legible para el modelo y handler."""

    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict[str, object],
        *,
        side: str = "server",
        handler: Callable[[dict[str, object]], dict[str, object]] | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.parameters = parameters
        self.side = side
        self.handler = handler

    def to_schema(self) -> dict[str, object]:
        """Esquema que viaja al proveedor LLM (formato compatible con OpenAI)."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def execute(self, arguments: dict[str, object]) -> dict[str, object]:
        if self.handler is None:
            raise ToolError(f"La función '{self.name}' no tiene handler implementado")
        try:
            return self.handler(arguments)
        except ToolError:
            raise
        except Exception as exc:  # pylint: disable=broad-except
            raise ToolError(f"Error ejecutando '{self.name}': {exc}") from exc


class ToolRegistry:
    """Lista blanca cerrada: solo aquí entran las funciones que el modelo puede invocar."""

    def __init__(self) -> None:
        self._tools: dict[str, FunctionTool] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        # --- Funciones del servidor (el backend las ejecuta) ----------------
        self.register(
            FunctionTool(
                name="listar_piezas",
                description="Devuelve el catálogo de piezas disponibles (id, título, compositor).",
                parameters={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                side="server",
                handler=self._listar_piezas,
            )
        )
        self.register(
            FunctionTool(
                name="buscar_pieza",
                description=(
                    "Busca una pieza por palabras sueltas del título o del compositor "
                    "(mejor sin artículos ni verbos) y devuelve los candidatos con más "
                    "coincidencias primero."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "texto": {
                            "type": "string",
                            "description": "Palabras clave a buscar, por ejemplo «minueto bach»",
                        }
                    },
                    "required": ["texto"],
                    "additionalProperties": False,
                },
                side="server",
                handler=self._buscar_pieza,
            )
        )
        self.register(
            FunctionTool(
                name="info_pieza",
                description="Devuelve compases, notas, duración, tempo y dificultad de una pieza.",
                parameters={
                    "type": "object",
                    "properties": {
                        "piece_id": {
                            "type": "string",
                            "description": "Id de la pieza del catálogo",
                        }
                    },
                    "required": ["piece_id"],
                    "additionalProperties": False,
                },
                side="server",
                handler=self._info_pieza,
            )
        )
        self.register(
            FunctionTool(
                name="estado_sesion",
                description="Devuelve el estado vivo de una sesión de práctica.",
                parameters={
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Id de la sesión de práctica",
                        }
                    },
                    "required": ["session_id"],
                    "additionalProperties": False,
                },
                side="server",
                handler=self._estado_sesion,
            )
        )
        # --- Funciones del navegador (el backend solo devuelve la intención) ---
        self.register(
            FunctionTool(
                name="reproducir_pieza",
                description="Manda una pieza al piano y la reproduce en el navegador.",
                parameters={
                    "type": "object",
                    "properties": {
                        "piece_id": {
                            "type": "string",
                            "description": "Id de la pieza a reproducir",
                        },
                        "auto_play": {
                            "type": "boolean",
                            "description": "Si la reproducción arranca sola",
                        },
                    },
                    "required": ["piece_id"],
                    "additionalProperties": False,
                },
                side="client",
            )
        )
        self.register(
            FunctionTool(
                name="pausar",
                description="Pausa la reproducción actual del transporte.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                side="client",
            )
        )
        self.register(
            FunctionTool(
                name="reanudar",
                description="Reanuda la reproducción desde donde se pausó.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                side="client",
            )
        )
        self.register(
            FunctionTool(
                name="parar",
                description="Detiene la reproducción y vuelve al inicio.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                side="client",
            )
        )
        self.register(
            FunctionTool(
                name="abrir_practica",
                description="Crea una sesión de práctica para una pieza y abre su vista.",
                parameters={
                    "type": "object",
                    "properties": {
                        "piece_id": {
                            "type": "string",
                            "description": "Id de la pieza para la sesión de práctica",
                        }
                    },
                    "required": ["piece_id"],
                    "additionalProperties": False,
                },
                side="client",
            )
        )

    def register(self, tool: FunctionTool) -> None:
        self._tools[tool.name] = tool

    def has(self, name: str) -> bool:
        return name in self._tools

    def get(self, name: str) -> FunctionTool:
        if name not in self._tools:
            raise ToolError(f"Función '{name}' no está en la lista blanca")
        return self._tools[name]

    def list_schemas(self) -> list[dict[str, object]]:
        """Esquemas listos para enviar al proveedor LLM."""
        return [tool.to_schema() for tool in self._tools.values()]

    def list_names(self) -> list[str]:
        return sorted(self._tools)

    # -- Handlers del servidor ------------------------------------------------
    def _listar_piezas(self, _arguments: dict[str, object]) -> dict[str, object]:
        rows = find_pieces()
        return {
            "piezas": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "composer": row["composer"],
                }
                for row in rows
            ]
        }

    def _buscar_pieza(self, arguments: dict[str, object]) -> dict[str, object]:
        """Busca por palabras sueltas, no por la frase entera, y ordena por coincidencias.

        Una orden como «pon el minueto de Bach» viaja ya reducida a «minueto
        bach» (el proveedor quita verbos y relleno); aquí cada palabra se compara
        con título y compositor y las piezas que encajan con más palabras
        quedan primero. El orden de partida es el del catálogo, así que dos
        piezas empatadas salen siempre en la misma posición: determinismo.
        """
        texto = str(arguments.get("texto", "")).strip()
        if not texto:
            raise ToolError("buscar_pieza requiere un texto no vacío")
        tokens = [t for t in _tokeniza(_sin_acentos(texto)) if len(t) >= 3]
        if not tokens:
            return {"piezas": []}

        def puntuacion(row: Any) -> int:
            campo = set(_tokeniza(_sin_acentos(f"{row['title']} {row['composer']}")))
            return sum(1 for token in tokens if _coincide(token, campo))

        rows = find_pieces()
        # `list.sort` es estable: con la misma puntuación se conserva el orden
        # del corpus (compositor, opus, id), que es el orden natural del selector.
        coincidencias = sorted(
            (row for row in rows if puntuacion(row) > 0),
            key=puntuacion,
            reverse=True,
        )
        return {
            "piezas": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "composer": row["composer"],
                }
                for row in coincidencias
            ]
        }

    def _info_pieza(self, arguments: dict[str, object]) -> dict[str, object]:
        row = get_piece(str(arguments["piece_id"]))
        if row is None:
            raise ToolError(f"La pieza '{arguments['piece_id']}' no existe")
        return {
            "id": row["id"],
            "title": row["title"],
            "composer": row["composer"],
            "tempo": row["tempo"],
            "duration_seconds": row["duration_s"],
            "notes_count": row["notes_count"],
            "difficulty": row["difficulty"],
        }

    def _estado_sesion(self, arguments: dict[str, object]) -> dict[str, object]:
        row = get_session(str(arguments["session_id"]))
        if row is None:
            raise ToolError(f"La sesión '{arguments['session_id']}' no existe")
        return {
            "session_id": row["id"],
            "piece_id": row["piece_id"],
            "status": row["status"],
            "control": row["control"],
            "current_measure": row["current_measure"],
            "position_s": row["position_s"],
        }


REGISTRY = ToolRegistry()


def list_tools() -> list[dict[str, object]]:
    return REGISTRY.list_schemas()


def tool_names() -> list[str]:
    return REGISTRY.list_names()


def execute_tool(name: str, arguments: dict[str, object]) -> dict[str, object]:
    return REGISTRY.get(name).execute(arguments)
