# description: Fixtures globales que aíslan la base de datos y el almacén MIDI de cada test.
# context: Evita escribir data/*.db y, sobre todo, dejar archivos MIDI fuera del repo.

"""Fixtures globales de pytest para el backend."""

from __future__ import annotations

from pathlib import Path

import pytest

from piano_mentor import api
from piano_mentor.config import settings
from piano_mentor.storage import LocalPieceStorage


@pytest.fixture(autouse=True)
def isolated_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Apunta DATABASE_URL a un archivo temporal durante cada test."""
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_file.as_posix()}")
    return db_file


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalPieceStorage:
    """Apunta el almacén MIDI a un directorio temporal durante cada test.

    Sin esto, un test que sube un MIDI escribía en el almacén real, que además es
    una ruta dependiente del directorio de trabajo: con `.env` vale `./data/midi`
    y sin él el valor por defecto `/data/midi` (en Windows, `E:\\data\\midi`). El
    resultado eran cientos de archivos sueltos fuera del repositorio.

    También se apunta `settings.midi_storage_path` al mismo directorio porque es
    la ruta que usa la API para resolver las piezas del corpus y el catálogo.

    El directorio es `tmp_path/midi` y no `tmp_path` para que la base de datos del
    test (y sus ficheros auxiliares) no se cuele al contar lo que hay en el
    almacén: los tests que inspeccionan el almacén solo deben ver MIDIs.
    """
    root = tmp_path / "midi"
    storage = LocalPieceStorage(root)
    monkeypatch.setattr(settings, "midi_storage_path", str(root))
    monkeypatch.setattr(api, "storage", storage)
    return storage
