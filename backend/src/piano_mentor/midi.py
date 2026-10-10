# description: Motor MIDI determinista: lectura, validación y normalización con Mido.
# context: Núcleo musical; no decide pedagogía ni responde HTTP.

from __future__ import annotations

from pathlib import Path

import mido

DEFAULT_BPM = 120.0
MICROSECONDS_PER_MINUTE = 60_000_000.0
ROUNDING_DECIMALS = 6


class MidiParseError(Exception):
    """Error de lectura MIDI con código estable para traducir a HTTP por el llamador."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _initial_tempo(midi: mido.MidiFile) -> float:
    """Tempo inicial en BPM: el primer `set_tempo` por tick absoluto, o 120 por defecto."""
    first_tick: int | None = None
    tempo: int | None = None
    for track in midi.tracks:
        tick = 0
        for message in track:
            tick += message.time
            if message.type != "set_tempo":
                continue
            if first_tick is None or tick < first_tick:
                first_tick = tick
                tempo = message.tempo
    if tempo is None:
        return DEFAULT_BPM
    return round(MICROSECONDS_PER_MINUTE / tempo, ROUNDING_DECIMALS)


def _count_notes(midi: mido.MidiFile) -> int:
    """Cuenta notas reales: `note_on` con velocidad positiva (vel 0 equivale a note_off)."""
    return sum(
        1
        for track in midi.tracks
        for message in track
        if message.type == "note_on" and message.velocity > 0
    )


def _used_channels(midi: mido.MidiFile) -> list[int]:
    """Canales MIDI usados por mensajes con canal, ordenados y sin duplicados."""
    return sorted(
        {
            message.channel
            for track in midi.tracks
            for message in track
            if not message.is_meta and hasattr(message, "channel")
        }
    )


def _duration_seconds(midi: mido.MidiFile) -> float | None:
    """Duración aproximada en segundos según Mido; None si el tipo no permite calcularla."""
    try:
        return round(midi.length, ROUNDING_DECIMALS)
    except TypeError:
        # Mido no calcula la longitud de los archivos tipo 2 (secuencias independientes).
        return None


def _read_midi_file(path: Path) -> mido.MidiFile:
    """Abre un MIDI del filesystem o lanza MidiParseError con código estable."""
    if not path.is_file():
        raise MidiParseError("midi_file_not_found", f"No existe el archivo MIDI: {path}")
    try:
        return mido.MidiFile(str(path))
    except (OSError, EOFError, ValueError, KeyError) as exc:
        raise MidiParseError(
            "invalid_midi_content",
            "El contenido no es un MIDI legible",
        ) from exc


class MidiService:
    """Motor MIDI determinista: lee metadatos y normaliza piezas sin estado global."""

    def inspect_file(self, path: Path) -> dict[str, object]:
        """Devuelve los metadatos musicales de un archivo MIDI legible."""
        midi = _read_midi_file(path)
        return {
            "path": str(path),
            "tracks": len(midi.tracks),
            "duration_seconds": _duration_seconds(midi),
            "tempo": _initial_tempo(midi),
            "notes_count": _count_notes(midi),
            "channels": _used_channels(midi),
        }

    def normalize(self, source: object) -> list[dict[str, object]]:
        """Normaliza una fuente MIDI a notas internas; placeholder inicial."""
        return []

    def play_section(
        self, piece_id: str, start_measure: int, end_measure: int
    ) -> dict[str, object]:
        """Prepara la reproducción de una sección sin emitir MIDI todavía."""
        return {"piece_id": piece_id, "range": [start_measure, end_measure], "status": "stub"}
