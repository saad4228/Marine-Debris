import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE, API } from '../site/data.js';
import { api, isMock } from '../site/api.js';
import { useRecords } from '../lib/useRecords.js';
import { paintSonar } from '../lib/sonar.js';
import { prefersReducedMotion, formatBytes, classLabel, cx, wait } from '../lib/utils.js';
import SurfaceBand from '../components/SurfaceBand.jsx';
import DetectionTable from '../components/DetectionTable.jsx';
import DebrisMap from '../components/DebrisMap.jsx';
import TierBadge from '../components/TierBadge.jsx';
import { TIERS } from '../lib/risk.js';

const STAGES = ['Correct water column', 'Tile', 'Detect and classify', 'Geotag and measure', 'Forecast, score, plan'];

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

export default function Upload() {
  const [hours, setHours] = useState(24);
  const { records, hazards, loading } = useRecords(hours);
  const [selectedId, setSelectedId] = useState(null);

  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const runRef = useRef(0);

  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [status, setStatus] = useState('idle');
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

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
    if (!file.type.startsWith('image/')) {
      setError(`"${file.name}" is not an image. NADIR takes PNG or JPEG exports of a waterfall tile.`);
      setStatus('error');
      return;
    }
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setError(null); setResults(null); setStatus('running'); setStage(0);
    setFileInfo({ name: file.name, size: file.size });

    let img;
    try { img = await loadImage(file); } catch (e) {
      if (!alive()) return;
      setStatus('error'); setError(`${e.message} Export the tile as PNG or JPEG and try again.`);
      return;
    }
    if (!alive()) return;
    imageRef.current = img;
    setImageLoaded(true);
    drawPreview(img, null);

    const detection = api.detect(file);
    detection.catch(() => {});
    const delay = prefersReducedMotion() ? 0 : 380;
    for (let i = 0; i < STAGES.length - 1; i++) {
      await wait(delay);
      if (!alive()) return;
      setStage(i + 1);
    }
    try {
      const { detections } = await detection;
      if (!alive()) return;
      setResults(detections); drawPreview(img, detections); setStage(STAGES.length); setStatus('done');
    } catch (e) {
      if (!alive()) return;
      setStatus('error');
      setError(`The detection service did not answer. ${API.baseUrl}${API.endpoints.detect} returned "${e.message}". Check the service is running, that it allows requests from ${window.location.origin}, and that it accepts multipart form-data with an "image" field. Set API.mode to "mock" in src/site/data.js to run without a backend.`);
    }
  }

  function makeSyntheticTile() {
    const seed = `synthetic-${Math.floor(Math.random() * 1e6)}`;
    const c = document.createElement('canvas');
    c.width = 720; c.height = 480;
    paintSonar(c.getContext('2d'), 720, 480, { seed, targetCount: 1 + Math.floor(Math.random() * 3) });
    c.toBlob((blob) => blob && handleFile(new File([blob], `${seed}.png`, { type: 'image/png' })), 'image/png');
  }

  const openPicker = () => inputRef.current && inputRef.current.click();
  const counts = TIERS.map((t) => ({ ...t, n: records.filter((r) => r.risk.tier.id === t.id).length }));

  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="h-page text-shadow-deep">Workbench</h1>
            <p className="lede measure mt-4 text-foam">Run a tile, review the catalogue, see where everything will be, and plan the boat.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.map((t) => (<span key={t.id} className={cx('tier', `tier-${t.id}`)}>{t.label} <span className="num">{t.n}</span></span>))}
          </div>
        </header>

        <div role="status" className={cx('mt-6 max-w-4xl border-l-2 pl-4 text-sm text-foamdim', isMock ? 'border-ping' : 'border-sun')}>
          {isMock
            ? <p><strong className="font-display text-foam">Mock mode.</strong> <code className="readout">API.mode</code> is "mock": nothing leaves your browser, no model runs, and drift, risk and routes come from a seeded in-browser model. The same file always gives the same result. Switch to "live" in <code className="readout">src/site/data.js</code> when the backend is up.</p>
            : <p><strong className="font-display text-foam">Live mode.</strong> Talking to <code className="readout">{API.baseUrl}</code>.</p>}
        </div>

        {/* 1. Sonar upload */}
        <section className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-labelledby="upload-h">
          <div>
            <h2 id="upload-h" className="text-2xl">Sonar tile</h2>
            <div
              role="button" tabIndex={0}
              aria-label="Drop a sonar tile here, or press Enter to choose a file"
              onClick={openPicker}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); }}
              className={cx('mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed px-6 py-8 text-center transition-colors', dragging ? 'border-ping bg-mid/30' : 'hairline hover:border-foamdim')}
            >
              <p className="font-display text-lg font-bold">Drop a tile here</p>
              <p className="mt-1 text-sm text-foamdim">or press Enter to choose a PNG or JPEG export</p>
              {fileInfo && <p className="readout mt-3 text-foamdim">{fileInfo.name} · {formatBytes(fileInfo.size)}</p>}
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" tabIndex={-1} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="mt-3"><button type="button" className="btn btn-ghost btn-sm" onClick={makeSyntheticTile} disabled={status === 'running'}>Generate a synthetic tile</button></div>
            <div ref={frameRef} className="mt-6 border hairline bg-abyss/60 p-2">
              {!imageLoaded && <p className="px-4 py-12 text-center text-sm text-foamdim">Preview appears here once a tile is loaded.</p>}
              <canvas ref={canvasRef} aria-hidden="true" className={cx('mx-auto', imageLoaded ? 'block' : 'hidden')} />
            </div>
          </div>

          <div>
            <h3 className="text-xl">Pipeline</h3>
            <ol className="mt-3 border-t hairline" aria-label="Pipeline progress">
              {STAGES.map((s, i) => {
                const state = status === 'running' && i === stage ? 'active' : i < stage ? 'done' : 'pending';
                return (
                  <li key={s} className="flex items-center gap-4 border-b hairline py-2.5 text-sm" aria-current={state === 'active' ? 'step' : undefined}>
                    <span className="font-display font-black text-ping" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span className={cx(state === 'pending' && 'text-foamdim', state === 'active' && 'stage-active')}>{s}</span>
                    <span className="readout ml-auto text-foamdim">{state === 'done' ? 'done' : state === 'active' ? 'running' : 'waiting'}</span>
                  </li>
                );
              })}
            </ol>
            <h3 className="mt-8 text-xl">Result</h3>
            <div className="mt-3" aria-live="polite">
              {status === 'idle' && <p className="text-sm text-foamdim">Nothing has been run yet.</p>}
              {status === 'running' && <p className="text-sm text-foamdim">Working through the tile.</p>}
              {status === 'error' && <p className="border-l-2 border-flag pl-4 text-sm text-foamdim">{error}</p>}
              {status === 'done' && results && results.length === 0 && <p className="text-sm text-foamdim">No targets in this tile. Most seabed is just seabed: sand, ripple, the odd rock. That is a real result, not a failure.</p>}
              {status === 'done' && results && results.length > 0 && (
                <table className="spec-table">
                  <thead><tr><th scope="col">Class</th><th scope="col">Confidence</th><th scope="col">Position in tile</th></tr></thead>
                  <tbody>{results.map((d, i) => (<tr key={i}><td className="font-display font-bold">{classLabel(SITE.classes, d.cls)}</td><td className="readout-md text-ping">{d.conf.toFixed(2)}</td><td className="readout-md text-foamdim">{Math.round(d.x * 100)}%, {Math.round(d.y * 100)}%</td></tr>))}</tbody>
                </table>
              )}
              {status === 'done' && results && results.length > 0 && <p className="mt-3 text-xs text-foamdim">In the full pipeline these boxes are geotagged from the tile&rsquo;s ping header and appear in the dashboard below. The demo tile has no header, so they stop here.</p>}
            </div>
          </div>
        </section>

        {/* 2. Dashboard */}
        <section className="mt-16" aria-labelledby="dash-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="dash-h" className="text-2xl">Dashboard</h2>
            <div className="flex items-center gap-3">
              <label htmlFor="horizon" className="text-sm text-foamdim">Forecast horizon</label>
              <select id="horizon" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="border hairline bg-abyss px-2 py-1 font-display text-sm font-bold">
                {[0, 6, 12, 24, 48].map((h) => (<option key={h} value={h}>{h === 0 ? 'now' : `+${h} h`}</option>))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-sm text-foamdim">Click a row to highlight it on the map. Weight is an estimate from L × W × H and a per-class density. Risk is scored at the chosen horizon.</p>
          {loading ? <p className="readout mt-6 text-foamdim">loading</p> : <DetectionTable records={records} selectedId={selectedId} onSelect={setSelectedId} className="mt-4 max-h-[60vh]" />}
        </section>

        {/* 3. Map */}
        <section className="mt-16" aria-labelledby="map-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="map-h" className="text-2xl">Geo map</h2>
            <Link to={selectedId ? `/map?sel=${selectedId}` : '/map'} className="btn btn-solid btn-sm">Open full map</Link>
          </div>
          <p className="mt-2 text-sm text-foamdim">Markers are coloured by priority. Dotted lines are the drift forecast to +{hours || 0} h with nodes every 6 h. The full map adds filters, layers and the mission planner.</p>
          <div className="mt-4 h-[520px] border hairline">
            {!loading && <DebrisMap records={records} hazards={hazards} hours={hours} selectedId={selectedId} onSelect={setSelectedId} port={SITE.area.port} />}
          </div>
          {selectedId && (() => { const r = records.find((x) => x.id === selectedId); return r ? (
            <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-display font-bold">{r.id}</span><span className="text-foamdim">{r.clsInfo.label}</span><TierBadge tier={r.risk.tier} score={r.risk.score} />
              <Link to={`/detections/${r.id}`} className="readout text-ping">open detail</Link>
            </p>) : null; })()}
        </section>
      </main>
    </div>
  );
}
