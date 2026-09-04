"""Unit tests for inference and catalogue endpoints."""

import io
import pytest


@pytest.mark.asyncio
async def test_root_endpoint(client):
    res = await client.get("/")
    assert res.status_code == 200
    json_data = res.json()
    assert json_data["status"] == "online"
    assert json_data["stub_model_active"] is True


@pytest.mark.asyncio
async def test_detect_endpoint(client):
    # Create fake image bytes
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 50
    files = {"image": ("test_sonar_tile.png", io.BytesIO(fake_png), "image/png")}

    res = await client.post("/api/v1/detect", files=files)
    assert res.status_code == 200
    data = res.json()
    assert "detections" in data
    assert isinstance(data["detections"], list)
    assert "metadata" in data
    assert data["metadata"]["model"] == "stub_detector"

    # Verify each detection has bounding box fields between 0 and 1
    for d in data["detections"]:
        assert "cls" in d
        assert "conf" in d
        assert 0.0 <= d["x"] <= 1.0
        assert 0.0 <= d["y"] <= 1.0
        assert 0.0 <= d["w"] <= 1.0
        assert 0.0 <= d["h"] <= 1.0


@pytest.mark.asyncio
async def test_detections_list_empty_initially(client):
    res = await client.get("/api/v1/detections")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["detections"] == []


@pytest.mark.asyncio
async def test_stats_empty_initially(client):
    res = await client.get("/api/v1/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["total_detections"] == 0
    assert data["confirmed"] == 0
