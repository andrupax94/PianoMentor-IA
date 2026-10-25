<!-- description: ADR 0006: identidad con Google OAuth vía Auth.js/id_token y, en ampliación, login simple con contraseña y tabla users mínima. -->
<!-- context: U-005; sin registro público: las cuentas con contraseña son manuales (admin) o vencen por vínculo de correo con Google. -->

# 0006 — Autenticación con Google: id_token de Google como identidad cruzada

- **Estado:** aceptada
- **Fecha:** 2026-10-25
- **Ámbito:** U-005 (login con Google y tabla `users`); base de B-029 (visibilidad de MIDIs por usuario)
- **Sustituye a:** —
- **Sustituida por:** —

## Contexto

El control de usuarios arranca sin registro propio: «Continuar con Google» y nada más. La base de datos solo debe guardar lo que Google entrega; los datos personales extra quedan vacíos para el futuro. El backend ya tenía `pieces.owner_id` esperando a la identidad (B-028). El frontend es Next.js 16 y el backend FastAPI, desplegados por separado (Render y Vercel), sin ninguna librería de auth preexistente.

## Opciones consideradas

1. **OAuth en el backend (FastAPI):** el backend hace el *code exchange* y monta su propio login. Condensa todo pero le pone al backend cookies de sesión y un UI de auth que hoy no tiene.
2. **Auth.js (v5) en el frontend y `google_sub` vía backend:** el front gestiona el OAuth con Google y guarda la sesión; el backend valida el `id_token` de Google de cada petición contra los JWKS públicos y hace *upsert* en `users`.
3. **Auth.js + JWT firmado entre ambos servicios:** la sesión del front llega firmada al backend con un secreto compartido. Acopla los dos despliegues a un mismo formato de sesión y al ciclo de rotación del secreto.

## Decisión

Opción 2, con dos piezas asimétricas:

- **Frontend** (`frontend/src/lib/auth.ts`, route handler `/api/auth/[...nextauth]`): Auth.js v5 con el proveedor Google, scopes `openid`/`email`/`profile`, sesión JWT (`AUTH_SECRET`) y el `id_token` original expuesto en `session.accessToken`. El cambio de identidad entre front y backend es un `Authorization: Bearer <id_token>` en las llamadas protegidas.
- **Backend** (`backend/src/piano_mentor/auth.py`): verificación del `id_token` con PyJWT + JWKS de Google (RS256, `iss`, `exp`, `aud=GOOGLE_CLIENT_ID`), `upsert` por `google_sub` en `users` y `pieces.owner_id = google_sub` en `POST /api/v1/pieces`. Sin header válido la subida queda anónima (`NULL`, como B-028); con header presente e inválido es 401.

Por qué el `id_token` y no la sesión interna de Auth.js: las cookies de sesión de Auth.js van cifradas JWE e internas a Next.js; Python no debería acoplarse a su formato ni a su rotación de secretos. El `id_token` se firma con RSA, se valida de forma autónoma contra los JWKS de Google y caduca solo (1 h), que es exactamente lo que necesita un backend sin estado.

Por qué `google_sub` como valor de `owner_id`: es el identificador entre-sistemas estable de Google; `users.id` (AUTOINCREMENT) es interno de SQLite y no debe filtrarse a la API.

## Consecuencias

- No hay registro ni perfiles: quien quiera entrar necesita una cuenta de Google; los campos personales están reservados (vacíos) para el futuro.
- La pantalla de consentimiento de Google arranca en **Testing** (solo usuarios de prueba); abrir el acceso público es solo *Publish*. Los scopes no sensibles liberan de la verificación de Google.
- El `id_token` caduca en ~1 h: durante una sesión larga la identidad caduca hasta que el usuario recarga. La UI tiene tolerancia (el registro fallido no bloquea nada); si B-029 necesita sesiones largas, se añade refresco/`access_token` ahí.
- Los tests del backend nunca tocan la red: el cliente de JWKS se sustituye por una clave RSA de prueba (`tests/test_auth.py`). El Client Secret solo existe en el frontend; el backend no lo necesita ni lo recibe.
- Se ha añadido `pyjwt[crypto]` al backend y `next-auth@beta` al frontend, dependencias nuevas documentadas en este ADR.

## Ampliación (2026-10-25, segunda jornada): login simple y cuenta manual

Además del OAuth, se añade **login simple** (cuenta/correo y contraseña) cuando el usuario ya posee contraseña, sin abrir registro público:

- **Contraseñas** (`backend/src/piano_mentor/passwords.py`): hash unidireccional PBKDF2-SHA256 con sal embebida (600k iteraciones, `pbkdf2_sha256$iter$sal$hash`, sin dependencias nuevas). Sin registro simple: las cuentas con contraseña se crean por el script `backend/scripts/create_user.py` (hoy, la cuenta admin) o por el alta de Google más contraseña.
- **Endpoint `POST /api/v1/auth/login`**: valida correo (sin mayúsculas en cuenta) y contraseña; el correo desconocido, la contraseña errónea y la cuenta de Google sin contraseña responden el mismo 401 `auth_invalid_credentials` («No existe esta combinación…», sin filtrar causas). Con certeza de credenciales emite un **JWT propio** (HS256 con `AUTH_SECRET`, 12 h) que el front guarda en la sesión Auth.js y usa como `Bearer` igual que el id_token; ambas vías convergen en `_current_user`. Fotografía la UI; el refresco (renovar el momento) lo manejará B-029 si hace falta.
- **Vinculación por correo** (`upsert_user`): si un id_token de Google llega con un correo ya registrado (cuenta manual), se vincula el sub de Google a esa fila sin duplicar; mantiene color, contraseña y `created_at`.
- **Color de burbuja** (`bubble_color`, migración `0008`): aleatorio al crear la cuenta (HUE al azar, S/L fijas para contraste con la inicial blanca) y nunca se vuelve a tocar; la cabecera lo pinta en el avatar.
- **Autologin** (`AUTOLOGIN=false` por defecto): solo fuera de producción, las credenciales vacías con `autologin=True` entran en la cuenta `ADMIN_EMAIL` (cuenta admin). El flag llegará al bundle como `NEXT_PUBLIC_AUTOLOGIN` y el cliente solo lo usa si `NODE_ENV !== "production"`.
- El mini box de la cabecera (`AuthSignInModal`) abre sobre el fondo atenuado con usuario/correo, contraseña, «Continuar con Google» y «Entrar» — el botón de Google de U-005.

## Referencias

`frontend/src/lib/auth.ts`, `frontend/src/app/api/auth/[...nextauth]/route.ts`, `frontend/src/lib/auth-user.ts`, `frontend/src/components/AppHeader/AuthUserMenu/` (con el mini box `AuthSignInModal`), `backend/src/piano_mentor/auth.py`, `backend/src/piano_mentor/passwords.py`, `backend/src/piano_mentor/migrations/0007_create_users.sql` y `0008_add_password_and_color.sql`, `backend/scripts/create_user.py`, `backend/src/piano_mentor/api.py` (`/auth/session`, `/auth/login`, `owner_id` en `POST /pieces`), issue `U-005`.
