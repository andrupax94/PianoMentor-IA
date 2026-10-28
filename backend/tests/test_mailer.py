# description: Tests del mailer de verificación vía Resend (U-006).
# context: Suite hermética: sin clave el mailer solo deja el enlace en el log;
# con la clave de test, `resend.Emails.send` se sustituye por un capturador y
# nunca sale tráfico. También cubre que un fallo de Resend no rompa el registro.

"""Tests del mailer del registro por pasos (U-006)."""

from __future__ import annotations

import logging

import pytest

from piano_mentor import mailer
from piano_mentor.config import settings

LINK = "http://localhost:3000/api/v1/auth/verify?token=abc123"
TO = "yo@example.com"


@pytest.fixture(autouse=True)
def _silencio_log(caplog: pytest.LogCaptureFixture) -> None:
    """Recoge los logs en caplog y silencia la salida de consola."""
    caplog.set_level(logging.INFO, logger="piano_mentor.mailer")


def test_sin_clave_queda_hermético(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "")

    mailer.send_verification_email(TO, LINK)

    mensajes = " ".join(record.getMessage() for record in caplog.records)
    assert "abc123" in mensajes, "sin proveedor, el enlace debe quedar en el log"
    assert "yo@example.com" in mensajes


def test_con_clave_envia_por_resend(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_xxxxxxxxx")
    enviados: list[dict[str, object]] = []

    def fake_send(params: dict[str, object]) -> dict[str, object]:
        enviados.append(dict(params))
        return {"id": "email-id-1"}

    monkeypatch.setattr(mailer.resend.Emails, "send", fake_send)

    mailer.send_verification_email(TO, LINK)

    assert len(enviados) == 1
    sent = enviados[0]
    assert sent["to"] == [TO]
    assert sent["subject"] == "Verifica tu correo · PianoMentor AI"
    assert sent["from"] == settings.email_from
    assert LINK in str(sent["html"])


def test_fallo_de_resend_no_rompe_el_registro(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_xxxxxxxxx")

    def failing_send(params: dict[str, object]) -> dict[str, object]:
        raise RuntimeError("resend down")

    monkeypatch.setattr(mailer.resend.Emails, "send", failing_send)

    # No debe levantar: el enlace queda en el log y el registro sigue vivo.
    mailer.send_verification_email(TO, LINK)
    mensajes = " ".join(record.getMessage() for record in caplog.records)
    assert "abc123" in mensajes and "yo@example.com" in mensajes
