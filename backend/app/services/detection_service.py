"""Detection service — business logic for detection CRUD and persistence."""

import random
import string
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.detection import Detection
from app.models.review import Review
from app.pipeline.interface import DetectionResult


def _generate_id() -> str:
    """Generate a NADIR-style detection id like NDR-0482."""
    num = random.randint(1, 99999)
    return f"NDR-{num:05d}"


async def _unique_id(db: AsyncSession) -> str:
    """Generate an id that doesn't collide with existing detections."""
    for _ in range(100):
        candidate = _generate_id()
        existing = await db.get(Detection, candidate)
        if existing is None:
            return candidate
    # Fallback: add random suffix
    suffix = "".join(random.choices(string.ascii_uppercase, k=3))
    return f"NDR-{suffix}-{random.randint(1, 9999):04d}"


async def persist_detections(
    db: AsyncSession,
    results: list[DetectionResult],
    image_path: str | None = None,
) -> list[Detection]:
    """Save detection results from inference to the database.

    Returns the list of persisted Detection ORM objects.
    """
    detections: list[Detection] = []

    for r in results:
        # Check if already present within 15m
        if r.lat is not None and r.lon is not None:
            lat_tol = 0.00015
            lon_tol = 0.00015 / max(0.1, abs(r.lat) * 0.01745)
            stmt = select(Detection).where(
                Detection.cls == r.cls,
                Detection.lat.between(r.lat - lat_tol, r.lat + lat_tol),
                Detection.lon.between(r.lon - lon_tol, r.lon + lon_tol),
            )
            res = await db.execute(stmt)
            existing = res.scalars().first()
            if existing:
                if r.conf > existing.conf:
                    existing.conf = r.conf
                    if image_path:
                        existing.image_path = image_path
                detections.append(existing)
                continue

        det_id = await _unique_id(db)
        det = Detection(
            id=det_id,
            cls=r.cls,
            conf=r.conf,
            x=r.x,
            y=r.y,
            w=r.w,
            h=r.h,
            side=r.side,
            range_m=r.range_m,
            depth_m=r.depth_m,
            lat=r.lat,
            lon=r.lon,
            echo_len_m=r.echo_len_m,
            shadow_len_m=r.shadow_len_m,
            height_est_m=r.height_est_m,
            line=r.line,
            ping=r.ping,
            status="Candidate",
            notes=r.notes,
            image_path=image_path,
            created_at=datetime.now(timezone.utc),
        )
        db.add(det)
        detections.append(det)

    await db.commit()
    for det in detections:
        await db.refresh(det)

    return detections


async def list_detections(
    db: AsyncSession,
    cls: str | None = None,
    status: str | None = None,
    line: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Detection], int]:
    """Paginated list of detections with optional filters.

    Returns (detections, total_count).
    """
    query = select(Detection)
    count_query = select(func.count(Detection.id))

    if cls and cls != "all":
        query = query.where(Detection.cls == cls)
        count_query = count_query.where(Detection.cls == cls)
    if status and status != "all":
        query = query.where(Detection.status == status)
        count_query = count_query.where(Detection.status == status)
    if line:
        query = query.where(Detection.line == line)
        count_query = count_query.where(Detection.line == line)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Detection.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    detections = list(result.scalars().all())

    return detections, total


async def get_detection(db: AsyncSession, detection_id: str) -> Detection | None:
    """Get a single detection by id."""
    return await db.get(Detection, detection_id)


async def update_review(
    db: AsyncSession,
    detection_id: str,
    status: str,
    notes: str | None = None,
    reviewer: str | None = None,
) -> Detection | None:
    """Update the review status of a detection and create a review record."""
    det = await db.get(Detection, detection_id)
    if det is None:
        return None

    # Update detection status
    det.status = status
    if notes is not None:
        det.notes = notes

    # Create a review record
    review = Review(
        detection_id=detection_id,
        reviewer=reviewer,
        status=status,
        notes=notes,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(review)
    await db.commit()
    await db.refresh(det)

    return det


async def delete_detection(db: AsyncSession, detection_id: str) -> bool:
    """Delete a detection and its reviews. Returns True if found and deleted."""
    det = await db.get(Detection, detection_id)
    if det is None:
        return False
    await db.delete(det)
    await db.commit()
    return True
