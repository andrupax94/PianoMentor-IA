# description: Envío del email de comprobación del registro (U-006).
# context: El MVP no tiene proveedor de email: la función deja el enlace en el
# log y queda como único punto a cambiar cuando se contrate SMTP. Los tests
# sustituyen esta función; ninguna llamada toca red en la suite.

"""Email de verificación de correo para el registro por pasos (U-006)."""

from __future__ import annotations

import logging


def send_verification_email(to: str, verification_link: str) -> None:
    """Entrega (o deja constancia de) el email de comprobación (U-006).

    Registra el enlace en el log: es lo único que necesita este flujo mientras
    no exista proveedor. Al contratar uno, sustituir `logging.info` por el envío
    real manteniendo la misma firma (quien llama no cambia).
    """
    logging.getLogger("piano_mentor.mailer").info(
        "[U-006] Email de verificación para %s: %s", to, verification_link
    )
