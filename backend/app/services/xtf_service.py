"""XTF Processing Service — orchestrates XTF extraction, tiling, concurrent YOLO inference, and database persistence."""

import asyncio
from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.detection import Detection
from app.models.survey import Survey
from app.pipeline.acoustic.denoise import DenoiseConfig
from app.pipeline.acoustic.tiling import TileMetadata, tile_xtf_waterfall
from app.pipeline.acoustic.xtf_processor import XtfProcessor, XtfSurveyData
from app.pipeline.interface import BaseDetector, DetectionResult
from app.schemas.detection import detection_image_url
from app.services.detection_service import _unique_id

logger = logging.getLogger("nadir.services.xtf")


def _project_coordinates(
    lat: float | None,
    lon: float | None,
    heading_deg: float,
    side: str,
    ground_range_m: float,
    along_track_offset_m: float = 0.0,
) -> tuple[float | None, float | None]:
    """Project georeferenced Lat/Lon coordinate given vehicle position, heading, side, and distance.

    Returns (None, None) when the originating tile carried no navigation fix — a target
    detected without a vessel position stays unlocated rather than being placed somewhere
    plausible.
    """
    if lat is None or lon is None:
        return None, None

    # Earth radius in metres
    R = 6378137.0

    # Heading angle in radians
    hdg_rad = math.radians(heading_deg)

    # Across-track angle (+90 deg for starboard, -90 deg for port)
    across_angle_rad = hdg_rad + (math.pi / 2.0 if side == "starboard" else -math.pi / 2.0)

    # Displacement vector in North (dN) and East (dE) metres
    dN = ground_range_m * math.cos(across_angle_rad) + along_track_offset_m * math.cos(hdg_rad)
    dE = ground_range_m * math.sin(across_angle_rad) + along_track_offset_m * math.sin(hdg_rad)

    # Coordinate delta
    dLat = (dN / R) * (180.0 / math.pi)
    dLon = (dE / (R * math.cos(math.radians(lat)))) * (180.0 / math.pi)

    return round(lat + dLat, 6), round(lon + dLon, 6)


async def process_xtf_file(
    db: AsyncSession,
    detector: BaseDetector,
    file_bytes: bytes,
    filename: str,
    line_name: str | None = None,
    output_tiles_dir: str = "storage/tiles",
) -> dict:
    """Execute complete end-to-end processing of an XTF file.

    1. Parse binary XTF, denoise each channel, and apply acoustic corrections.
    2. Register Survey in database.
    3. Slice corrected waterfall into overlapping JPG tiles.
    4. Run YOLO model inference concurrently on all generated tiles.
    5. Calculate acoustic telemetry (shadow height, georeferenced Lat/Lon).
    6. Persist detections and survey history into database.
    """
    start_time = datetime.now(timezone.utc)
    logger.info("Starting processing for XTF file: %s (%d bytes)", filename, len(file_bytes))

    # 1. Parse XTF, denoise each channel, and extract the acoustic waterfall
    denoise_cfg = DenoiseConfig(
        enabled=settings.DENOISE_ENABLED,
        repair_bad_pings=settings.DENOISE_REPAIR_BAD_PINGS,
        beam_pattern_correction=settings.DENOISE_BEAM_PATTERN,
        destripe=settings.DENOISE_DESTRIPE,
        despeckle=settings.DESPECKLE_METHOD,
        filter_size=settings.DESPECKLE_FILTER_SIZE,
    )
    processor = XtfProcessor(
        strip_water_col=True,
        correct_slant=True,
        normalize_gain=True,
        denoise=denoise_cfg,
    )
    survey_data: XtfSurveyData = processor.process_file(file_bytes, filename)

    # 2. Register Survey in Database
    clean_line = line_name or Path(filename).stem.upper()
    if not clean_line.startswith("L"):
        clean_line = f"L_{clean_line}"

    first_pt = survey_data.nav_points[0] if survey_data.nav_points else None
    last_pt = survey_data.nav_points[-1] if survey_data.nav_points else None

    bounds_dict = {
        "min_lat": survey_data.min_lat,
        "max_lat": survey_data.max_lat,
        "min_lon": survey_data.min_lon,
        "max_lon": survey_data.max_lon,
    }

    survey = Survey(
        name=filename,
        line=clean_line,
        sensor=survey_data.sonar_name,
        frequency_khz=450.0,
        ping_count=survey_data.total_pings,
        altitude_m=float(np.mean([p.altitude_m for p in survey_data.nav_points])) if survey_data.nav_points else 6.5,
        start_lat=first_pt.lat if first_pt else survey_data.min_lat,
        start_lon=first_pt.lon if first_pt else survey_data.min_lon,
        end_lat=last_pt.lat if last_pt else survey_data.max_lat,
        end_lon=last_pt.lon if last_pt else survey_data.max_lon,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)

    # 3. Tile the waterfall into JPG images
    tiles = tile_xtf_waterfall(
        survey_data=survey_data,
        output_dir=output_tiles_dir,
        survey_id=str(survey.id),
        tile_width=640,
        tile_height=640,
        overlap_px=128,
    )

    # 4. Concurrently run YOLO inference on all generated tiles
    async def _detect_tile(tile: TileMetadata) -> tuple[TileMetadata, list[DetectionResult]]:
        try:
            results = await detector.detect(tile.image_bytes, tile.tile_id)
            return tile, results
        except Exception as ex:
            logger.error("Error detecting tile %s: %s", tile.tile_id, ex)
            return tile, []

    tile_tasks = [_detect_tile(t) for t in tiles]
    tile_detections = await asyncio.gather(*tile_tasks)

    # 5. Calculate acoustic measurements and persist detections into DB
    persisted_detections: list[Detection] = []
    tile_summaries = []
    unlocated_count = 0

    for tile, raw_dets in tile_detections:
        tile_det_count = len(raw_dets)
        tile_summaries.append({
            "tile_id": tile.tile_id,
            "tile_index": tile.tile_index,
            "image_path": tile.image_path,
            "image_url": detection_image_url(tile.image_path),
            "ping_start": tile.ping_start,
            "ping_end": tile.ping_end,
            "center_lat": tile.center_lat,
            "center_lon": tile.center_lon,
            "altitude_m": tile.altitude_m,
            "depth_m": tile.depth_m,
            "coverage": tile.channel_coverage,
            "detection_count": tile_det_count,
        })

        for det_res in raw_dets:
            det_id = await _unique_id(db)

            # Determine side from relative box coordinates & tile coverage
            cx = det_res.x + det_res.w / 2.0
            cy = det_res.y + det_res.h / 2.0

            if tile.channel_coverage == "port":
                side = "port"
                dist_norm = 1.0 - cx  # outer swath on left, nadir on right
            elif tile.channel_coverage == "starboard":
                side = "starboard"
                dist_norm = cx
            else:  # full_swath
                side = "port" if cx < 0.5 else "starboard"
                dist_norm = abs(cx - 0.5) * 2.0

            swath_r = tile.swath_range_m
            range_m = round(max(1.0, dist_norm * swath_r), 1)
            depth_m = round(tile.depth_m + (cy - 0.5) * 4.0, 1)

            # Acoustic shadow and height calculation
            echo_len_m = round(max(0.3, det_res.w * (swath_r * 0.35)), 2)
            shadow_len_m = round(max(0.4, det_res.h * (swath_r * 0.45)), 2)
            # Acoustic shadow height: H = (L_shadow * Altitude) / (Range + L_shadow)
            alt_m = max(3.0, tile.altitude_m)
            height_est_m = round((shadow_len_m * alt_m) / (range_m + shadow_len_m), 2)

            # Georeferenced coordinates projected from vehicle track
            along_track_offset = (cy - 0.5) * (swath_r * 0.4)
            det_lat, det_lon = _project_coordinates(
                lat=tile.center_lat,
                lon=tile.center_lon,
                heading_deg=tile.heading_deg,
                side=side,
                ground_range_m=range_m,
                along_track_offset_m=along_track_offset,
            )

            ping_num = int(tile.ping_start + cy * max(1, tile.ping_end - tile.ping_start))

            located = det_lat is not None and det_lon is not None
            if not located:
                unlocated_count += 1

            note = (
                f"XTF Target {det_res.cls} ({det_res.conf:.2f}) on {side} channel. "
                f"Ground range: {range_m}m, Alt: {alt_m:.1f}m, Est height: {height_est_m}m."
            )
            if not located:
                note += " No navigation fix for this ping — position unknown."

            # Spatial deduplication: check if this object is already in database within ~15m
            # proximity. Only possible for located targets — without a position there is
            # nothing to compare, so unlocated targets are always inserted.
            existing_det = None
            if located:
                lat_tol = 0.00015
                lon_tol = 0.00015 / max(0.1, math.cos(math.radians(det_lat)))
                stmt = select(Detection).where(
                    Detection.cls == det_res.cls,
                    Detection.lat.between(det_lat - lat_tol, det_lat + lat_tol),
                    Detection.lon.between(det_lon - lon_tol, det_lon + lon_tol),
                )
                res = await db.execute(stmt)
                existing_det = res.scalars().first()

            if existing_det:
                # Update confidence or image if newer detection is better, but DO NOT insert duplicate
                if det_res.conf > existing_det.conf:
                    existing_det.conf = det_res.conf
                    existing_det.image_path = tile.image_path
                    existing_det.survey_id = survey.id
                    existing_det.echo_len_m = echo_len_m
                    existing_det.shadow_len_m = shadow_len_m
                    existing_det.height_est_m = height_est_m
                persisted_detections.append(existing_det)
                continue

            det = Detection(
                id=det_id,
                cls=det_res.cls,
                conf=det_res.conf,
                x=det_res.x,
                y=det_res.y,
                w=det_res.w,
                h=det_res.h,
                side=side,
                range_m=range_m,
                depth_m=depth_m,
                lat=det_lat,
                lon=det_lon,
                echo_len_m=echo_len_m,
                shadow_len_m=shadow_len_m,
                height_est_m=height_est_m,
                line=survey.line,
                ping=ping_num,
                status="Candidate",
                notes=note,
                image_path=tile.image_path,
                survey_id=survey.id,
                created_at=datetime.now(timezone.utc),
            )
            db.add(det)
            persisted_detections.append(det)

    # 6. Commit and refresh
    await db.commit()
    await db.refresh(survey)
    for det in persisted_detections:
        await db.refresh(det)

    elapsed_ms = round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000.0, 2)
    logger.info(
        "Finished XTF processing for %s: %d tiles, %d detections in %.1fms",
        filename,
        len(tiles),
        len(persisted_detections),
        elapsed_ms,
    )

    return {
        "survey": {
            "id": survey.id,
            "name": survey.name,
            "line": survey.line,
            "sensor": survey.sensor,
            "total_pings": survey_data.total_pings,
            "total_tiles": len(tiles),
            "total_detections": len(persisted_detections),
            "unlocated_detections": unlocated_count,
            "has_navigation": survey_data.has_navigation,
            "swath_width_m": survey_data.max_slant_range_m * 2.0,
            "bounds": bounds_dict,
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
            for d in persisted_detections
        ],
        "metadata": {
            "processing_time_ms": elapsed_ms,
            "sonar_name": survey_data.sonar_name,
            "sample_rate": survey_data.sample_rate,
            "denoise": {
                "enabled": denoise_cfg.enabled,
                "despeckle": denoise_cfg.despeckle,
                "filter_size": denoise_cfg.filter_size,
                "beam_pattern_correction": denoise_cfg.beam_pattern_correction,
                "destripe": denoise_cfg.destripe,
                "repair_bad_pings": denoise_cfg.repair_bad_pings,
            },
            "stages": [
                "Parse XTF navigation & acoustic channels",
                "Denoise: bad-ping repair, spike clipping & speckle suppression",
                "Slant-to-ground & water-column correction",
                "Generate standard 640x640 JPG waterfall tiles",
                "Concurrent YOLOv8 debris inference",
                "Acoustic shadow height & GPS coordinate projection",
                "Database sync & catalogue registration",
            ],
        },
    }
