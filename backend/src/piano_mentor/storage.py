# description: Guardado local de piezas MIDI en filesystem.
# context: Persistencia MVP de bytes MIDI; metadatos irán a SQLite.

"""Abstracción de almacenamiento y adaptador local para piezas MIDI."""

from __future__ import annotations

import hashlib
import tempfile
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from .config import settings

def content_hash(content: bytes) -> str:
    """Devuelve el SHA-256 en hexa de unos bytes MIDI; base de la deduplicación."""
    return hashlib.sha256(content).hexdigest()


class PieceStorage(ABC):
    """Interfaz de almacenamiento de piezas MIDI."""

    @abstractmethod
    def save(self, filename: str, content: bytes, owner_id: str | None = None) -> str:
        """Guarda un archivo y devuelve su identificador estable.

        ``owner_id`` es informativo para backends que particionen por usuario
        (p. ej. R2); el identificador devuelto sigue siendo único globalmente.
        """
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

    def save(self, filename: str, content: bytes, owner_id: str | None = None) -> str:
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

class R2PieceStorage(PieceStorage):
    """Almacenamiento de piezas MIDI en Cloudflare R2 (compatible S3).

    Se activa cuando hay credenciales R2 configuradas; en local se usa
    ``LocalPieceStorage``. Los bytes se guardan bajo ``midi/uploads/{id}`` y
    se descargan a una caché local al leerlos, para que el motor MIDI (que
    necesita una ruta en disco) siga funcionando sin cambios.
    """

    def __init__(
        self,
        bucket: str,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        region: str = "auto",
        prefix: str = "midi/uploads",
        client: object | None = None,
        cache_dir: Path | None = None,
    ) -> None:
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._client = client or boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region,
        )
        if cache_dir is None:
            cache_dir = Path(settings.midi_storage_path).parent / ".midi_cache"
        self._cache_dir = cache_dir

    def _key(self, piece_id: str) -> str:
        return f"{self._prefix}/{piece_id}"

    def _cache_path(self, piece_id: str) -> Path:
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        return self._cache_dir / piece_id

    def save(self, filename: str, content: bytes, owner_id: str | None = None) -> str:
        piece_id = uuid.uuid4().hex
        key = self._key(piece_id)
        self._client.put_object(Bucket=self._bucket, Key=key, Body=content)
        # Deja una copia en caché para la inspección inmediata.
        self._cache_path(piece_id).write_bytes(content)
        return piece_id

    def exists(self, piece_id: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=self._key(piece_id))
            return True
        except Exception as exc:  # noqa: BLE001
            response = getattr(exc, "response", None)
            code = None
            if isinstance(response, dict):
                code = response.get("Error", {}).get("Code")
            if code in {"404", "NoSuchKey", "NotFound"} or "404" in str(exc):
                return False
            raise

    def get_path(self, piece_id: str) -> Path:
        target = self._cache_path(piece_id)
        if not target.exists():
            self._client.download_file(self._bucket, self._key(piece_id), str(target))
        return target

    def delete(self, piece_id: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=self._key(piece_id))
        except ClientError:
            pass
        cache = self._cache_path(piece_id)
        if cache.exists():
            cache.unlink()


def create_storage() -> PieceStorage:
    """Elige el backend de storage según la configuración.

    Con credenciales R2 usa ``R2PieceStorage``; en caso contrario (local o
    tests) usa ``LocalPieceStorage``. Mantiene el contrato ``PieceStorage``.
    """
    if (
        getattr(settings, "r2_access_key_id", "") or ""
    ).strip() and getattr(settings, "r2_secret_access_key", "") and getattr(settings, "r2_bucket", ""):
        return R2PieceStorage(
            bucket=settings.r2_bucket,
            endpoint_url=settings.r2_endpoint,
            access_key_id=settings.r2_access_key_id,
            secret_access_key=settings.r2_secret_access_key,
            region=getattr(settings, "r2_region", "auto") or "auto",
        )
    return LocalPieceStorage(Path(settings.midi_storage_path))
