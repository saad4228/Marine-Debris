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
          <span className="readout hidden text-foamdim sm:inline">marine debris & hazard chart · {SITE.area.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/detections" className="btn btn-ghost btn-sm">Detections</Link>
          <Link to="/upload" className="btn btn-ghost btn-sm">Workbench</Link>
          <button
            type="button"
            className={cx(
              'btn btn-sm transition-colors',
              sidebarOpen ? 'btn-ghost' : 'btn-solid'
            )}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? '✕ Hide Controls' : `◨ Control Deck (${visible.length})`}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Full-bleed Map Viewport */}
        <div className="relative min-w-0 flex-1">
          {loading && (
            <p className="readout absolute left-4 top-4 z-[500] bg-abyss/85 px-3 py-1.5 text-xs text-foamdim shadow-xl backdrop-blur-md border hairline">
              loading forecast...
            </p>
          )}
          {error && (
            <p className="absolute left-4 top-4 z-[500] border-l-2 border-flag bg-abyss/90 px-3 py-2 text-xs text-foam shadow-xl backdrop-blur-md">
              {error}
            </p>
          )}

          {/* Top-left Telemetry Badge */}
          {!loading && !error && (
            <div className="pointer-events-none absolute left-4 top-4 z-[500] hidden sm:flex items-center gap-3 border hairline bg-abyss/85 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-ping animate-pulse" />
              <span className="font-display font-bold text-foam">{SITE.area.name}</span>
              <span className="readout text-foamdim">·</span>
              <span className="readout text-foamdim">{visible.length} targets active</span>
            </div>
          )}

          {/* Floating Drift Horizon Scrubber HUD */}
          {!loading && !error && (
            <div className="pointer-events-auto absolute bottom-5 left-5 z-[500] w-[calc(100%-2.5rem)] max-w-md border hairline bg-abyss/90 p-3 shadow-2xl backdrop-blur-md sm:w-96">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="readout text-[11px] font-bold uppercase tracking-wider text-foamdim">Drift Horizon</span>
                  <span className="readout text-xs font-bold text-ping">{hours === 0 ? 'Now (0 h)' : `+${hours} h`}</span>
                </div>
                <div className="flex gap-1">
                  {[0, 12, 24, 48].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHours(h)}
                      className={cx(
                        'px-2 py-0.5 text-[10px] font-display font-bold transition-colors border',
                        hours === h
                          ? 'border-ping bg-ping text-abyss'
                          : 'border-hairline bg-abyss/60 text-foamdim hover:text-foam'
                      )}
                    >
                      {h === 0 ? 'Now' : `+${h}h`}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={48}
                step={6}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                aria-label="Map drift horizon"
                className="mt-2 h-1.5 w-full cursor-pointer accent-[#f2a93b]"
              />
              <div className="readout mt-1 flex justify-between text-[10px] text-foamdim">
                <span>0 h</span>
                <span>+12 h</span>
                <span>+24 h</span>
                <span>+36 h</span>
                <span>+48 h</span>
              </div>
            </div>
          )}

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

        {/* Dockable Control Deck Sidebar */}
        <div
          className={cx(
            'absolute inset-y-0 right-0 z-[600] w-full max-w-sm sm:w-[390px] shadow-2xl transition-transform duration-300 ease-in-out',
            sidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          )}
        >
          <MapSidebar
            records={records}
            visible={visible}
            hours={hours} setHours={setHours}
            filters={filters} setFilters={setFilters}
            layers={layers} setLayers={setLayers}
            selectedId={selectedId} onSelect={setSelectedId}
            port={port}
            mission={mission} onPlan={plan} onClearRoute={() => setMission({ running: false, route: null, error: null })}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
