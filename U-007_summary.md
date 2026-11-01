# U-007: Recuperación de contraseña - Implementación completada

## Resumen
Flujo completo de "olvidé mi contraseña" con endpoints, UI páginas, gestión de tokens y emails.

### Hecho ✅

**Backend:**
- Migración 0010: tabla `auth_tokens` + columna `password_changed_at`
- Funciones de BD: `_hash_token`, `create_auth_token`, `find_user_by_auth_token`, `consume_auth_token`, `update_password_changed_at`, `_rate_limited`
- Mailler: `send_password_reset_email`, `send_password_changed_notification`, `_send_email` (Resend o log)
- Esquemas Pydantic: `AuthForgotPasswordRequest/Response`, `AuthResetPasswordRequest/Response`
- Endpoints: `POST /auth/forgot-password` (rate-limit, respuesta neutra), `POST /auth/reset-password` (valida token, política de contraseña, marca usado, notifica)

**Frontend:**
- Página `/recuperar` con formulario de solicitud de enlace
- Página `/recuperar/[token]` con formulario de restablecimiento
- `ForgotPasswordForm`: estados idle/sending/sent, manejo de rate-limit, mensajes neutros
- `ResetPasswordForm`: validación de 8 min caracteres, confirmación, redirect al login
- `AuthShell` reutilizado con `AuthShell.module.css` (patrón U-006)
- `api-client.ts`: `requestPasswordReset`, `resetPassword` methods

**Tests y Build:**
- Frontend: 444/444 passing
- Backend: 473/473 passing (incluye nuevos tests U-007)
- `npm run build`: éxito sin errores

**Diseño clave:**
- Sin enumeración de usuarios: `forgot-password` siempre mensaje neutro
- Token solo SHA-256 hash en BD, nunca texto plano
- TTL 30 min en tokens de reset
- `password_changed_at` invalida JWTs previos comparando `iat`
- Email: reset (30 min) → éxito → notificación de cambio de contraseña

## Próximos pasos (checkpoint)
Usuario indica pasar a issue B-032.5; otro modelo trabaja en U-004.