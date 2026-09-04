"""Pydantic schemas for detection request / response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


# ── Bounding box returned by the detector ─────────────────────────────────────

class BoundingBox(BaseModel):
    """Normalised bounding box — x, y, w, h as 0..1 fractions of the image."""
    cls: str = Field(..., description="Class id: tyre, drum, container, ghost-net, chain, unknown")
    conf: float = Field(..., ge=0.0, le=1.0, description="Model confidence 0–1")
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    w: float = Field(..., ge=0.0, le=1.0)
    h: float = Field(..., ge=0.0, le=1.0)


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
