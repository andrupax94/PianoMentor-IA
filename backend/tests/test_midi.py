# description: MIDI válido, inválido y normalización básica.
# context: Confianza en el parsing.

from pathlib import Path

import pytest

from piano_mentor.midi import DEFAULT_BPM, MidiParseError, MidiService

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
