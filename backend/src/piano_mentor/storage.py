"""Abstracción de almacenamiento y adaptador local para piezas MIDI."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from pathlib import Path


class PieceStorage(ABC):
    """Interfaz de almacenamiento de piezas MIDI."""

    @abstractmethod
    def save(self, filename: str, content: bytes) -> str:
        """Guarda un archivo y devuelve su identificador estable."""
        raise NotImplementedError

    @abstractmethod
    def exists(self, piece_id: str) -> bool:
        """Comprueba si una pieza existe."""
        raise NotImplementedError

    @abstractmethod
    def get_path(self, piece_id: str) -> Path:
        """Devuelve la ruta lógica de una pieza."""
        raise NotImplementedError


class LocalPieceStorage(PieceStorage):
    """Implementación local basada en filesystem."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def save(self, filename: str, content: bytes) -> str:
        piece_id = uuid.uuid4().hex
        target = self._root / piece_id
        self._root.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return piece_id

    def exists(self, piece_id: str) -> bool:
        return (self._root / piece_id).exists()

    def get_path(self, piece_id: str) -> Path:
        return self._root / piece_id
