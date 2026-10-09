# description: Validación de uploads MIDI: nombre, extensión, tamaño y contenido.
# context: Rechaza archivos inválidos antes de guardarlos.

"""Validación y normalización de cargas MIDI."""

from __future__ import annotations

import re
from pathlib import Path

ALLOWED_EXTENSIONS = {".mid", ".midi"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
SAFE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")


class ValidationError(Exception):
    """Error de validación con código estable para traducir a HTTP."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def validate_extension(filename: str) -> str:
    """Valida la extensión y devuelve la extensión normalizada en minúsculas."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            "invalid_extension",
            f"Extensiones permitidas: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return ext


def validate_size(size: int) -> None:
    """Valida que el tamaño no exceda el límite."""
    if size <= 0:
        raise ValidationError("empty_file", "El archivo está vacío")
    if size > MAX_FILE_SIZE:
        raise ValidationError(
            "file_too_large",
            f"El archivo excede el límite de {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )


def sanitize_filename(filename: str) -> str:
    """Limpia el nombre de archivo evitando traversal y caracteres no permitidos."""
    # Rechazar si el nombre original contiene separadores de ruta
    if "/" in filename or "\\" in filename:
        raise ValidationError(
            "invalid_filename",
            "El nombre no puede contener rutas",
        )
    # Extraer solo el nombre base por seguridad
    name = Path(filename).name
    # Reemplazar espacios y caracteres problemáticos
    name = name.strip().replace(" ", "_")
    # Validar patrón seguro
    if not SAFE_NAME_PATTERN.match(name):
        raise ValidationError(
            "invalid_filename",
            "El nombre contiene caracteres no permitidos",
        )
    return name


def validate_content(content: bytes) -> None:
    """Validación mínima de contenido: rechaza archivos vacíos."""
    if not content:
        raise ValidationError("empty_file", "El archivo está vacío")
