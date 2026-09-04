"""Export and Stats service — generates GeoJSON chart layers, CSV data, and analytics summaries."""

import csv
import io
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.detection import Detection
from app.schemas.export import (
    ClassCount,
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONGeometry,
    GeoJSONProperties,
    StatsResponse,
)


async def get_stats(db: AsyncSession) -> StatsResponse:
    """Compute aggregate counts by status and class."""
    total_q = select(func.count(Detection.id))
    total_detections = (await db.execute(total_q)).scalar() or 0

    confirmed_q = select(func.count(Detection.id)).where(Detection.status == "Confirmed by review")
    confirmed = (await db.execute(confirmed_q)).scalar() or 0

    candidates_q = select(func.count(Detection.id)).where(Detection.status == "Candidate")
    candidates = (await db.execute(candidates_q)).scalar() or 0

    rejected_q = select(func.count(Detection.id)).where(Detection.status == "Rejected")
    rejected = (await db.execute(rejected_q)).scalar() or 0

    class_q = select(Detection.cls, func.count(Detection.id)).group_by(Detection.cls)
    class_results = (await db.execute(class_q)).all()
    by_class = [ClassCount(cls=cls_name, count=count) for cls_name, count in class_results]

    return StatsResponse(
        total_detections=total_detections,
        confirmed=confirmed,
        candidates=candidates,
        rejected=rejected,
        by_class=by_class,
    )


async def export_geojson(
    db: AsyncSession,
    only_confirmed: bool = False,
) -> GeoJSONFeatureCollection:
    """Generate GeoJSON FeatureCollection for detections with valid coordinates."""
    query = select(Detection).where(Detection.lat.is_not(None), Detection.lon.is_not(None))
    if only_confirmed:
        query = query.where(Detection.status == "Confirmed by review")

    result = await db.execute(query)
    detections = result.scalars().all()

    features = []
    for d in detections:
        feature = GeoJSONFeature(
            type="Feature",
            geometry=GeoJSONGeometry(
                type="Point",
                coordinates=[d.lon, d.lat],
            ),
            properties=GeoJSONProperties(
                id=d.id,
                cls=d.cls,
                conf=d.conf,
                status=d.status,
                notes=d.notes,
            ),
        )
        features.append(feature)

    return GeoJSONFeatureCollection(type="FeatureCollection", features=features)


async def export_csv(db: AsyncSession) -> str:
    """Generate CSV review sheet formatted string."""
    query = select(Detection).order_by(Detection.created_at.desc())
    result = await db.execute(query)
    detections = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "class", "confidence", "status", "line", "ping", "side",
        "ground_range_m", "depth_m", "lat", "lon", "echo_len_m", "shadow_len_m",
        "height_est_m", "notes", "created_at"
    ])

    for d in detections:
        writer.writerow([
            d.id,
            d.cls,
            f"{d.conf:.2f}",
            d.status,
            d.line or "",
            d.ping or "",
            d.side or "",
            f"{d.range_m:.1f}" if d.range_m is not None else "",
            f"{d.depth_m:.1f}" if d.depth_m is not None else "",
            f"{d.lat:.5f}" if d.lat is not None else "",
            f"{d.lon:.5f}" if d.lon is not None else "",
            f"{d.echo_len_m:.2f}" if d.echo_len_m is not None else "",
            f"{d.shadow_len_m:.2f}" if d.shadow_len_m is not None else "",
            f"{d.height_est_m:.2f}" if d.height_est_m is not None else "",
            d.notes or "",
            d.created_at.isoformat() if d.created_at else "",
        ])

    return output.getvalue()
