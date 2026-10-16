# description: Motor MIDI determinista: lectura, validación, normalización, rejilla de compases, acordes y manos con Mido.
# context: Núcleo musical; no decide pedagogía ni responde HTTP.

from __future__ import annotations

import statistics
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import mido

DEFAULT_BPM = 120.0
MICROSECONDS_PER_MINUTE = 60_000_000.0
DEFAULT_TEMPO_US = 500_000  # microsegundos por pulso: 120 BPM por defecto
DEFAULT_TIME_SIGNATURE = (4, 4)  # numerador/denominador cuando el MIDI no declara firma
ROUNDING_DECIMALS = 6
CHORD_TOLERANCE_SECONDS = 0.001  # 1 ms: notas que empiezan más juntas que esto son el mismo acorde (B-009.1)

# Manos (B-009.2): se derivan de la pista, nunca se inventan cuando no hay con qué comparar.
HAND_LEFT = "left"
HAND_RIGHT = "right"
HAND_UNKNOWN = "unknown"
Hand = Literal["left", "right", "unknown"]


class MidiParseError(Exception):
    """Error de lectura MIDI con código estable para traducir a HTTP por el llamador."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class NormalizedNote:
    """Nota interna estable: el contrato que consumen reproducción, compases y evaluación.

    Todos los instantes van en segundos reales (ya convertidos con TempoMap),
    nunca en ticks. Congelada para que nadie la mute por accidente.
    """

    pitch: int
    start_seconds: float
    duration_seconds: float
    velocity: int
    channel: int
    track: int


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


@dataclass(frozen=True)
class MeasureGrid:
    """Rejilla de compases inmutable: firma y límites en segundos de cada compás (B-008.1).

    La construye el motor desde un TempoMap (la fuente única de conversión) y la
    consumen la reproducción por rangos y el compás actual del PlayerBar.
    Sin eventos `time_signature` la pieza se interpreta en 4/4.
    """

    ticks_per_beat: int
    starts_ticks: tuple[int, ...]
    starts_s: tuple[float, ...]
    signatures: tuple[tuple[int, int], ...]
    end_seconds: float

    def __post_init__(self) -> None:
        if not (len(self.starts_ticks) == len(self.starts_s) == len(self.signatures)):
            raise ValueError(
                "MeasureGrid necesita starts_ticks, starts_s y signatures con la misma longitud"
            )

    @classmethod
    def build(cls, midi: mido.MidiFile, tempo_map: TempoMap) -> MeasureGrid:
        """Construye la rejilla recorriendo las firmas ordenadas por tick.

        - Sin `time_signature` rige el 4/4 por defecto.
        - Un cambio de firma se aplica en el primer compás que empieza en su tick
          o después; nunca parte un compás ya iniciado.
        - Los límites en segundos salen del TempoMap recibido, nunca de un BPM constante.
        """
        events = sorted(_collect_time_signatures(midi).items())
        end_tick = _track_end_tick(midi)
        ticks_per_beat = tempo_map.ticks_per_beat

        starts_ticks: list[int] = []
        signatures: list[tuple[int, int]] = []
        active = DEFAULT_TIME_SIGNATURE
        event_index = 0
        tick = 0
        while tick < end_tick:
            while event_index < len(events) and events[event_index][0] <= tick:
                active = events[event_index][1]
                event_index += 1
            length = _measure_ticks(active, ticks_per_beat)
            if length < 1:
                raise MidiParseError(
                    "invalid_time_signature",
                    f"La firma {active[0]}/{active[1]} no cabe en {ticks_per_beat} ticks por pulso",
                )
            starts_ticks.append(tick)
            signatures.append(active)
            tick += length

        return cls(
            ticks_per_beat=ticks_per_beat,
            starts_ticks=tuple(starts_ticks),
            starts_s=tuple(tempo_map.tick_to_seconds(t) for t in starts_ticks),
            signatures=tuple(signatures),
            end_seconds=tempo_map.tick_to_seconds(end_tick),
        )

    @property
    def count(self) -> int:
        """Número total de compases; 0 si la pieza no ocupa ni un tick."""
        return len(self.starts_ticks)

    def measure_at(self, seconds: float) -> int:
        """Compás que contiene un instante; en un borde devuelve el que empieza ahí.

        Instantes negativos se tratan como 0 y los posteriores al final devuelven
        el último compás (misma tolerancia que TempoMap con los ticks negativos).
        """
        if not self.starts_s:
            raise MidiParseError("measure_grid_empty", "La rejilla no tiene compases")
        target = max(seconds, 0.0)
        return max(bisect_right(self.starts_s, target) - 1, 0)

    def bounds_s(self, measure: int) -> tuple[float, float]:
        """Límites [inicio, fin) de un compás en segundos; el último cierra al final."""
        if measure < 0 or measure >= self.count:
            raise IndexError(f"Compás fuera de rango: {measure}")
        end = self.starts_s[measure + 1] if measure + 1 < self.count else self.end_seconds
        return (self.starts_s[measure], end)

    def signature_at(self, seconds: float) -> tuple[int, int]:
        """Firma (numerador, denominador) vigente en un instante."""
        return self.signatures[self.measure_at(seconds)]

    def resolve_range(
        self, start_measure: int, end_measure: int
    ) -> tuple[float, float]:
        """Convierte un rango [start_measure, end_measure] a ventana [from_s, to_s].

        - Borde inicial **incluido**, borde final **exclusivo** (el compás `end_measure`
          termina donde empieza el siguiente; si `end_measure == count`, cierra en `end_seconds`).
        - Valida: rango invertido, vacío, negativo o fuera de límites → MidiParseError.
        """
        if start_measure < 0 or end_measure < 0:
            raise MidiParseError(
                "invalid_measure_range",
                "Los índices de compás no pueden ser negativos",
            )
        if start_measure >= end_measure:
            raise MidiParseError(
                "invalid_measure_range",
                "El rango de compases debe tener start_measure < end_measure",
            )
        if start_measure >= self.count or end_measure > self.count:
            raise MidiParseError(
                "invalid_measure_range",
                f"Rango fuera de límites: la pieza tiene {self.count} compases "
                f"(índices 0..{self.count - 1})",
            )
        from_s = self.starts_s[start_measure]
        to_s = self.starts_s[end_measure] if end_measure < self.count else self.end_seconds
        return (from_s, to_s)


@dataclass(frozen=True)
class Chord:
    """Notas que suenan a la vez (B-009.1): la unidad que usarán evaluación y UI.

    `start_seconds` es el **ancla** del grupo (el inicio más temprano de sus notas),
    y `notes` conserva cada nota con su velocity, canal y pista, para que las capas
    de arriba puedan separar manos sin perder información.
    """

    start_seconds: float
    notes: tuple[NormalizedNote, ...]

    def __post_init__(self) -> None:
        if not self.notes:
            raise ValueError("Un acorde necesita al menos una nota")

    @property
    def size(self) -> int:
        """Cuántas notas tiene el acorde (1 en una nota suelta)."""
        return len(self.notes)

    @property
    def pitches(self) -> tuple[int, ...]:
        """Alturas de las notas, de grave a agudo y en el mismo orden que `notes`.

        Si la misma altura llega por dos caminos (dos pistas, por ejemplo) aparece
        dos veces; `notes` conserva el detalle de cada una.
        """
        return tuple(note.pitch for note in self.notes)


def group_chords(
    notes: Sequence[NormalizedNote],
    tolerance_seconds: float = CHORD_TOLERANCE_SECONDS,
) -> tuple[Chord, ...]:
    """Agrupa notas por instante de inicio y devuelve los acordes en orden temporal.

    Reglas (B-009.1):
    - Una nota entra en el acorde abierto si su inicio dista del ancla **como mucho**
      `tolerance_seconds` (el borde cuenta); una nota suelta es un acorde de una nota.
    - El acorde se ancla en el inicio más temprano del grupo; sus notas quedan
      ordenadas por altura, canal y pista (no por el orden de entrada).
    - Un acorde puede cruzar canales y pistas (las dos manos a la vez); cada nota
      conserva su canal y su pista.
    - Es determinista: mismas notas, mismos acordes, en cualquier orden de entrada.
    - Una tolerancia negativa es un error de programación (no de la pieza) → ValueError.
    """
    if tolerance_seconds < 0:
        raise ValueError("La tolerancia de acorde no puede ser negativa")

    ordered = sorted(notes, key=lambda n: (n.start_seconds, n.pitch, n.channel, n.track))
    chords: list[Chord] = []
    group: list[NormalizedNote] = []
    anchor = 0.0

    for note in ordered:
        if group and note.start_seconds - anchor > tolerance_seconds:
            chords.append(_build_chord(anchor, group))
            group = []
        if not group:
            anchor = note.start_seconds
        group.append(note)

    if group:
        chords.append(_build_chord(anchor, group))
    return tuple(chords)


def _build_chord(anchor: float, group: Sequence[NormalizedNote]) -> Chord:
    """Cierra un grupo en un acorde ordenado de grave a agudo."""
    return Chord(
        start_seconds=anchor,
        notes=tuple(sorted(group, key=lambda n: (n.pitch, n.channel, n.track))),
    )


@dataclass(frozen=True)
class TrackInfo:
    """Resumen de una pista con notas y la mano que le toca (B-009.2).

    Es la vista que consumen la evidencia del corpus y, más adelante, la UI:
    cuántas notas trae, por dónde se mueve y con qué mano se toca.
    """

    track: int
    hand: Hand
    note_count: int
    channels: tuple[int, ...]
    lowest_pitch: int
    highest_pitch: int
    median_pitch: float


@dataclass(frozen=True)
class _TrackStats:
    """Resumen por pista antes de decidir manos; privado del módulo."""

    track: int
    note_count: int
    channels: tuple[int, ...]
    lowest_pitch: int
    highest_pitch: int
    median_pitch: float


def _track_stats(notes: Sequence[NormalizedNote]) -> tuple[_TrackStats, ...]:
    """Resumen por pista con notas, ordenado por número de pista (determinista)."""
    pitches_by_track: dict[int, list[int]] = {}
    channels_by_track: dict[int, set[int]] = {}
    for note in notes:
        pitches_by_track.setdefault(note.track, []).append(note.pitch)
        channels_by_track.setdefault(note.track, set()).add(note.channel)
    return tuple(
        _TrackStats(
            track=track,
            note_count=len(pitches),
            channels=tuple(sorted(channels_by_track[track])),
            lowest_pitch=min(pitches),
            highest_pitch=max(pitches),
            median_pitch=statistics.median(pitches),
        )
        for track, pitches in sorted(pitches_by_track.items())
    )


def hand_by_track(notes: Sequence[NormalizedNote]) -> dict[int, Hand]:
    """Mano de cada pista con notas, decidida por **altura** (B-009.2).

    Reglas:
    - La pista con la mediana de alturas más grave es la **izquierda** y la más
      aguda la **derecha**; las pistas intermedias quedan en `unknown`.
    - Una sola pista con notas → todo `unknown`: no hay contra qué compararla.
    - Si las pistas extremas empatan en mediana, la decisión es ambigua → `unknown`.
    - Determinista: los empates de mediana se rompen por número de pista.

    Se decide por **pista** y no nota a nota: en el corpus los rangos de las dos
    manos se solapan hasta 28 semitonos, así que un umbral fijo de altura
    etiquetaría mal a la mitad de las notas (ver la evidencia de B-009.2).
    """
    stats = sorted(_track_stats(notes), key=lambda s: (s.median_pitch, s.track))
    if len(stats) < 2:
        return {stat.track: HAND_UNKNOWN for stat in stats}

    lowest, highest = stats[0], stats[-1]
    hands: dict[int, Hand] = {stat.track: HAND_UNKNOWN for stat in stats}
    if lowest.median_pitch == highest.median_pitch:
        return hands
    hands[lowest.track] = HAND_LEFT
    hands[highest.track] = HAND_RIGHT
    return hands


def describe_tracks(notes: Sequence[NormalizedNote]) -> tuple[TrackInfo, ...]:
    """Describe cada pista con notas (notas, rango, mediana y mano) en orden de pista.

    Acompaña a `hand_by_track`: la mano de una nota concreta es
    `hands[note.track]`, así que `NormalizedNote` no cambia y la reproducción
    sigue recibiendo una única lista mezclada (decisión de B-009.2).
    """
    hands = hand_by_track(notes)
    return tuple(
        TrackInfo(
            track=stat.track,
            hand=hands[stat.track],
            note_count=stat.note_count,
            channels=stat.channels,
            lowest_pitch=stat.lowest_pitch,
            highest_pitch=stat.highest_pitch,
            median_pitch=stat.median_pitch,
        )
        for stat in _track_stats(notes)
    )


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


def _collect_time_signatures(midi: mido.MidiFile) -> dict[int, tuple[int, int]]:
    """Firmas de compás por tick absoluto; sin eventos devuelve 4/4 en el tick 0.

    Un numerador o denominador menor que 1 rompería el ciclo de compases,
    así que se rechaza con código estable antes de construir la rejilla.
    """
    signatures: dict[int, tuple[int, int]] = {0: DEFAULT_TIME_SIGNATURE}
    for track in midi.tracks:
        tick = 0
        for message in track:
            tick += message.time
            if message.type == "time_signature":
                if message.numerator < 1 or message.denominator < 1:
                    raise MidiParseError(
                        "invalid_time_signature",
                        f"Firma de compás inválida en tick {tick}: "
                        f"{message.numerator}/{message.denominator}",
                    )
                signatures[tick] = (message.numerator, message.denominator)
    return signatures


def _track_end_tick(midi: mido.MidiFile) -> int:
    """Último tick entre pistas: la rejilla cubre la pieza hasta ese punto."""
    return max((sum(message.time for message in track) for track in midi.tracks), default=0)


def _measure_ticks(signature: tuple[int, int], ticks_per_beat: int) -> int:
    """Ticks de un compás: numerador × (resolución × 4 / denominador)."""
    numerator, denominator = signature
    return (numerator * ticks_per_beat * 4) // denominator


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


def _is_note_on(message: mido.Message) -> bool:
    """note_on con velocidad positiva (vel 0 equivale a note_off en la convención MIDI)."""
    return message.type == "note_on" and message.velocity > 0


def _is_note_off(message: mido.Message) -> bool:
    """note_off explícito o note_on con velocidad 0."""
    return message.type == "note_off" or (message.type == "note_on" and message.velocity == 0)


def _open_note_key(message: mido.Message, track: int) -> tuple[int, int, int]:
    """Identidad de una nota abierta: pitch, canal y pista de origen (sin velocity)."""
    return (message.note, message.channel, track)


def _normalize_notes(midi: mido.MidiFile, tempo_map: TempoMap) -> list[NormalizedNote]:
    """Empareja note_on/note_off por pitch+canal+pista y devuelve notas en segundos.

    Convención aplicada:
    - Las notas se emparejan en orden FIFO por (pitch, canal, pista).
    - Una nota sin note_off se corta al final de la pieza (duración hasta `midi.length`).
    - Salida ordenada de forma estable por (inicio, pitch, canal, pista).
    """
    piece_end = _duration_seconds(midi) or 0.0
    notes: list[NormalizedNote] = []
    open_notes: dict[tuple[int, int, int], list[tuple[int, int]]] = {}

    for track_index, track in enumerate(midi.tracks):
        tick = 0
        for message in track:
            tick += message.time
            if _is_note_on(message):
                key = _open_note_key(message, track_index)
                open_notes.setdefault(key, []).append((tick, message.velocity))
            elif _is_note_off(message):
                key = _open_note_key(message, track_index)
                pending = open_notes.get(key)
                if pending:
                    start_tick, velocity = pending.pop(0)
                    notes.append(
                        _build_note(
                            tempo_map,
                            message.note,
                            message.channel,
                            track_index,
                            start_tick,
                            tick,
                            velocity,
                        )
                    )

    # Notas sin note_off: se cortan al final de la pieza, sin lanzar excepción.
    for (note, channel, track), pending in open_notes.items():
        for start_tick, velocity in pending:
            start_seconds = tempo_map.tick_to_seconds(start_tick)
            notes.append(
                NormalizedNote(
                    pitch=note,
                    start_seconds=start_seconds,
                    duration_seconds=round(piece_end - start_seconds, ROUNDING_DECIMALS),
                    velocity=velocity,
                    channel=channel,
                    track=track,
                )
            )

    return sorted(notes, key=lambda n: (n.start_seconds, n.pitch, n.channel, n.track))


def _build_note(
    tempo_map: TempoMap,
    note: int,
    channel: int,
    track: int,
    start_tick: int,
    end_tick: int,
    velocity: int,
) -> NormalizedNote:
    """Crea una nota normalizada a partir de sus ticks de inicio y fin."""
    start_seconds = tempo_map.tick_to_seconds(start_tick)
    end_seconds = tempo_map.tick_to_seconds(end_tick)
    return NormalizedNote(
        pitch=note,
        start_seconds=start_seconds,
        duration_seconds=round(end_seconds - start_seconds, ROUNDING_DECIMALS),
        velocity=velocity,
        channel=channel,
        track=track,
    )


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

    def measure_grid(self, path: Path) -> MeasureGrid:
        """Construye la rejilla de compases de un archivo (B-008.1).

        Es la noción de compás que consumen la reproducción por rangos y el
        PlayerBar; lanza MidiParseError con código estable si el archivo
        falta o es ilegible.
        """
        midi = _read_midi_file(path)
        return MeasureGrid.build(midi, TempoMap.build(midi))

    def resolve_measure_range(
        self, path: Path, start_measure: int, end_measure: int
    ) -> dict[str, object]:
        """Resuelve un rango de compases a ventana temporal [from_s, to_s] (B-008.2).

        Devuelve dict con: piece_id (nombre archivo), measure_range, window (from_s, to_s),
        total_measures, status="resolved". Lanza MidiParseError con código estable
        si el archivo falta, es ilegible o el rango es inválido.
        """
        grid = self.measure_grid(path)
        from_s, to_s = grid.resolve_range(start_measure, end_measure)
        return {
            "piece_id": path.name,
            "measure_range": [start_measure, end_measure],
            "window": [from_s, to_s],
            "total_measures": grid.count,
            "status": "resolved",
        }

    def normalize(self, source: Path | None) -> list[NormalizedNote]:
        """Normaliza un MIDI a la lista estable de notas internas.

        - Fuente no válida (None u otro tipo que no sea Path) mantiene el
          comportamiento placeholder y devuelve `[]`, sin excepción.
        - Un Path legible produce las notas reales en segundos (B-005.2/B-005.3).
        - Un Path ilegible lanza MidiParseError con código estable.
        """
        if not isinstance(source, Path):
            return []
        midi = _read_midi_file(source)
        return _normalize_notes(midi, TempoMap.build(midi))

    def score(self, source: Path) -> dict[str, object]:
        """Lee partitura y tempo inicial en una sola pasada (B-006.1).

        Evita parsear el archivo dos veces cuando el llamador necesita las
        notas y el tempo a la vez. Lanza MidiParseError con código estable
        si el archivo falta o es ilegible.
        """
        midi = _read_midi_file(source)
        tempo_map = TempoMap.build(midi)
        return {
            "notes": _normalize_notes(midi, tempo_map),
            "tempo": tempo_map.initial_tempo(),
        }

    def play_section(
        self, piece_id: str, start_measure: int, end_measure: int
    ) -> dict[str, object]:
        """Prepara la reproducción de una sección sin emitir MIDI todavía.

        Nota: este método requiere que el llamador resuelva piece_id a Path.
        Para uso directo desde API, véase el endpoint /pieces/{id}/notes con
        from_measure/to_measure o el método resolve_measure_range.
        """
        # Mantiene compatibilidad; la implementación real está en resolve_measure_range
        # y en el endpoint de notas. Aquí se deja como referencia documentada.
        return {
            "piece_id": piece_id,
            "measure_range": [start_measure, end_measure],
            "status": "use_resolve_measure_range_or_notes_endpoint",
        }
