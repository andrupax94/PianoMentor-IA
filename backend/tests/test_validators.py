# description: Extensión, tamaño, nombre y contenido de uploads.
# context: Confianza en el rechazo de archivos malos.

"""Tests de validación y seguridad de cargas MIDI (B-002.3)."""

import pytest

from piano_mentor.validators import (
    MAX_FILE_SIZE,
    ValidationError,
    sanitize_filename,
    validate_content,
    validate_extension,
    validate_size,
)


class TestValidateExtension:
    def test_valid_mid(self) -> None:
        assert validate_extension("song.mid") == ".mid"

    def test_valid_midi(self) -> None:
        assert validate_extension("song.midi") == ".midi"

    def test_case_insensitive(self) -> None:
        assert validate_extension("song.MID") == ".mid"

    def test_invalid_extension(self) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_extension("song.mp3")
        assert exc.value.code == "invalid_extension"

    def test_no_extension(self) -> None:
        with pytest.raises(ValidationError):
            validate_extension("song")


class TestValidateSize:
    def test_valid_size(self) -> None:
        validate_size(1024)

    def test_empty_file(self) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_size(0)
        assert exc.value.code == "empty_file"

    def test_negative_size(self) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_size(-1)
        assert exc.value.code == "empty_file"

    def test_too_large(self) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_size(MAX_FILE_SIZE + 1)
        assert exc.value.code == "file_too_large"


class TestSanitizeFilename:
    def test_valid_name(self) -> None:
        assert sanitize_filename("song.mid") == "song.mid"

    def test_spaces_replaced(self) -> None:
        assert sanitize_filename("my song.mid") == "my_song.mid"

    def test_path_traversal_rejected(self) -> None:
        with pytest.raises(ValidationError) as exc:
            sanitize_filename("../etc/passwd")
        assert exc.value.code == "invalid_filename"

    def test_absolute_path_rejected(self) -> None:
        with pytest.raises(ValidationError):
            sanitize_filename("/etc/passwd")

    def test_special_chars_rejected(self) -> None:
        with pytest.raises(ValidationError):
            sanitize_filename("song<script>.mid")


class TestValidateContent:
    def test_valid_content(self) -> None:
        validate_content(b"fake midi")

    def test_empty_content(self) -> None:
        with pytest.raises(ValidationError) as exc:
            validate_content(b"")
        assert exc.value.code == "empty_file"
