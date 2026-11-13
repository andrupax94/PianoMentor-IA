# description: Envío de emails de autenticación (U-006/U-007) vía Resend.
# context: Si hay RESEND_API_KEY, envía con el SDK de Resend; si no, queda
# hermético y el enlace va al log. Es el único punto que toca red por email:
# los tests sustituyen esta función o simulan `resend.Emails.send`.

"""Emails de autenticación: verificación de registro (U-006) y recuperación
de contraseña (U-007) vía Resend."""

from __future__ import annotations

import logging
from html import escape

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


def _reset_subject() -> str:
    return "Restablece tu contraseña · PianoMentor AI"


def _reset_html(to: str, link: str) -> str:
    """Cuerpo del email de reset: enlace de un solo uso, 30 min."""
    return (
        "<p>Hola, has pedido restablecer tu contraseña en PianoMentor AI:</p>"
        f"<p><a href='{link}'>Cambiar mi contraseña</a></p>"
        "<p>Si el botón no funciona, copia esta dirección en el navegador:</p>"
        f"<p style='word-break:break-all'>{link}</p>"
        "<p style='color:#8693ad'>El enlace caduca a los 30 minutos y es de un solo uso. "
        "Si no fuiste tú, ignora este mensaje; tu contraseña no cambiará.</p>"
    )


def _password_changed_subject() -> str:
    return "Tu contraseña se ha restablecido · PianoMentor AI"


def _password_changed_html(to: str) -> str:
    """Email de aviso tras cambio exitoso (U-007)."""
    return (
        "<p>Hola, tu contraseña se ha actualizado correctamente.</p>"
        "<p>Por seguridad, hemos cerrado todas tus sesiones anteriores: "
        "usa la nueva contraseña para volver a entrar.</p>"
        "<p style='color:#8693ad'>Si no fuiste tú, contacta con soporte inmediatamente.</p>"
    )


def _send_email(to: str, subject: str, html: str, log_prefix: str) -> None:
    """Punto único de envío: Resend si hay clave, sino log hermético."""
    if not settings.resend_api_key:
        logger.info("[%s] Email para %s (log): %s", log_prefix, to, html[:200])
        return

    resend.api_key = settings.resend_api_key
    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    try:
        resend.Emails.send(params)
        logger.info("[%s] Email enviado por Resend a %s", log_prefix, to)
    except Exception:
        logger.exception(
            "[%s] Fallo el envío por Resend a %s; enlace en el log: %s", log_prefix, to, html[:500]
        )


def send_verification_email(to: str, verification_link: str) -> None:
    """Entrega el email de comprobación del registro (U-006)."""
    _send_email(to, _verification_subject(), _verification_html(to, verification_link), "U-006")


def send_password_reset_email(to: str, reset_link: str) -> None:
    """Entrega el email de restablecimiento de contraseña (U-007)."""
    _send_email(to, _reset_subject(), _reset_html(to, reset_link), "U-007")


def send_password_changed_notification(to: str) -> None:
    """Email de aviso tras cambio exitoso de contraseña (U-007)."""
    _send_email(to, _password_changed_subject(), _password_changed_html(to), "U-007")


# --- Respuesta aplazada del chat (B-036.3) ------------------------------------


def _reply_subject() -> str:
    return "Tu respuesta está lista · PianoMentor AI"


def _reply_html(texto: str, link: str) -> str:
    """Cuerpo del email de la respuesta aplazada: el texto del mentor + enlace.

    El texto viene del LLM en texto plano: se escapa y se respeta el salto de
    línea como párrafos (nunca se interpola sin escapar)."""
    parrafos = "".join(
        f"<p style='margin:0 0 10px'>{escape(linea)}</p>"
        for linea in texto.strip().split("\n")
        if linea.strip()
    )
    return (
        "<p>Tu respuesta del chat de PianoMentor AI ya está lista:</p>"
        f"<blockquote style='border-left:3px solid #e8a13e;padding-left:12px'>{parrafos}</blockquote>"
        f"<p><a href='{link}'>Volver a la app y seguir la conversación</a></p>"
        "<p style='color:#8693ad'>Los servidores estaban ocupados cuando la pediste; "
        "ya han afinado la respuesta. 🎹</p>"
    )


def send_llm_reply_email(to: str, texto: str) -> None:
    """Entrega el email de la respuesta aplazada del chat (B-036.3)."""
    link = settings.app_public_url.rstrip("/") or "https://www.pianomentoria.com"
    _send_email(to, _reply_subject(), _reply_html(texto, link), "B-036.3")
