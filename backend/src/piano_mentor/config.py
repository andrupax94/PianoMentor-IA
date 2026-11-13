# description: Configuración tipada desde variables de entorno (Settings).
# context: Centraliza puertos, CORS, rutas MIDI y base de datos.

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PianoMentor AI"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = "sqlite:///./data/piano_mentor.db"
    midi_storage_path: str = "/data/midi"
    cors_origins: str = "http://localhost:3000"

    # --- Autenticación con Google (U-005) --------------------------------
    # Client ID del OAuth de Google (GOOGLE_CLIENT_ID en .env); con él se
    # valida el `aud` de cada id_token. El Client Secret solo vive en el
    # frontend: el backend valida el token, no hace el intercambio de code.
    google_client_id: str = ""

    # --- Login simple manual (U-005) ---------------------------------------
    # Token propio emitido en POST /auth/login (HS256 con AUTH_SECRET) para
    # las sesiones de contraseña; comparte secreto con Auth.js a propósito:
    # ambas piezas despliegan juntas y la rotación es del despliegue.
    auth_secret: str = ""
    # AUTOLOGIN: solo fuera de producción, las credenciales vacías del
    # login inician sesión con la cuenta ADMIN_EMAIL (cuenta admin).
    autologin: bool = False
    admin_email: str = ""

    # --- Registro abierto por pasos (U-006) --------------------------------
    # APP_PUBLIC_URL es el frontend al que apuntan los enlaces de la página
    # de verificación («Volver al registro», «Ir a la app»). API_PUBLIC_URL,
    # si está definida, es la base del enlace de verificación del email
    # (producción: el dominio del backend); sin ella se asume el front.
    app_public_url: str = "http://localhost:3000"
    api_public_url: str = ""
    verification_token_ttl_h: int = 24

    # --- Email vía Resend (U-006/U-007) ------------------------------------------
    # Con RESEND_API_KEY el mailer manda de verdad; sin ella queda hermético
    # (enlace en el log). El remitente usa el dominio pianomentoria.com
    # que está verificado en Resend (eu-west-1). Cualquier correo del sistema
    # (verificación, reset, notificación de cambio) saldrá de aquí.
    resend_api_key: str = ""
    email_from: str = "PianoMentor AI <onboarding@pianomentoria.com>"

    # --- Proveedor LLM para el chat del agente (B-012.8) ------------------
    # "mock" por defecto: CI y desarrollo son herméticos (sin red ni clave).
    # "groq", "gemini" o "opencode" activan el proveedor real.
    llm_provider: str = "mock"
    groq_api_key: str = ""
    gemini_api_key: str = ""
    opencode_token: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    gemini_model: str = "gemini-3.8-flash"
    opencode_base_url: str = "https://opencode.ai/inference/openai/v1"
    chat_memory_window: int = 20
    llm_timeout_s: float = 10.0
    # Techo del presupuesto de respuesta por turno (B-033.4 revisión 2026-11-09):
    # el chat general no lo toca (el proveedor usa su 400) y el turno de la
    # interpretación puede pedir más — la ventana maximizada es grande.
    llm_max_tokens_techo: int = 2000
    # Reintentos ante LLM saturado (B-036.1): los transitorios (429/5xx/timeout)
    # se reintentan con espera corta DENTRO del mismo proveedor antes de saltar
    # de la cadena; el turno HTTP vivo no se congela minutos (eso lo hace la
    # cola aplazada de B-036.3). Sin Retry-After se espera 1 s, 2 s, ...
    llm_retry_intentos: int = 1
    llm_retry_espera_max_s: float = 8.0
    # Worker de la cola de respuestas aplazadas (B-036.3): cada intervalo
    # recoge los pendientes vencidos, reintenta el turno con la cadena y
    # entrega la redacción (historial del chat + correo si hay dirección).
    # En DESARROLLO el intervalo baja a 5 s automáticamente (model_post_init):
    # ver el aplazado funcionar en ~un minuto no debe exigir tocar el .env.
    # Un valor explícito (LLM_RETRY_WORKER_INTERVALO_S) siempre manda.
    llm_retry_worker: bool = True
    llm_retry_worker_intervalo_s: float = 60.0
    # El caos de verificación (429 de mentira para probar el reintento a mano)
    # NO es configuración: vive en memoria del proceso y lo gobierna el menú
    # Depurar del front vía POST /api/v1/dev/llm/chaos (dev-only, 404 en
    # producción). Ver llm.py (`fijar_llm_chaos`).

    # --- Cloudflare R2 (storage de piezas subidas, B-029.1) ----------------
    # Con credenciales presentes, las subidas de usuario van a R2 y sobreviven
    # a un redeploy de Render; sin ellas se usa el filesystem local (MVP).
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_endpoint: str = ""
    r2_bucket: str = ""
    r2_region: str = "auto"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def model_post_init(self, __context: object) -> None:
        """B-036.3: en desarrollo el worker va rápido (5 s) por defecto.

        Solo si el intervalo no viene explícito (ni .env ni constructor): en
        producción y con valor ajustado a mano manda lo que se pidió."""
        if (
            "llm_retry_worker_intervalo_s" not in self.model_fields_set
            and self.environment == "development"
        ):
            self.llm_retry_worker_intervalo_s = 5.0


settings = Settings()
