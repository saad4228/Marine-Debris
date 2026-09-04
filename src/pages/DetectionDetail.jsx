import { Link, useParams } from 'react-router-dom';
import { useRecords } from '../lib/useRecords.js';
import { formatLatLon } from '../lib/geo.js';
import { formatKg } from '../lib/utils.js';
import SurfaceBand from '../components/SurfaceBand.jsx';
import SonarTile from '../components/SonarTile.jsx';
import TierBadge from '../components/TierBadge.jsx';
import DebrisMap from '../components/DebrisMap.jsx';

export default function DetectionDetail() {
  const { id } = useParams();
  const { records, hazards, loading } = useRecords(48);
  const index = records.findIndex((d) => d.id === id);
  const r = records[index];

  if (loading) return <main className="mx-auto max-w-7xl px-6 pt-10 md:px-10"><p className="readout text-foamdim">loading</p></main>;

  if (!r) {
    return (
      <main className="mx-auto max-w-7xl px-6 pb-12 pt-10 md:px-10">
        <h1 className="h-page">No such target</h1>
        <p className="lede measure mt-6">There is no detection with id <span className="readout-md text-ping">{id}</span> in the catalogue.</p>
        <Link to="/detections" className="btn btn-ghost mt-8">Back to detections</Link>
      </main>
    );
  }

  const prev = records[index - 1];
  const next = records[index + 1];
  const nodes = [6, 12, 24, 48].map((h) => r.track[h]).filter(Boolean);

  const specs = [
    ['Class', r.clsInfo.label],
    ['Confidence', <span key="confidence" className="readout-md text-ping">{r.conf.toFixed(2)}</span>],
    ['Status', r.status],
    ['Priority', <TierBadge key="priority" tier={r.risk.tier} score={r.risk.score} />],
    ['Survey line / ping', <span key="line" className="readout-md">{r.line} · {r.ping}</span>],
    ['Side / ground range', <span key="range" className="readout-md">{r.side} · {r.rangeM.toFixed(1)} m</span>],
    ['Water depth', <span key="depth" className="readout-md">{r.depthM} m</span>],
    ['Position', <span key="position" className="readout-md">{formatLatLon(r.lat, r.lon)}</span>],
    ['L × W × H', <span key="dimensions" className="readout-md">{r.dims.map((v) => v.toFixed(1)).join(' × ')} m</span>],
    ['Shadow length', <span key="shadow" className="readout-md">{r.shadowM.toFixed(1)} m</span>],
    ['Estimated weight', <span key="weight" className="readout-md">{formatKg(r.weightKg)}</span>],
    ['Detected', <span key="detected" className="readout-md">{new Date(r.detectedAt).toUTCString()}</span>],
  ];

  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <p className="readout text-foam"><Link to="/detections" className="hover:text-ping">Detections</Link> / {r.id}</p>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <h1 className="h-page text-shadow-deep">{r.clsInfo.label}</h1>
            <p className="readout mt-3 text-foamdim">{r.id}</p>
            <div className="mt-8 border hairline">
              <SonarTile seed={r.id} targets={[r.tile]} showBox label={`${r.cls.toUpperCase()} ${r.conf.toFixed(2)}`} aspect={0.68} />
            </div>
            <p className="mt-3 text-sm text-foamdim">Tile rendered from the detection id. The shadow falls to {r.side}, away from the nadir.</p>

            <h2 className="mt-12 text-2xl">Drift forecast</h2>
            <div className="mt-4 h-80 border hairline">
              <DebrisMap records={[r]} hazards={hazards} hours={48} selectedId={r.id} layers={{ drift: true, hazards: true, currents: false, seamarks: false, route: false }} />
            </div>
            <table className="spec-table mt-4">
              <thead><tr><th scope="col">Horizon</th><th scope="col">Forecast position</th><th scope="col">Uncertainty</th></tr></thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.hours}><th scope="row">+{n.hours} h</th><td className="readout-md">{formatLatLon(n.lat, n.lon)}</td><td className="readout-md text-foamdim">± {Math.round(n.spreadM)} m</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm text-foamdim">Displacement over 48 h: {r.risk.displacementKm.toFixed(2)} km. {r.risk.displacementKm < 0.05 ? 'Below the mobility threshold for this class: expected to stay put.' : ''}</p>
            <Link to={`/map?sel=${r.id}`} className="btn btn-ghost btn-sm mt-4">Open on the full map</Link>
          </div>

          <div>
            <h2 className="text-2xl">Specification</h2>
            <table className="spec-table mt-4"><tbody>{specs.map(([k, v]) => (<tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>))}</tbody></table>

            <h2 className="mt-10 text-2xl">Risk breakdown</h2>
            <p className="mt-2 text-sm text-foamdim">Score {r.risk.score} of 100. Each bar is factor value × weight.</p>
            <ul className="mt-4 space-y-3">
              {r.risk.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-display font-bold">{f.label} <span className="readout text-foamdim">w {f.weight.toFixed(2)}</span></span>
                    <span className="readout-md text-ping">{Math.round(f.contribution * 100)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-foamdim/15"><div className="h-full bg-ping" style={{ width: `${Math.round(f.contribution * 100 * (1 / f.weight) * f.weight)}%` }} /></div>
                  <p className="mt-1 text-xs text-foamdim">{f.detail}</p>
                </li>
              ))}
            </ul>

            {r.risk.hazardsHit.length > 0 && (
              <>
                <h2 className="mt-10 text-2xl">Hazards on the track</h2>
                <ul className="mt-3 space-y-1 text-sm">
                  {r.risk.hazardsHit.map((h) => (<li key={h.id} className="flex justify-between gap-4 border-b hairline py-1.5"><span>{h.name}</span><span className="readout text-foamdim">{h.when} · exposure {h.exposure.toFixed(2)}</span></li>))}
                </ul>
              </>
            )}

            <h2 className="mt-10 text-2xl">Analyst note</h2>
            <p className="mt-3 text-foamdim">{r.notes}</p>
            {r.cls === 'ghost-net' && <p className="mt-4 border-l-2 border-flag pl-4 text-sm text-foamdim">Ghost net is the weakest class in this model. Treat this call as a prompt to look, not a finding.</p>}
          </div>
        </div>

        <nav aria-label="Neighbouring detections" className="mt-16 flex flex-wrap justify-between gap-3 border-t hairline pt-8">
          {prev ? <Link to={`/detections/${prev.id}`} className="btn btn-ghost">Previous · {prev.id}</Link> : <span />}
          {next ? <Link to={`/detections/${next.id}`} className="btn btn-ghost">Next · {next.id}</Link> : <Link to="/detections" className="btn btn-ghost">All detections</Link>}
        </nav>
      </main>
    </div>
  );
}
