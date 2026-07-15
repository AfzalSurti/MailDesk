from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_frontend_origins(value: str) -> list[str]:
    """Comma-separated origins; trailing slashes stripped."""
    return [
        origin.strip().rstrip("/")
        for origin in value.split(",")
        if origin.strip()
    ]


def parse_csv_keys(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


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
    # Render: OPENROUTER_API_KEY=key1,key2  — also accepts API_KEY
    OPENROUTER_API_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_API_KEY", "API_KEY"),
    )
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    # Render: MODEL_NAME=openai/gpt-4o-mini  — also accepts OPENROUTER_MODEL
    OPENROUTER_MODEL: str = Field(
        default="openai/gpt-4o-mini",
        validation_alias=AliasChoices("MODEL_NAME", "OPENROUTER_MODEL"),
    )
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

    @property
    def openrouter_api_keys(self) -> list[str]:
        return [
            k
            for k in parse_csv_keys(self.OPENROUTER_API_KEY)
            if not k.lower().startswith("your-")
        ]

    @property
    def openrouter_model_name(self) -> str:
        return (self.OPENROUTER_MODEL or "openai/gpt-4o-mini").strip()


settings = Settings()
