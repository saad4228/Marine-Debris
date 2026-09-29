"""Detection inference endpoint — receives sonar tile image and returns detected bounding boxes."""

import time
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_detector
from app.config import settings
from app.core.exceptions import InvalidImageFile
from app.pipeline.interface import BaseDetector
from app.schemas.detection import BoundingBox, DetectResponse, DetectResponseMetadata
from app.services.detection_service import persist_detections

router = APIRouter()


@router.post("", response_model=DetectResponse)
async def detect_sonar_image(
    image: UploadFile = File(...),
    persist: bool = True,
    line: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    depth_m: float | None = None,
    detector: BaseDetector = Depends(get_detector),
    db: AsyncSession = Depends(get_db),
):
    """Run candidate detection on an uploaded sonar tile image.

    Accepts multipart/form-data with field `image`.
    Returns `{ detections: [{ cls, conf, x, y, w, h, lat, lon, ... }], metadata: {...} }`.
    Matches the exact contract expected by NADIR's frontend.
    """
    if not image.filename:
        raise InvalidImageFile("Uploaded file must have a filename.")

    content_type = image.content_type or ""
    if not (content_type.startswith("image/") or image.filename.lower().endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp"))):
        raise InvalidImageFile("File must be an image (PNG, JPG, TIFF, etc.).")

    start_time = time.perf_counter()
    image_bytes = await image.read()

    if not image_bytes:
        raise InvalidImageFile("Uploaded file is empty.")

    # Save to storage directory if configured
    saved_rel_path = None
    try:
        dest = settings.upload_path / f"{int(time.time())}_{image.filename}"
        with open(dest, "wb") as f:
            f.write(image_bytes)
        saved_rel_path = str(dest)
    except Exception:
        # Non-fatal if disk write fails
        pass

    # Run detection inference (Stub or real model)
    raw_results = await detector.detect(image_bytes=image_bytes, filename=image.filename)

    # If caller supplied explicit survey location context, overlay them
    for r in raw_results:
        if line and not r.line:
            r.line = line
        if lat is not None and r.lat is None:
            r.lat = lat
        if lon is not None and r.lon is None:
            r.lon = lon
        if depth_m is not None and r.depth_m is None:
            r.depth_m = depth_m

    # Persist to database if requested
    if persist and raw_results:
        try:
            await persist_detections(db, raw_results, image_path=saved_rel_path)
        except Exception:
            # Continue even if DB connection is unavailable in offline demo mode
            pass

    duration_ms = (time.perf_counter() - start_time) * 1000

    boxes = [
        BoundingBox(
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
            notes=r.notes,
        )
        for r in raw_results
    ]

    return DetectResponse(
        detections=boxes,
        metadata=DetectResponseMetadata(
            processing_time_ms=round(duration_ms, 2),
            model="stub_detector" if settings.USE_STUB_MODEL else "trained_yolo_model",
            stages=[
                "Correct water column",
                "Tile the waterfall",
                "Propose candidates",
                "Classify echo and shadow",
                "Reconcile and export",
            ],
        ),
    )
