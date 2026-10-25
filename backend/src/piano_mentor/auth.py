# description: Validación de id_token de Google y token propio del backend (U-005).
# context: El frontend entrega la identidad en el header Authorization
# (`Bearer <token>`). Hay dos vías: el id_token de Google se valida contra
# sus JWKS (firma RS256, iss, exp) y el token del login con contraseña es un
# JWT propio HS256 con AUTH_SECRET (se emite en POST /auth/login). La suite
# normal de pytest nunca toca red: los tests sustituyen el client de JWKS
# por uno local y firmar cuando hace falta.

"""Identidad del backend: id_token de Google y token propio del login (U-005)."""

from __future__ import annotations

import time
from typing import Any

import jwt

from .config import settings

GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# Token propio del login con contraseña (U-005).
PM_TOKEN_ALGORITHM = "HS256"
PM_TOKEN_ISSUER = "piano-mentor"
PM_TOKEN_TTL_S = 12 * 3600  # media vida de sesión; renovable re-entrando


class AuthTokenError(Exception):
    """El id_token no es válido o no hay configuración para validarlo."""

    code = "auth_invalid_token"


class AuthNotConfiguredError(AuthTokenError):
    """Falta `GOOGLE_CLIENT_ID`: no se puede validar el `aud` del token."""

    code = "auth_not_configured"


def _jwks_client(cache_keys: bool = True) -> jwt.PyJWKClient:
    """Crea el client de JWKS. Punto único de inyección para los tests."""
    return jwt.PyJWKClient(JWKS_URL, cache_keys=cache_keys)


def verify_google_id_token(token: str) -> dict[str, Any]:
    """Valida un id_token de Google y devuelve las claims de identidad (U-005).

    Comprueba firma (RS256 con los JWKS de Google), emisor, vigencia y que
    `aud` sea el Client ID del proyecto. Requiere `GOOGLE_CLIENT_ID`
    configurado; sin él se rechaza con `auth_not_configured`.

    Devuelve las claims del payload: `sub` es el identificador estable del
    usuario en Google y con `email`, `name` y `picture` si el scope los da.

    Raises:
        AuthTokenError: token malformado, expirado, firma o emisor inválidos.
        AuthNotConfiguredError: backend sin `GOOGLE_CLIENT_ID`.
    """
    if not settings.google_client_id:
        raise AuthNotConfiguredError(
            "El backend no tiene GOOGLE_CLIENT_ID configurado; no puede validar tokens"
        )

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            options={"require": ["exp", "iss"]},
        )
    except jwt.PyJWKClientError as exc:
        raise AuthTokenError(f"No se pudo validar la firma del id_token: {exc}") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthTokenError(f"Claims del id_token inválidas: {exc}") from exc

    iss = claims.get("iss")
    if iss not in GOOGLE_ISSUERS:
        raise AuthTokenError("El emisor del id_token no es Google")

    return claims


class AuthSecretMissingError(AuthTokenError):
    """Falta `AUTH_SECRET`: no hay secreto para firmar/validar tokens propios."""

    code = "auth_not_configured"


def create_pm_token(google_sub: str) -> str:
    """Emite el JWT propio del backend tras un login con contraseña (U-005).

    `sub` es el identificador del usuario (`google_sub` real o el centinela
    `manual:<email>`) y coincide con lo que el backend guarda en `owner_id`.
    """
    if not settings.auth_secret:
        raise AuthSecretMissingError("Falta AUTH_SECRET para firmar el token del login")
    now = int(time.time())
    return jwt.encode(
        {"iss": PM_TOKEN_ISSUER, "sub": google_sub, "iat": now, "exp": now + PM_TOKEN_TTL_S},
        settings.auth_secret,
        algorithm=PM_TOKEN_ALGORITHM,
    )


def verify_pm_token(token: str) -> dict[str, Any] | None:
    """Valida el token propio del backend; None si no es de esta casa (U-005).

    Solo devuelve claims cuando el token es un JWT HS256 firmado con
    AUTH_SECRET, vigente y emitido por el backend; un id_token de Google
    (RS256, sin ser HS256) devuelve None para que se valide por la vía Google.
    """
    if not settings.auth_secret:
        return None
    try:
        return jwt.decode(
            token,
            settings.auth_secret,
            algorithms=[PM_TOKEN_ALGORITHM],
            issuer=PM_TOKEN_ISSUER,
            options={"require": ["exp", "sub"]},
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError):
        return None
