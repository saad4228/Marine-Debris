"""Survey service — business logic for survey lines and survey metadata."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.survey import Survey
from app.schemas.survey import SurveyCreate


async def create_survey(db: AsyncSession, data: SurveyCreate) -> Survey:
    """Register a new survey line metadata record."""
    survey = Survey(
        name=data.name,
        line=data.line,
        sensor=data.sensor,
        frequency_khz=data.frequency_khz,
        ping_count=data.ping_count,
        altitude_m=data.altitude_m,
        start_lat=data.start_lat,
        start_lon=data.start_lon,
        end_lat=data.end_lat,
        end_lon=data.end_lon,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return survey


async def list_surveys(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Survey], int]:
    """List all registered survey lines."""
    count_query = select(func.count(Survey.id))
    total = (await db.execute(count_query)).scalar() or 0

    query = select(Survey).order_by(Survey.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    surveys = list(result.scalars().all())

    return surveys, total


async def get_survey(db: AsyncSession, survey_id: int) -> Survey | None:
    """Get a single survey by id."""
    return await db.get(Survey, survey_id)
