# description: Motor MIDI determinista: lectura, validación y normalización con Mido.
# context: Núcleo musical; no decide pedagogía ni responde HTTP.

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import mido

DEFAULT_BPM = 120.0
MICROSECONDS_PER_MINUTE = 60_000_000.0
DEFAULT_TEMPO_US = 500_000  # microsegundos por pulso: 120 BPM por defecto
ROUNDING_DECIMALS = 6


class MidiParseError(Exception):
    """Error de lectura MIDI con código estable para traducir a HTTP por el llamador."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class TempoMap:
    """Mapa de tempo inmutable de una pieza: convierte ticks a segundos de forma determinista."""

    ticks_per_beat: int
    changes: tuple[tuple[int, int], ...]

    def __post_init__(self) -> None:
        if not self.changes:
            raise ValueError("TempoMap necesita al menos un cambio de tempo")

    @classmethod
    def build(cls, midi: mido.MidiFile) -> TempoMap:
        """Construye el mapa acumulando ticks absolutos; sin `set_tempo` usa 120 BPM."""
        changes: dict[int, int] = {0: DEFAULT_TEMPO_US}
        for track in midi.tracks:
            tick = 0
            for message in track:
                tick += message.time
                if message.type == "set_tempo":
                    changes[tick] = message.tempo
        return cls(ticks_per_beat=midi.ticks_per_beat, changes=tuple(sorted(changes.items())))

    def initial_tempo(self) -> float:
        """Tempo inicial en BPM, correspondiente al primer cambio del mapa."""
        return round(MICROSECONDS_PER_MINUTE / self.changes[0][1], ROUNDING_DECIMALS)

    def tick_to_seconds(self, tick: int) -> float:
        """Convierte un tick absoluto a segundos aplicando el tramo de tempo que le corresponde.

        Los ticks negativos se tratan como 0; más allá del último cambio de tempo
        se mantiene el último tempo declarado.
        """
        position = 0.0
        previous_tick, tempo = self.changes[0]
        target = max(tick, previous_tick)
        for change_tick, change_tempo in self.changes[1:]:
            if change_tick > target:
                break
            position += mido.tick2second(change_tick - previous_tick, self.ticks_per_beat, tempo)
            previous_tick, tempo = change_tick, change_tempo
        position += mido.tick2second(target - previous_tick, self.ticks_per_beat, tempo)
        return round(position, ROUNDING_DECIMALS)


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
        tempo_map = TempoMap.build(midi)
        return {
            "path": str(path),
            "tracks": len(midi.tracks),
            "duration_seconds": _duration_seconds(midi),
            "tempo": tempo_map.initial_tempo(),
            "notes_count": _count_notes(midi),
            "channels": _used_channels(midi),
        }

    def tempo_map(self, path: Path) -> TempoMap:
        """Construye el mapa de tempo de un archivo para convertir ticks a segundos."""
        return TempoMap.build(_read_midi_file(path))

    def normalize(self, source: object) -> list[dict[str, object]]:
        """Normaliza una fuente MIDI a notas internas; placeholder inicial."""
        return []

    def play_section(
        self, piece_id: str, start_measure: int, end_measure: int
    ) -> dict[str, object]:
        """Prepara la reproducción de una sección sin emitir MIDI todavía."""
        return {"piece_id": piece_id, "range": [start_measure, end_measure], "status": "stub"}
