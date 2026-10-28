# description: Registro abierto por pasos: alta, verificación y login (U-006).
# context: Suite hermética: el email de comprobación se sustituye por un stub
# que captura el enlace; sin red ni proveedor. La BD es temporal por test
# (isolated_database del conftest).

"""Tests del registro por pasos (U-006): POST /auth/register y GET /auth/verify."""

from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from piano_mentor import api, database
from piano_mentor.config import settings
from piano_mentor.database import connect, find_user_by_email, init_db
from piano_mentor.main import app
from piano_mentor.passwords import verify_password

client = TestClient(app)

VALID_PAYLOAD = {
    "email": "nueva@gmail.com",
    "password": "contrasena-larga-1234",
    "display_name": "Nueva",
    "level": "beginner",
}


@pytest.fixture(autouse=True)
def capture_emails(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """Captura los enlaces «enviados» y fija el secreto del token propio.

    El mailer real nunca toca red en la suite; el secreto habilita el JWT del
    login después de la verificación (mismo trato que test_auth).
    """
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(api, "send_verification_email", lambda to, link: sent.append((to, link)))
    monkeypatch.setattr(settings, "auth_secret", "test-auth-secret-0123456789abcdef-generada")
    return sent


def _token_from_link(link: str) -> str:
    """Extrae el token del enlace de verificación capturado."""
    match = re.search(r"token=([A-Za-z0-9_-]+)", link)
    assert match is not None, f"El enlace {link} no trae token"
    return match.group(1)


def test_el_enlace_de_verificacion_usa_api_public_cuando_existe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Producción: front y backend en dominios distintos (U-006)."""
    from piano_mentor.api import _verification_link

    monkeypatch.setattr(settings, "api_public_url", "https://api.pianomentoria.com")
    monkeypatch.setattr(settings, "app_public_url", "https://www.pianomentoria.com")
    link = _verification_link("t")
    assert link == "https://api.pianomentoria.com/api/v1/auth/verify?token=t"

    # Sin dominio de API, el desarrollo local apunta al front: mismo default.
    monkeypatch.setattr(settings, "api_public_url", "")
    assert _verification_link("t").startswith("https://www.pianomentoria.com/")


def test_register_crea_cuenta_inactiva_y_envia_email(
    capture_emails: list[tuple[str, str]],
) -> None:
    response = client.post("/api/v1/auth/register", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "verification_sent"
    assert data["email"] == VALID_PAYLOAD["email"]

    # Email capturado en el stub con el enlace del token.
    assert len(capture_emails) == 1
    to, link = capture_emails[0]
    assert to == VALID_PAYLOAD["email"]
    token = _token_from_link(link)
    assert link.startswith(settings.app_public_url.rstrip("/"))

    conn = connect(settings.database_url)
    try:
        init_db(conn)
        row = find_user_by_email(conn, VALID_PAYLOAD["email"])
    finally:
        conn.close()
    assert row is not None
    assert row["name"] == "Nueva"
    assert row["level"] == "beginner"
    assert row["genres"] is None
    assert row["email_verified"] == 0
    assert row["verification_token"] == token
    assert isinstance(row["bubble_color"], str) and re.match("^#[0-9a-f]{6}$", row["bubble_color"])
    assert verify_password(VALID_PAYLOAD["password"], row["password_hash"])


def test_register_rechaza_correo_ya_verificado() -> None:
    client.post("/api/v1/auth/register", json=VALID_PAYLOAD)
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        conn.execute(
            "UPDATE users SET email_verified = 1 WHERE lower(email) = lower(?)",
            (VALID_PAYLOAD["email"],),
        )
        conn.commit()
    finally:
        conn.close()

    again = client.post("/api/v1/auth/register", json=VALID_PAYLOAD)
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "auth_email_exists"


def test_register_reemite_token_con_datos_nuevos_en_pendiente() -> None:
    """El reenvío: mismo correo pendiente fuera de plazo → token fresco."""
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        database.create_pending_registration(
            conn,
            {
                "email": VALID_PAYLOAD["email"],
                "password_hash": "pbkdf2_sha256$1$sal$hash",
                "level": "intermediate",
                "verification_token": "token-antiguo",
                "verification_expires_at": "2000-01-01T00:00:00Z",
            },
        )
    finally:
        conn.close()

    fresh = {**VALID_PAYLOAD, "password": "otra-larga-987654", "level": "advanced"}
    response = client.post("/api/v1/auth/register", json=fresh)
    assert response.status_code == 200

    conn = connect(settings.database_url)
    try:
        init_db(conn)
        row = find_user_by_email(conn, VALID_PAYLOAD["email"])
    finally:
        conn.close()
    assert row is not None
    assert row["level"] == "advanced"
    assert row["email_verified"] == 0
    assert row["verification_token"] != "token-antiguo"  # el enlace viejo ya no abre
    assert verify_password(fresh["password"], row["password_hash"])


def test_login_de_pendiente_informa_verificacion() -> None:
    client.post("/api/v1/auth/register", json=VALID_PAYLOAD)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_email_unverified"
    assert "Verifica tu correo" in response.json()["detail"]["message"]


def test_verify_activa_y_login_funciona(capture_emails: list[tuple[str, str]]) -> None:
    client.post("/api/v1/auth/register", json=VALID_PAYLOAD)
    _, link = capture_emails[0]
    token = _token_from_link(link)

    activated = client.get(f"/api/v1/auth/verify?token={token}")
    assert activated.status_code == 200
    assert "Cuenta activada" in activated.text

    session = client.post(
        "/api/v1/auth/login",
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    assert session.status_code == 200
    assert session.json()["user"]["email"].lower() == VALID_PAYLOAD["email"]

    # El token se consume: un segundo intento con el mismo enlace falla.
    replay = client.get(f"/api/v1/auth/verify?token={token}")
    assert replay.status_code == 404


def test_verify_rechaza_token_inexistente_y_caducado() -> None:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        database.create_pending_registration(
            conn,
            {
                "email": "caducado@prueba.es",
                "password_hash": "pbkdf2_sha256$1$sal$hash",
                "level": "basic",
                "verification_token": "token-caducado",
                "verification_expires_at": "2000-01-01T00:00:00Z",
            },
        )
    finally:
        conn.close()

    assert client.get("/api/v1/auth/verify?token=no-sirve-de-nada").status_code == 404
    expired = client.get("/api/v1/auth/verify?token=token-caducado")
    assert expired.status_code == 410
    assert "caducado" in expired.text.lower()


def test_register_validaciones_escaladas() -> None:
    bad_email = client.post(
        "/api/v1/auth/register", json={**VALID_PAYLOAD, "email": "no-valido"}
    )
    assert bad_email.status_code == 422
    assert bad_email.json()["detail"]["code"] == "auth_invalid_email"

    weak = client.post("/api/v1/auth/register", json={**VALID_PAYLOAD, "password": "corta"})
    assert weak.status_code == 422
    assert weak.json()["detail"]["code"] == "auth_weak_password"

    bad_level = client.post("/api/v1/auth/register", json={**VALID_PAYLOAD, "level": "gurú"})
    assert bad_level.status_code == 422
    assert bad_level.json()["detail"]["code"] == "auth_invalid_level"

    bad_genre = client.post(
        "/api/v1/auth/register", json={**VALID_PAYLOAD, "genres": ["Flamencaso"]}
    )
    assert bad_genre.status_code == 422
    assert bad_genre.json()["detail"]["code"] == "auth_invalid_genre"


def test_register_guarda_generos_y_terminos_si_llegan() -> None:
    with_terms = {**VALID_PAYLOAD, "genres": ["Clásica", "Jazz"], "accepted_terms": True}
    response = client.post("/api/v1/auth/register", json=with_terms)
    assert response.status_code == 200

    conn = connect(settings.database_url)
    try:
        init_db(conn)
        row = find_user_by_email(conn, VALID_PAYLOAD["email"])
    finally:
        conn.close()
    assert row is not None
    assert json.loads(row["genres"]) == ["Clásica", "Jazz"]
    assert row["terms_version"] == "PRE-P001"
    assert row["terms_accepted_at"] is not None
