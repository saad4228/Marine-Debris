import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TierBadge from './TierBadge.jsx';
import { formatKg, cx } from '../lib/utils.js';

const COLUMNS = [
  { key: 'id', label: 'Debris ID', get: (r) => r.id },
  { key: 'cls', label: 'Class', get: (r) => r.clsInfo.label },
  { key: 'conf', label: 'Conf.', get: (r) => r.conf, num: true, fmt: (v) => v.toFixed(2) },
  { key: 'lat', label: 'Lat', get: (r) => r.lat, num: true, fmt: (v) => v.toFixed(4) },
  { key: 'lon', label: 'Lon', get: (r) => r.lon, num: true, fmt: (v) => v.toFixed(4) },
  { key: 'L', label: 'L (m)', get: (r) => r.dims[0], num: true, fmt: (v) => v.toFixed(1) },
  { key: 'W', label: 'W (m)', get: (r) => r.dims[1], num: true, fmt: (v) => v.toFixed(1) },
  { key: 'H', label: 'H (m)', get: (r) => r.dims[2], num: true, fmt: (v) => v.toFixed(1) },
  { key: 'shadow', label: 'Shadow (m)', get: (r) => r.shadowM, num: true, fmt: (v) => v.toFixed(1) },
  { key: 'weight', label: 'Est. weight', get: (r) => r.weightKg, num: true, fmt: formatKg },
  { key: 'score', label: 'Risk', get: (r) => r.risk.score, num: true, fmt: (v) => String(v) },
  { key: 'tier', label: 'Priority', get: (r) => r.risk.score },
];

export default function DetectionTable({ records, selectedId, onSelect, className, dense = false }) {
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    const arr = [...records];
    arr.sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [records, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'id' || key === 'cls' ? 'asc' : 'desc' }));

  return (
    <div className={cx('overflow-auto border hairline', className)}>
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
            <th scope="col"><span className="sr-only">Open</span></th>
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
                      {c.fmt ? c.fmt(v) : v}
                    </td>
                  );
                })}
                <td>
                  <Link to={`/detections/${r.id}`} className="readout text-ping hover:text-foam" onClick={(e) => e.stopPropagation()}>
                    detail
                  </Link>
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
  );
}
