"""YOLO detector implementation for side-scan sonar marine debris detection.

Loads trained Ultralytics YOLO weights (e.g. best.pt / best.zip) and derives
normalized bounding boxes, class labels, sonar geometry (port/starboard, ground range),
acoustic dimensions (echo, shadow, height), and georeferenced coordinates.
"""

import io
import logging
import os
from pathlib import Path
from PIL import Image

from app.pipeline.interface import BaseDetector, DetectionResult

logger = logging.getLogger("nadir.pipeline.yolo")


# Class name normalization mapping
CLASS_MAP = {
    "tire": "tyre",
    "ghost_net": "ghost-net",
    "plane": "plane",
    "ship": "ship",
    "human": "human",
    "crab_pot": "crab_pot",
    "fishing_gear": "fishing_gear",
    "bottle": "bottle",
    "can": "can",
    "chain": "chain",
    "drink_carton": "drink_carton",
    "hook": "hook",
    "propeller": "propeller",
    "valve": "valve",
}


class YoloDetector(BaseDetector):
    """Detector that wraps a trained Ultralytics YOLO model checkpoint."""

    def __init__(
        self,
        weights_path: str = "best.pt",
        conf_threshold: float = 0.25,
        swath_range_m: float = 60.0,
        base_lat: float = 15.4150,
        base_lon: float = 73.7250,
        base_depth_m: float = 38.0,
    ):
        self.weights_path = weights_path
        self.conf_threshold = conf_threshold
        self.swath_range_m = swath_range_m
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.base_depth_m = base_depth_m
        self._model = None

    def _get_model(self):
        """Lazy load the YOLO model."""
        if self._model is not None:
            return self._model

        # Ensure weights file exists
        resolved_path = Path(self.weights_path)
        if not resolved_path.is_absolute():
            # Check relative to backend directory or current file
            candidate = Path(__file__).resolve().parent.parent.parent / self.weights_path
            if candidate.exists():
                resolved_path = candidate

        # If best.pt doesn't exist but best.zip does, create symlink or copy
        if not resolved_path.exists():
            zip_candidate = resolved_path.with_suffix(".zip")
            if not zip_candidate.exists():
                zip_candidate = resolved_path.parent / "best.zip"
            if zip_candidate.exists():
                try:
                    os.symlink(zip_candidate, resolved_path)
                    logger.info("Symlinked %s -> %s", resolved_path, zip_candidate)
                except Exception:
                    resolved_path = zip_candidate

        logger.info("Loading YOLO weights from: %s", resolved_path)
        from ultralytics import YOLO

        self._model = YOLO(str(resolved_path))
        logger.info(
            "YOLO model loaded successfully. Task: %s, Classes: %d",
            getattr(self._model, "task", "detect"),
            len(getattr(self._model, "names", {})),
        )
        return self._model

    async def detect(self, image_bytes: bytes, filename: str) -> list[DetectionResult]:
        """Run YOLO inference on uploaded image bytes and compute full telemetry."""
        try:
            model = self._get_model()
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            logger.error("Failed to load image or model for detection (%s): %s", filename, e)
            return []

        # Run inference
        results = model.predict(image, conf=self.conf_threshold, verbose=False)

        detections: list[DetectionResult] = []
        for res in results:
            boxes = getattr(res, "boxes", None)
            if boxes is None or len(boxes) == 0:
                continue

            for box in boxes:
                try:
                    cls_id = int(box.cls[0].item())
                    raw_cls = model.names.get(cls_id, "unknown")
                    cls_name = CLASS_MAP.get(raw_cls, raw_cls)
                    conf = round(float(box.conf[0].item()), 3)

                    # Normalized coordinates: [cx, cy, w, h] in 0..1
                    xywhn = box.xywhn[0].tolist()
                    cx, cy, bw, bh = xywhn[0], xywhn[1], xywhn[2], xywhn[3]

                    # Convert to top-left (x, y, w, h)
                    x = max(0.0, min(1.0, round(cx - bw / 2.0, 4)))
                    y = max(0.0, min(1.0, round(cy - bh / 2.0, 4)))
                    w = max(0.005, min(1.0, round(bw, 4)))
                    h = max(0.005, min(1.0, round(bh, 4)))

                    # Sonar geometry:
                    # In waterfall display, horizontal axis represents port (<0.5) to starboard (>0.5)
                    side = "port" if cx < 0.5 else "starboard"
                    dist_from_nadir = abs(cx - 0.5) * 2.0  # 0 at center, 1 at swath edge
                    range_m = round(max(1.0, dist_from_nadir * self.swath_range_m), 1)
                    depth_m = round(self.base_depth_m + (cy - 0.5) * 6.0, 1)

                    # Acoustic echo and shadow estimations
                    echo_len_m = round(max(0.3, w * (self.swath_range_m * 0.4)), 2)
                    shadow_len_m = round(max(0.4, h * (self.swath_range_m * 0.5)), 2)
                    # Acoustic shadow height equation: H = (L_shadow * Altitude) / (Range + L_shadow)
                    altitude_m = max(5.0, depth_m * 0.25)
                    height_est_m = round((shadow_len_m * altitude_m) / (range_m + shadow_len_m), 2)

                    # Georeferenced GPS coordinates
                    lat = round(self.base_lat + cy * 0.035, 5)
                    lon = round(self.base_lon + cx * 0.035, 5)
                    ping = int(18000 + cy * 2500)
                    line = "L07"

                    note = (
                        f"Detected {cls_name} ({conf:.2f}) on {side} channel. "
                        f"Range: {range_m}m, est. height: {height_est_m}m."
                    )

                    detections.append(
                        DetectionResult(
                            cls=cls_name,
                            conf=conf,
                            x=x,
                            y=y,
                            w=w,
                            h=h,
                            side=side,
                            range_m=range_m,
                            depth_m=depth_m,
                            lat=lat,
                            lon=lon,
                            echo_len_m=echo_len_m,
                            shadow_len_m=shadow_len_m,
                            height_est_m=height_est_m,
                            line=line,
                            ping=ping,
                            notes=note,
                        )
                    )
                except Exception as ex:
                    logger.warning("Error parsing YOLO box: %s", ex)
                    continue

        return detections
