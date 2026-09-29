"""Custom application exceptions mapped to HTTP error responses."""

from fastapi import HTTPException, status


class DetectionNotFound(HTTPException):
    def __init__(self, detection_id: str) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Detection '{detection_id}' not found in catalogue.",
        )


class SurveyNotFound(HTTPException):
    def __init__(self, survey_id: int) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey line with id {survey_id} not found.",
        )


class InvalidImageFile(HTTPException):
    def __init__(self, reason: str = "Unsupported or corrupt image file.") -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=reason,
        )
