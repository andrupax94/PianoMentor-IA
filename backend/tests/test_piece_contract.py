"""Tests del contrato de piezas MIDI (B-002.1)."""

from piano_mentor.schemas import PieceMetadata, PieceResponse


def test_piece_response_minimal() -> None:
    piece = PieceResponse(
        id="abc123",
        filename="test.mid",
        stored_filename="stored.mid",
        size_bytes=1024,
        extension=".mid",
    )
    assert piece.id == "abc123"
    assert piece.filename == "test.mid"
    assert piece.status == "uploaded"
    assert piece.metadata.tracks is None


def test_piece_response_with_metadata() -> None:
    piece = PieceResponse(
        id="def456",
        filename="song.midi",
        stored_filename="stored.midi",
        size_bytes=2048,
        extension=".midi",
        metadata=PieceMetadata(tracks=2, duration_seconds=120.5, tempo=120.0, notes_count=100),
    )
    assert piece.metadata.tracks == 2
    assert piece.metadata.duration_seconds == 120.5
    assert piece.metadata.tempo == 120.0
    assert piece.metadata.notes_count == 100


def test_piece_response_serialization() -> None:
    piece = PieceResponse(
        id="ghi789",
        filename="test.mid",
        stored_filename="stored.mid",
        size_bytes=512,
        extension=".mid",
    )
    data = piece.model_dump()
    assert data["id"] == "ghi789"
    assert data["status"] == "uploaded"
    assert "metadata" in data
