# description: Genera los fixtures MIDI deterministas de backend/tests/fixtures/midi/.
# context: Fixtures versionados de B-005.1; no dependen del corpus de terceros.

"""Genera los fixtures MIDI pequeños y deterministas usados por los tests.

Uso:
    python backend/scripts/build_midi_fixtures.py [--output DIR]

Los archivos generados son binarios estables: volver a ejecutar el script con la
misma versión de Mido produce bytes idénticos. No editar los .mid a mano.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path

import mido

DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "midi"

TICKS_PER_BEAT = 480
TEMPO_120_BPM = 500_000  # microsegundos por pulso (120 BPM)
TEMPO_60_BPM = 1_000_000  # microsegundos por pulso (60 BPM)


def _note_pair(note: int, channel: int, start: int, length: int) -> list[mido.Message]:
    """Devuelve note_on y note_off con deltas relativos al instante `start`."""
    return [
        mido.Message("note_on", note=note, velocity=64, channel=channel, time=start),
        mido.Message("note_off", note=note, velocity=0, channel=channel, time=length),
    ]


def _new_track(midi: mido.MidiFile) -> mido.MidiTrack:
    """Añade una pista vacía y la devuelve (list.append no devuelve la pista)."""
    track = mido.MidiTrack()
    midi.tracks.append(track)
    return track


def build_single_track() -> mido.MidiFile:
    """Pista única, tempo explícito de 120 BPM y dos notas en el canal 0."""
    midi = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = _new_track(midi)
    track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    track.extend(_note_pair(60, channel=0, start=0, length=TICKS_PER_BEAT))
    track.extend(_note_pair(62, channel=0, start=0, length=TICKS_PER_BEAT))
    track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_multi_track() -> mido.MidiFile:
    """Tres pistas (meta + melodía + bajo) usando los canales 0 y 9."""
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)

    meta_track = _new_track(midi)
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    meta_track.append(mido.MetaMessage("end_of_track", time=0))

    melody_track = _new_track(midi)
    melody_track.extend(_note_pair(72, channel=0, start=0, length=TICKS_PER_BEAT))
    melody_track.extend(_note_pair(74, channel=0, start=0, length=TICKS_PER_BEAT))
    melody_track.append(mido.MetaMessage("end_of_track", time=0))

    bass_track = _new_track(midi)
    bass_track.extend(_note_pair(36, channel=9, start=0, length=TICKS_PER_BEAT))
    bass_track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_tempo_change() -> mido.MidiFile:
    """Dos pistas con cambio de tempo a mitad de pieza (120 BPM -> 60 BPM)."""
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)

    meta_track = _new_track(midi)
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_60_BPM, time=TICKS_PER_BEAT))
    meta_track.append(mido.MetaMessage("end_of_track", time=0))

    note_track = _new_track(midi)
    note_track.extend(_note_pair(60, channel=0, start=0, length=TICKS_PER_BEAT))
    note_track.extend(_note_pair(65, channel=0, start=0, length=TICKS_PER_BEAT))
    note_track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_no_tempo() -> mido.MidiFile:
    """Pista única sin set_tempo: el servicio debe asumir 120 BPM por defecto."""
    midi = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = _new_track(midi)
    track.extend(_note_pair(48, channel=0, start=0, length=TICKS_PER_BEAT))
    track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_corrupt() -> bytes:
    """Contenido que no es un MIDI: el servicio debe rechazarlo con código estable."""
    return b"NOT-A-MIDI-FILE\x00\x01\x02\x03esto no es un MIDI v\x00\xff\xfe"


def build_unclosed_note() -> mido.MidiFile:
    """Una nota cerrada y otra sin note_off: el normalizador debe cortarla al final."""
    midi = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = _new_track(midi)
    track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    track.append(mido.Message("note_on", note=60, velocity=64, channel=0, time=0))
    # note 62 empieza a mitad de la anterior y queda abierta: no tiene note_off.
    track.append(mido.Message("note_on", note=62, velocity=64, channel=0, time=TICKS_PER_BEAT // 2))
    track.append(mido.Message("note_off", note=60, velocity=0, channel=0, time=TICKS_PER_BEAT // 2))
    track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_mixed_problems() -> mido.MidiFile:
    """Pieza más larga que mezcla acorde, dos canales (manos), cambio de tempo y nota sin cerrar."""
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)

    # Cambio de tempo a mitad (120 -> 60 BPM) en el tick 960.
    meta_track = _new_track(midi)
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_60_BPM, time=2 * TICKS_PER_BEAT))
    meta_track.append(mido.MetaMessage("end_of_track", time=0))

    # Mano derecha (canal 0): acorde de 3 notas, una nota que cruza el cambio de
    # tempo y una nota sin cerrar al final.
    right_track = _new_track(midi)
    for note in (72, 76, 79):
        right_track.append(mido.Message("note_on", note=note, velocity=80, channel=0, time=0))
    for index, note in enumerate((72, 76, 79)):
        right_track.append(
            mido.Message(
                "note_off",
                note=note,
                velocity=0,
                channel=0,
                time=TICKS_PER_BEAT if index == 0 else 0,
            )
        )
    # note 81 cruza el cambio de tempo: empieza a 120 BPM y termina a 60 BPM.
    right_track.append(mido.Message("note_on", note=81, velocity=90, channel=0, time=0))
    right_track.append(
        mido.Message("note_off", note=81, velocity=0, channel=0, time=3 * TICKS_PER_BEAT // 2)
    )
    # note 84 queda abierta: no tiene note_off.
    right_track.append(mido.Message("note_on", note=84, velocity=100, channel=0, time=0))
    right_track.append(mido.MetaMessage("end_of_track", time=0))

    # Mano izquierda (canal 9): dos notas largas, la primera cruza el cambio de tempo.
    left_track = _new_track(midi)
    left_track.append(mido.Message("note_on", note=36, velocity=70, channel=9, time=0))
    left_track.append(
        mido.Message("note_off", note=36, velocity=0, channel=9, time=2 * TICKS_PER_BEAT)
    )
    left_track.append(mido.Message("note_on", note=43, velocity=70, channel=9, time=0))
    left_track.append(mido.Message("note_off", note=43, velocity=0, channel=9, time=TICKS_PER_BEAT))
    left_track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def build_test_scale() -> mido.MidiFile:
    """Escala de tres notas (Do-Re-Mi) sin `set_tempo`: el "MIDI válido" de los tests de /pieces.

    Es el fixture que fijan los números de la carga de piezas: **1 pista, 3 notas,
    120 BPM por defecto y 1,5 s**. No lleva `set_tempo` a propósito, porque así los
    tests comprueban que el motor asume 120 BPM cuando el archivo no lo declara.
    """
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)
    track = _new_track(midi)
    track.append(mido.Message("program_change", program=0, channel=0, time=0))
    for note in (60, 62, 64):
        track.append(mido.Message("note_on", note=note, velocity=64, channel=0, time=0))
        track.append(
            mido.Message("note_off", note=note, velocity=64, channel=0, time=TICKS_PER_BEAT)
        )
    track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def _notes_track(channel: int, notes: list[tuple[float, float, int, int]]) -> list[mido.Message]:
    """Mensajes de una pista a partir de (inicio, fin, altura, velocity) en pulsos.

    Ordena los eventos por instante y, en el mismo instante, cierra antes de
    abrir: es lo que espera cualquier lector MIDI para una nota repetida.
    """
    events: list[tuple[int, int, mido.Message]] = []
    for start, end, pitch, velocity in notes:
        events.append(
            (
                round(start),
                1,
                mido.Message("note_on", note=pitch, velocity=velocity, channel=channel),
            )
        )
        events.append(
            (round(end), 0, mido.Message("note_off", note=pitch, velocity=0, channel=channel))
        )
    events.sort(key=lambda item: (item[0], item[1]))

    messages: list[mido.Message] = []
    previous = 0
    for tick, _, message in events:
        message.time = tick - previous
        previous = tick
        messages.append(message)
    return messages


# Frase de práctica: 4 compases de 4/4 a 120 BPM (1 pulsación = 0,5 s), con las
# dos manos separadas por registro (izquierda <= 55, derecha >= 67) y 22 notas.
# Es la pieza con la que se prueban la sesión (B-012.1) y la evaluación (B-012.2):
# tiene acordes (uno de tres notas en la derecha y dos voces en la izquierda), un
# silencio en el cuarto tiempo del compás 2 y tres niveles de velocity.
PRACTICE_BEAT = TICKS_PER_BEAT

# (pulsación de inicio, de fin, altura, velocity) relativo al inicio de la pieza.
PRACTICE_RIGHT_HAND: list[tuple[float, float, int, int]] = [
    (0, 1, 72, 80),  # C5
    (1, 2, 74, 80),  # D5
    (2, 3, 76, 80),  # E5
    (3, 4, 77, 80),  # F5
    (4, 6, 79, 100),  # G5, blanca
    (6, 7, 69, 90),  # A4 ┐
    (6, 7, 72, 90),  # C5 ├ acorde de tres notas
    (6, 7, 76, 90),  # E5 ┘  (el tiempo 7 queda en silencio)
    (8, 9, 76, 80),  # E5
    (9, 10, 77, 80),  # F5
    (10, 12, 79, 90),  # G5, blanca
    (12, 13, 69, 80),  # A4
    (13, 14, 67, 80),  # G4
    (14, 16, 72, 95),  # C5, blanca final
]

PRACTICE_LEFT_HAND: list[tuple[float, float, int, int]] = [
    (0, 4, 48, 60),  # C3 ┐
    (0, 4, 55, 60),  # G3 ┘
    (4, 8, 45, 60),  # A2 ┐
    (4, 8, 52, 60),  # E3 ┘
    (8, 12, 41, 65),  # F2 ┐
    (8, 12, 48, 65),  # C3 ┘
    (12, 16, 43, 60),  # G2 ┐
    (12, 16, 50, 60),  # D3 ┘
]


def _practice_ticks(
    notes: list[tuple[float, float, int, int]],
) -> list[tuple[float, float, int, int]]:
    """Convierte las pulsaciones de la frase de práctica en ticks."""
    return [
        (start * PRACTICE_BEAT, end * PRACTICE_BEAT, pitch, velocity)
        for start, end, pitch, velocity in notes
    ]


def build_practice_phrase() -> mido.MidiFile:
    """Pieza propia de práctica: 4 compases, 22 notas, dos manos y 8,0 s.

    Las notas empiezan en `pulsación * 0,5` segundos (120 BPM). La derecha toca
    la melodía en el canal 0 y la izquierda los bajos en el canal 1; los rangos
    no se solapan, así que la mano se puede deducir por altura (B-009.2) además
    de por pista. El catálogo del corpus la incluye como `p16`.
    """
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)

    meta_track = _new_track(midi)
    meta_track.append(mido.MetaMessage("set_tempo", tempo=TEMPO_120_BPM, time=0))
    meta_track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    meta_track.append(mido.MetaMessage("end_of_track", time=0))

    right_track = _new_track(midi)
    right_track.extend(_notes_track(0, _practice_ticks(PRACTICE_RIGHT_HAND)))
    right_track.append(mido.MetaMessage("end_of_track", time=0))

    left_track = _new_track(midi)
    left_track.extend(_notes_track(1, _practice_ticks(PRACTICE_LEFT_HAND)))
    left_track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


MIDI_BUILDERS: dict[str, Callable[[], mido.MidiFile]] = {
    "single_track.mid": build_single_track,
    "multi_track.mid": build_multi_track,
    "tempo_change.mid": build_tempo_change,
    "no_tempo.mid": build_no_tempo,
    "unclosed_note.mid": build_unclosed_note,
    "mixed_problems.mid": build_mixed_problems,
    "test_scale.mid": build_test_scale,
    "practice_phrase.mid": build_practice_phrase,
}

BYTE_BUILDERS: dict[str, Callable[[], bytes]] = {
    "corrupt.mid": build_corrupt,
}


def build_fixtures(output: Path) -> list[Path]:
    """Escribe todos los fixtures en `output` y devuelve las rutas generadas."""
    output.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, builder in MIDI_BUILDERS.items():
        target = output / name
        builder().save(target)
        written.append(target)
    for name, builder in BYTE_BUILDERS.items():
        target = output / name
        target.write_bytes(builder())
        written.append(target)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    for path in build_fixtures(args.output):
        print(f"escrito: {path}")


if __name__ == "__main__":
    main()
