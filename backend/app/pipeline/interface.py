"""Abstract detector interface.

Any real ML model must subclass BaseDetector and implement `detect()`.
The application switches between StubDetector and real implementations
via the USE_STUB_MODEL config flag.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DetectionResult:
    """A single detected object — returned by every detector implementation."""
    cls: str       # class id: tyre, drum, container, ghost-net, chain, unknown, bottle, can, etc.
    conf: float    # confidence 0–1
    x: float       # normalised bounding box left   (0–1)
    y: float       # normalised bounding box top    (0–1)
    w: float       # normalised bounding box width  (0–1)
    h: float       # normalised bounding box height (0–1)

    # Sonar geometry & location details
    side: str | None = None          # port / starboard
    range_m: float | None = None     # ground range from nadir track in metres
    depth_m: float | None = None     # seabed / sensor depth in metres
    lat: float | None = None         # georeferenced latitude
    lon: float | None = None         # georeferenced longitude
    echo_len_m: float | None = None   # acoustic echo length (metres)
    shadow_len_m: float | None = None # acoustic shadow length (metres)
    height_est_m: float | None = None # estimated object relief/height (metres)
    line: str | None = None          # survey line id
    ping: int | None = None          # ping sequence number
    notes: str | None = None         # analyst or model notes


class BaseDetector(ABC):
    """Contract that every detector must satisfy.

    To plug in your real model:
    1. Create a new file, e.g. `app/pipeline/yolo_detector.py`
    2. Subclass BaseDetector
    3. Implement `async def detect(...)` to load your model and run inference
    4. Set USE_STUB_MODEL=false in .env and wire it up in `app/api/deps.py`
    """

    @abstractmethod
    async def detect(self, image_bytes: bytes, filename: str) -> list[DetectionResult]:
        """Run inference on raw image bytes and return a list of detections.

        Args:
            image_bytes: The raw bytes of the uploaded image file.
            filename:    Original filename — useful for logging and deterministic stubs.

        Returns:
            A list of DetectionResult objects.
        """
        ...
