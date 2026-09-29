"""Stub detector — mirrors the frontend's demoDetect logic.

Produces deterministic fake detections seeded from the filename and file size
so the same file always gives the same boxes. Used when USE_STUB_MODEL=true
(i.e. no real ML model is available yet).
"""

import hashlib
from app.pipeline.interface import BaseDetector, DetectionResult

CLASSES = [
    "bottle", "can", "chain", "drink_carton", "hook", "propeller",
    "tyre", "valve", "plane", "ship", "human", "ghost-net",
    "crab_pot", "fishing_gear",
]


def _seeded_rng(seed: str):
    """Simple deterministic PRNG seeded from a string (matches the frontend's rngFor)."""
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)

    def _next() -> float:
        nonlocal h
        h = (h * 1103515245 + 12345) & 0x7FFFFFFF
        return h / 0x7FFFFFFF

    return _next


class StubDetector(BaseDetector):
    """Returns fake but deterministic detections for demo / development purposes.

    TODO: Replace this with your real model by subclassing BaseDetector.
    """

    async def detect(self, image_bytes: bytes, filename: str) -> list[DetectionResult]:
        seed = f"{filename}:{len(image_bytes)}"
        rng = _seeded_rng(seed)

        roll = rng()
        n = 0 if roll < 0.22 else 1 + int(rng() * 3)

        detections: list[DetectionResult] = []
        for _ in range(n):
            cls = CLASSES[int(rng() * len(CLASSES))]
            w = 0.08 + rng() * 0.14
            h = 0.08 + rng() * 0.14
            detections.append(
                DetectionResult(
                    cls=cls,
                    conf=round(0.55 + rng() * 0.42, 2),
                    x=rng() * (1 - w),
                    y=rng() * (1 - h),
                    w=w,
                    h=h,
                )
            )

        return detections
