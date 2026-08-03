from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def normalize_database_url(url: str) -> str:
    """Neon/Render often paste postgresql:// — force asyncpg for SQLAlchemy async."""
    raw = (url or "").strip()
    if raw.startswith("postgres://"):
        raw = "postgresql+asyncpg://" + raw[len("postgres://") :]
    elif raw.startswith("postgresql://"):
        raw = "postgresql+asyncpg://" + raw[len("postgresql://") :]
    elif raw.startswith("postgresql+psycopg2://"):
        raw = "postgresql+asyncpg://" + raw[len("postgresql+psycopg2://") :]

    parsed = urlparse(raw)
    query = parse_qs(parsed.query)
    query.pop("channel_binding", None)
    # asyncpg expects ssl=require; Neon often sends sslmode=require
    if "sslmode" in query and "ssl" not in query:
        query["ssl"] = query.pop("sslmode")
    clean_query = urlencode({key: values[0] for key, values in query.items()})
    return urlunparse(parsed._replace(query=clean_query))


engine = create_async_engine(
    normalize_database_url(settings.DATABASE_URL),
    echo=settings.DEBUG,
    pool_pre_ping=True,   # drop dead connections before use (Neon closes idle ones)
    pool_recycle=280,     # recycle before Neon ~5 min idle timeout
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
