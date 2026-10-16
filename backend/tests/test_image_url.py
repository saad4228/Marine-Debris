"""Contract tests for image_url on DetectionResponse.

image_url was declared as a plain @property, which Pydantic v2 does not serialise, so it
was silently absent from every response the API returned. These tests pin the shape: the
key is always present, always derived from image_path by one shared helper, and explicitly
null (never omitted) when a detection has no image.
"""

import pytest

from app.schemas.detection import DetectionResponse, detection_image_url

BASE = {"id": "NDR-00001", "cls": "ship", "conf": 0.42, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}


@pytest.mark.parametrize(
    "image_path,expected",
    [
        ("storage/tiles/survey_20/tile_0004_full_swath.jpg", "/storage/tiles/survey_20/tile_0004_full_swath.jpg"),
        ("/storage/tiles/survey_20/tile_0004_full_swath.jpg", "/storage/tiles/survey_20/tile_0004_full_swath.jpg"),
        ("storage/uploads/1788633748_tile.png", "/storage/uploads/1788633748_tile.png"),
        (None, None),
        ("", None),
    ],
)
def test_detection_image_url_helper(image_path, expected):
    assert detection_image_url(image_path) == expected


def test_image_url_is_serialised_not_just_a_property():
    """The actual regression: @property alone is dropped by model_dump()."""
    dumped = DetectionResponse(**BASE, image_path="storage/tiles/survey_1/t.jpg").model_dump()

    assert "image_url" in dumped, "image_url must be serialised, not merely a Python property"
    assert dumped["image_url"] == "/storage/tiles/survey_1/t.jpg"


def test_image_url_key_present_and_null_when_no_image():
    """Nullable by design — the key is emitted as null, never omitted."""
    dumped = DetectionResponse(**BASE, image_path=None).model_dump()

    assert "image_url" in dumped
    assert dumped["image_url"] is None


def test_image_url_matches_image_path():
    det = DetectionResponse(**BASE, image_path="storage/tiles/survey_9/tile_0001_port.jpg")
    assert det.image_url == f"/{det.image_path}"


@pytest.mark.asyncio
async def test_all_detection_routes_return_the_same_shape(client, db_session):
    """list, single-fetch and review must emit identical keys, image_url included."""
    from datetime import datetime, timezone

    from app.models.detection import Detection

    db_session.add(
        Detection(
            id="NDR-SHAPE1", cls="ship", conf=0.5, x=0.1, y=0.1, w=0.2, h=0.2,
            status="Candidate", image_path="storage/tiles/survey_1/tile_0000_port.jpg",
            created_at=datetime.now(timezone.utc),
        )
    )
    # A detection with no image at all, to prove the null case survives the round trip.
    db_session.add(
        Detection(
            id="NDR-SHAPE2", cls="chain", conf=0.6, x=0.1, y=0.1, w=0.2, h=0.2,
            status="Candidate", image_path=None,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()

    listed = (await client.get("/api/v1/detections?page_size=200")).json()["detections"]
    by_id = {d["id"]: d for d in listed}
    assert by_id["NDR-SHAPE1"]["image_url"] == "/storage/tiles/survey_1/tile_0000_port.jpg"
    assert "image_url" in by_id["NDR-SHAPE2"] and by_id["NDR-SHAPE2"]["image_url"] is None

    single = (await client.get("/api/v1/detections/NDR-SHAPE1")).json()
    reviewed = (
        await client.patch(
            "/api/v1/detections/NDR-SHAPE1/review", json={"status": "Confirmed by review"}
        )
    ).json()

    assert single.keys() == by_id["NDR-SHAPE1"].keys() == reviewed.keys()
    assert single["image_url"] == reviewed["image_url"] == "/storage/tiles/survey_1/tile_0000_port.jpg"
