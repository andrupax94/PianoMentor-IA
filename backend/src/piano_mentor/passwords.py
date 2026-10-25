# description: Contraseña unidireccional (PBKDF2-SHA256 con sal) y color de burbuja (U-005).
# context: El registro simple queda de lado, pero la verificación de contraseña
# para el login simple ya vive aquí. Solo la biblioteca estándar (hashlib,
# secrets, colorsys): sin dependencias nuevas. El hash se guarda en una sola
# cadena con sus parámetros (formato `pbkdf2_sha256$iteraciones$sal$hash`),
# igual que en Django, por lo que las iteraciones pueden subir sin migración.

"""Hash de contraseñas y color aleatorio del avatar (U-005)."""

from __future__ import annotations

import colorsys
import hashlib
import hmac
import secrets

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
_SALT_BYTES = 16

BUBBLE_COLOR_FORMAT = "#rrggbb"


def hash_password(password: str) -> str:
    """Genera el hash unidireccional de una contraseña (U-005).

    PBKDF2-SHA256 con sal aleatoria de 16 bytes y {PBKDF2_ITERATIONS}
    iteraciones; la sal va incrustada en la propia cadena del hash.
    """
    if not password:
        raise ValueError("La contraseña no puede estar vacía")
    salt = secrets.token_hex(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), PBKDF2_ITERATIONS
    )
    return f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Comprueba una contraseña contra su hash almacenado (U-005).

    Sin hash almacenado (usuario que solo entra con Google) es False:
    la respuesta de login es siempre la misma combinación errónea.
    """
    if not stored or not password:
        return False
    try:
        algorithm, iterations, salt, digest_hex = stored.split("$", 3)
    except ValueError:
        return False
    if algorithm != PBKDF2_ALGORITHM or not iterations.isdigit():
        return False
    computed = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), int(iterations)
    )
    return hmac.compare_digest(computed.hex(), digest_hex)


def random_bubble_color() -> str:
    """Color aleatorio para la burbuja del usuario (U-005).

    HUE aleatorio con saturación y luminosidad fijas, de modo que el
    contraste con la inicial blanca se lea siempre bien. Formato #rrggbb
    para que la UI lo pinte tal cual en CSS.
    """
    hue = secrets.randbelow(360)
    red, green, blue = colorsys.hls_to_rgb(hue / 360.0, 0.46, 0.62)
    return f"#{int(red * 255):02x}{int(green * 255):02x}{int(blue * 255):02x}"
