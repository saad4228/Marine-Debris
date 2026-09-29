"""Pydantic schemas for survey line request / response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class SurveyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    line: str = Field(..., max_length=50)
    sensor: str | None = None
    frequency_khz: float | None = None
    ping_count: int | None = None
    altitude_m: float | None = None
    start_lat: float | None = None
    start_lon: float | None = None
    end_lat: float | None = None
    end_lon: float | None = None


class SurveyResponse(BaseModel):
    id: int
    name: str
    line: str
    sensor: str | None = None
    frequency_khz: float | None = None
    ping_count: int | None = None
    altitude_m: float | None = None
    start_lat: float | None = None
    start_lon: float | None = None
    end_lat: float | None = None
    end_lon: float | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class SurveyListResponse(BaseModel):
    total: int
    surveys: list[SurveyResponse]
