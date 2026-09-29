import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TierBadge from './TierBadge.jsx';
import { normalizeDims, formatKg, cx, downloadImage, detectionImageName, confidenceColor, confidenceBand } from '../lib/utils.js';

const COLUMNS = [
  { key: 'id', label: 'Debris ID', get: (r) => r.id },
  { key: 'cls', label: 'Class', get: (r) => r.clsInfo?.label || r.cls },
  {
    key: 'conf',
    label: 'Conf.',
    get: (r) => (r.conf == null ? null : Number(r.conf)),
    num: true,
    // Colour rides alongside the number, never instead of it — the value stays readable
    // if the hue is not (colour-blind readers, greyscale print, low-contrast screens).
    fmt: (v) => (
      <span
        className="inline-flex items-center gap-1.5 font-bold"
        style={{ color: confidenceColor(v) }}
        title={`${confidenceBand(v)} confidence (${Number(v).toFixed(2)})`}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: confidenceColor(v) }}
        />
        {Number(v).toFixed(2)}
      </span>
    ),
  },
  // Unmeasured values stay null and render as "—"; they are never defaulted to a
  // plausible-looking number, which would be indistinguishable from a real reading.
  { key: 'lat', label: 'Lat', get: (r) => (r.lat == null ? null : Number(r.lat)), num: true, fmt: (v) => Number(v).toFixed(4) },
  { key: 'lon', label: 'Lon', get: (r) => (r.lon == null ? null : Number(r.lon)), num: true, fmt: (v) => Number(v).toFixed(4) },
  { key: 'L', label: 'L (m)', get: (r) => normalizeDims(r.dims).length, num: true, fmt: (v) => Number(v).toFixed(1) },
  { key: 'W', label: 'W (m)', get: (r) => normalizeDims(r.dims).width, num: true, fmt: (v) => Number(v).toFixed(1) },
  { key: 'H', label: 'H (m)', get: (r) => normalizeDims(r.dims).height, num: true, fmt: (v) => Number(v).toFixed(1) },
  { key: 'shadow', label: 'Shadow (m)', get: (r) => (r.shadowLenM ?? r.shadow_len_m ?? r.shadowM ?? null), num: true, fmt: (v) => Number(v).toFixed(1) },
  { key: 'weight', label: 'Est. weight', get: (r) => (r.weightKg ?? null), num: true, fmt: formatKg },
  { key: 'score', label: 'Risk', get: (r) => (r.risk?.score == null ? null : Number(r.risk.score)), num: true, fmt: (v) => String(Math.round(v)) },
  { key: 'tier', label: 'Priority', get: (r) => Number(r.risk?.score ?? 50) },
  { key: 'created_at', label: 'Detected', get: (r) => (r.created_at ? new Date(r.created_at).getTime() : 0), num: true, fmt: (v) => v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—' },
];

export default function DetectionTable({ records, selectedId, onSelect, className, dense = false }) {
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  // Per-row image download: which id is in flight, and the last failure.
  const [imgBusy, setImgBusy] = useState(null);
  const [imgError, setImgError] = useState(null);

  async function saveTile(record, e) {
    e.stopPropagation();          // the row itself is clickable — don't also select it
    if (imgBusy) return;
    setImgBusy(record.id);
    setImgError(null);
    try {
      await downloadImage(record.tileUrl, detectionImageName(record.id, record.cls, record.tileUrl));
    } catch (err) {
      setImgError(`${record.id}: ${err.message}`);
    } finally {
      setImgBusy(null);
    }
  }

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    const arr = [...records];
    const flip = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      // Unmeasured values always sink to the bottom, whichever way the column is sorted,
      // so a missing reading never masquerades as the smallest or largest one.
      const aMissing = va == null || va === '';
      const bMissing = vb == null || vb === '';
      if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1;
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return flip * cmp;
    });
    return arr;
  }, [records, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'id' || key === 'cls' ? 'asc' : 'desc' }));

  return (
    <div className={cx('flex flex-col', className)}>
      {imgError && (
        <p className="readout border-b hairline border-l-2 border-l-flag px-3 py-2 text-xs text-foam" role="alert">
          Could not download that tile — {imgError}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto border hairline">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cx('inline-flex items-center gap-1 hover:text-foam', active && 'text-ping')}
                  >
                    {c.label}
                    <span aria-hidden="true" className="readout">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
              );
            })}
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <tr
                key={r.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect && onSelect(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onSelect) onSelect(r.id);
                  }
                }}
                className={cx(dense && 'text-sm')}
              >
                {COLUMNS.map((c) => {
                  if (c.key === 'tier') {
                    return (
                      <td key={c.key}><TierBadge tier={r.risk.tier} /></td>
                    );
                  }
                  const v = c.get(r);
                  return (
                    <td key={c.key} className={cx(c.num && 'num', c.key === 'id' && 'font-display font-bold')}>
                      {v == null || v === '' ? '—' : c.fmt ? c.fmt(v) : v}
                    </td>
                  );
                })}
                <td>
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <Link to={`/detections/${r.id}`} className="readout text-ping hover:text-foam" onClick={(e) => e.stopPropagation()}>
                      detail
                    </Link>
                    {r.tileUrl ? (
                      <button
                        type="button"
                        className="readout text-ping hover:text-foam disabled:opacity-40"
                        disabled={imgBusy !== null}
                        onClick={(e) => saveTile(r, e)}
                        title={`Download the sonar tile this ${r.cls} was detected in`}
                      >
                        {imgBusy === r.id ? 'saving…' : '↓ image'}
                      </button>
                    ) : (
                      <span className="readout text-foamdim" title="No stored image for this detection">—</span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="text-foamdim">No detections match the current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
