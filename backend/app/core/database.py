"""Async SQLAlchemy engine, session factory, and declarative Base for PostgreSQL (with dev SQLite fallback)."""

import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger("nadir.database")

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


async def create_tables() -> None:
    """Create all tables that don't exist yet. Dev convenience — use Alembic in production."""
    global engine, async_session

    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Connected to primary database: %s", settings.DATABASE_URL.split("@")[-1])
    except Exception as e:
        if "postgresql" in settings.DATABASE_URL:
            fallback_url = "sqlite+aiosqlite:///./nadir.db"
            logger.warning(
                "Could not connect to PostgreSQL (%s). Falling back to local SQLite (%s) "
                "so the backend can run immediately. Start PostgreSQL or configure DATABASE_URL in .env to use PostgreSQL.",
                e,
                fallback_url,
            )
            # Recreate engine with SQLite fallback
            engine = create_async_engine(fallback_url, echo=False)
            async_session.configure(bind=engine)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Initialized local SQLite fallback database tables.")
        else:
            raise e


async def dispose_engine() -> None:
    """Cleanly close the connection pool."""
    await engine.dispose()
