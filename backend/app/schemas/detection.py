"""Pydantic schemas for detection request / response validation."""

from datetime import datetime
from pydantic import BaseModel, Field, computed_field


def detection_image_url(image_path: str | None) -> str | None:
    """Public URL for a stored detection image, or None when there is no image.

    The single source of truth for turning a stored path into a URL. Detection images
    live under the StaticFiles mount at /storage (tiles under storage/tiles/..., single
    uploads under storage/uploads/...), so the URL is just the stored relative path made
    absolute. Anything that needs this URL must call this function rather than
    re-deriving the layout, so a move to a CDN or signed URLs is a one-place change.
    """
    if not image_path:
        return None
    return f"/{str(image_path).lstrip('/')}"


# ── Bounding box returned by the detector ─────────────────────────────────────

class BoundingBox(BaseModel):
    """Normalised bounding box — x, y, w, h as 0..1 fractions of the image, with sonar telemetry."""
    cls: str = Field(..., description="Class id: tyre, drum, container, ghost-net, chain, unknown, bottle, etc.")
    conf: float = Field(..., ge=0.0, le=1.0, description="Model confidence 0–1")
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    w: float = Field(..., ge=0.0, le=1.0)
    h: float = Field(..., ge=0.0, le=1.0)

    # Optional sonar geometry & location details
    side: str | None = None
    range_m: float | None = None
    depth_m: float | None = None
    lat: float | None = None
    lon: float | None = None
    echo_len_m: float | None = None
    shadow_len_m: float | None = None
    height_est_m: float | None = None
    line: str | None = None
    ping: int | None = None
    notes: str | None = None


# ── Response from POST /detect ────────────────────────────────────────────────

class DetectResponseMetadata(BaseModel):
    processing_time_ms: float
    model: str = "stub"
    stages: list[str] = []


class DetectResponse(BaseModel):
    """Matches the contract the frontend expects: { detections: [...] }"""
    detections: list[BoundingBox]
    metadata: DetectResponseMetadata


# ── Full detection record (from DB) ───────────────────────────────────────────

class DetectionResponse(BaseModel):
    id: str
    cls: str
    conf: float
    x: float
    y: float
    w: float
    h: float
    side: str | None = None
    range_m: float | None = None
    depth_m: float | None = None
    lat: float | None = None
    lon: float | None = None
    echo_len_m: float | None = None
    shadow_len_m: float | None = None
    height_est_m: float | None = None
    line: str | None = None
    ping: int | None = None
    status: str = "Candidate"
    notes: str | None = None
    image_path: str | None = None
    survey_id: int | None = None
    created_at: datetime | None = None

    # A plain @property is NOT serialised by Pydantic v2, which is why this field was
    # silently missing from every DetectionResponse the API returned. @computed_field
    # puts it in the JSON, so list, single-fetch and review all emit an identical shape.
    #
    # Nullable by design: image_path is nullable in the DB and /detect leaves it None
    # when the disk write fails, so a detection can genuinely have no image. The key is
    # always present and is explicitly null in that case — never omitted.
    @computed_field
    @property
    def image_url(self) -> str | None:
        return detection_image_url(self.image_path)

    model_config = {"from_attributes": True}


# ── Review update ─────────────────────────────────────────────────────────────

class ReviewUpdate(BaseModel):
    status: str = Field(..., description="Candidate | Confirmed by review | Rejected")
    notes: str | None = None
    reviewer: str | None = None


class ReviewResponse(BaseModel):
    id: int
    detection_id: str
    reviewer: str | None = None
    status: str
    notes: str | None = None
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Paginated list ────────────────────────────────────────────────────────────

class DetectionListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    detections: list[DetectionResponse]
