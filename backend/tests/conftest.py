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
def isolated_llm(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Aísla la cadena de LLM: la suite normal nunca depende del `.env` ni de la red.

    El `.env` de desarrollo trae `LLM_PROVIDER` y claves reales de Groq y
    Gemini; sin este aislamiento los tests del chat se ejecutaban contra la
    cadena de respaldo real (y contra la red) en vez del Mock, que es el
    proveedor con el que están escritos. El gating se prueba test a test con
    monkeypatch; aquí se fija el modo hermético por defecto, igual que ya hacen
    `isolated_database` e `isolated_storage`.

    Las pruebas de integración (`-m integration`) sí quieren las claves reales
    y se quedan fuera del aislamiento.
    """
    if request.node.get_closest_marker("integration"):
        return
    monkeypatch.setattr(settings, "llm_provider", "mock")
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "")


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
