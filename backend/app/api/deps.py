"""FastAPI dependencies: database session, detector model instance."""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import async_session
from app.pipeline.interface import BaseDetector
from app.pipeline.stub_detector import StubDetector

# Shared detector singleton
_detector_instance: BaseDetector | None = None


def get_detector() -> BaseDetector:
    """Provides detector instance.

    When you add your trained model:
    1. Import your custom detector subclass from app.pipeline
    2. Instantiate it here if settings.USE_STUB_MODEL is False
    """
    global _detector_instance
    if _detector_instance is None:
        if settings.USE_STUB_MODEL:
            _detector_instance = StubDetector()
        else:
            # TODO: Plug in real model here, e.g.:
            # from app.pipeline.real_detector import RealModelDetector
            # _detector_instance = RealModelDetector(weights_path=settings.MODEL_PATH)
            _detector_instance = StubDetector()
    return _detector_instance


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Async database session dependency."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
