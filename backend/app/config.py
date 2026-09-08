from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres
    database_url: str = "postgresql+asyncpg://sih_user:change_me@localhost:5432/sih_platform"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # Auth
    jwt_secret: str = "dev_secret_change_me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # LLM provider
    llm_provider: str = "gemini"
    google_api_key: str = ""
    gemini_text_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    local_llm_base_url: str = "http://localhost:11434"

    # Uploads
    upload_dir: str = "/app/uploads"
    max_upload_size_mb: int = 25


settings = Settings()
