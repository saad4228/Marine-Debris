"""Survey lines endpoints — manages hydrographic survey passes and XTF metadata."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import SurveyNotFound
from app.schemas.survey import SurveyCreate, SurveyListResponse, SurveyResponse
from app.services import survey_service

router = APIRouter()


@router.get("", response_model=SurveyListResponse)
async def list_surveys(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List registered survey lines."""
    items, total = await survey_service.list_surveys(db, skip=skip, limit=limit)
    return SurveyListResponse(
        total=total,
        surveys=[SurveyResponse.model_validate(s) for s in items],
    )


@router.post("", response_model=SurveyResponse, status_code=status.HTTP_201_CREATED)
async def create_survey(
    payload: SurveyCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new survey line."""
    survey = await survey_service.create_survey(db, payload)
    return SurveyResponse.model_validate(survey)


@router.get("/{survey_id}", response_model=SurveyResponse)
async def get_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get metadata for a specific survey line."""
    survey = await survey_service.get_survey(db, survey_id)
    if survey is None:
        raise SurveyNotFound(survey_id)
    return SurveyResponse.model_validate(survey)
