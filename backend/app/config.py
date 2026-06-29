from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_frontend_origins(value: str) -> list[str]:
    """Comma-separated origins; trailing slashes stripped."""
    return [
        origin.strip().rstrip("/")
        for origin in value.split(",")
        if origin.strip()
    ]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ENCRYPTION_KEY: str
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"
    FRONTEND_URL: str
    BACKEND_URL: str = "http://localhost:8000"
    GOOGLE_CLIENT_ID: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_CLIENT_ID", "CLIENT_ID"),
    )
    GOOGLE_CLIENT_SECRET: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_CLIENT_SECRET", "CLIENT_SECRET"),
    )
    DEBUG: bool = False

    @property
    def frontend_origins(self) -> list[str]:
        return parse_frontend_origins(self.FRONTEND_URL)

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.BACKEND_URL.rstrip('/')}/auth/google/callback"


settings = Settings()
