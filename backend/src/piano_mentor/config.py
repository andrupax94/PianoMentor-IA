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
