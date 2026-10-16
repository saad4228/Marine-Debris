"""XTF Sonar Processing Endpoints."""

import logging
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_detector
from app.models.detection import Detection
from app.models.survey import Survey
from app.pipeline.interface import BaseDetector
from app.schemas.detection import detection_image_url
from app.services.xtf_service import process_xtf_file

logger = logging.getLogger("nadir.api.xtf")
router = APIRouter(prefix="/xtf", tags=["XTF Sonar Processing"])


class ProcessStoredRequest(BaseModel):
    filename: str
    line_name: str | None = None
    force: bool = False


def _build_survey_details_dict(survey: Survey, detections: list[Detection], tiles_dir: Path) -> dict:
    """Format survey, tiles, and detections into the standard result dictionary."""
    tile_files = sorted(list(tiles_dir.glob("*.jpg"))) if tiles_dir.exists() else []

    tile_summaries = []
    for idx, f in enumerate(tile_files):
        coverage = "full_swath"
        if "port" in f.name.lower():
            coverage = "port"
        elif "starboard" in f.name.lower():
            coverage = "starboard"

        tile_path = f"storage/tiles/survey_{survey.id}/{f.name}"
        tile_summaries.append({
            "tile_id": f.stem,
            "tile_index": idx,
            "image_path": tile_path,
            "image_url": detection_image_url(tile_path),
            "ping_start": 0,
            "ping_end": survey.ping_count or 0,
            "center_lat": survey.start_lat,
            "center_lon": survey.start_lon,
            "altitude_m": survey.altitude_m or 6.5,
            "depth_m": 28.0,
            "coverage": coverage,
            "detection_count": sum(1 for d in detections if d.image_path and f.name in d.image_path),
        })

    return {
        "survey": {
            "id": survey.id,
            "name": survey.name,
            "line": survey.line,
            "sensor": survey.sensor or "Side-Scan Sonar",
            "total_pings": survey.ping_count or 0,
            "total_tiles": len(tile_files),
            "total_detections": len(detections),
            "unlocated_detections": sum(1 for d in detections if d.lat is None or d.lon is None),
            "has_navigation": survey.start_lat is not None,
            "swath_width_m": 120.0,
            "bounds": {
                "min_lat": survey.start_lat,
                "max_lat": survey.end_lat,
                "min_lon": survey.start_lon,
                "max_lon": survey.end_lon,
            },
        },
        "tiles": tile_summaries,
        "detections": [
            {
                "id": d.id,
                "cls": d.cls,
                "conf": d.conf,
                "x": d.x,
                "y": d.y,
                "w": d.w,
                "h": d.h,
                "side": d.side,
                "range_m": d.range_m,
                "depth_m": d.depth_m,
                "lat": d.lat,
                "lon": d.lon,
                "echo_len_m": d.echo_len_m,
                "shadow_len_m": d.shadow_len_m,
                "height_est_m": d.height_est_m,
                "line": d.line,
                "ping": d.ping,
                "status": d.status,
                "notes": d.notes,
                "image_path": d.image_path,
                "image_url": detection_image_url(d.image_path),
            }
            for d in detections
        ],
        "metadata": {
            "processing_time_ms": 0,
            "sonar_name": survey.sensor or "Side-Scan Sonar",
            "cached": True,
            "stages": [
                "Ingest binary XTF ping stream & navigation",
                "Denoise: bad-ping repair & speckle suppression",
                "Slant-to-ground & water-column correction",
                "Slice waterfall into standard 640x640 JPG tiles",
                "Concurrent YOLOv8 debris inference",
                "Acoustic shadow height & GPS coordinate projection",
                "Database sync & survey catalogue registration",
            ],
        },
    }


@router.get("/stored-files")
async def list_stored_xtf_files(
    db: AsyncSession = Depends(get_db),
):
    """List all XTF/SON sonar files stored in backend storage with processing status."""
    storage_dir = Path("storage/XTFFiles")
    if not storage_dir.exists():
        storage_dir.mkdir(parents=True, exist_ok=True)

    # Query all surveys from database
    stmt = select(Survey)
    res = await db.execute(stmt)
    surveys = res.scalars().all()
    survey_map = {s.name: s for s in surveys}
    survey_stem_map = {Path(s.name).stem: s for s in surveys}

    # Count detections per survey
    det_stmt = select(Detection.survey_id, func.count(Detection.id)).group_by(Detection.survey_id)
    det_res = await db.execute(det_stmt)
    det_counts = dict(det_res.all())

    files_list = []
    found_paths = (
        list(storage_dir.glob("*.xtf"))
        + list(storage_dir.glob("*.XTF"))
        + list(storage_dir.glob("*.son"))
        + list(storage_dir.glob("*.SON"))
    )

    seen_names = set()
    sorted_paths = sorted(found_paths, key=lambda p: p.name)

    for p in sorted_paths:
        if p.name.lower() in seen_names:
            continue
        seen_names.add(p.name.lower())

        stat = p.stat()
        matched_survey = survey_map.get(p.name) or survey_stem_map.get(p.stem)
        is_processed = matched_survey is not None
        survey_id = matched_survey.id if matched_survey else None

        tiles_count = 0
        if survey_id:
            tiles_dir = Path(f"storage/tiles/survey_{survey_id}")
            if tiles_dir.exists():
                tiles_count = len(list(tiles_dir.glob("*.jpg")))

        files_list.append({
            "filename": p.name,
            "size_bytes": stat.st_size,
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "is_processed": is_processed,
            "survey_id": survey_id,
            "line": matched_survey.line if matched_survey else None,
            "total_pings": matched_survey.ping_count if matched_survey else None,
            "total_tiles": tiles_count,
            "detection_count": det_counts.get(survey_id, 0) if survey_id else 0,
            "created_at": matched_survey.created_at.isoformat() if matched_survey else None,
        })

    processed_count = sum(1 for f in files_list if f["is_processed"])
    return {
        "total_files": len(files_list),
        "processed_count": processed_count,
        "unprocessed_count": len(files_list) - processed_count,
        "files": files_list,
    }


@router.post("/process-stored")
async def process_stored_xtf(
    req: ProcessStoredRequest,
    db: AsyncSession = Depends(get_db),
    detector: BaseDetector = Depends(get_detector),
):
    """Process an XTF file already located in backend storage."""
    safe_name = Path(req.filename).name
    file_path = Path("storage/XTFFiles") / safe_name
    if not file_path.exists():
        file_path = Path("storage/uploads") / safe_name
    if not file_path.exists():
        file_path = Path("storage") / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Stored XTF file not found: {safe_name}")

    # If already processed and not force, return existing survey details
    if not req.force:
        stmt = select(Survey).where(Survey.name == safe_name)
        res = await db.execute(stmt)
        existing_survey = res.scalars().first()
        if existing_survey:
            det_stmt = select(Detection).where(Detection.survey_id == existing_survey.id)
            det_res = await db.execute(det_stmt)
            dets = list(det_res.scalars().all())
            tiles_dir = Path(f"storage/tiles/survey_{existing_survey.id}")
            return _build_survey_details_dict(existing_survey, dets, tiles_dir)

    try:
        with open(file_path, "rb") as f:
            content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read stored XTF file: {e}")

    try:
        result = await process_xtf_file(
            db=db,
            detector=detector,
            file_bytes=content,
            filename=safe_name,
            line_name=req.line_name,
        )
        return result
    except Exception as e:
        logger.exception("Error processing stored XTF file %s: %s", safe_name, e)
        raise HTTPException(status_code=500, detail=f"XTF processing failed: {str(e)}")


@router.post("/upload")
async def upload_and_process_xtf(
    file: UploadFile = File(...),
    line_name: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    detector: BaseDetector = Depends(get_detector),
):
    """Upload an XTF sonar file for complete end-to-end processing."""
    filename = file.filename or "survey.xtf"
    logger.info("Received XTF upload: %s (content_type=%s)", filename, file.content_type)

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


@router.get("/surveys/{survey_id}/details")
async def get_survey_details(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get full survey metadata, extracted tiles, and detections."""
    stmt = select(Survey).where(Survey.id == survey_id)
    res = await db.execute(stmt)
    survey = res.scalars().first()
    if not survey:
        raise HTTPException(status_code=404, detail=f"Survey {survey_id} not found")

    det_stmt = select(Detection).where(Detection.survey_id == survey_id)
    det_res = await db.execute(det_stmt)
    dets = list(det_res.scalars().all())

    tiles_dir = Path(f"storage/tiles/survey_{survey_id}")
    return _build_survey_details_dict(survey, dets, tiles_dir)


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
