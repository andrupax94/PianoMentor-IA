# description: MIDI válido, inválido y normalización básica.
# context: Confianza en el parsing.

import dataclasses
from pathlib import Path

import mido
import pytest

from piano_mentor.midi import (
    DEFAULT_BPM,
    MidiParseError,
    MidiService,
    NormalizedNote,
    TempoMap,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"


def fixture(name: str) -> Path:
    return FIXTURES_DIR / name


def test_midi_service_starts_with_empty_normalized_output() -> None:
    assert MidiService().normalize(None) == []


def test_inspect_file_reads_single_track_fixture() -> None:
    result = MidiService().inspect_file(fixture("single_track.mid"))
    assert result["tracks"] == 1
    assert result["tempo"] == 120.0
    assert result["notes_count"] == 2
    assert result["duration_seconds"] == pytest.approx(1.0)
    assert result["channels"] == [0]


def test_inspect_file_reports_real_track_count() -> None:
    result = MidiService().inspect_file(fixture("multi_track.mid"))
    assert result["tracks"] == 3
    assert result["notes_count"] == 3
    assert result["channels"] == [0, 9]


def test_inspect_file_uses_initial_tempo_on_tempo_change() -> None:
    result = MidiService().inspect_file(fixture("tempo_change.mid"))
    assert result["tempo"] == 120.0
    assert result["notes_count"] == 2
    assert result["duration_seconds"] == pytest.approx(1.5)


def test_inspect_file_defaults_to_120_bpm_without_set_tempo() -> None:
    result = MidiService().inspect_file(fixture("no_tempo.mid"))
    assert result["tempo"] == DEFAULT_BPM
    assert result["notes_count"] == 1


def test_inspect_file_rejects_corrupt_content_with_stable_code() -> None:
    with pytest.raises(MidiParseError) as exc_info:
        MidiService().inspect_file(fixture("corrupt.mid"))
    assert exc_info.value.code == "invalid_midi_content"


def test_inspect_file_rejects_missing_file_with_stable_code(tmp_path: Path) -> None:
    with pytest.raises(MidiParseError) as exc_info:
        MidiService().inspect_file(tmp_path / "no_existe.mid")
    assert exc_info.value.code == "midi_file_not_found"


def test_inspect_file_is_deterministic() -> None:
    service = MidiService()
    path = fixture("multi_track.mid")
    assert service.inspect_file(path) == service.inspect_file(path)


def test_tempo_map_converts_ticks_with_constant_tempo() -> None:
    tempo_map = MidiService().tempo_map(fixture("single_track.mid"))
    assert tempo_map.ticks_per_beat == 480
    assert tempo_map.initial_tempo() == 120.0
    assert tempo_map.tick_to_seconds(480) == pytest.approx(0.5)
    assert tempo_map.tick_to_seconds(960) == pytest.approx(1.0)


def test_tempo_map_displaces_ticks_after_tempo_change() -> None:
    tempo_map = MidiService().tempo_map(fixture("tempo_change.mid"))
    # Antes del cambio (120 BPM): 480 ticks = 0.5 s.
    assert tempo_map.tick_to_seconds(480) == pytest.approx(0.5)
    # Después del cambio (60 BPM): otros 480 ticks = 1.0 s más.
    assert tempo_map.tick_to_seconds(960) == pytest.approx(1.5)


def test_tempo_map_defaults_to_120_bpm_without_set_tempo() -> None:
    tempo_map = MidiService().tempo_map(fixture("no_tempo.mid"))
    assert tempo_map.initial_tempo() == DEFAULT_BPM
    assert tempo_map.tick_to_seconds(480) == pytest.approx(0.5)


def test_tempo_map_treats_negative_tick_as_start() -> None:
    tempo_map = MidiService().tempo_map(fixture("single_track.mid"))
    assert tempo_map.tick_to_seconds(-100) == tempo_map.tick_to_seconds(0)


def test_tempo_map_is_immutable_and_deterministic() -> None:
    service = MidiService()
    path = fixture("tempo_change.mid")
    first = service.tempo_map(path)
    with pytest.raises(dataclasses.FrozenInstanceError):
        first.ticks_per_beat = 960  # type: ignore[misc]
    assert first == service.tempo_map(path)
    assert first.tick_to_seconds(960) == service.tempo_map(path).tick_to_seconds(960)


def test_tempo_map_rejects_empty_changes() -> None:
    with pytest.raises(ValueError):
        TempoMap(ticks_per_beat=480, changes=())


def test_normalize_keeps_placeholder_for_invalid_source() -> None:
    assert MidiService().normalize(None) == []


def test_normalize_produces_note_with_pitch_start_duration_velocity_channel_track() -> None:
    notes = MidiService().normalize(fixture("single_track.mid"))
    assert len(notes) == 2
    first = notes[0]
    assert isinstance(first, NormalizedNote)
    assert first.pitch == 60
    assert first.start_seconds == pytest.approx(0.0)
    assert first.duration_seconds == pytest.approx(0.5)
    assert first.velocity == 64
    assert first.channel == 0
    assert first.track == 0


def test_normalize_separates_chord_notes() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    chord = [n for n in notes if n.start_seconds == pytest.approx(0.0) and n.channel == 0]
    assert sorted(n.pitch for n in chord) == [72, 76, 79]
    # Cada nota del acorde conserva su propio instante y duración.
    assert all(n.duration_seconds == pytest.approx(0.5) for n in chord)


def test_normalize_sorts_stably_by_start_pitch_channel_track() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    keys = [(n.start_seconds, n.pitch, n.channel, n.track) for n in notes]
    assert keys == sorted(keys)
    # El mismo archivo produce siempre la misma lista (determinismo).
    assert notes == MidiService().normalize(fixture("mixed_problems.mid"))


def test_normalize_cuts_unclosed_note_at_piece_end() -> None:
    notes = MidiService().normalize(fixture("unclosed_note.mid"))
    assert len(notes) == 2
    closed = next(n for n in notes if n.pitch == 60)
    unclosed = next(n for n in notes if n.pitch == 62)
    assert closed.duration_seconds == pytest.approx(0.5)
    # La nota sin note_off se corta al final de la pieza, no se descarta ni lanza error.
    assert unclosed.start_seconds == pytest.approx(0.25)
    assert unclosed.duration_seconds == pytest.approx(0.25)


def test_normalize_uses_tempo_map_across_tempo_change() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    # note 81 cruza el cambio de tempo: 480 ticks a 120 BPM -> 480 ticks a 60 BPM.
    crossing = next(n for n in notes if n.pitch == 81)
    assert crossing.start_seconds == pytest.approx(0.5)
    assert crossing.duration_seconds == pytest.approx(1.0)


def test_normalize_handles_two_channels_as_two_hands() -> None:
    notes = MidiService().normalize(fixture("mixed_problems.mid"))
    channels = {n.channel for n in notes}
    assert channels == {0, 9}
    left = [n for n in notes if n.channel == 9]
    right = [n for n in notes if n.channel == 0]
    assert len(left) == 2
    assert len(right) == 5
    # Cada mano conserva su pista de origen.
    assert {n.track for n in left} == {2}
    assert {n.track for n in right} == {1}


def test_normalize_rejects_corrupt_content_with_stable_code() -> None:
    with pytest.raises(MidiParseError) as exc_info:
        MidiService().normalize(fixture("corrupt.mid"))
    assert exc_info.value.code == "invalid_midi_content"


def test_tempo_map_uses_default_before_first_declared_tempo() -> None:
    """Un set_tempo tardío no cambia el tempo inicial: antes de él rige 120 BPM."""
    midi = mido.MidiFile(type=1, ticks_per_beat=480)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=1_000_000, time=480))
    track.append(mido.MetaMessage("end_of_track", time=0))

    tempo_map = TempoMap.build(midi)
    assert tempo_map.initial_tempo() == DEFAULT_BPM
    assert tempo_map.tick_to_seconds(480) == pytest.approx(0.5)
    assert tempo_map.tick_to_seconds(960) == pytest.approx(1.5)
