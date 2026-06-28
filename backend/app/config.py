from pydantic_settings import BaseSettings


def parse_frontend_origins(value: str) -> list[str]:
    """Comma-separated origins; trailing slashes stripped."""
    return [
        origin.strip().rstrip("/")
        for origin in value.split(",")
        if origin.strip()
    ]


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ENCRYPTION_KEY: str
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"
    FRONTEND_URL: str
    DEBUG: bool = False

    @property
    def frontend_origins(self) -> list[str]:
        return parse_frontend_origins(self.FRONTEND_URL)

    class Config:
        env_file = ".env"


settings = Settings()
