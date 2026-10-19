# description: Etiquetado de manos por pista del motor MIDI (B-009.2).
# context: Confianza en que la mano sale de la altura de la pista, no del orden ni del canal.

"""Tests de la estrategia de pistas y el etiquetado de manos."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

import pytest

from piano_mentor.midi import (
    HAND_LEFT,
    HAND_RIGHT,
    HAND_UNKNOWN,
    MidiService,
    NormalizedNote,
    describe_tracks,
    hand_by_track,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"
REPO_ROOT = Path(__file__).parent.parent.parent


def fixture(name: str) -> Path:
    return FIXTURES_DIR / name


@cache
def corpus_pieces() -> tuple[tuple[str, Path], ...]:
    """Piezas del catálogo en orden: (id, ruta del MIDI)."""
    catalog = json.loads((REPO_ROOT / "data" / "midi" / "catalog.json").read_text(encoding="utf-8"))
    entries = catalog["pieces"] if isinstance(catalog, dict) else catalog
    return tuple((entry["id"], REPO_ROOT / "data" / "midi" / entry["file"]) for entry in entries)


@cache
def corpus_notes(piece_id: str) -> tuple[NormalizedNote, ...]:
    """Notas normalizadas de una pieza del corpus (en caché: los tests del corpus son baratos)."""
    path = dict(corpus_pieces())[piece_id]
    return tuple(MidiService().normalize(path))


# p16 es la pieza de práctica propia (B-012.1). Las propiedades del repertorio de
# Mutopia se comprueban solo sobre las 16 piezas de terceros: la nuestra es un
# ejercicio corto con las manos separadas a propósito (izquierda <= 55, derecha
# >= 67), así que sus rangos no se pisan y no representa al repertorio real.
OWN_PIECE_IDS = frozenset({"p16"})


def third_party_pieces() -> tuple[tuple[str, Path], ...]:
    return tuple(piece for piece in corpus_pieces() if piece[0] not in OWN_PIECE_IDS)


def note(pitch: int, *, track: int, channel: int = 0) -> NormalizedNote:
    """Nota normalizada de laboratorio: solo importa su altura y su pista."""
    return NormalizedNote(
        pitch=pitch,
        start_seconds=0.0,
        duration_seconds=0.5,
        velocity=64,
        channel=channel,
        track=track,
    )


def test_hand_by_track_of_no_notes_is_empty() -> None:
    assert hand_by_track([]) == {}


def test_hand_by_track_of_a_single_track_is_unknown() -> None:
    # Con una sola pista no hay contra qué compararla: no se inventa la mano.
    assert hand_by_track([note(60, track=1), note(64, track=1)]) == {1: HAND_UNKNOWN}


def test_hand_by_track_labels_the_lowest_track_as_left() -> None:
    notes = [note(72, track=1), note(76, track=1), note(36, track=2)]
    assert hand_by_track(notes) == {1: HAND_RIGHT, 2: HAND_LEFT}


def test_hand_by_track_follows_the_height_and_not_the_track_order() -> None:
    # Mismo caso que p02 del corpus: las pistas vienen al revés y aun así acierta.
    notes = [note(36, track=1), note(72, track=2), note(76, track=2)]
    assert hand_by_track(notes) == {1: HAND_LEFT, 2: HAND_RIGHT}


def test_hand_by_track_with_equal_medians_is_ambiguous() -> None:
    notes = [note(60, track=1), note(62, track=1), note(60, track=2), note(62, track=2)]
    assert hand_by_track(notes) == {1: HAND_UNKNOWN, 2: HAND_UNKNOWN}


def test_hand_by_track_with_three_tracks_labels_only_the_extremes() -> None:
    notes = [note(60, track=1), note(72, track=2), note(48, track=3)]
    assert hand_by_track(notes) == {1: HAND_UNKNOWN, 2: HAND_RIGHT, 3: HAND_LEFT}


def test_hand_by_track_is_order_independent() -> None:
    notes = [note(72, track=1), note(36, track=2), note(76, track=1)]
    assert hand_by_track(list(reversed(notes))) == hand_by_track(notes)


def test_hand_by_track_on_the_multi_track_fixture() -> None:
    notes = MidiService().normalize(fixture("multi_track.mid"))
    # La pista 0 solo trae metadatos: no aparece en el etiquetado.
    assert hand_by_track(notes) == {1: HAND_RIGHT, 2: HAND_LEFT}


def test_hand_by_track_on_the_mixed_problems_fixture() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    # El canal no decide la mano (izquierda usa el 9 y derecha el 0 aquí, pero la regla mira alturas).
    assert hand_by_track(notes) == {1: HAND_RIGHT, 2: HAND_LEFT}


def test_normalize_still_merges_every_track_by_default() -> None:
    # La decisión de B-009.2 es merge: la reproducción recibe una sola lista y no cambia.
    notes = MidiService().normalize(fixture("multi_track.mid"))
    assert len(notes) == 3
    assert [n.pitch for n in notes] == [36, 72, 74]
    assert [n.track for n in notes] == [2, 1, 1]


def test_describe_tracks_summarises_each_track() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    tracks = describe_tracks(notes)
    assert [info.track for info in tracks] == [1, 2]
    assert [info.hand for info in tracks] == [HAND_RIGHT, HAND_LEFT]
    assert [info.note_count for info in tracks] == [5, 2]
    assert [list(info.channels) for info in tracks] == [[0], [9]]
    assert [(info.lowest_pitch, info.highest_pitch) for info in tracks] == [(72, 84), (36, 43)]
    assert [info.median_pitch for info in tracks] == pytest.approx([79, 39.5])


def test_describe_tracks_matches_hand_by_track_on_the_corpus() -> None:
    for piece_id, _ in corpus_pieces():
        notes = corpus_notes(piece_id)
        hands = hand_by_track(notes)
        assert {info.track: info.hand for info in describe_tracks(notes)} == hands


def test_third_party_pieces_have_one_hand_per_track() -> None:
    assert len(third_party_pieces()) == 16
    for piece_id, _ in third_party_pieces():
        tracks = describe_tracks(corpus_notes(piece_id))
        # La pista 0 es de metadatos: solo las pistas con notas llegan hasta aquí.
        assert [info.track for info in tracks] == [1, 2]
        assert sorted(info.hand for info in tracks) == [HAND_LEFT, HAND_RIGHT]
        left = next(info for info in tracks if info.hand == HAND_LEFT)
        right = next(info for info in tracks if info.hand == HAND_RIGHT)
        assert left.median_pitch < right.median_pitch
        assert left.lowest_pitch < right.lowest_pitch


def test_corpus_track_order_does_not_decide_the_hand() -> None:
    # p01 y p02 son los dos casos que descartan "la primera pista es la derecha".
    assert hand_by_track(corpus_notes("p01")) == {1: HAND_RIGHT, 2: HAND_LEFT}
    assert hand_by_track(corpus_notes("p02")) == {1: HAND_LEFT, 2: HAND_RIGHT}


def test_corpus_hand_ranges_overlap() -> None:
    # Por qué la mano se decide por pista y no nota a nota: en el repertorio real
    # los rangos se pisan (la nuestra, p16, no cuenta: es un ejercicio sintético).
    for piece_id, _ in third_party_pieces():
        tracks = describe_tracks(corpus_notes(piece_id))
        overlap = min(info.highest_pitch for info in tracks) - max(
            info.lowest_pitch for info in tracks
        )
        assert overlap > 0, piece_id
