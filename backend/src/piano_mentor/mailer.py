# description: Envío del email de comprobación del registro (U-006) vía Resend.
# context: Si hay RESEND_API_KEY, envía con el SDK de Resend; si no, queda
# hermético y el enlace va al log. Es el único punto que toca red por email:
# los tests sustituyen esta función o simulan `resend.Emails.send`.

"""Email de verificación de correo para el registro por pasos (U-006)."""

from __future__ import annotations

import logging

import resend

from .config import settings

logger = logging.getLogger("piano_mentor.mailer")


def _verification_subject() -> str:
    return "Verifica tu correo · PianoMentor AI"


def _verification_html(to: str, link: str) -> str:
    """Cuerpo mínimo del email: un enlace de un solo uso."""
    return (
        "<p>Hola, una cosa más para entrar en PianoMentor AI:</p>"
        f"<p><a href='{link}'>Confirmar mi correo</a></p>"
        "<p>Si el botón no funciona, copia esta dirección en el navegador:</p>"
        f"<p style='word-break:break-all'>{link}</p>"
        "<p style='color:#8693ad'>El enlace caduca a las 24 horas. "
        "Si no fuiste tú quien pidió la cuenta, ignora este mensaje.</p>"
    )


def send_verification_email(to: str, verification_link: str) -> None:
    """Entrega el email de comprobación (U-006).

    Con `RESEND_API_KEY` manda el correo por Resend; si el envío falla, el
    enlace queda en el log para no romper el registro (la cuenta ya existe y
    puede reintentarse). Sin clave, hermético: solo el log — mismo punto de
    sustitución documentado en el mailer original.
    """
    if not settings.resend_api_key:
        logger.info("[U-006] Email de verificación para %s: %s", to, verification_link)
        return

    resend.api_key = settings.resend_api_key
    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to],
        "subject": _verification_subject(),
        "html": _verification_html(to, verification_link),
    }
    try:
        resend.Emails.send(params)
        logger.info("[U-006] Email de verificación enviado por Resend a %s", to)
    except Exception:  # el registro no debe caer por el email
        logger.exception(
            "[U-006] Fallo el envío por Resend a %s; enlace en el log: %s", to, verification_link
        )
