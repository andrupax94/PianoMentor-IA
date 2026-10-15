# description: Rejilla de compases: firmas, tempo y consultas por instante.
# context: Confianza en el cálculo de compases de B-008.1.

import dataclasses
from pathlib import Path

import mido
import pytest

from piano_mentor.midi import MeasureGrid, MidiParseError, MidiService, TempoMap

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"


def fixture(name: str) -> Path:
    return FIXTURES_DIR / name


def build_midi(
    end_tick: int,
    *,
    ticks_per_beat: int = 480,
    time_signatures: tuple[tuple[int, int, int], ...] = (),
    tempo_changes: tuple[tuple[int, int], ...] = (),
) -> mido.MidiFile:
    """MIDI mínimo en memoria: metadatos pedidos y una nota que marca el tick final."""
    specs: list[tuple[int, int, str, dict[str, int]]] = []
    for tick, tempo in tempo_changes:
        specs.append((tick, 0, "set_tempo", {"tempo": tempo}))
    for tick, numerator, denominator in time_signatures:
        payload = {"numerator": numerator, "denominator": denominator}
        specs.append((tick, 0, "time_signature", payload))
    specs.append((0, 1, "note_on", {"note": 60, "velocity": 64, "channel": 0}))
    specs.append((end_tick, 1, "note_off", {"note": 60, "velocity": 0, "channel": 0}))
    specs.sort(key=lambda spec: (spec[0], spec[1]))

    midi = mido.MidiFile(type=1, ticks_per_beat=ticks_per_beat)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    previous_tick = 0
    for tick, _priority, kind, payload in specs:
        if kind in {"set_tempo", "time_signature"}:
            track.append(mido.MetaMessage(kind, time=tick - previous_tick, **payload))
        else:
            track.append(mido.Message(kind, time=tick - previous_tick, **payload))
        previous_tick = tick
    track.append(mido.MetaMessage("end_of_track", time=0))
    return midi


def grid_of(midi: mido.MidiFile) -> MeasureGrid:
    return MeasureGrid.build(midi, TempoMap.build(midi))


def test_service_measure_grid_defaults_to_four_four() -> None:
    grid = MidiService().measure_grid(fixture("single_track.mid"))
    assert grid.count == 1
    assert grid.signatures == ((4, 4),)
    assert grid.starts_s == (0.0,)
    assert grid.bounds_s(0) == (0.0, 1.0)


def test_service_measure_grid_rejects_unreadable_file() -> None:
    with pytest.raises(MidiParseError) as exc_info:
        MidiService().measure_grid(fixture("corrupt.mid"))
    assert exc_info.value.code == "invalid_midi_content"


def test_grid_counts_full_measures_and_closes_partial_at_piece_end() -> None:
    grid = grid_of(build_midi(end_tick=4 * 1920 + 960))
    assert grid.count == 5
    assert grid.starts_ticks == (0, 1920, 3840, 5760, 7680)
    assert grid.starts_s == pytest.approx((0.0, 2.0, 4.0, 6.0, 8.0))
    assert grid.bounds_s(4) == pytest.approx((8.0, 9.0))
    assert grid.end_seconds == pytest.approx(9.0)


def test_grid_measure_length_follows_signature() -> None:
    # 6/8 con resolución 480: 6 × (480 × 4 / 8) = 1440 ticks = 1.5 s a 120 BPM.
    grid = grid_of(build_midi(end_tick=3 * 1440, time_signatures=((0, 6, 8),)))
    assert grid.count == 3
    assert grid.starts_s == pytest.approx((0.0, 1.5, 3.0))
    assert grid.bounds_s(2) == pytest.approx((3.0, 4.5))


def test_grid_applies_time_signature_change() -> None:
    # 3/4 durante tres compases y 4/4 desde el tick 4320.
    change = ((0, 3, 4), (4320, 4, 4))
    grid = grid_of(build_midi(end_tick=3 * 1440 + 2 * 1920, time_signatures=change))
    assert grid.count == 5
    assert grid.starts_ticks == (0, 1440, 2880, 4320, 6240)
    assert grid.starts_s == pytest.approx((0.0, 1.5, 3.0, 4.5, 6.5))
    assert grid.signatures == ((3, 4), (3, 4), (3, 4), (4, 4), (4, 4))


def test_grid_applies_signature_change_at_next_measure_boundary() -> None:
    # El cambio cae a mitad de compás (tick 1500): rige desde el compás que empieza en 2880.
    change = ((0, 3, 4), (1500, 4, 4))
    grid = grid_of(build_midi(end_tick=6720, time_signatures=change))
    assert grid.starts_ticks == (0, 1440, 2880, 4800)
    assert grid.signatures == ((3, 4), (3, 4), (4, 4), (4, 4))


def test_grid_seconds_follow_tempo_map_not_constant_bpm() -> None:
    # Cambio a 60 BPM en el tick 1920: con BPM constante los compases serían (0, 2, 4, 6).
    tempos = ((0, 500_000), (1920, 1_000_000))
    grid = grid_of(build_midi(end_tick=7680, tempo_changes=tempos))
    assert grid.count == 4
    assert grid.starts_s == pytest.approx((0.0, 2.0, 6.0, 10.0))
    assert grid.end_seconds == pytest.approx(14.0)


def test_grid_is_independent_of_tick_resolution() -> None:
    coarse = grid_of(build_midi(end_tick=2 * 384, ticks_per_beat=96))
    fine = grid_of(build_midi(end_tick=2 * 1920))
    assert coarse.count == fine.count == 2
    assert coarse.starts_s == fine.starts_s == (0.0, 2.0)
    assert coarse.end_seconds == fine.end_seconds == 4.0


def test_grid_measure_at_returns_containing_measure_on_boundaries() -> None:
    change = ((0, 3, 4), (4320, 4, 4))
    grid = grid_of(build_midi(end_tick=3 * 1440 + 2 * 1920, time_signatures=change))
    assert grid.measure_at(-1.0) == 0  # instantes negativos → compás 0
    assert grid.measure_at(1.499999) == 0
    assert grid.measure_at(1.5) == 1  # en el borde → el compás que empieza ahí
    assert grid.measure_at(4.5) == 3
    assert grid.measure_at(999.0) == grid.count - 1  # pasado el final → último compás


def test_grid_measure_at_rejects_empty_grid_with_stable_code() -> None:
    grid = grid_of(build_midi(end_tick=0))
    assert grid.count == 0
    with pytest.raises(MidiParseError) as exc_info:
        grid.measure_at(0.0)
    assert exc_info.value.code == "measure_grid_empty"


def test_grid_bounds_reject_out_of_range_measures() -> None:
    grid = grid_of(build_midi(end_tick=1920))
    with pytest.raises(IndexError):
        grid.bounds_s(-1)
    with pytest.raises(IndexError):
        grid.bounds_s(grid.count)


def test_grid_signature_at_returns_active_signature() -> None:
    change = ((0, 3, 4), (4320, 4, 4))
    grid = grid_of(build_midi(end_tick=3 * 1440 + 2 * 1920, time_signatures=change))
    assert grid.signature_at(0.0) == (3, 4)
    assert grid.signature_at(4.499999) == (3, 4)
    assert grid.signature_at(4.5) == (4, 4)


def test_grid_is_immutable_and_deterministic() -> None:
    service = MidiService()
    path = fixture("tempo_change.mid")
    first = service.measure_grid(path)
    with pytest.raises(dataclasses.FrozenInstanceError):
        first.ticks_per_beat = 960  # type: ignore[misc]
    assert first == service.measure_grid(path)
    assert first.starts_s == service.measure_grid(path).starts_s


def test_grid_rejects_invalid_time_signature_with_stable_code() -> None:
    with pytest.raises(MidiParseError) as exc_info:
        grid_of(build_midi(end_tick=10, time_signatures=((0, 0, 4),)))
    assert exc_info.value.code == "invalid_time_signature"


def test_grid_rejects_signature_that_does_not_fit_resolution() -> None:
    # Con 1 tick por pulso, la firma 1/64 no llega a ocupar un tick de compás.
    with pytest.raises(MidiParseError) as exc_info:
        grid_of(build_midi(end_tick=4, ticks_per_beat=1, time_signatures=((0, 1, 64),)))
    assert exc_info.value.code == "invalid_time_signature"
