# description: Fixture global que aísla la base de datos de cada test en un directorio temporal.
# context: Evita escribir data/*.db durante pytest.

"""Fixtures globales de pytest para el backend."""

from __future__ import annotations

from pathlib import Path

import pytest

from piano_mentor.config import settings


@pytest.fixture(autouse=True)
def isolated_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Apunta DATABASE_URL a un archivo temporal durante cada test."""
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_file.as_posix()}")
    return db_file
