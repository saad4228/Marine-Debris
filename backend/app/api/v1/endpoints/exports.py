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
    cls: str | None = Query(None, description="Filter by class, or 'all' for every class"),
    db: AsyncSession = Depends(get_db),
):
    """Export geo-referenced detections as a GeoJSON FeatureCollection for nautical charts.

    Note: detections with no navigation fix have no geometry and are necessarily omitted.
    Use the CSV export to get the full catalogue including unlocated targets.
    """
    return await export_service.export_geojson(db, only_confirmed=only_confirmed, cls=cls)


@router.get("/csv")
async def export_csv(
    cls: str | None = Query(None, description="Filter by class, or 'all' for every class"),
    db: AsyncSession = Depends(get_db),
):
    """Export detections catalogue as a CSV review sheet for manual inspection."""
    csv_content = await export_service.export_csv(db, cls=cls)
    suffix = f"_{cls}" if cls and cls != "all" else ""
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=nadir_survey_detections{suffix}.csv"},
    )
