# description: Hash de contraseñas y color de burbuja (U-005).
# context: Suite hermética: solo hashlib/secrets, sin red ni dependencias nuevas.

"""Tests del hash de contraseñas y del color del avatar (U-005)."""

from __future__ import annotations

import re

from piano_mentor.passwords import (
    PBKDF2_ALGORITHM,
    PBKDF2_ITERATIONS,
    hash_password,
    random_bubble_color,
    verify_password,
)

HASH_RE = re.compile(
    rf"^{PBKDF2_ALGORITHM}\$\d+\$[0-9a-f]{{32}}\$[0-9a-f]{{64}}$"
)
COLOR_RE = re.compile("^#[0-9a-f]{6}$")


def test_hash_formato_con_sal_y_hash_hex() -> None:
    stored = hash_password("152930")
    assert HASH_RE.match(stored)
    # Iteración, sal y hash en una sola cadena, a lo Django.
    assert stored.split("$")[1] == str(PBKDF2_ITERATIONS)


def test_hashes_distintos_con_la_misma_contrasena() -> None:
    # Cada hash lleva su propia sal: dos iguales nunca comparten cadena.
    first = hash_password("152930")
    second = hash_password("152930")
    assert first != second
    assert verify_password("152930", first)
    assert verify_password("152930", second)


def test_verificacion_rechaza_contrasena_erronea() -> None:
    stored = hash_password("152930")
    assert not verify_password("152931", stored)


def test_verificacion_rechaza_sin_hash_o_sin_contrasena() -> None:
    # Usuario de Google sin contraseña asignada o petición sin contraseña:
    # nunca hay caso True salvo coincidencia explícita.
    assert not verify_password("152930", None)
    assert not verify_password("", hash_password("152930"))
    assert not verify_password("152930", "cadena-que-no-es-un-hash")


def test_color_de_burbuja_valido_y_variado() -> None:
    colors = {random_bubble_color() for _ in range(50)}
    for color in colors:
        assert COLOR_RE.match(color)
        assert int(color[1:3], 16) < 255  # luminosidad contenida por la s y l fijas
    assert len(colors) > 5  # con 50 tiradas, repite poco y varía mucho
