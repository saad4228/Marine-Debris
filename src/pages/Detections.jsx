import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLASS_FILTERS } from '../site/data.js';
import { useRecords } from '../lib/useRecords.js';
import { api, REVIEW_STATUSES } from '../site/api.js';
import { formatLatLon } from '../lib/geo.js';
import { formatKg, formatDims } from '../lib/utils.js';
import { ENABLE_DRIFT_PHYSICS } from '../lib/drift.js';
import SurfaceBand from '../components/SurfaceBand.jsx';
import SonarTile from '../components/SonarTile.jsx';
import TierBadge from '../components/TierBadge.jsx';

/* ------------------------------------------------------------------ */
/*  Inline detail panel – replaces the broken DetectionDetail route    */
/* ------------------------------------------------------------------ */
function DetectionInfoPanel({ record: r, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!r) return null;

  const rangeVal  = r.range_m ?? r.rangeM ?? r.range ?? 25.0;
  const shadowVal = r.shadow_len_m ?? r.shadowM ?? 1.5;
  const depthVal  = r.depth_m ?? r.depthM ?? r.depth ?? 30.0;
  const dateStr   = r.detectedAt || r.created_at
    ? new Date(r.detectedAt || r.created_at).toUTCString()
    : 'Live Survey Ingested';

  const dimsStr = formatDims(r.dims);

  const specs = [
    ['Class',              r.clsInfo?.label || r.cls],
    ['Confidence',         (r.conf || 0).toFixed(2)],
    ['Status',             r.status || 'Candidate'],
    ['Survey line / ping', `${r.line} · ${r.ping}`],
    ['Side / ground range',`${r.side} · ${Number(rangeVal).toFixed(1)} m`],
    ['Water depth',        `${depthVal} m`],
    ['Position (GPS)',     formatLatLon(r.lat, r.lon)],
    ['L × W × H',         `${dimsStr} m`],
    ['Shadow length',      `${Number(shadowVal).toFixed(1)} m`],
    ['Est. weight',        formatKg(r.weightKg || 500)],
    ['Detected',           dateStr],
  ];

  /* Physical characteristics from class data */
  const cls = r.clsInfo || {};

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm"
         onClick={onClose} role="dialog" aria-modal="true" aria-label={`Details for ${r.id}`}>

      {/* Panel – slides in from right */}
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[#060e18]/95 border-l border-white/10 shadow-2xl animate-[slideIn_0.3s_ease]"
           onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#060e18]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="readout text-foamdim">{r.id}</p>
            <h2 className="font-display text-2xl font-bold text-foam">{r.clsInfo?.label || r.cls}</h2>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foamdim transition hover:bg-white/10 hover:text-foam" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 space-y-8 px-6 py-6">
          {/* Sonar tile */}
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <SonarTile tileUrl={r.tileUrl} seed={r.id} targets={[r.tile]} showBox label={`${r.cls.toUpperCase()} ${r.conf.toFixed(2)}`} aspect={0.68} />
          </div>
          <p className="text-xs text-foamdim">Tile rendered from detection. Shadow falls to {r.side}, away from nadir.</p>

          {/* Priority badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-foam">Priority</span>
            <TierBadge tier={r.risk.tier} score={r.risk.score} />
            <span className="readout text-foamdim ml-auto">score {r.risk.score} / 100</span>
          </div>

          {/* Spec table */}
          <div>
            <h3 className="text-lg font-display font-bold text-foam mb-3">Specification</h3>
            <table className="w-full text-sm">
              <tbody>
                {specs.map(([k, v]) => (
                  <tr key={k} className="border-b border-white/5">
                    <th className="py-2 pr-4 text-left font-normal text-foamdim whitespace-nowrap">{k}</th>
                    <td className="py-2 text-foam font-mono text-xs">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Physical characteristics */}
          <div>
            <h3 className="text-lg font-display font-bold text-foam mb-3">Physical Characteristics</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ['Density', `${cls.density ?? 300} kg/m³`],
                ['Mobility', ((cls.mobility ?? 0.3) * 100).toFixed(0) + '%'],
                ['Severity', ((cls.severity ?? 0.5) * 100).toFixed(0) + '%'],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  <p className="readout text-foamdim text-[10px]">{label}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-ping">{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Risk breakdown */}
          {r.risk?.factors?.length > 0 && (
            <div>
              <h3 className="text-lg font-display font-bold text-foam mb-3">Risk Breakdown</h3>
              <ul className="space-y-3">
                {r.risk.factors.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-display font-bold text-foam">{f.label} <span className="readout text-foamdim">w {f.weight.toFixed(2)}</span></span>
                      <span className="readout-md text-ping">{Math.round(f.contribution * 100)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-ping transition-all" style={{ width: `${Math.min(100, Math.round(f.contribution * 100))}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-foamdim">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hazards hit */}
          {r.risk?.hazardsHit?.length > 0 && (
            <div>
              <h3 className="text-lg font-display font-bold text-foam mb-3">Hazards on Track</h3>
              <ul className="space-y-1 text-sm">
                {r.risk.hazardsHit.map((h) => (
                  <li key={h.id} className="flex justify-between gap-4 border-b border-white/5 py-1.5">
                    <span className="text-foam">{h.name}</span>
                    <span className="readout text-foamdim">{h.when} · exposure {h.exposure.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Analyst note */}
          <div>
            <h3 className="text-lg font-display font-bold text-foam mb-2">Analyst Note</h3>
            <p className="text-sm text-foamdim leading-relaxed">{r.notes}</p>
            {r.cls === 'ghost-net' && (
              <p className="mt-3 border-l-2 border-orange-400/60 pl-4 text-xs text-foamdim italic">
                Ghost net is the weakest class in this model. Treat this call as a prompt to look, not a finding.
              </p>
            )}
          </div>

          {/* Drift info */}
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs text-foamdim">
              <span className="font-bold text-foam">Drift physics status:</span>{' '}
              {ENABLE_DRIFT_PHYSICS ? (
                <>
                  {r.risk.displacementKm.toFixed(2)} km displacement.{' '}
                  {r.risk.displacementKm < 0.05
                    ? 'Below mobility threshold — expected to stay put.'
                    : 'Object may move under current. Check Map for drift track.'}
                </>
              ) : (
                'Bypassed for prototype. Target coordinates are stationary at the surveyed sonar fix.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Detections page                                               */
/* ------------------------------------------------------------------ */
export default function Detections() {
  const [active, setActive] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { records, loading, error } = useRecords(48);

  // Who is signing off. The catalogue is shared, so an unattributed "Confirmed" tells
  // you a call was made but not who made it. This is a stated identity, not an
  // authenticated one — it makes the audit trail readable, it does not make it trusted.
  const [analyst, setAnalyst] = useState(() => {
    try { return localStorage.getItem('nadir.analyst') || ''; } catch { return ''; }
  });

  const rememberAnalyst = useCallback((name) => {
    setAnalyst(name);
    try { localStorage.setItem('nadir.analyst', name); } catch { /* private mode */ }
  }, []);

  // Detections the sonar could not georeference. Surfaced as a count so missing geo data
  // is visible rather than silently absorbed by a map that simply omits them.
  const unlocatedCount = useMemo(
    () => records.filter((r) => r.lat == null || r.lon == null).length,
    [records]
  );

  // Optimistic review overlay, keyed by detection id: { status, pending, error }.
  // records comes straight from useRecords and has no setter, so the applied status is
  // held here and merged at render time rather than mutating the fetched list.
  const [review, setReview] = useState({});

  const statusOf = useCallback((r) => review[r.id]?.status ?? r.status, [review]);

  const applyReview = useCallback(async (record, nextStatus) => {
    const previous = review[record.id]?.status ?? record.status;
    if (review[record.id]?.pending || previous === nextStatus) return;

    if (!analyst.trim()) {
      setReview((m) => ({
        ...m,
        [record.id]: { status: previous, pending: false, error: 'Add your name under "Reviewing as" before signing off.' },
      }));
      document.getElementById('analyst-name')?.focus();
      return;
    }

    // Optimistic: show the new status immediately, mark in-flight so the control locks.
    setReview((m) => ({ ...m, [record.id]: { status: nextStatus, pending: true, error: null } }));

    try {
      const updated = await api.reviewDetection(record.id, nextStatus, analyst);
      setReview((m) => ({
        ...m,
        [record.id]: { status: updated?.status ?? nextStatus, pending: false, error: null },
      }));
    } catch (e) {
      // Roll back to the status we had before the click, and say why it failed.
      setReview((m) => ({ ...m, [record.id]: { status: previous, pending: false, error: e.message } }));
    }
  }, [review, analyst]);

  const counts = useMemo(() => {
    const c = { all: records.length };
    for (const r of records) c[r.cls] = (c[r.cls] || 0) + 1;
    return c;
  }, [records]);

  const chips = [{ id: 'all', label: 'All classes' }, ...CLASS_FILTERS];
  const shown = (active === 'all' ? records : records.filter((r) => r.cls === active))
    .filter(r => !searchQuery || (r.id || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .slice().sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA;
  });

  const selectedRecord = useMemo(() => records.find((r) => r.id === selectedId) || null, [records, selectedId]);
  const closePanel = useCallback(() => setSelectedId(null), []);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (selectedId) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedId]);

  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="max-w-4xl">
          <h1 className="h-page text-shadow-deep">Detections</h1>
          <p className="lede measure mt-6 text-foam">Every target raised on the processed survey lines, drawn as the tile it was found in, ranked by risk. Boxes enclose echo and shadow together.</p>
        </header>

        <div role="group" aria-label="Filter by class" className="mt-10 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={active === c.id} onClick={() => setActive(c.id)}>
              {c.label}<span className="readout">{counts[c.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <p className="readout text-foamdim" aria-live="polite">
              {loading ? 'loading' : `${shown.length} of ${records.length} targets`}
              {!loading && unlocatedCount > 0 && (
                <span className="ml-2 text-sun">· {unlocatedCount} without a position</span>
              )}
            </p>
            <input 
              type="text" 
              placeholder="Search by ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border hairline bg-abyss px-2.5 py-1 text-sm text-foam outline-none focus:border-ping w-48"
              aria-label="Search by Target ID"
            />
          </div>
          <label className="readout flex items-center gap-2 text-foamdim" htmlFor="analyst-name">
            Reviewing as
            <input
              id="analyst-name"
              type="text"
              value={analyst}
              onChange={(e) => rememberAnalyst(e.target.value)}
              placeholder="your name"
              autoComplete="name"
              className="border hairline bg-abyss px-2 py-1 text-foam outline-none focus:border-ping"
            />
          </label>
        </div>

        {shown.length > 0 ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r) => (
              <li key={r.id} className="border hairline bg-abyss/90 transition-colors hover:border-ping/50">
                <button type="button" onClick={() => setSelectedId(r.id)} className="group block w-full p-4 text-left cursor-pointer">
                  <SonarTile tileUrl={r.tileUrl} seed={r.id} targets={[r.tile]} showBox label={`${r.cls.toUpperCase()} ${r.conf.toFixed(2)}`} aspect={0.72} />
                  <div className="mt-3 flex items-baseline justify-between gap-4">
                    <span className="font-display text-lg font-bold text-foam group-hover:text-ping">{r.clsInfo.label}</span>
                    <TierBadge tier={r.risk.tier} score={r.risk.score} />
                  </div>
                  <div className="readout mt-1 text-foamdim">{r.id} · {r.line} · {r.side} · conf {r.conf.toFixed(2)}</div>
                </button>

                {/* Review controls sit outside the card button: nesting a button inside
                    a button is invalid HTML and every click would also select the card. */}
                <div className="border-t hairline px-4 pb-4 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-foamdim">
                      {statusOf(r)}
                      {(r.lat == null || r.lon == null) && (
                        <span
                          className="border border-sun/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sun"
                          title="Detected, but the sonar ping carried no navigation fix — this target is not on the map."
                        >
                          No position
                        </span>
                      )}
                    </span>
                    <div role="group" aria-label={`Review ${r.id}`} className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-confirm"
                        disabled={review[r.id]?.pending || statusOf(r) === REVIEW_STATUSES.confirmed}
                        aria-pressed={statusOf(r) === REVIEW_STATUSES.confirmed}
                        onClick={() => applyReview(r, REVIEW_STATUSES.confirmed)}
                      >
                        ✓ Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-reject"
                        disabled={review[r.id]?.pending || statusOf(r) === REVIEW_STATUSES.rejected}
                        aria-pressed={statusOf(r) === REVIEW_STATUSES.rejected}
                        onClick={() => applyReview(r, REVIEW_STATUSES.rejected)}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                  {review[r.id]?.pending && (
                    <p className="readout mt-2 text-xs text-foamdim" aria-live="polite">saving review…</p>
                  )}
                  {review[r.id]?.error && (
                    <p className="readout mt-2 border-l-2 border-flag pl-2 text-xs text-foam" role="alert">
                      {review[r.id].error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : !loading && error ? (
          <div className="mt-12 border-l-2 border-flag py-8 pl-4 text-foamdim">
            <p className="readout text-foam">Could not load detections (backend may be down).</p>
            <p className="readout mt-2 text-xs">{error}</p>
          </div>
        ) : !loading ? (
          <div className="mt-12 py-8 text-center text-foamdim">
            <p className="readout">No detections found for this category.</p>
          </div>
        ) : null}
      </main>

      {/* Inline detail panel */}
      {selectedRecord && <DetectionInfoPanel record={selectedRecord} onClose={closePanel} />}
    </div>
  );
}
