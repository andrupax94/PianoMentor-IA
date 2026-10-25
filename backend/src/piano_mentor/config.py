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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
