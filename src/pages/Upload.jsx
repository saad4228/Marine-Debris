import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE, API } from '../site/data.js';
import { api, isMock } from '../site/api.js';
import { useRecords, notifyRecordsUpdated } from '../lib/useRecords.js';
import { paintSonar } from '../lib/sonar.js';
import { formatBytes, classLabel, cx, downloadImage, detectionImageName, confidenceColor, confidenceBand, saveBlob } from '../lib/utils.js';
import SurfaceBand from '../components/SurfaceBand.jsx';
import DetectionTable from '../components/DetectionTable.jsx';
import DebrisMap from '../components/DebrisMap.jsx';
import TierBadge from '../components/TierBadge.jsx';
import { TIERS } from '../lib/risk.js';

const XTF_STAGES = [
  'Ingest binary XTF ping stream & navigation',
  'Denoise: repair bad pings & suppress speckle',
  'Acoustic water-column & slant-range correction',
  'Slice waterfall into overlapping 640×640 JPG tiles',
  'Concurrent YOLOv8 debris inference',
  'Acoustic shadow height & GPS coordinate projection',
  'Database sync & survey catalogue registration',
];

const TILE_STAGES = [
  'Correct water column',
  'Tile the waterfall',
  'Detect and classify',
  'Geotag and measure',
  'Forecast, score, plan',
];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The browser could not decode this file as an image.')); };
    img.src = url;
  });
}

function drawBox(ctx, d, w, h) {
  const x = d.x * w, y = d.y * h, bw = d.w * w, bh = d.h * h;
  ctx.strokeStyle = '#e4572e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, bw, bh);
  const label = `${d.cls.toUpperCase()} ${d.conf.toFixed(2)}`;
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width + 10;
  const ly = y - 18 >= 0 ? y - 18 : y + bh;
  ctx.fillStyle = '#e4572e';
  ctx.fillRect(x - 1, ly, tw, 18);
  ctx.fillStyle = '#03070c';
  ctx.fillText(label, x + 4, ly + 9.5);
}

function exportFilename(kind) {
  const day = new Date().toISOString().slice(0, 10);
  return `detections_${day}.${kind}`;
}

let workbenchCache = {
  xtfData: null,
  results: null,
  fileInfo: null,
  fileType: 'image',
  status: 'idle',
  selectedTile: null,
};

export default function Upload() {
  const [hours, setHours] = useState(24);
  const { records, hazards, loading, refresh } = useRecords(hours);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const port = useMemo(() => {
    if (records && records.length > 0) {
      const first = records[0];
      const dLat = Math.abs(first.lat - SITE.area.port.lat);
      const dLon = Math.abs(first.lon - SITE.area.port.lon);
      if (dLat > 2 || dLon > 2) {
        return {
          name: `${first.line || 'Survey'} Staging Port`,
          lat: Number((first.lat + 0.015).toFixed(4)),
          lon: Number((first.lon + 0.015).toFixed(4)),
        };
      }
    }
    return SITE.area.port;
  }, [records]);

  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const runRef = useRef(0);

  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState(workbenchCache.fileInfo);
  const [fileType, setFileType] = useState(workbenchCache.fileType); // 'xtf' or 'image'
  const [imageLoaded, setImageLoaded] = useState(false);
  const [status, setStatus] = useState(workbenchCache.status);
  const [results, setResults] = useState(workbenchCache.results);
  const [xtfData, setXtfData] = useState(workbenchCache.xtfData);
  const [error, setError] = useState(null);
  const [selectedTile, setSelectedTile] = useState(workbenchCache.selectedTile);
  // Real elapsed seconds, so a long backend call visibly progresses without pretending
  // to know which pipeline stage it is on.
  const [elapsed, setElapsed] = useState(0);
  // Which detection's tile is being fetched, and the last failure — keyed per row so one
  // bad image cannot make the whole table look broken.
  const [imgBusy, setImgBusy] = useState(null);
  const [imgError, setImgError] = useState(null);



  // Catalogue-wide export: which format is in flight, and the last failure.
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  async function runExport(kind) {
    if (exporting) return;
    setExporting(kind);
    setExportError(null);
    try {
      // No class filter here — the registry shows the whole catalogue, so the export
      // matches what is on screen.
      const blob = kind === 'geojson' ? await api.exportGeoJSON(null) : await api.exportCSV(null);
      saveBlob(blob, exportFilename(kind));
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(null);
    }
  }

  async function saveDetectionImage(det, key) {
    if (imgBusy) return;
    setImgBusy(key);
    setImgError(null);
    try {
      await downloadImage(det.image_url, detectionImageName(det.id, det.cls, det.image_url));
    } catch (e) {
      setImgError(`${det.id || 'Target'}: ${e.message}`);
    } finally {
      setImgBusy(null);
    }
  }

  useEffect(() => {
    if (status !== 'running') return undefined;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  const updateCache = (updates) => {
    workbenchCache = { ...workbenchCache, ...updates };
  };

  useEffect(() => () => { runRef.current += 1; }, []);

  function drawPreview(img, dets) {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !img) return;
    const maxW = frame.clientWidth || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(img, 0, 0, w, h);
    if (dets) for (const d of dets) drawBox(ctx, d, w, h);
  }

  async function handleFile(file) {
    if (!file) return;

    const isXtf = file.name.toLowerCase().endsWith('.xtf') || file.name.toLowerCase().endsWith('.son');
    const isImage = file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.png') || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');

    if (!isXtf && !isImage) {
      setError(`"${file.name}" is not supported. Upload a raw sonar .XTF survey file or a waterfall tile image (.PNG, .JPG).`);
      setStatus('error');
      return;
    }

    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setError(null);
    setResults(null);
    setXtfData(null);
    setStatus('running');
    setElapsed(0);
    setFileType(isXtf ? 'xtf' : 'image');
    setFileInfo({ name: file.name, size: file.size, isXtf });

    if (isXtf) {
      // Process Full XTF Sonar File
      // No fake stage advance. The backend does not stream progress, so the only
      // honest states are "running" and "finished" — a timer that ticked stages off
      // showed six of seven complete in under two seconds and then sat frozen on the
      // last one for the real duration of the request.
      const xtfPromise = api.processXtf(file);

      try {
        const data = await xtfPromise;
        if (!alive()) return;
        setXtfData(data);
        setResults(data.detections || []);
        const firstTile = data.tiles && data.tiles.length > 0 ? data.tiles[0] : null;
        if (firstTile) {
          setSelectedTile(firstTile);
        }
        setStatus('done');
        updateCache({
          xtfData: data,
          results: data.detections || [],
          fileInfo: { name: file.name, size: file.size, isXtf: true },
          fileType: 'xtf',
          status: 'done',
          selectedTile: firstTile,
        });
        notifyRecordsUpdated();
        if (refresh) refresh();
      } catch (e) {
        if (!alive()) return;
        setStatus('error');
        setError(`XTF Processing service failed: "${e.message}". Ensure the backend is running and allows requests.`);
      }
    } else {
      // Process Single Image Sonar Tile
      let img;
      try { img = await loadImage(file); } catch (e) {
        if (!alive()) return;
        setStatus('error');
        setError(`${e.message} Export the tile as PNG or JPEG and try again.`);
        return;
      }
      if (!alive()) return;
      imageRef.current = img;
      setImageLoaded(true);
      drawPreview(img, null);

      const detection = api.detect(file);
      try {
        const { detections } = await detection;
        if (!alive()) return;
        setResults(detections);
        drawPreview(img, detections);
        setStatus('done');
        updateCache({
          results: detections,
          fileInfo: { name: file.name, size: file.size, isXtf: false },
          fileType: 'image',
          status: 'done',
        });
        notifyRecordsUpdated();
        if (refresh) refresh();
      } catch (e) {
        if (!alive()) return;
        setStatus('error');
        setError(`The detection service did not answer. ${API.baseUrl}${API.endpoints.detect} returned "${e.message}".`);
      }
    }
  }

  function makeSyntheticTile() {
    const seed = `synthetic-${Math.floor(Math.random() * 1e6)}`;
    const c = document.createElement('canvas');
    c.width = 720; c.height = 480;
    paintSonar(c.getContext('2d'), 720, 480, { seed, targetCount: 1 + Math.floor(Math.random() * 3) });
    c.toBlob((blob) => blob && handleFile(new File([blob], `${seed}.png`, { type: 'image/png' })), 'image/png');
  }

  function makeSyntheticXtf() {
    // Generate a minimal valid XTF binary payload for testing
    const buf = new ArrayBuffer(8664);
    const u8 = new Uint8Array(buf);
    const view = new DataView(buf);
    u8[0] = 123; // XTF
    const nameStr = 'Edgetech 4200   ';
    for (let i = 0; i < nameStr.length; i++) u8[26 + i] = nameStr.charCodeAt(i);

    let offset = 1024;
    for (let i = 0; i < 10; i++) {
      view.setUint16(offset, 0xFACE, true);
      view.setUint8(offset + 2, 0); // Ping packet
      view.setUint8(offset + 3, 0);
      view.setUint16(offset + 4, 2, true);
      view.setUint32(offset + 6, 256 + 512, true);

      // Ping header
      view.setUint32(offset + 14 + 16, i + 1, true);
      view.setFloat32(offset + 14 + 56, 6.8, true); // alt
      view.setFloat32(offset + 14 + 48, 60.0, true); // slant
      view.setFloat32(offset + 14 + 52, 28.0, true); // depth
      view.setFloat32(offset + 14 + 68, 45.0, true); // heading
      view.setFloat64(offset + 14 + 72, 73.7250 + i * 0.0001, true); // lon
      view.setFloat64(offset + 14 + 80, 15.4150 + i * 0.0001, true); // lat

      // Synthetic sonar echo backscatter
      for (let s = 0; s < 512; s++) {
        u8[offset + 256 + s] = 70 + ((s + i * 7) % 50);
      }
      offset += 256 + 512;
    }

    const blob = new Blob([u8], { type: 'application/octet-stream' });
    handleFile(new File([blob], `survey_track_${Math.floor(Math.random() * 900 + 100)}.xtf`, { type: 'application/octet-stream' }));
  }

  const openPicker = () => inputRef.current && inputRef.current.click();
  const counts = TIERS.map((t) => ({ ...t, n: records.filter((r) => r.risk.tier.id === t.id).length }));
  const currentStages = fileType === 'xtf' ? XTF_STAGES : TILE_STAGES;

  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="h-page text-shadow-deep">Sonar Workbench</h1>
            <p className="lede measure mt-4 text-foam">
              Ingest raw <strong>.XTF</strong> sonar files or waterfall tiles, run concurrent YOLO inference, compute acoustic shadow metrics, and stream georeferenced debris history to the database.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.map((t) => (
              <span key={t.id} className={cx('tier', `tier-${t.id}`)}>
                {t.label} <span className="num">{t.n}</span>
              </span>
            ))}
          </div>
        </header>

        <div role="status" className={cx('mt-6 max-w-4xl border-l-2 pl-4 text-sm text-foamdim', isMock ? 'border-ping' : 'border-sun')}>
          {isMock ? (
            <p>
              <strong className="font-display text-foam">Mock mode.</strong> <code className="readout">API.mode</code> is "mock": running simulated client-side pipeline. Switch to "live" in <code className="readout">src/site/data.js</code> to talk to backend.
            </p>
          ) : (
            <p>
              <strong className="font-display text-foam">Live Backend Connected.</strong> Streaming to <code className="readout">{API.baseUrl}</code> with PostgreSQL/SQLite persistence and YOLOv8 inference.
            </p>
          )}
        </div>

        {/* 1. Sonar Ingestion */}
        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" aria-labelledby="upload-h">
          <div>
            <div className="flex items-center justify-between">
              <h2 id="upload-h" className="text-2xl font-display font-bold">Sonar Ingestion</h2>
              <span className="readout text-xs text-foamdim">Accepts .XTF, .SON, .PNG, .JPG</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Drop an XTF file or sonar tile here, or press Enter to choose a file"
              onClick={openPicker}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); }}
              className={cx(
                'mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-all duration-200',
                dragging ? 'border-ping bg-mid/40 shadow-xl' : 'hairline hover:border-foamdim bg-abyss/40'
              )}
            >
              <div className="flex items-center gap-3 text-ping mb-2">
                <span className="text-2xl font-mono">◨</span>
                <p className="font-display text-lg font-bold text-foam">Drop an .XTF file or Sonar Tile</p>
              </div>
              <p className="text-sm text-foamdim">or click to browse from your computer</p>
              {fileInfo && (
                <div className="readout mt-3 flex items-center gap-2 rounded bg-abyss/80 px-3 py-1 text-xs text-ping border hairline">
                  <span className="font-bold">{fileInfo.isXtf ? 'XTF Stream' : 'Tile Image'}</span>
                  <span>·</span>
                  <span>{fileInfo.name}</span>
                  <span>·</span>
                  <span>{formatBytes(fileInfo.size)}</span>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xtf,.son,image/*"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-solid btn-sm"
                onClick={makeSyntheticXtf}
                disabled={status === 'running'}
              >
                ▶ Ingest Demo .XTF Survey
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={makeSyntheticTile}
                disabled={status === 'running'}
              >
                Generate Synthetic Tile
              </button>
            </div>

            {/* Single Tile Preview Canvas (for Image uploads) */}
            {fileType === 'image' && (
              <div ref={frameRef} className="mt-6 border hairline bg-abyss/60 p-2">
                {!imageLoaded && <p className="px-4 py-12 text-center text-sm text-foamdim">Preview appears here once a tile is loaded.</p>}
                <canvas ref={canvasRef} aria-hidden="true" className={cx('mx-auto', imageLoaded ? 'block' : 'hidden')} />
              </div>
            )}

            {/* XTF Survey Telemetry Card (for XTF uploads) */}
            {fileType === 'xtf' && xtfData && (
              <div className="mt-6 border hairline bg-abyss/80 p-5 shadow-xl">
                <div className="flex items-center justify-between border-b hairline pb-3">
                  <div>
                    <span className="readout text-xs uppercase tracking-wider text-foamdim">Survey Line Ingested</span>
                    <h4 className="font-display text-lg font-bold text-foam">{xtfData.survey?.line || 'SURVEY_LINE'}</h4>
                  </div>
                  <span className="rounded bg-ping/15 px-2.5 py-1 text-xs font-mono font-bold text-ping border border-ping/40">
                    {xtfData.survey?.status || 'Processed'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="border hairline bg-abyss/40 p-2.5">
                    <div className="readout text-[11px] text-foamdim">Total Pings</div>
                    <div className="readout text-base font-bold text-foam mt-0.5">{xtfData.survey?.total_pings || 0}</div>
                  </div>
                  <div className="border hairline bg-abyss/40 p-2.5">
                    <div className="readout text-[11px] text-foamdim">JPG Tiles</div>
                    <div className="readout text-base font-bold text-ping mt-0.5">{xtfData.survey?.total_tiles || 0}</div>
                  </div>
                  <div className="border hairline bg-abyss/40 p-2.5">
                    <div className="readout text-[11px] text-foamdim">Detections</div>
                    <div className="readout text-base font-bold text-foam mt-0.5">{xtfData.survey?.total_detections || 0}</div>
                  </div>
                  <div className="border hairline bg-abyss/40 p-2.5">
                    <div className="readout text-[11px] text-foamdim">Swath Width</div>
                    <div className="readout text-base font-bold text-foam mt-0.5">{xtfData.survey?.swath_width_m || 120} m</div>
                  </div>
                </div>

                {/* Sliced JPG Tile Gallery */}
                {xtfData.tiles && xtfData.tiles.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-display text-sm font-bold text-foam">Generated Waterfall JPG Tiles ({xtfData.tiles.length})</h5>
                      <span className="readout text-xs text-foamdim">Click tile to inspect</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {xtfData.tiles.map((t) => {
                        const isSel = selectedTile?.tile_id === t.tile_id;
                        return (
                          <div
                            key={t.tile_id}
                            onClick={() => setSelectedTile(t)}
                            className={cx(
                              'group relative cursor-pointer border p-1.5 transition-all bg-abyss/60',
                              isSel ? 'border-ping ring-1 ring-ping' : 'hairline hover:border-foamdim'
                            )}
                          >
                            <img
                              src={t.image_url}
                              alt={t.tile_id}
                              className="h-28 w-full object-cover rounded bg-abyss/80 transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="mt-1.5 flex items-center justify-between text-[10px] readout text-foamdim">
                              <span className="truncate">{t.tile_id}</span>
                              {t.detection_count > 0 && (
                                <span className="bg-ping text-abyss px-1 py-0.2 rounded font-bold">{t.detection_count} target</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Selected Tile Inspector */}
                    {selectedTile && (
                      <div className="mt-4 border hairline bg-abyss p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="readout text-xs text-foam font-bold flex items-center gap-2">
                            <span className="font-mono text-ping">▣</span>
                            Inspecting: <span className="text-ping font-mono">{selectedTile.tile_id}</span>
                            <span className="capitalize text-foamdim">({selectedTile.coverage?.replace('_', ' ')})</span>
                          </span>
                          <span className="readout text-[11px] text-foamdim">
                            Alt: {selectedTile.altitude_m}m · Depth: {selectedTile.depth_m}m
                          </span>
                        </div>
                        <div className="relative border hairline bg-black flex justify-center overflow-hidden rounded">
                          <img
                            src={selectedTile.image_url}
                            alt={selectedTile.tile_id}
                            className="max-h-96 w-full object-contain"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Pipeline Execution Stages & Results */}
          <div>
            <h3 className="flex flex-wrap items-baseline gap-3 text-xl font-display font-bold">
              Pipeline Telemetry
              {status === 'running' && (
                <span className="readout text-sm font-normal text-foamdim" aria-live="polite">
                  processing · {elapsed}s elapsed
                </span>
              )}
            </h3>
            <ol className="mt-3 border-t hairline" aria-label="Pipeline progress">
              {currentStages.map((s, i) => {
                // The backend reports nothing until it returns, so every stage shares the
                // same state: all running, or all done. Claiming per-stage progress would
                // be invented.
                const state = status === 'running' ? 'active' : status === 'done' ? 'done' : 'pending';
                return (
                  <li key={s} className="flex items-center gap-4 border-b hairline py-2.5 text-sm" aria-current={state === 'active' ? 'step' : undefined}>
                    <span className="font-display font-black text-ping" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span className={cx(state === 'pending' && 'text-foamdim', state === 'active' && 'stage-active')}>{s}</span>
                    <span className="readout ml-auto text-foamdim">{state === 'done' ? '✓ done' : state === 'active' ? 'running…' : 'waiting'}</span>
                  </li>
                );
              })}
            </ol>

            <h3 className="mt-8 text-xl font-display font-bold">Targets Identified</h3>
            <div className="mt-3" aria-live="polite">
              {status === 'idle' && <p className="text-sm text-foamdim">No file processed yet. Drop an .XTF or tile to begin.</p>}
              {status === 'running' && <p className="text-sm text-foamdim">Processing through acoustic corrections and YOLO detection...</p>}
              {status === 'error' && <p className="border-l-2 border-flag pl-4 text-sm text-foam">{error}</p>}
              {status === 'done' && results && results.length === 0 && (
                <p className="text-sm text-foamdim border-l-2 border-hairline pl-3 py-2 bg-abyss/40">
                  No debris targets detected in this section. Flat seabed echo recorded.
                </p>
              )}
              {status === 'done' && results && results.length > 0 && (
                <div className="overflow-x-auto border hairline bg-abyss/70">
                  <table className="spec-table w-full">
                    <thead>
                      <tr>
                        <th scope="col">Target ID</th>
                        <th scope="col">Class</th>
                        <th scope="col">Conf</th>
                        <th scope="col">Side</th>
                        <th scope="col">Range</th>
                        <th scope="col">Est Height</th>
                        <th scope="col">GPS Coordinates</th>
                        <th scope="col">Tile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((d, i) => (
                        <tr key={i} className="hover:bg-mid/30 transition-colors">
                          <td className="readout font-bold text-ping">{d.id || `TGT-${i + 1}`}</td>
                          <td className="font-display font-bold text-foam">{classLabel(SITE.classes, d.cls)}</td>
                          <td className="readout font-bold">
                            <span
                              className="inline-flex items-center gap-1.5"
                              style={{ color: confidenceColor(d.conf) }}
                              title={`${confidenceBand(d.conf)} confidence (${d.conf.toFixed(2)})`}
                            >
                              <span
                                aria-hidden="true"
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ background: confidenceColor(d.conf) }}
                              />
                              {d.conf.toFixed(2)}
                            </span>
                          </td>
                          <td className="readout capitalize text-foamdim">{d.side || 'starboard'}</td>
                          <td className="readout text-foamdim">{d.range_m != null ? `${d.range_m}m` : '—'}</td>
                          <td className="readout text-sun font-bold">{d.height_est_m != null ? `${d.height_est_m}m` : '—'}</td>
                          <td className="readout text-xs">
                            {d.lat != null && d.lon != null ? (
                              <span className="text-foamdim">{d.lat.toFixed(4)}, {d.lon.toFixed(4)}</span>
                            ) : (
                              <span
                                className="inline-block border border-sun/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sun"
                                title="This target was detected, but its ping carried no navigation fix, so no position could be derived."
                              >
                                No coordinates found
                              </span>
                            )}
                          </td>
                          <td>
                            {d.image_url ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={imgBusy !== null}
                                onClick={() => saveDetectionImage(d, i)}
                                title={`Download the sonar tile this ${d.cls} was detected in`}
                              >
                                {imgBusy === i ? 'Saving…' : '↓ Image'}
                              </button>
                            ) : (
                              <span className="readout text-xs text-foamdim">no image</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {imgError && (
                <p className="readout mt-3 border-l-2 border-flag pl-3 text-xs text-foam" role="alert">
                  Could not download that tile — {imgError}
                </p>
              )}
              {status === 'done' && results && results.length > 0 && (() => {
                const unlocated = results.filter((d) => d.lat == null || d.lon == null).length;
                return (
                  <p className="mt-3 text-xs text-foamdim flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ping" />
                    <span>
                      All {results.length} targets have been uniquely saved to database history.
                      {unlocated === 0
                        ? ' Every target carried a navigation fix and is mapped to the Live Geo Map below.'
                        : ` ${results.length - unlocated} of ${results.length} carried a navigation fix and appear on the Live Geo Map below; ${unlocated} had no fix in the source XTF and are recorded without a position.`}
                    </span>
                  </p>
                );
              })()}
            </div>
          </div>
        </section>

        {/* 3. Real-time Live Geo Map */}
        <section className="mt-16" aria-labelledby="map-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="map-h" className="text-2xl font-display font-bold">Survey Map & Target Positions</h2>
              <p className="mt-1 text-sm text-foamdim">
                Georeferenced debris coordinates projected from the survey line with trajectory drift forecasts.
              </p>
            </div>
            <Link to={selectedId ? `/map?sel=${selectedId}` : '/map'} className="btn btn-solid btn-sm">
              Open Full-Screen Mission Map →
            </Link>
          </div>

          <div className="mt-4 h-[500px] border hairline shadow-2xl">
            {!loading && (
              <DebrisMap
                records={records}
                hazards={hazards}
                hours={hours}
                selectedId={selectedId}
                onSelect={setSelectedId}
                port={port}
              />
            )}
          </div>
          {selectedId && (() => {
            const r = records.find((x) => x.id === selectedId);
            return r ? (
              <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-display font-bold text-foam">{r.id}</span>
                <span className="text-foamdim">{r.clsInfo.label}</span>
                <TierBadge tier={r.risk.tier} score={r.risk.score} />
                <Link to={`/detections/${r.id}`} className="readout text-ping hover:underline">
                  inspect acoustic records →
                </Link>
              </p>
            ) : null;
          })()}
        </section>

        {/* 4. Catalogue Table */}
        <section className="mt-16" aria-labelledby="dash-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="dash-h" className="text-2xl font-display font-bold">Database Target Registry</h2>
            <div className="flex items-center gap-4">
              <input 
                type="text" 
                placeholder="Search by ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border hairline bg-abyss px-2.5 py-1 font-display text-sm text-foam outline-none focus:border-ping w-48"
                aria-label="Search by Target ID"
              />
              <label htmlFor="horizon" className="text-sm text-foamdim ml-2">Forecast Horizon:</label>
              <select
                id="horizon"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="border hairline bg-abyss px-2.5 py-1 font-display text-sm font-bold text-foam"
              >
                {[0, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>{h === 0 ? 'Now (0 h)' : `+${h} h`}</option>
                ))}
              </select>
            </div>
          </div>
          {loading ? (
            <p className="readout mt-6 text-foamdim">loading database records...</p>
          ) : (
            <DetectionTable
              records={records.filter(r => !searchQuery || (r.id || '').toLowerCase().includes(searchQuery.toLowerCase()))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              className="mt-4 max-h-[60vh]"
            />
          )}

          {/* Catalogue-wide export, directly under the table it exports. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t hairline pt-4">
            <p className="readout text-xs text-foamdim">
              Export the full target registry — {records.length} {records.length === 1 ? 'record' : 'records'}.
              <span className="ml-2">GeoJSON carries only georeferenced targets; CSV includes every record.</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={exporting !== null || loading}
                onClick={() => runExport('geojson')}
              >
                {exporting === 'geojson' ? 'Preparing…' : 'Download GeoJSON'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={exporting !== null || loading}
                onClick={() => runExport('csv')}
              >
                {exporting === 'csv' ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          </div>
          {exportError && (
            <p className="readout mt-3 border-l-2 border-flag pl-3 text-xs text-foam" role="alert">
              {exportError}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
