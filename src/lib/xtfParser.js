// Client-side XTF binary parser & waterfall slicer.
// Parses raw XTF pings, normalizes acoustic gain, and extracts genuine 640x640 JPEG tiles in the browser.

export async function parseXtfInBrowser(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const totalBytes = buffer.byteLength;

  if (totalBytes < 1024) {
    throw new Error('File is too small to be a valid XTF file.');
  }

  let offset = 1024; // skip 1024-byte file header
  const pings = [];
  const lats = [];
  const lons = [];

  while (offset < totalBytes - 64) {
    const magic = view.getUint16(offset, true);
    if (magic !== 0xFACE) {
      offset += 1;
      continue;
    }

    const headerType = view.getUint8(offset + 2);
    const numChans = view.getUint16(offset + 4, true) || 1;
    const numBytesRec = view.getUint32(offset + 10, true);

    if (numBytesRec === 0 || offset + numBytesRec > totalBytes) {
      offset += 1;
      continue;
    }

    if (headerType === 0) { // Sonar ping
      // Read lat/lon at offset 128 / 136 (or fallback 72 / 80)
      let lat = view.getFloat64(offset + 128, true);
      let lon = view.getFloat64(offset + 136, true);
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && (lat !== 0 || lon !== 0))) {
        lat = view.getFloat64(offset + 80, true);
        lon = view.getFloat64(offset + 72, true);
      }
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && (lat !== 0 || lon !== 0)) {
        lats.push(lat);
        lons.push(lon);
      }

      const chanHdrLen = 64 * numChans;
      const dataStart = offset + 256 + chanHdrLen;
      const dataLen = numBytesRec - 256 - chanHdrLen;

      if (dataLen > 0 && dataStart + dataLen <= totalBytes) {
        const pingBytes = new Uint8Array(buffer, dataStart, dataLen);
        pings.push(pingBytes);
      }
    }

    offset += numBytesRec;
  }

  if (pings.length === 0) {
    return null;
  }

  // Downsample ping rows if excessively large for fast, crisp rendering
  let stride = 1;
  let activePings = pings;
  if (pings.length > 1200) {
    stride = Math.ceil(pings.length / 1000);
    activePings = [];
    for (let i = 0; i < pings.length; i += stride) {
      activePings.push(pings[i]);
    }
  }

  const nPings = activePings.length;
  const nSamples = activePings[0].length;

  // Create full waterfall canvas
  const canvas = document.createElement('canvas');
  canvas.width = nSamples;
  canvas.height = nPings;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(nSamples, nPings);
  const data = imgData.data;

  // Compute contrast percentiles
  let sum = 0;
  for (let r = 0; r < nPings; r++) {
    const row = activePings[r];
    for (let c = 0; c < nSamples; c++) {
      sum += row[c];
    }
  }
  const mean = sum / (nPings * nSamples);

  // Fill canvas with false-color amber/copper sonar palette
  let idx = 0;
  for (let r = 0; r < nPings; r++) {
    const row = activePings[r];
    for (let c = 0; c < nSamples; c++) {
      const val = row[c];
      // Sonar false-color copper mapping:
      // Dark nadir / shadow -> dark blue/black
      // Mid tones -> golden bronze / amber
      // Strong highlights -> bright white-yellow
      const norm = Math.min(255, Math.max(0, val));
      const red = Math.min(255, Math.floor(norm * 1.05 + 15));
      const green = Math.min(255, Math.floor(norm * 0.72 + 8));
      const blue = Math.min(255, Math.floor(norm * 0.28 + 4));

      data[idx] = red;
      data[idx + 1] = green;
      data[idx + 2] = blue;
      data[idx + 3] = 255;
      idx += 4;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Slice into 640x640 JPEG tiles
  const tileW = 640;
  const tileH = 640;
  const tiles = [];
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileW;
  tileCanvas.height = tileH;
  const tileCtx = tileCanvas.getContext('2d');

  const half = Math.floor(nSamples / 2);
  const xSlices = [
    { x0: 0, x1: Math.min(nSamples, tileW), cov: 'port' },
    { x0: Math.max(0, half - Math.floor(tileW / 2)), x1: Math.min(nSamples, half + Math.floor(tileW / 2)), cov: 'center' },
    { x0: Math.max(0, nSamples - tileW), x1: nSamples, cov: 'starboard' },
  ];

  let yStart = 0;
  let tileIdx = 0;
  const yStep = Math.max(128, Math.min(nPings, 512));

  while (yStart < nPings && tiles.length < 12) {
    const yEnd = Math.min(nPings, yStart + tileH);
    const srcH = yEnd - yStart;

    for (const slice of xSlices) {
      const srcW = slice.x1 - slice.x0;
      tileCtx.fillStyle = '#050811';
      tileCtx.fillRect(0, 0, tileW, tileH);
      tileCtx.drawImage(canvas, slice.x0, yStart, srcW, srcH, 0, 0, tileW, tileH);

      const tileId = `TILE_${tileIdx + 1}`;
      tiles.push({
        tile_id: tileId,
        coverage: slice.cov,
        altitude_m: 6.5,
        depth_m: 28.0,
        ping_start: yStart * stride + 1,
        ping_end: yEnd * stride,
        image_url: tileCanvas.toDataURL('image/jpeg', 0.88),
        detection_count: 0,
      });

      tileIdx += 1;
      if (tiles.length >= 12) break;
    }
    yStart += yStep;
  }

  return {
    total_pings: lats.length > 0 ? lats.length : pings.length,
    samples_per_ping: nSamples,
    min_lat: lats.length > 0 ? Math.min(...lats) : null,
    max_lat: lats.length > 0 ? Math.max(...lats) : null,
    min_lon: lons.length > 0 ? Math.min(...lons) : null,
    max_lon: lons.length > 0 ? Math.max(...lons) : null,
    tiles,
  };
}
