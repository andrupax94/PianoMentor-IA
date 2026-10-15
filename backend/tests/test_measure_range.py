# description: Resolución de rango de compases a ventana temporal + endpoint measure.
# context: B-008.2 - resolve_measure_range real y parámetros from_measure/to_measure en /notes.

import io
from pathlib import Path

import mido
import pytest
from fastapi.testclient import TestClient

from piano_mentor import api
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db, insert_piece
from piano_mentor.main import app
from piano_mentor.midi import (
    MeasureGrid,
    MidiParseError,
    MidiService,
    TempoMap,
)
from piano_mentor.storage import LocalPieceStorage

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
        specs.append((tick, 0, "time_signature", {"numerator": numerator, "denominator": denominator}))
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


def save_midi(midi: mido.MidiFile) -> bytes:
    """Guarda un MidiFile en bytes."""
    buf = io.BytesIO()
    midi.save(file=buf)
    return buf.getvalue()


def grid_of(midi: mido.MidiFile) -> MeasureGrid:
    return MeasureGrid.build(midi, TempoMap.build(midi))


def _insert_piece(piece_id: str, stored_filename: str, size_bytes: int) -> None:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        insert_piece(
            conn,
            {
                "id": piece_id,
                "filename": "test.mid",
                "stored_filename": stored_filename,
                "size_bytes": size_bytes,
                "extension": ".mid",
            },
        )
    finally:
        conn.close()


def test_measure_grid_resolve_range_basic() -> None:
    """Un rango [start_measure, end_measure] → [from_s, to_s] con bordes exactos."""
    grid = grid_of(build_midi(end_tick=4 * 1920))
    assert grid.count == 4
    window = grid.resolve_range(0, 2)
    assert window == pytest.approx((0.0, 4.0))
    window = grid.resolve_range(3, 4)
    assert window == pytest.approx((6.0, 8.0))
    window = grid.resolve_range(0, 4)
    assert window == pytest.approx((0.0, 8.0))


def test_measure_grid_resolve_range_with_tempo_change() -> None:
    """Ventana respeta TempoMap, no BPM constante."""
    tempos = ((0, 500_000), (1920, 1_000_000))
    grid = grid_of(build_midi(end_tick=7680, tempo_changes=tempos))
    assert grid.count == 4
    window = grid.resolve_range(0, 2)
    assert window == pytest.approx((0.0, 6.0))
    window = grid.resolve_range(2, 4)
    assert window == pytest.approx((6.0, 14.0))


def test_measure_grid_resolve_range_with_signature_change() -> None:
    """Ventana respeta cambio de firma."""
    change = ((0, 3, 4), (4320, 4, 4))
    grid = grid_of(build_midi(end_tick=3 * 1440 + 2 * 1920, time_signatures=change))
    window = grid.resolve_range(0, 3)
    assert window == pytest.approx((0.0, 4.5))
    window = grid.resolve_range(3, 5)
    assert window == pytest.approx((4.5, 8.5))


def test_measure_grid_resolve_range_rejects_invalid_ranges() -> None:
    grid = grid_of(build_midi(end_tick=4 * 1920))
    with pytest.raises(MidiParseError) as exc_info:
        grid.resolve_range(2, 1)
    assert exc_info.value.code == "invalid_measure_range"
    with pytest.raises(MidiParseError) as exc_info:
        grid.resolve_range(1, 1)
    assert exc_info.value.code == "invalid_measure_range"
    with pytest.raises(MidiParseError) as exc_info:
        grid.resolve_range(-1, 2)
    assert exc_info.value.code == "invalid_measure_range"
    with pytest.raises(MidiParseError) as exc_info:
        grid.resolve_range(0, 5)
    assert exc_info.value.code == "invalid_measure_range"


def test_midi_service_resolve_measure_range_via_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """resolve_measure_range resuelve rango de compases a ventana usando Path."""
    midi = build_midi(end_tick=4 * 1920)
    midi_bytes = save_midi(midi)

    monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))
    storage = LocalPieceStorage(tmp_path)
    stored_name = storage.save("test.mid", midi_bytes)
    midi_path = storage.get_path(stored_name)

    service = MidiService()
    result = service.resolve_measure_range(midi_path, 0, 2)
    assert result["piece_id"] == stored_name
    assert result["measure_range"] == [0, 2]
    assert result["window"] == pytest.approx((0.0, 4.0))
    assert result["total_measures"] == 4
    assert result["status"] == "resolved"

    # Rango inválido
    with pytest.raises(MidiParseError) as exc_info:
        service.resolve_measure_range(midi_path, 2, 1)
    assert exc_info.value.code == "invalid_measure_range"
    # Archivo inexistente
    with pytest.raises(MidiParseError) as exc_info:
        service.resolve_measure_range(tmp_path / "no_existe.mid", 0, 1)
    assert exc_info.value.code == "midi_file_not_found"


def test_notes_endpoint_accepts_from_measure_to_measure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /pieces/{id}/notes?from_measure=0&to_measure=2 devuelve notas de esos compases."""
    midi = build_midi(end_tick=4 * 1920)
    midi_bytes = save_midi(midi)

    isolated = LocalPieceStorage(tmp_path)
    monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))
    monkeypatch.setattr(api, "storage", isolated)
    stored_name = isolated.save("test.mid", midi_bytes)
    piece_id = "test-piece-" + stored_name[:8]
    _insert_piece(piece_id, stored_name, len(midi_bytes))

    client = TestClient(app)
    # Sin parámetros measure → todas las notas
    resp = client.get(f"/api/v1/pieces/{piece_id}/notes")
    assert resp.status_code == 200
    all_notes = resp.json()["notes"]
    assert len(all_notes) == 1  # MIDI tiene 1 nota larga que abarca todos los compases

    # Con from_measure=0, to_measure=2 → primeros 2 compases (la nota empieza en 0.0)
    resp = client.get(
        f"/api/v1/pieces/{piece_id}/notes", params={"from_measure": 0, "to_measure": 2}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["from_measure"] == 0
    assert data["to_measure"] == 2
    assert data["from_s"] == pytest.approx(0.0)
    assert data["to_s"] == pytest.approx(4.0)
    assert len(data["notes"]) == 1
    assert data["notes"][0]["start_seconds"] == pytest.approx(0.0)


def test_notes_endpoint_rejects_invalid_measure_params(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /pieces/{id}/notes con parámetros de compás inválidos → 400."""
    midi = build_midi(end_tick=4 * 1920)
    midi_bytes = save_midi(midi)

    isolated = LocalPieceStorage(tmp_path)
    monkeypatch.setattr(settings, "midi_storage_path", str(tmp_path))
    monkeypatch.setattr(api, "storage", isolated)
    stored_name = isolated.save("test.mid", midi_bytes)
    piece_id = "test-piece-" + stored_name[:8]
    _insert_piece(piece_id, stored_name, len(midi_bytes))

    client = TestClient(app)
    # from_measure > to_measure
    resp = client.get(
        f"/api/v1/pieces/{piece_id}/notes", params={"from_measure": 2, "to_measure": 1}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_measure_range"
    # to_measure > total
    resp = client.get(
        f"/api/v1/pieces/{piece_id}/notes", params={"from_measure": 0, "to_measure": 10}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_measure_range"
    # rango válido
    resp = client.get(
        f"/api/v1/pieces/{piece_id}/notes", params={"from_measure": 0, "to_measure": 1}
    )
    assert resp.status_code == 200


def test_notes_endpoint_piece_not_found() -> None:
    """GET /pieces/{id}/notes con piece_id inexistente → 404."""
    client = TestClient(app)
    resp = client.get("/api/v1/pieces/no-existe/notes?from_measure=0&to_measure=1")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "piece_not_found"