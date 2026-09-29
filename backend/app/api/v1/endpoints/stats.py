"""Evaluation and catalogue statistics endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.export import StatsResponse
from app.services import export_service

router = APIRouter()


@router.get("", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
):
    """Retrieve aggregate detection counts, class distribution, and review progress."""
    return await export_service.get_stats(db)
