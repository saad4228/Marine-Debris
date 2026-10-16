"""Batch process all remaining unprocessed XTF files in backend/storage/XTFFiles.

Runs end-to-end acoustic denoising, slant-range correction, waterfall tiling,
YOLOv8 marine debris inference, coordinate projection, and database persistence
for every survey file.
"""

import asyncio
from datetime import datetime, timezone
import logging
from pathlib import Path
import sys
import time

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import create_tables, async_session, engine
from app.models.detection import Detection
from app.models.survey import Survey
from app.pipeline.yolo_detector import YoloDetector
from app.services.xtf_service import process_xtf_file

# Configure console logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
# Silence verbose loggers
logging.getLogger("ultralytics").setLevel(logging.WARNING)
logging.getLogger("pyxtf").setLevel(logging.WARNING)
logger = logging.getLogger("batch_runner")


async def get_processed_survey_names(db: AsyncSession) -> set[str]:
    """Return set of filenames and stems already registered in the database."""
    stmt = select(Survey.name)
    res = await db.execute(stmt)
    names = set(res.scalars().all())
    stems = {Path(n).stem for n in names}
    return names | stems


async def main():
    start_total_time = time.time()
    logger.info("Initializing NADIR database and YOLO model...")
    await create_tables()

    # Load YOLO detector checkpoint once
    detector = YoloDetector()
    detector._get_model()  # warm up weights

    storage_dir = Path("storage/XTFFiles")
    if not storage_dir.exists():
        logger.error("Directory %s does not exist!", storage_dir)
        sys.exit(1)

    seen_lower = set()
    all_files = []
    for f in sorted(list(storage_dir.iterdir()), key=lambda p: p.name):
        if f.is_file() and f.suffix.lower() in [".xtf", ".son"]:
            if f.name.lower() not in seen_lower:
                seen_lower.add(f.name.lower())
                all_files.append(f)

    async with async_session() as session:
        processed_names = await get_processed_survey_names(session)

    unprocessed_files = [f for f in all_files if f.name not in processed_names and f.stem not in processed_names]

    logger.info(
        "Found %d total XTF files in %s: %d already processed, %d remaining to run.",
        len(all_files),
        storage_dir,
        len(all_files) - len(unprocessed_files),
        len(unprocessed_files),
    )

    if not unprocessed_files:
        logger.info("All files are already processed! Nothing to do.")
        return

    total_unprocessed = len(unprocessed_files)
    successful_count = 0
    failed_count = 0
    total_detections_batch = 0
    total_tiles_batch = 0

    for idx, fpath in enumerate(unprocessed_files, 1):
        file_name = fpath.name
        file_size_mb = round(fpath.stat().st_size / (1024 * 1024), 2)
        logger.info(
            "[%d/%d] Starting: %s (%.1f MB)...",
            idx,
            total_unprocessed,
            file_name,
            file_size_mb,
        )

        t0 = time.time()
        try:
            with open(fpath, "rb") as f:
                content = f.read()

            async with async_session() as session:
                result = await process_xtf_file(
                    db=session,
                    detector=detector,
                    file_bytes=content,
                    filename=file_name,
                )

            elapsed = round(time.time() - t0, 1)
            survey_id = result["survey"]["id"]
            tiles_cnt = len(result["tiles"])
            dets_cnt = len(result["detections"])

            successful_count += 1
            total_tiles_batch += tiles_cnt
            total_detections_batch += dets_cnt

            det_summary = ""
            if dets_cnt > 0:
                cls_counts = {}
                for d in result["detections"]:
                    cls_counts[d["cls"]] = cls_counts.get(d["cls"], 0) + 1
                det_summary = " -> Found: " + ", ".join(f"{count}x {cls}" for cls, count in cls_counts.items())

            logger.info(
                "[%d/%d] SUCCESS: Survey #%d registered with %d tiles, %d detections in %.1fs%s",
                idx,
                total_unprocessed,
                survey_id,
                tiles_cnt,
                dets_cnt,
                elapsed,
                det_summary,
            )

            # Delete the raw XTF file from storage after processing to reclaim disk space
            try:
                fpath.unlink(missing_ok=True)
                logger.info("[%d/%d] Deleted raw XTF from storage: %s", idx, total_unprocessed, file_name)
            except Exception as del_err:
                logger.warning("[%d/%d] Could not delete raw file %s: %s", idx, total_unprocessed, file_name, del_err)

        except Exception as e:
            failed_count += 1
            logger.error("[%d/%d] FAILED on %s: %s", idx, total_unprocessed, file_name, e)

        # Periodic status summary every 5 files
        if idx % 5 == 0 or idx == total_unprocessed:
            elapsed_total = round((time.time() - start_total_time) / 60, 1)
            avg_sec = round((time.time() - start_total_time) / idx, 1)
            remaining_mins = round((avg_sec * (total_unprocessed - idx)) / 60, 1)
            logger.info(
                "--- PROGRESS: %d/%d done (%d ok, %d fail) | %d new detections | Elapsed: %.1fm | Est. remaining: %.1fm ---",
                idx,
                total_unprocessed,
                successful_count,
                failed_count,
                total_detections_batch,
                elapsed_total,
                remaining_mins,
            )

    # Final tally
    total_elapsed_min = round((time.time() - start_total_time) / 60, 2)
    async with async_session() as session:
        total_surveys_stmt = select(func.count(Survey.id))
        total_dets_stmt = select(func.count(Detection.id))
        total_surveys = (await session.execute(total_surveys_stmt)).scalar() or 0
        total_dets = (await session.execute(total_dets_stmt)).scalar() or 0

    logger.info("=========================================================")
    logger.info("BATCH RUN COMPLETE in %.2f minutes!", total_elapsed_min)
    logger.info("Processed %d files (%d succeeded, %d failed)", total_unprocessed, successful_count, failed_count)
    logger.info("New tiles generated: %d", total_tiles_batch)
    logger.info("New detections saved: %d", total_detections_batch)
    logger.info("Grand Total in Database: %d surveys, %d detections", total_surveys, total_dets)
    logger.info("=========================================================")


if __name__ == "__main__":
    asyncio.run(main())
