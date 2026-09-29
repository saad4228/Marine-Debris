"""Unit tests for inference, XTF processing, and catalogue endpoints."""

import io
import struct
from PIL import Image
import pytest


def _create_valid_png() -> bytes:
    """Helper to create a small valid PNG in memory."""
    img = Image.new("RGB", (128, 128), color=(30, 60, 90))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_root_endpoint(client):
    res = await client.get("/")
    assert res.status_code == 200
    json_data = res.json()
    assert json_data["status"] == "online"
    assert "stub_model_active" in json_data


@pytest.mark.asyncio
async def test_detect_endpoint(client):
    png_bytes = _create_valid_png()
    files = {"image": ("test_sonar_tile.png", io.BytesIO(png_bytes), "image/png")}

    res = await client.post("/api/v1/detect", files=files)
    assert res.status_code == 200
    data = res.json()
    assert "detections" in data
    assert isinstance(data["detections"], list)
    assert "metadata" in data

    # Verify bounding box format
    for d in data["detections"]:
        assert "cls" in d
        assert "conf" in d
        assert 0.0 <= d["x"] <= 1.0
        assert 0.0 <= d["y"] <= 1.0
        assert 0.0 <= d["w"] <= 1.0
        assert 0.0 <= d["h"] <= 1.0


@pytest.mark.asyncio
async def test_xtf_upload_endpoint(client):
    buf = io.BytesIO()
    file_hdr = bytearray(1024)
    file_hdr[0] = 123
    file_hdr[26:42] = b"Edgetech Sonar  "
    buf.write(file_hdr)

    for i in range(12):
        pkt_hdr = struct.pack("<HBBHI", 0xFACE, 0, 0, 2, 256 + 256)
        ping_hdr = bytearray(242)
        struct.pack_into("<I", ping_hdr, 16, i + 1)
        struct.pack_into("<f", ping_hdr, 56, 6.5)
        struct.pack_into("<f", ping_hdr, 48, 50.0)
        struct.pack_into("<f", ping_hdr, 52, 25.0)
        struct.pack_into("<f", ping_hdr, 68, 45.0)
        struct.pack_into("<d", ping_hdr, 72, 73.7250 + i * 0.0001)
        struct.pack_into("<d", ping_hdr, 80, 15.4150 + i * 0.0001)
        samples = bytes([90 + (j % 30) for j in range(256)])
        buf.write(pkt_hdr + ping_hdr + samples)

    xtf_bytes = buf.getvalue()
    files = {"file": ("test_survey.xtf", io.BytesIO(xtf_bytes), "application/octet-stream")}
    data = {"line_name": "L_TEST_UNIT"}

    res = await client.post("/api/v1/xtf/upload", files=files, data=data)
    assert res.status_code == 200
    res_data = res.json()
    assert "survey" in res_data
    assert "tiles" in res_data
    assert "detections" in res_data
    assert len(res_data["tiles"]) > 0


@pytest.mark.asyncio
async def test_detections_list_and_stats(client):
    res = await client.get("/api/v1/detections")
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert isinstance(data["detections"], list)

    res_stats = await client.get("/api/v1/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "total_detections" in stats
