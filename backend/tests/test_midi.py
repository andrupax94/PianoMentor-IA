# description: MIDI válido, inválido y normalización básica.
# context: Confianza en el parsing.

from piano_mentor.midi import MidiService


def test_midi_service_starts_with_empty_normalized_output() -> None:
    assert MidiService().normalize(None) == []
