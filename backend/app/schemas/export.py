"""Pydantic schemas for export and stats responses."""

from pydantic import BaseModel


# ── Stats ─────────────────────────────────────────────────────────────────────

class ClassCount(BaseModel):
    cls: str
    count: int


class StatsResponse(BaseModel):
    total_detections: int
    confirmed: int
    candidates: int
    rejected: int
    by_class: list[ClassCount]


# ── GeoJSON feature (simplified) ──────────────────────────────────────────────

class GeoJSONProperties(BaseModel):
    id: str
    cls: str
    conf: float
    status: str
    notes: str | None = None


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: list[float]  # [lon, lat]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: GeoJSONProperties


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]
