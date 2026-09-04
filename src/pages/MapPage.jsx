import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SITE } from '../site/data.js';
import { api } from '../site/api.js';
import { useRecords } from '../lib/useRecords.js';
import { TIERS } from '../lib/risk.js';
import { cx } from '../lib/utils.js';
import DebrisMap from '../components/DebrisMap.jsx';
import MapSidebar from '../components/MapSidebar.jsx';

export default function MapPage() {
  const [params, setParams] = useSearchParams();
  const [hours, setHours] = useState(24);
  const { records, hazards, loading, error } = useRecords(hours);
  const [selectedId, setSelectedId] = useState(params.get('sel'));
  const [filters, setFilters] = useState({ tiers: new Set(TIERS.map((t) => t.id)), classes: new Set(SITE.classes.map((c) => c.id)), minConf: 0 });
  const [layers, setLayers] = useState({ drift: true, hazards: true, currents: false, seamarks: false, route: true });
  const [port, setPort] = useState(SITE.area.port);
  const [mission, setMission] = useState({ running: false, route: null, error: null });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (selectedId) setParams({ sel: selectedId }, { replace: true });
  }, [selectedId, setParams]);

  // Routes go stale when the horizon or port changes.
  useEffect(() => { setMission((m) => (m.route ? { ...m, route: null } : m)); }, [hours, port]);

  const visible = useMemo(
    () => records.filter((r) => filters.tiers.has(r.risk.tier.id) && filters.classes.has(r.cls) && r.conf >= filters.minConf),
    [records, filters]
  );

  async function plan(ids) {
    setMission({ running: true, route: null, error: null });
    try {
      const route = await api.mission({ start: { ...port, id: 'PORT' }, ids, hours });
      setMission({ running: false, route, error: null });
    } catch (e) {
      setMission({ running: false, route: null, error: `The planner did not answer: ${e.message}. Check the mission endpoint, or set API.mode to "mock".` });
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-abyss">
      <header className="flex items-center justify-between gap-4 border-b hairline px-4 py-2">
        <div className="flex items-baseline gap-4">
          <Link to="/" className="font-display text-lg font-black text-foam no-underline">{SITE.name}</Link>
          <span className="readout hidden text-foamdim sm:inline">geo map · {SITE.area.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/upload" className="btn btn-ghost btn-sm">Workbench</Link>
          <button type="button" className="btn btn-ghost btn-sm lg:hidden" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((o) => !o)}>
            {sidebarOpen ? 'Hide panel' : 'Show panel'}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {loading && <p className="readout absolute left-4 top-4 z-[500] bg-abyss/80 px-2 py-1 text-foamdim">loading forecast</p>}
          {error && <p className="absolute left-4 top-4 z-[500] border-l-2 border-flag bg-abyss/90 px-3 py-2 text-sm text-foamdim">{error}</p>}
          {!loading && !error && (
            <DebrisMap
              records={visible}
              hazards={hazards}
              hours={hours}
              selectedId={selectedId}
              onSelect={setSelectedId}
              layers={layers}
              route={mission.route}
              port={port}
              onPortMove={(p) => setPort({ ...port, ...p })}
            />
          )}
        </div>
        <div className={cx('absolute inset-y-0 right-0 z-[600] w-full max-w-sm transition-transform lg:static lg:w-96 lg:max-w-none lg:translate-x-0', sidebarOpen ? 'translate-x-0' : 'translate-x-full')}>
          <MapSidebar
            records={records}
            visible={visible}
            hours={hours} setHours={setHours}
            filters={filters} setFilters={setFilters}
            layers={layers} setLayers={setLayers}
            selectedId={selectedId} onSelect={setSelectedId}
            port={port}
            mission={mission} onPlan={plan} onClearRoute={() => setMission({ running: false, route: null, error: null })}
          />
        </div>
      </div>
    </div>
  );
}
