"""FastAPI dependencies: database session, detector model instance."""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.config import settings
from app.core.database import async_session
from app.pipeline.interface import BaseDetector
from app.pipeline.stub_detector import StubDetector

logger = logging.getLogger("nadir.deps")

# Shared detector singleton
_detector_instance: BaseDetector | None = None


def get_detector() -> BaseDetector:
    """Provides detector instance.

    Uses YoloDetector if USE_STUB_MODEL is False and weights are present,
    otherwise falls back to StubDetector.
    """
    global _detector_instance
    if _detector_instance is None:
        if settings.USE_STUB_MODEL:
            logger.info("Using StubDetector (USE_STUB_MODEL=True)")
            _detector_instance = StubDetector()
        else:
            try:
                from app.pipeline.yolo_detector import YoloDetector
                weights = settings.MODEL_PATH or "new.pt"
                logger.info("Instantiating YoloDetector with weights: %s", weights)
                _detector_instance = YoloDetector(weights_path=weights)
            except Exception as e:
                logger.error("Failed to initialize YoloDetector: %s. Falling back to StubDetector.", e)
                _detector_instance = StubDetector()
    return _detector_instance


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Async database session dependency."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
