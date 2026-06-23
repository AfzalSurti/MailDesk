from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ENCRYPTION_KEY: str
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str
    FRONTEND_URL: str

    class Config:
        env_file = ".env"

settings = Settings()