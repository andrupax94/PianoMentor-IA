# description: Motor MIDI determinista: lectura, validación y normalización con Mido.
# context: Núcleo musical; no decide pedagogía ni responde HTTP.

from pathlib import Path


class MidiService:
    """Punto de entrada del motor MIDI; la implementación musical llegará después."""

    def inspect_file(self, path: Path) -> dict[str, object]:
        """Devuelve metadatos mínimos para mantener el contrato del MVP."""
        return {"path": str(path), "status": "not_implemented", "notes": []}

    def normalize(self, source: object) -> list[dict[str, object]]:
        """Normaliza una fuente MIDI a notas internas; placeholder inicial."""
        return []

    def play_section(self, piece_id: str, start_measure: int, end_measure: int) -> dict[str, object]:
        """Prepara la reproducción de una sección sin emitir MIDI todavía."""
        return {"piece_id": piece_id, "range": [start_measure, end_measure], "status": "stub"}
