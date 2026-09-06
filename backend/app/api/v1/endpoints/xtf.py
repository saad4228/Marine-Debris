"""XTF Sonar Processing Endpoints."""

import logging
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_detector
from app.pipeline.interface import BaseDetector
from app.services.xtf_service import process_xtf_file

logger = logging.getLogger("nadir.api.xtf")
router = APIRouter(prefix="/xtf", tags=["XTF Sonar Processing"])


@router.post("/upload")
async def upload_and_process_xtf(
    file: UploadFile = File(...),
    line_name: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    detector: BaseDetector = Depends(get_detector),
):
    """Upload an XTF sonar file for complete end-to-end processing.

    - Binary header parsing & acoustic telemetry extraction
    - Water column removal & slant-range geometric correction
    - Slices waterfall into overlapping standard 640x640 JPG tiles
    - Concurrently runs YOLO detection on all generated tiles
    - Computes acoustic shadow height & georeferenced coordinates
    - Persists detections and survey history uniquely into database
    """
    filename = file.filename or "survey.xtf"
    logger.info("Received XTF upload: %s (content_type=%s)", filename, file.content_type)

    # Read binary bytes
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {e}")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = await process_xtf_file(
            db=db,
            detector=detector,
            file_bytes=content,
            filename=filename,
            line_name=line_name,
        )
        return result
    except Exception as e:
        logger.exception("Error processing XTF file %s: %s", filename, e)
        raise HTTPException(status_code=500, detail=f"XTF processing failed: {str(e)}")


@router.get("/surveys/{survey_id}/tiles")
async def get_survey_tiles(
    survey_id: int,
):
    """List all extracted JPG tiles for a given survey."""
    tiles_dir = Path(f"storage/tiles/survey_{survey_id}")
    if not tiles_dir.exists():
        return {"survey_id": survey_id, "tiles": []}

    tile_files = sorted(list(tiles_dir.glob("*.jpg")))
    return {
        "survey_id": survey_id,
        "count": len(tile_files),
        "tiles": [
            {
                "filename": f.name,
                "url": f"/storage/tiles/survey_{survey_id}/{f.name}",
                "size_bytes": f.stat().st_size,
            }
            for f in tile_files
        ],
    }
