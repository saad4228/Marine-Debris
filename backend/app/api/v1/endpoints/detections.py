"""Detections catalogue and review endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import DetectionNotFound
from app.schemas.detection import (
    DetectionListResponse,
    DetectionResponse,
    ReviewResponse,
    ReviewUpdate,
)
from app.services import detection_service

router = APIRouter()


@router.get("", response_model=DetectionListResponse)
async def list_detections(
    cls: str | None = Query(None, description="Filter by class: tyre, drum, container, ghost-net, chain, unknown, or all"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status: Candidate, Confirmed by review, Rejected"),
    line: str | None = Query(None, description="Filter by survey line e.g. L07, L08"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve paginated detections catalogue with optional class/status filters."""
    items, total = await detection_service.list_detections(
        db,
        cls=cls,
        status=status_filter,
        line=line,
        page=page,
        page_size=page_size,
    )
    return DetectionListResponse(
        total=total,
        page=page,
        page_size=page_size,
        detections=[DetectionResponse.model_validate(d) for d in items],
    )


@router.get("/{detection_id}", response_model=DetectionResponse)
async def get_detection(
    detection_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full telemetry and specification for a single detection."""
    det = await detection_service.get_detection(db, detection_id)
    if det is None:
        raise DetectionNotFound(detection_id)
    return DetectionResponse.model_validate(det)


@router.patch("/{detection_id}/review", response_model=DetectionResponse)
async def review_detection(
    detection_id: str,
    payload: ReviewUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update analyst review status (Candidate, Confirmed by review, Rejected) and notes."""
    det = await detection_service.update_review(
        db,
        detection_id=detection_id,
        status=payload.status,
        notes=payload.notes,
        reviewer=payload.reviewer,
    )
    if det is None:
        raise DetectionNotFound(detection_id)
    return DetectionResponse.model_validate(det)


@router.delete("/{detection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_detection(
    detection_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a detection record from the catalogue."""
    deleted = await detection_service.delete_detection(db, detection_id)
    if not deleted:
        raise DetectionNotFound(detection_id)
    return None
