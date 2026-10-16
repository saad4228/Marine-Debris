"""YOLO detector implementation for side-scan sonar marine debris detection.

Loads trained Ultralytics YOLO weights (shipped as new.zip, unpacked to new.pt on first
use) and derives normalized bounding boxes, class labels, sonar geometry (port/starboard,
ground range), acoustic dimensions (echo, shadow, height), and georeferenced coordinates.
"""

import io
import logging
import shutil
import zipfile
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
        weights_path: str = "new.pt",
        conf_threshold: float = 0.25,
        swath_range_m: float = 60.0,
        base_depth_m: float = 38.0,
    ):
        self.weights_path = weights_path
        self.conf_threshold = conf_threshold
        self.swath_range_m = swath_range_m
        self.base_depth_m = base_depth_m
        self._model = None

    def _resolve_weights(self) -> Path:
        """Locate the weights file, unpacking a zipped checkpoint if that is all we have.

        Weights are distributed as a zip archive (they are far too large for git), so a
        fresh clone has only ``new.zip`` and no ``.pt``. Two archive shapes are handled:

        * a real zip containing a ``.pt`` member — extracted once, next to the archive
        * a bare torch checkpoint that merely carries a ``.zip`` extension — ``torch.save``
          writes zip-format files, so these load directly with no extraction

        The extracted file is cached on disk, so this cost is paid once per deployment.
        """
        resolved = Path(self.weights_path)
        if not resolved.is_absolute():
            candidate = Path(__file__).resolve().parent.parent.parent / self.weights_path
            if candidate.exists():
                return candidate
            resolved = candidate

        if resolved.is_file():
            return resolved

        # No .pt on disk — look for the archive it ships in.
        archive = resolved.with_suffix(".zip")
        if not archive.is_file():
            return resolved

        if not zipfile.is_zipfile(archive):
            return resolved

        with zipfile.ZipFile(archive) as zf:
            # __MACOSX/* holds resource forks from archives made on macOS, never weights.
            members = [
                m for m in zf.infolist()
                if m.filename.endswith(".pt") and not m.filename.startswith("__MACOSX")
            ]
            if not members:
                # A torch checkpoint saved directly as .zip: hand it to YOLO as-is.
                logger.info("Loading weights straight from torch-format archive %s", archive)
                return archive

            member = members[0]
            logger.info("Extracting %s from %s -> %s", member.filename, archive.name, resolved)
            resolved.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(resolved, "wb") as dst:
                shutil.copyfileobj(src, dst)

        return resolved

    def _get_model(self):
        """Lazy load the YOLO model."""
        if self._model is not None:
            return self._model

        resolved_path = self._resolve_weights()

        from ultralytics import YOLO

        if resolved_path.exists() and resolved_path.is_file() and resolved_path.stat().st_size > 100:
            logger.info("Loading YOLO weights from: %s", resolved_path)
            self._model = YOLO(str(resolved_path))
        else:
            logger.warning(
                "Custom weights file '%s' not found or is empty. Falling back to default 'yolov8n.pt'. "
                "Place new.zip (or an extracted new.pt) in backend/ to use the trained sonar weights.",
                resolved_path,
            )
            self._model = YOLO("yolov8n.pt")

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

                    # A standalone tile image carries no navigation, survey line or ping
                    # number, so none are derivable here. They stay None and are filled in
                    # by the XTF pipeline (which projects from the real vessel track) or by
                    # an explicit caller-supplied override on /detect.
                    lat = None
                    lon = None
                    ping = None
                    line = None

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
