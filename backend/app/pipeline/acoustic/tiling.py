"""Waterfall tiling engine for Side-Scan Sonar.

Splits large, continuous corrected sonar waterfalls into overlapping standard JPG tiles
suitable for high-accuracy YOLOv8 detection.
Tracks spatial bounds (pings, coordinates, altitude, side) for each extracted tile.
"""

from dataclasses import dataclass
import io
import logging
from pathlib import Path
from PIL import Image
import numpy as np

from app.pipeline.acoustic.xtf_processor import XtfNavigationPoint, XtfSurveyData

logger = logging.getLogger("nadir.pipeline.tiling")


@dataclass
class TileMetadata:
    """Metadata and image payload for an extracted sonar waterfall tile."""
    tile_index: int
    tile_id: str
    image_path: str  # Relative path for serving / storage, e.g. "storage/tiles/survey_1/tile_000.jpg"
    abs_path: str
    image_bytes: bytes
    width: int
    height: int
    # Waterfall pixel bounding box
    x_start: int
    x_end: int
    y_start: int
    y_end: int
    # Acoustic and spatial telemetry
    ping_start: int
    ping_end: int
    # None when no ping in this tile's window carried a navigation fix
    center_lat: float | None
    center_lon: float | None
    heading_deg: float
    altitude_m: float
    depth_m: float
    swath_range_m: float
    channel_coverage: str  # "full_swath", "port", "starboard"


def tile_xtf_waterfall(
    survey_data: XtfSurveyData,
    output_dir: Path | str,
    survey_id: str | int = "1",
    tile_width: int = 640,
    tile_height: int = 640,
    overlap_px: int = 128,
) -> list[TileMetadata]:
    """Slice the XTF survey waterfall into overlapping JPG tiles and save to disk.

    Args:
        survey_data: Extracted XtfSurveyData containing waterfall_composite and nav_points.
        output_dir: Destination base directory (e.g. backend/storage/tiles).
        survey_id: Survey identifier used to create subfolder.
        tile_width: Desired tile width in pixels.
        tile_height: Desired tile height in pixels.
        overlap_px: Stride overlap between adjacent tiles.

    Returns:
        List of TileMetadata objects with saved image paths and spatial telemetry.
    """
    out_path = Path(output_dir) / f"survey_{survey_id}"
    out_path.mkdir(parents=True, exist_ok=True)

    waterfall = survey_data.waterfall_composite
    n_pings, n_samples = waterfall.shape

    if n_pings == 0 or n_samples == 0:
        logger.warning("Empty waterfall provided for tiling.")
        return []

    tiles: list[TileMetadata] = []
    y_step = max(64, tile_height - overlap_px)
    x_step = max(64, tile_width - overlap_px)

    # Determine across-track column slicing
    # If waterfall width is comparable to tile_width (e.g. 1024 vs 640), slice Port, Center, and Starboard
    if n_samples <= tile_width * 1.2:
        x_ranges = [(0, n_samples, "full_swath")]
    else:
        # Port half, Center (nadir), Starboard half
        half = n_samples // 2
        x_ranges = [
            (0, min(n_samples, tile_width), "port"),
            (max(0, half - tile_width // 2), min(n_samples, half + tile_width // 2), "full_swath"),
            (max(0, n_samples - tile_width), n_samples, "starboard"),
        ]

    tile_idx = 0
    y_start = 0

    while y_start < n_pings:
        y_end = min(n_pings, y_start + tile_height)
        ping_sub_indices = range(y_start, y_end)

        # Average navigation telemetry for this ping window
        window_nav = [survey_data.nav_points[i] for i in ping_sub_indices if i < len(survey_data.nav_points)]
        if window_nav:
            p_start = window_nav[0].ping_number
            p_end = window_nav[-1].ping_number
            # Average only over pings that actually carried a fix; a tile whose window has
            # no fix at all stays unlocated rather than borrowing a neighbour's position.
            located = [p for p in window_nav if p.has_fix]
            avg_lat = float(np.mean([p.lat for p in located])) if located else None
            avg_lon = float(np.mean([p.lon for p in located])) if located else None
            avg_heading = float(np.mean([p.heading for p in window_nav]))
            avg_alt = float(np.mean([p.altitude_m for p in window_nav]))
            avg_dep = float(np.mean([p.depth_m for p in window_nav]))
            slant_r = float(np.mean([p.slant_range_m for p in window_nav]))
        else:
            p_start, p_end = y_start + 1, y_end
            avg_lat = None
            avg_lon = None
            avg_heading = 45.0
            avg_alt = 6.5
            avg_dep = 28.0
            slant_r = survey_data.max_slant_range_m

        for x_start, x_end, coverage_label in x_ranges:
            tile_crop = waterfall[y_start:y_end, x_start:x_end]

            # Convert to PIL RGB Image
            img = Image.fromarray(tile_crop).convert("RGB")

            # Resize if smaller or disproportionate to ensure 640x640 standard YOLO input
            if img.width != tile_width or img.height != tile_height:
                img_resized = img.resize((tile_width, tile_height), Image.Resampling.BICUBIC)
            else:
                img_resized = img

            # Encode as JPG
            buf = io.BytesIO()
            img_resized.save(buf, format="JPEG", quality=92)
            jpg_bytes = buf.getvalue()

            tile_filename = f"tile_{tile_idx:04d}_{coverage_label}.jpg"
            tile_file_path = out_path / tile_filename
            with open(tile_file_path, "wb") as f:
                f.write(jpg_bytes)

            rel_path = f"storage/tiles/survey_{survey_id}/{tile_filename}"
            tile_id = f"TILE-S{survey_id}-{tile_idx:03d}"

            tiles.append(
                TileMetadata(
                    tile_index=tile_idx,
                    tile_id=tile_id,
                    image_path=rel_path,
                    abs_path=str(tile_file_path),
                    image_bytes=jpg_bytes,
                    width=tile_width,
                    height=tile_height,
                    x_start=x_start,
                    x_end=x_end,
                    y_start=y_start,
                    y_end=y_end,
                    ping_start=p_start,
                    ping_end=p_end,
                    center_lat=avg_lat,
                    center_lon=avg_lon,
                    heading_deg=avg_heading,
                    altitude_m=avg_alt,
                    depth_m=avg_dep,
                    swath_range_m=slant_r,
                    channel_coverage=coverage_label,
                )
            )
            tile_idx += 1

        if y_end >= n_pings:
            break
        y_start += y_step

    logger.info("Generated %d JPG tiles for survey %s in %s", len(tiles), survey_id, out_path)
    return tiles
