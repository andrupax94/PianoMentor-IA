# description: Carga idempotente de data/midi/catalog.json en pieces (upsert por id) con verificación previa de los MIDI referenciados.
# context: CLI python -m piano_mentor.catalog; B-003.3 no toca el formato del catálogo.

"""Carga el catálogo del corpus MIDI en SQLite sin modificar su formato."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import settings
from .database import connect, init_db, upsert_piece
from .storage import content_hash


class CatalogError(Exception):
    """Catálogo inválido o archivo MIDI referenciado inexistente."""


def _catalog_path() -> Path:
    return Path(settings.midi_storage_path) / "catalog.json"


def _record(entry: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    relative_path = Path(entry["file"])
    midi_file = base_dir / relative_path
    if not midi_file.is_file():
        raise CatalogError(f"MIDI referenciado inexistente: {relative_path}")
    return {
        "id": entry["id"],
        "filename": midi_file.name,
        "stored_filename": midi_file.name,
        "midi_path": relative_path.as_posix(),
        "size_bytes": midi_file.stat().st_size,
        "extension": midi_file.suffix,
        "title": entry["title"],
        "composer": entry["composer"],
        "opus": entry.get("opus"),
        "tracks": entry.get("tracks"),
        "duration_s": entry.get("duration_s"),
        "notes_count": entry.get("notes"),
        "license": entry.get("license"),
        "source_url": entry.get("source_url"),
        "difficulty": entry.get("difficulty"),
        # B-005.4+: hash y procedencia, para que subir un MIDI idéntico a un
        # archivo del corpus reutilice la entrada del catálogo en vez de duplicarla.
        "content_hash": content_hash(midi_file.read_bytes()),
        "source": "corpus",
    }


def load_catalog(catalog_file: Path | None = None) -> int:
    """Inserta o actualiza las piezas del catálogo; devuelve el número de filas escritas.

    Primero valida que todos los MIDI referenciados existen; solo entonces escribe.
    """
    path = catalog_file or _catalog_path()
    if not path.is_file():
        raise CatalogError(f"Catálogo no encontrado: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("pieces")
    if not isinstance(entries, list) or not entries:
        raise CatalogError("El catálogo no contiene la lista 'pieces'")

    base_dir = path.parent
    records = [_record(entry, base_dir) for entry in entries]

    conn = connect()
    try:
        init_db(conn)
        for record in records:
            upsert_piece(conn, record)
    finally:
        conn.close()
    return len(records)


def main() -> None:
    count = load_catalog()
    print(f"Catálogo cargado: {count} piezas en {settings.database_url}")


if __name__ == "__main__":
    main()
