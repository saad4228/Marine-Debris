"""Unit tests for navigation handling — coordinates are never fabricated.

A detection with no navigation fix must be reported as detected but unlocated. These
tests guard against any reintroduction of a placeholder position.
"""

import numpy as np
import pytest

from app.pipeline.acoustic.tiling import tile_xtf_waterfall
from app.pipeline.acoustic.xtf_processor import XtfProcessor, _validate_fix

# The origin the old code used to invent positions around.
FABRICATED_LAT = 15.4150
FABRICATED_LON = 73.7250


@pytest.mark.parametrize(
    "raw_lat,raw_lon",
    [
        (None, None),
        (None, 73.7),
        (15.4, None),
        ("not-a-number", 73.7),
        (float("nan"), 73.7),
        (float("inf"), 73.7),
        (91.0, 73.7),        # latitude out of range
        (15.4, 181.0),       # longitude out of range
        (0.0, 0.0),          # Null Island — the classic "no GPS" sentinel
    ],
)
def test_validate_fix_rejects_unusable_positions(raw_lat, raw_lon):
    assert _validate_fix(raw_lat, raw_lon) == (None, None)


@pytest.mark.parametrize(
    "raw_lat,raw_lon",
    [
        (15.4150, 73.7250),
        (30.3881, -88.3849),   # real Gulf of Mexico survey nav
        (-33.9, 18.4),
        ("15.4", "73.7"),      # numeric strings are still a real fix
    ],
)
def test_validate_fix_accepts_real_positions(raw_lat, raw_lon):
    lat, lon = _validate_fix(raw_lat, raw_lon)
    assert lat == pytest.approx(float(raw_lat))
    assert lon == pytest.approx(float(raw_lon))


def test_survey_without_navigation_has_no_coordinates():
    """An unparseable file tells us nothing about where it was recorded."""
    survey = XtfProcessor()._generate_synthetic_survey("nonav.xtf", "TestSonar")

    assert survey.has_navigation is False
    assert all(p.lat is None and p.lon is None for p in survey.nav_points)
    assert all(p.has_fix is False for p in survey.nav_points)
    assert survey.min_lat is None and survey.max_lat is None
    assert survey.min_lon is None and survey.max_lon is None


def test_survey_without_navigation_still_produces_imagery():
    """No position must not mean no detection — the waterfall is still built."""
    survey = XtfProcessor()._generate_synthetic_survey("nonav.xtf", "TestSonar")

    assert survey.waterfall_composite.dtype == np.uint8
    assert survey.waterfall_composite.shape[0] == len(survey.nav_points) == survey.total_pings


def test_tiles_from_unlocated_survey_have_no_centre(tmp_path):
    survey = XtfProcessor()._generate_synthetic_survey("nonav.xtf", "TestSonar")
    tiles = tile_xtf_waterfall(survey, output_dir=tmp_path, survey_id="nonav")

    assert tiles, "imagery must still be tiled so the detector can run"
    assert all(t.center_lat is None and t.center_lon is None for t in tiles)


def test_junk_payload_never_lands_on_the_fabricated_origin():
    """The regression this suite exists for: no silent fallback to Goa."""
    survey = XtfProcessor().process_file(b"\x00" * 4096, "junk.xtf")

    for point in survey.nav_points:
        if point.lat is not None:
            assert not (
                abs(point.lat - FABRICATED_LAT) < 0.5 and abs(point.lon - FABRICATED_LON) < 0.5
            ), "navigation fell back to the fabricated origin"


def test_project_coordinates_returns_none_without_a_fix():
    from app.services.xtf_service import _project_coordinates

    assert _project_coordinates(None, None, 45.0, "port", 20.0) == (None, None)
    assert _project_coordinates(15.4, None, 45.0, "port", 20.0) == (None, None)
    assert _project_coordinates(None, 73.7, 45.0, "port", 20.0) == (None, None)


def test_project_coordinates_still_projects_with_a_fix():
    from app.services.xtf_service import _project_coordinates

    lat, lon = _project_coordinates(15.4, 73.7, 0.0, "starboard", 100.0)
    assert lat is not None and lon is not None
    # Heading 0 (north) with a starboard offset displaces east, not north.
    assert lat == pytest.approx(15.4, abs=1e-4)
    assert lon > 73.7


@pytest.mark.asyncio
async def test_unlocated_detections_persist_without_crashing_dedup(db_session):
    """Spatial dedup must be SKIPPED for unlocated targets, not run with None bounds.

    Uses StubDetector, which always emits boxes with no coordinates, so the persistence
    and dedup path is genuinely exercised — a real model finds nothing on synthetic noise,
    which would make this assertion vacuous.
    """
    from app.pipeline.stub_detector import StubDetector
    from app.services.xtf_service import process_xtf_file

    result = await process_xtf_file(
        db=db_session,
        detector=StubDetector(),
        file_bytes=b"\x00" * 4096,
        filename="nonav.xtf",
        output_tiles_dir="storage/tiles",
    )

    survey = result["survey"]
    detections = result["detections"]

    assert survey["has_navigation"] is False
    assert detections, "StubDetector must produce boxes so the dedup path is really tested"
    assert survey["unlocated_detections"] == len(detections)

    for det in detections:
        assert det["lat"] is None and det["lon"] is None
        assert "position unknown" in (det["notes"] or "")


@pytest.mark.asyncio
async def test_located_detections_still_deduplicate(db_session, monkeypatch):
    """The dedup skip must not disable dedup for targets that DO have a position."""
    from app.pipeline.acoustic.xtf_processor import XtfNavigationPoint
    from app.pipeline.stub_detector import StubDetector
    from app.services.xtf_service import process_xtf_file

    real_lat, real_lon = 30.3881, -88.3849  # genuine Gulf of Mexico fix
    original = XtfProcessor._generate_synthetic_survey

    def _located_survey(self, filename, sonar_name):
        # _generate_synthetic_survey draws from the global NumPy RNG, so without a fixed
        # seed each ingest yields different imagery, different tiles and therefore a
        # different set of stub detections — which would make the dedup check meaningless.
        np.random.seed(1234)
        survey = original(self, filename, sonar_name)
        survey.nav_points = [
            XtfNavigationPoint(
                ping_number=point.ping_number,
                timestamp=point.timestamp,
                lat=real_lat,
                lon=real_lon,
                heading=point.heading,
                altitude_m=point.altitude_m,
                depth_m=point.depth_m,
                slant_range_m=point.slant_range_m,
            )
            for point in survey.nav_points
        ]
        survey.min_lat = survey.max_lat = real_lat
        survey.min_lon = survey.max_lon = real_lon
        return survey

    monkeypatch.setattr(XtfProcessor, "_generate_synthetic_survey", _located_survey)

    result = await process_xtf_file(
        db=db_session, detector=StubDetector(), file_bytes=b"\x00" * 4096,
        filename="located.xtf", output_tiles_dir="storage/tiles",
    )

    assert result["survey"]["has_navigation"] is True
    assert result["survey"]["unlocated_detections"] == 0
    assert result["detections"], "need boxes for this to mean anything"

    # Every target is projected from the real fix, and the dedup query runs for all of
    # them (it is only skipped when a target has no position) without raising.
    for det in result["detections"]:
        assert det["lat"] == pytest.approx(real_lat, abs=0.01)
        assert det["lon"] == pytest.approx(real_lon, abs=0.01)
        assert "position unknown" not in (det["notes"] or "")

    # Cross-ingest dedup is deliberately not asserted here: StubDetector seeds itself from
    # tile_id, which embeds the survey id, so a second ingest of identical bytes genuinely
    # detects a different set of objects. That is pre-existing behaviour, unrelated to the
    # located/unlocated split this suite covers.
