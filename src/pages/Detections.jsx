import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../site/data.js';
import { useRecords } from '../lib/useRecords.js';
import SurfaceBand from '../components/SurfaceBand.jsx';
import SonarTile from '../components/SonarTile.jsx';
import TierBadge from '../components/TierBadge.jsx';

export default function Detections() {
  const [active, setActive] = useState('all');
  const { records, loading } = useRecords(48);

  const counts = useMemo(() => {
    const c = { all: records.length };
    for (const r of records) c[r.cls] = (c[r.cls] || 0) + 1;
    return c;
  }, [records]);

  const chips = [{ id: 'all', label: 'All classes' }, ...SITE.classes];
  const shown = (active === 'all' ? records : records.filter((r) => r.cls === active)).slice().sort((a, b) => b.risk.score - a.risk.score);

  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="max-w-4xl">
          <h1 className="h-page text-shadow-deep">Detections</h1>
          <p className="lede measure mt-6 text-foam">Every target raised on the evaluation surveys, drawn as the tile it was found in, ranked by risk. Boxes enclose echo and shadow together.</p>
        </header>

        <div role="group" aria-label="Filter by class" className="mt-10 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={active === c.id} onClick={() => setActive(c.id)}>
              {c.label}<span className="readout">{counts[c.id] || 0}</span>
            </button>
          ))}
        </div>

        <p className="readout mt-6 text-foamdim" aria-live="polite">{loading ? 'loading' : `${shown.length} of ${records.length} targets`}</p>

        <ul className="mt-4 grid gap-px border hairline bg-foamdim/20 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <li key={r.id} className="bg-abyss">
              <Link to={`/detections/${r.id}`} className="group block p-4 no-underline">
                <SonarTile seed={r.id} targets={[r.tile]} showBox label={`${r.cls.toUpperCase()} ${r.conf.toFixed(2)}`} aspect={0.72} />
                <div className="mt-3 flex items-baseline justify-between gap-4">
                  <span className="font-display text-lg font-bold text-foam group-hover:text-ping">{r.clsInfo.label}</span>
                  <TierBadge tier={r.risk.tier} score={r.risk.score} />
                </div>
                <div className="readout mt-1 text-foamdim">{r.id} · {r.line} · {r.side} · conf {r.conf.toFixed(2)}</div>
                <div className="mt-1 text-sm text-foamdim">{r.status}</div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
