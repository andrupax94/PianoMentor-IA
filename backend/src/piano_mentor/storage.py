# description: Guardado local de piezas MIDI en filesystem.
# context: Persistencia MVP de bytes MIDI; metadatos irán a SQLite.

"""Abstracción de almacenamiento y adaptador local para piezas MIDI."""

from __future__ import annotations

import hashlib
import uuid
from abc import ABC, abstractmethod
from pathlib import Path


def content_hash(content: bytes) -> str:
    """Devuelve el SHA-256 en hexa de unos bytes MIDI; base de la deduplicación."""
    return hashlib.sha256(content).hexdigest()


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

    @abstractmethod
    def delete(self, piece_id: str) -> None:
        """Elimina una pieza guardada; no falla si ya no existe."""
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

    def delete(self, piece_id: str) -> None:
        """Borra el archivo si existe; se usa para no dejar huérfanos tras un fallo."""
        target = self._root / piece_id
        if target.exists():
            target.unlink()
