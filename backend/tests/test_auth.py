# description: Autenticación con Google: validación de id_token y upsert en users (U-005).
# context: Suite hermética: nunca pide los JWKS de Google; el client se sustituye
# por otro que responde con una clave RSA generada en el propio test. Se cubren
# el endpoint /auth/session, el header en nombre-only y el owner_id de la subida.

"""Tests de identidad con Google (U-005)."""

from __future__ import annotations

import re
import time
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from piano_mentor import auth
from piano_mentor.config import settings
from piano_mentor.database import connect, init_db, upsert_manual_user
from piano_mentor.main import app
from piano_mentor.passwords import hash_password

client = TestClient(app)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "midi"
VALID_FIXTURE = FIXTURES_DIR / "test_scale.mid"

# Clave RSA de juguete para signar los tokens del test. El JWKS real de
# Google no se toca: el stub de abajo devuelve esta clave pública.
PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC_KEY = PRIVATE_KEY.public_key()

GOOGLE_AUD = "test-google-client-id"
GOOGLE_SUB = "google-sub-123"


class _StubSigningKey:
    def __init__(self, key: object) -> None:
        self.key = key


class _StubJwksClient:
    """Mismo contrato que jwt.PyJWKClient, sin red."""

    def __init__(self, key: object) -> None:
        self._key = key

    def get_signing_key_from_jwt(self, token: str) -> _StubSigningKey:
        return _StubSigningKey(self._key)


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch: pytest.MonkeyPatch):
    """JWKS falsos, Client ID de prueba y secreto del token propio."""
    monkeypatch.setattr(auth, "_jwks_client", lambda cache_keys=True: _StubJwksClient(PUBLIC_KEY))
    monkeypatch.setattr(settings, "google_client_id", GOOGLE_AUD)
    monkeypatch.setattr(settings, "auth_secret", "test-auth-secret-0123456789abcdef-generada")


def _id_token(**extra: object) -> str:
    """Signa un id_token de Google con las claims mínimas de la práctica."""
    now = int(time.time())
    claims: dict[str, object] = {
        "iss": "https://accounts.google.com",
        "aud": GOOGLE_AUD,
        "sub": GOOGLE_SUB,
        "email": "practica@gmail.com",
        "name": "Práctica de Piano",
        "picture": "https://lh3.googleusercontent.com/avatar.png",
        "iat": now,
        "exp": now + 300,
    }
    claims.update(extra)
    return jwt.encode(claims, PRIVATE_KEY, algorithm="RS256")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _users() -> list:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    finally:
        conn.close()


def _row(piece_id):
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        return conn.execute("SELECT * FROM pieces WHERE id = ?", (piece_id,)).fetchone()
    finally:
        conn.close()


# --------------------------- POST /auth/session -----------------------------


def test_auth_session_rechaza_sin_header() -> None:
    response = client.post("/api/v1/auth/session")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_missing_header"


def test_auth_session_rechaza_header_malformado() -> None:
    for header in ["Token abc", "Bearer", "Bearer  "]:
        response = client.post("/api/v1/auth/session", headers={"Authorization": header})
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "auth_invalid_header"


def test_auth_session_rechaza_token_expirado() -> None:
    now = int(time.time())
    token = _id_token(iat=now - 1000, exp=now - 500)
    response = client.post("/api/v1/auth/session", headers=_auth(token))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_token"


def test_auth_session_rechaza_aud_distinto() -> None:
    token = _id_token(aud="otro-cliente")
    response = client.post("/api/v1/auth/session", headers=_auth(token))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_token"


def test_auth_session_rechaza_sin_google_client_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_client_id", "")
    response = client.post(
        "/api/v1/auth/session", headers=_auth(_id_token())
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_not_configured"


def test_auth_session_registra_usuario() -> None:
    response = client.post("/api/v1/auth/session", headers=_auth(_id_token()))

    assert response.status_code == 200
    user = response.json()["user"]
    assert user["id"] == GOOGLE_SUB
    assert user["email"] == "practica@gmail.com"
    assert user["name"] == "Práctica de Piano"
    assert user["picture"].startswith("https://lh3")

    rows = _users()
    assert len(rows) == 1
    assert rows[0]["google_sub"] == GOOGLE_SUB
    assert rows[0]["id"] and rows[0]["id"] > 0  # PK interna aparte del sub


def test_auth_session_reregistro_actualiza_sin_duplicar() -> None:
    client.post("/api/v1/auth/session", headers=_auth(_id_token()))
    refreshed = _id_token(name="Nombre actualizado")
    response = client.post("/api/v1/auth/session", headers=_auth(refreshed))

    assert response.status_code == 200
    rows = _users()
    assert len(rows) == 1
    assert rows[0]["name"] == "Nombre actualizado"


# ---------------------------- owner_id en /pieces ---------------------------


def test_upload_con_id_token_asocia_owner() -> None:
    response = client.post(
        "/api/v1/pieces",
        headers=_auth(_id_token()),
        files={"file": ("practica.mid", VALID_FIXTURE.read_bytes(), "audio/midi")},
    )
    assert response.status_code == 200
    piece_id = response.json()["id"]
    row = _row(piece_id)
    assert row["owner_id"] == GOOGLE_SUB
    assert row["source"] == "upload"


def test_upload_sin_header_queda_anonimo() -> None:
    response = client.post(
        "/api/v1/pieces",
        files={"file": ("practica.mid", VALID_FIXTURE.read_bytes(), "audio/midi")},
    )
    assert response.status_code == 200
    row = _row(response.json()["id"])
    assert row["owner_id"] is None


def test_upload_con_header_invalido_devuelve_401() -> None:
    response = client.post(
        "/api/v1/pieces",
        headers=_auth(_id_token(exp=int(time.time()) - 100)),
        files={"file": ("practica.mid", VALID_FIXTURE.read_bytes(), "audio/midi")},
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_token"


# --------------------------- color de burbuja --------------------------------


def test_registro_asigna_color_y_reregistro_lo_conserva() -> None:
    user = client.post("/api/v1/auth/session", headers=_auth(_id_token())).json()["user"]
    color_re = re.compile("^#[0-9a-f]{6}$")
    assert color_re.match(user["bubble_color"]) is not None

    client.post("/api/v1/auth/session", headers=_auth(_id_token(name="Cambio")))
    row = _users()[0]
    assert row["bubble_color"] == user["bubble_color"]

    # Solo la fila nueva recibe color: el upsert no lo toca después.
    otro = client.post(
        "/api/v1/auth/session", headers=_auth(_id_token(sub="otro-usuario"))
    ).json()["user"]
    # Con 360 matices posibles puede repetir: solo se valida el formato.
    assert color_re.match(otro["bubble_color"]) is not None


# --------------------------- login simple (U-005) ----------------------------


def _manual_user(email: str, password: str, name: str = "Usuario manual") -> None:
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        upsert_manual_user(
            conn,
            {"email": email, "name": name, "password_hash": hash_password(password)},
        )
    finally:
        conn.close()


def _delete_email(email: str) -> None:
    "Limpia la fila antes de crear la de prueba con contraseña."
    conn = connect(settings.database_url)
    try:
        init_db(conn)
        conn.execute("DELETE FROM users WHERE lower(email) = lower(?)", (email,))
        conn.commit()
    finally:
        conn.close()


def test_login_contrasena_correcta_devuelve_usuario_y_token() -> None:
    _delete_email("practica@gmail.com")
    _manual_user("Practica@gmail.com", "152930", name="Admin")
    response = client.post(
        "/api/v1/auth/login",
        # El correo no distingue mayúsculas: el lookup compara en minúsculas.
        json={"email": "practica@gmail.com", "password": "152930"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"].lower() == "practica@gmail.com"
    assert data["user"]["name"] == "Admin"
    assert re.match("^#[0-9a-f]{6}$", data["user"]["bubble_color"])
    assert len(data["access_token"].split(".")) == 3  # JWT de tres segmentos


def test_login_token_propio_pasa_por_auth_session() -> None:
    _delete_email("practica@gmail.com")
    _manual_user("practica@gmail.com", "152930", name="Admin")
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "practica@gmail.com", "password": "152930"},
    ).json()["access_token"]

    session = client.post("/api/v1/auth/session", headers=_auth(token))
    assert session.status_code == 200
    assert session.json()["user"]["name"] == "Admin"


def test_login_token_propio_falsificado_devuelve_401() -> None:
    _manual_user("practica@gmail.com", "152930")
    forged = jwt.encode(
        {"iss": "piano-mentor", "sub": "manual:practica@gmail.com", "exp": int(time.time()) + 100},
        "otra-clave-larga-1234567890abcdef-que-no-es-la-del-test",
        algorithm="HS256",
    )
    response = client.post("/api/v1/auth/session", headers=_auth(forged))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_token"


def test_login_contrasena_erronea_da_el_mensaje_tipico() -> None:
    _delete_email("practica@gmail.com")
    _manual_user("practica@gmail.com", "152930", name="Admin")
    response = client.post(
        "/api/v1/auth/login", json={"email": "practica@gmail.com", "password": "000000"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == {
        "code": "auth_invalid_credentials",
        "message": "No existe esta combinación de usuario y contraseña.",
    }


def test_login_correo_desconocido_mismo_mensaje() -> None:
    response = client.post(
        "/api/v1/auth/login", json={"email": "nadie@gmail.com", "password": "152930"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_credentials"


def test_login_usuario_de_google_sin_contrasena_mismo_mensaje() -> None:
    _delete_email("practica@gmail.com")
    # Cuenta creada por vía Google (upsert con id_token): sin password_hash.
    client.post("/api/v1/auth/session", headers=_auth(_id_token()))
    response = client.post(
        "/api/v1/auth/login", json={"email": "practica@gmail.com", "password": "152930"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_invalid_credentials"


def test_google_login_vincula_cuenta_existente_por_correo() -> None:
    _delete_email("practica@gmail.com")
    _manual_user("practica@gmail.com", "152930", name="Admin")
    color = _users()[0]["bubble_color"]

    # El mismo correo llega por Google con un sub distinto: se vincula.
    session = client.post("/api/v1/auth/session", headers=_auth(_id_token()))
    rows = _users()

    assert session.status_code == 200
    assert len(rows) == 1
    assert rows[0]["google_sub"] == GOOGLE_SUB
    assert rows[0]["bubble_color"] == color  # el color de la fila original
    assert rows[0]["password_hash"]  # y la contraseña sigue ahí

    # La contraseña del grupo vinculado sigue funcionando en el login.
    login = client.post(
        "/api/v1/auth/login", json={"email": "practica@gmail.com", "password": "152930"}
    )
    assert login.status_code == 200
    assert login.json()["user"]["id"] == GOOGLE_SUB


# --------------------------------- autologin ---------------------------------


def test_autologin_devuelve_la_cuenta_admin() -> None:
    _delete_email("admin@pianomentor.local")
    _manual_user("admin@pianomentor.local", "152930", name="Admin")
    _autologin_settings("admin@pianomentor.local", enabled=True)
    response = client.post("/api/v1/auth/login", json={"autologin": True})

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "admin@pianomentor.local"
    assert data["user"]["name"] == "Admin"


def test_autologin_inactivo_o_produccion_no_entra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _delete_email("admin@pianomentor.local")
    _manual_user("admin@pianomentor.local", "152930", name="Admin")
    monkeypatch.setattr(settings, "admin_email", "admin@pianomentor.local")

    # AUTOLOGIN=false (valor del .env por defecto): ni aunque el front lo pida.
    monkeypatch.setattr(settings, "autologin", False)
    off = client.post("/api/v1/auth/login", json={"autologin": True})
    assert off.status_code == 401
    assert off.json()["detail"] == {
        "code": "auth_invalid_credentials",
        "message": "No existe esta combinación de usuario y contraseña.",
    }

    # Con AUTOLOGIN=true pero environment=production (despliegue real): tampoco.
    monkeypatch.setattr(settings, "autologin", True)
    monkeypatch.setattr(settings, "environment", "production")
    prod = client.post("/api/v1/auth/login", json={"autologin": True})
    assert prod.status_code == 401


def _autologin_settings(admin_email: str, *, enabled: bool) -> None:
    """Fija las settings de autologin para un test concreto (sin fixture global)."""
    settings.autologin = enabled
    settings.admin_email = admin_email
    settings.environment = "development"

