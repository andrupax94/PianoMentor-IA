# description: Agrupación de notas simultáneas en acordes (B-009.1).
# context: Confianza en que un acorde conserva cada nota y en que un arpegio no se agrupa.

"""Tests del agrupado por acordes del motor MIDI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from piano_mentor.midi import (
    CHORD_TOLERANCE_SECONDS,
    Chord,
    MidiService,
    NormalizedNote,
    group_chords,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"
REPO_ROOT = Path(__file__).parent.parent.parent


def fixture(name: str) -> Path:
    return FIXTURES_DIR / name


def note(
    pitch: int,
    start: float,
    *,
    channel: int = 0,
    track: int = 0,
    velocity: int = 64,
    duration: float = 0.5,
) -> NormalizedNote:
    """Nota normalizada de laboratorio: solo cambia lo que prueba cada test."""
    return NormalizedNote(
        pitch=pitch,
        start_seconds=start,
        duration_seconds=duration,
        velocity=velocity,
        channel=channel,
        track=track,
    )


def corpus_piece(piece_id: str) -> Path:
    """Ruta del MIDI de una pieza del catálogo, sin escribir a mano el nombre del archivo."""
    catalog = json.loads((REPO_ROOT / "data" / "midi" / "catalog.json").read_text(encoding="utf-8"))
    entries = catalog["pieces"] if isinstance(catalog, dict) else catalog
    entry = next(item for item in entries if item["id"] == piece_id)
    return REPO_ROOT / "data" / "midi" / entry["file"]


def test_group_chords_of_no_notes_is_empty() -> None:
    assert group_chords([]) == ()


def test_chord_rejects_an_empty_group() -> None:
    with pytest.raises(ValueError):
        Chord(start_seconds=0.0, notes=())


def test_group_chords_joins_notes_that_start_together() -> None:
    chords = group_chords([note(72, 1.0), note(76, 1.0), note(79, 1.0)])
    assert len(chords) == 1
    assert chords[0].size == 3
    assert chords[0].pitches == (72, 76, 79)
    assert chords[0].start_seconds == pytest.approx(1.0)


def test_group_chords_keeps_each_note_detail() -> None:
    chords = group_chords(
        [
            note(36, 0.0, channel=9, track=2, velocity=70),
            note(72, 0.0, channel=0, track=1, velocity=80),
        ]
    )
    assert len(chords) == 1
    lowest, highest = chords[0].notes
    # El acorde cruza canales y pistas: cada nota conserva los suyos.
    assert (lowest.pitch, lowest.channel, lowest.track, lowest.velocity) == (36, 9, 2, 70)
    assert (highest.pitch, highest.channel, highest.track, highest.velocity) == (72, 0, 1, 80)


def test_group_chords_orders_notes_from_low_to_high() -> None:
    chords = group_chords([note(79, 0.0), note(72, 0.0), note(76, 0.0)])
    assert chords[0].pitches == (72, 76, 79)
    assert [n.pitch for n in chords[0].notes] == [72, 76, 79]


def test_group_chords_does_not_join_an_arpeggio() -> None:
    chords = group_chords([note(60, 0.0), note(64, 0.02), note(67, 0.04)])
    assert [chord.size for chord in chords] == [1, 1, 1]
    assert [chord.start_seconds for chord in chords] == pytest.approx([0.0, 0.02, 0.04])


def test_group_chords_joins_at_the_tolerance_edge_and_splits_just_past_it() -> None:
    inside = group_chords([note(60, 0.0), note(64, CHORD_TOLERANCE_SECONDS)])
    outside = group_chords([note(60, 0.0), note(64, CHORD_TOLERANCE_SECONDS + 0.001)])
    assert inside[0].size == 2
    assert [chord.size for chord in outside] == [1, 1]


def test_group_chords_uses_a_configurable_tolerance() -> None:
    notes = [note(60, 0.0), note(64, 0.001)]
    assert len(group_chords(notes, tolerance_seconds=0.0)) == 2
    assert len(group_chords(notes, tolerance_seconds=0.01)) == 1


def test_group_chords_anchors_on_the_earliest_start() -> None:
    chords = group_chords([note(60, 0.0), note(64, 0.005)], tolerance_seconds=0.01)
    assert chords[0].start_seconds == pytest.approx(0.0)


def test_group_chords_is_deterministic_and_order_independent() -> None:
    notes = [note(60, 0.0), note(64, 0.0), note(67, 0.5), note(72, 0.5)]
    expected = group_chords(notes)
    assert group_chords(list(reversed(notes))) == expected
    assert group_chords(notes) == expected


def test_group_chords_rejects_a_negative_tolerance() -> None:
    with pytest.raises(ValueError):
        group_chords([note(60, 0.0)], tolerance_seconds=-0.001)


def test_group_chords_on_the_chord_fixture_keeps_a_single_note_alone() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    chords = group_chords(notes)
    # Acorde de tres notas de la mano derecha más el bajo de la izquierda, que empieza a la vez.
    assert len(chords) == 4
    assert chords[0].start_seconds == pytest.approx(0.0)
    assert chords[0].pitches == (36, 72, 76, 79)
    assert [chord.size for chord in chords[1:]] == [1, 1, 1]
    assert [chord.start_seconds for chord in chords[1:]] == pytest.approx([0.5, 1.0, 1.5])


def test_group_chords_on_a_piece_without_chords_returns_single_notes() -> None:
    notes = MidiService().normalize(fixture("single_track.mid"))
    chords = group_chords(notes)
    assert [chord.size for chord in chords] == [1, 1]


def test_group_chords_covers_every_note_of_the_corpus() -> None:
    service = MidiService()
    for piece_id in ("p02", "p10", "p15"):
        notes = service.normalize(corpus_piece(piece_id))
        chords = group_chords(notes)
        # Ninguna nota se pierde ni se duplica al agrupar.
        assert sum(chord.size for chord in chords) == len(notes)
        assert [chord.start_seconds for chord in chords] == sorted(chord.start_seconds for chord in chords)


def test_group_chords_finds_the_biggest_chord_of_the_corpus() -> None:
    notes = MidiService().normalize(corpus_piece("p15"))
    chords = group_chords(notes)
    assert max(chord.size for chord in chords) == 9
