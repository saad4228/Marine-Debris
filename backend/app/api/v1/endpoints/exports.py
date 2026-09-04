"""Export endpoints for GeoJSON chart layers and CSV review sheets."""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.export import GeoJSONFeatureCollection
from app.services import export_service

router = APIRouter()


@router.get("/geojson", response_model=GeoJSONFeatureCollection)
async def export_geojson(
    only_confirmed: bool = Query(False, description="Export only confirmed detections"),
    db: AsyncSession = Depends(get_db),
):
    """Export geo-referenced detections as a GeoJSON FeatureCollection for nautical charts."""
    return await export_service.export_geojson(db, only_confirmed=only_confirmed)


@router.get("/csv")
async def export_csv(
    db: AsyncSession = Depends(get_db),
):
    """Export detections catalogue as a CSV review sheet for manual inspection."""
    csv_content = await export_service.export_csv(db)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nadir_survey_detections.csv"},
    )
