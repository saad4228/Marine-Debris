import { useEffect, useMemo, useState } from 'react';
import { SITE, CLASS_FILTERS } from '../site/data.js';
import { api, isMock } from '../site/api.js';
import { TIERS, HAZARD_KINDS } from '../lib/risk.js';
import { formatHours, formatKg, cx } from '../lib/utils.js';
import { ENABLE_DRIFT_PHYSICS } from '../lib/drift.js';
import TierBadge from './TierBadge.jsx';

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2 text-sm text-foam hover:text-ping">
      <span>{children}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-[#f2a93b]"
      />
    </label>
  );
}

export default function MapSidebar({
  records,
  visible,
  hours, setHours,
  filters, setFilters,
  layers, setLayers,
  selectedId, onSelect,
  port,
  mission, onPlan, onClearRoute,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('targets'); // 'targets' | 'mission' | 'layers'
  const [conds, setConds] = useState(null);
  const [planTiers, setPlanTiers] = useState(new Set(['immediate', 'high']));
  const [searchQuery, setSearchQuery] = useState('');
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.conditions({ lat: SITE.area.center[0], lon: SITE.area.center[1] }, hours).then((c) => alive && setConds(c));
    return () => { alive = false; };
  }, [hours]);

  const counts = useMemo(
    () => TIERS.reduce((m, t) => ({ ...m, [t.id]: records.filter((r) => r.risk.tier.id === t.id).length }), {}),
    [records]
  );

  const planTargets = useMemo(
    () => visible.filter((r) => planTiers.has(r.risk.tier.id)),
    [visible, planTiers]
  );

  const toggleSet = (key, id) =>
    setFilters((f) => {
      const next = new Set(f[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, [key]: next };
    });

  const sorted = useMemo(() => {
    let list = [...visible].sort((a, b) => b.risk.score - a.risk.score);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => r.id.toLowerCase().includes(q) || r.clsInfo.label.toLowerCase().includes(q));
    }
    return list;
  }, [visible, searchQuery]);

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l hairline bg-abyss/95 backdrop-blur-md" aria-label="Map controls">
      {/* Header bar */}
      <div className="border-b hairline p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-base font-black tracking-tight text-foam">{SITE.area.name}</p>
            <p className="readout mt-0.5 text-xs text-foamdim">
              {visible.length} of {records.length} targets · {isMock ? 'simulation' : 'live telemetry'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center text-foamdim hover:text-foam"
              title="Close panel"
              aria-label="Close panel"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tier counts overview */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <span key={t.id} className={cx('tier text-[11px] py-0.5 px-1.5', `tier-${t.id}`)}>
              {t.label} <span className="num font-bold">{counts[t.id] || 0}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Modern Tab Selector */}
      <nav className="flex border-b hairline bg-abyss/40" aria-label="Sidebar sections">
        <button
          type="button"
          onClick={() => setActiveTab('targets')}
          className={cx(
            'flex-1 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors',
            activeTab === 'targets'
              ? 'border-b-2 border-ping bg-ping/5 text-ping'
              : 'text-foamdim hover:text-foam'
          )}
        >
          Targets ({sorted.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mission')}
          className={cx(
            'flex-1 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors',
            activeTab === 'mission'
              ? 'border-b-2 border-ping bg-ping/5 text-ping'
              : 'text-foamdim hover:text-foam'
          )}
        >
          Mission {mission.route ? '•' : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('layers')}
          className={cx(
            'flex-1 py-2.5 text-xs font-display font-bold uppercase tracking-wider transition-colors',
            activeTab === 'layers'
              ? 'border-b-2 border-ping bg-ping/5 text-ping'
              : 'text-foamdim hover:text-foam'
          )}
        >
          Layers & Filters
        </button>
      </nav>

      {/* Main Tab Panels */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* TAB 1: TARGETS */}
        {activeTab === 'targets' && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="search"
                placeholder="Search targets by ID or class..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border hairline bg-abyss/80 px-3 py-1.5 text-xs text-foam placeholder:text-foamdim/60 focus:border-ping focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1.5 text-xs text-foamdim hover:text-foam"
                >
                  ✕
                </button>
              )}
            </div>

            <ul className="space-y-1.5">
              {sorted.map((r) => {
                const isSel = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      aria-current={isSel ? 'true' : undefined}
                      className={cx(
                        'flex w-full flex-col border p-2.5 text-left transition-all',
                        isSel
                          ? 'border-ping bg-ping/10 shadow-[0_0_12px_rgba(242,169,59,0.15)]'
                          : 'border-hairline bg-abyss/60 hover:border-foamdim/40 hover:bg-mid/20'
                      )}
                    >
                      <div className="flex w-full items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cx('h-2 w-2 rounded-full', isSel ? 'bg-ping animate-pulse' : 'bg-foamdim')} />
                          <span className="font-display text-sm font-bold text-foam">{r.id}</span>
                          <span className="text-xs text-foamdim">({r.clsInfo.label})</span>
                        </div>
                        <TierBadge tier={r.risk.tier} score={r.risk.score} />
                      </div>
                      <div className="readout mt-1 flex items-center justify-between text-[11px] text-foamdim">
                        <span>conf {r.conf.toFixed(2)} · {formatKg(r.weightKg)}</span>
                        {ENABLE_DRIFT_PHYSICS ? (
                          <span className="text-ping">drift {r.risk.displacementKm.toFixed(2)} km</span>
                        ) : (
                          <span className="text-foamdim font-mono">stationary</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
              {sorted.length === 0 && (
                <li className="py-8 text-center text-xs text-foamdim">
                  No targets match current filters or search.
                </li>
              )}
            </ul>
          </div>
        )}

        {/* TAB 2: MISSION PLANNER */}
        {activeTab === 'mission' && (
          <div className="space-y-4">
            <div>
              <p className="font-display text-sm font-bold text-foam">Recovery Route Planner</p>
              <p className="mt-1 text-xs text-foamdim">
                Optimised multi-waypoint path originating from <strong className="text-foam">{port.name}</strong>.
              </p>
            </div>

            <div>
              <label className="readout text-xs text-foamdim">Select priority tiers to include</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="chip text-xs"
                    aria-pressed={planTiers.has(t.id)}
                    onClick={() =>
                      setPlanTiers((s) => {
                        const n = new Set(s);
                        if (n.has(t.id)) n.delete(t.id);
                        else n.add(t.id);
                        return n;
                      })
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="btn btn-solid btn-sm flex-1 justify-center"
                disabled={mission.running || planTargets.length === 0}
                onClick={() => onPlan(planTargets.map((r) => r.id))}
              >
                {mission.running ? 'Computing optimum route...' : `Plan Route (${planTargets.length} targets)`}
              </button>
              {mission.route && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRoute}>
                  Clear
                </button>
              )}
            </div>

            {mission.error && (
              <p className="border-l-2 border-flag bg-flag/10 p-2 text-xs text-foam">
                {mission.error}
              </p>
            )}

            {mission.route && (
              <div className="mt-4 space-y-3">
                <dl className="grid grid-cols-3 gap-1.5 border hairline bg-abyss/80 p-2 text-center">
                  <div className="border-r hairline pr-2">
                    <dd className="font-display text-lg font-black text-foam">{mission.route.totalNm.toFixed(1)}</dd>
                    <dt className="readout text-[10px] text-foamdim">distance (nm)</dt>
                  </div>
                  <div className="border-r hairline px-2">
                    <dd className="font-display text-lg font-black text-foam">{formatHours(mission.route.hours)}</dd>
                    <dt className="readout text-[10px] text-foamdim">mission duration</dt>
                  </div>
                  <div className="pl-2">
                    <dd className="font-display text-lg font-black text-foam">{Math.round(mission.route.fuelL)}</dd>
                    <dt className="readout text-[10px] text-foamdim">fuel (L)</dt>
                  </div>
                </dl>

                <p className="readout text-xs text-foamdim">Waypoint sequence:</p>
                <ol className="space-y-1">
                  {mission.route.order.map((id, i) => {
                    const r = records.find((x) => x.id === id);
                    const leg = mission.route.legs[i];
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onSelect(id)}
                          className="flex w-full items-center gap-2.5 border hairline bg-abyss/60 p-2 text-left text-xs transition-colors hover:border-ping"
                        >
                          <span className="grid h-5 w-5 place-items-center bg-sun font-display text-[11px] font-bold text-abyss">
                            {i + 1}
                          </span>
                          <span className="font-display font-bold text-foam">{id}</span>
                          <span className="text-foamdim">{r ? r.clsInfo.label : ''}</span>
                          <span className="readout ml-auto text-foamdim">{leg ? `${leg.nm.toFixed(1)} nm` : ''}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <p className="readout text-[11px] text-foamdim">
                  Based on {SITE.vessel.speedKn} kn transit, {SITE.vessel.minutesPerRecovery} min recovery/target, port return included.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LAYERS & FILTERS */}
        {activeTab === 'layers' && (
          <div className="space-y-5">
            {/* Layers */}
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-wider text-foamdim">Map Layer Overlays</p>
              <div className="mt-2 divide-y hairline border-y hairline">
                <Toggle checked={layers.drift} onChange={(v) => setLayers((l) => ({ ...l, drift: v }))}>
                  <span>
                    Drift tracks (dotted 6 h nodes)
                    {!ENABLE_DRIFT_PHYSICS && (
                      <span className="ml-1 text-[10px] text-foamdim font-mono">(bypassed)</span>
                    )}
                  </span>
                </Toggle>
                <Toggle checked={layers.hazards} onChange={(v) => setLayers((l) => ({ ...l, hazards: v }))}>
                  Hazard zones (marine parks & lanes)
                </Toggle>
                <Toggle checked={layers.currents} onChange={(v) => setLayers((l) => ({ ...l, currents: v }))}>
                  Ocean current field
                </Toggle>
                <Toggle checked={layers.seamarks} onChange={(v) => setLayers((l) => ({ ...l, seamarks: v }))}>
                  OpenSeaMap seamarks
                </Toggle>
                <Toggle checked={layers.route} onChange={(v) => setLayers((l) => ({ ...l, route: v }))}>
                  Planned mission route
                </Toggle>
              </div>
            </div>

            {/* Target Filters */}
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-wider text-foamdim">Priority Tiers</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="chip text-xs"
                    aria-pressed={filters.tiers.has(t.id)}
                    onClick={() => toggleSet('tiers', t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="font-display text-xs font-bold uppercase tracking-wider text-foamdim">Target Classes to Include</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="readout text-[10px] text-ping hover:text-foam underline cursor-pointer"
                    onClick={() =>
                      setFilters((f) => ({ ...f, classes: new Set(CLASS_FILTERS.map((c) => c.id)) }))
                    }
                  >
                    All
                  </button>
                  <span className="text-foamdim text-[10px]">·</span>
                  <button
                    type="button"
                    className="readout text-[10px] text-ping hover:text-foam underline cursor-pointer"
                    onClick={() => setFilters((f) => ({ ...f, classes: new Set() }))}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="mt-1 space-y-0.5 border hairline bg-abyss/60 px-2 py-1.5 max-h-48 overflow-y-auto">
                {CLASS_FILTERS.map((c) => {
                  const checked = filters.classes.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 cursor-pointer py-0.5 text-xs hover:text-foam group"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSet('classes', c.id)}
                        className="h-3.5 w-3.5 accent-[#f2a93b] cursor-pointer"
                      />
                      <span className={checked ? 'text-foam' : 'text-foamdim'}>{c.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="readout text-xs text-foamdim">Min Confidence</span>
                <span className="readout-md text-sm text-ping">{filters.minConf.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={filters.minConf}
                onChange={(e) => setFilters((f) => ({ ...f, minConf: Number(e.target.value) }))}
                aria-label="Minimum confidence"
                className="mt-2 w-full accent-[#f2a93b]"
              />
            </div>

            {/* Forecast Horizon inside layers tab too */}
            <div className="border-t hairline pt-4">
              <div className="flex items-baseline justify-between">
                <span className="readout text-xs text-foamdim">Drift Horizon</span>
                <span className="readout-md text-sm text-ping">{hours === 0 ? 'Now' : `+${hours} h`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={48}
                step={6}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                aria-label="Forecast horizon in hours"
                className="mt-2 w-full accent-[#f2a93b]"
              />
              <div className="readout flex justify-between text-[11px] text-foamdim">
                <span>0 h (Now)</span>
                <span>+24 h</span>
                <span>+48 h</span>
              </div>
              {conds && (
                <dl className="readout mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-[11px] text-foamdim">
                  <dt>Current:</dt>
                  <dd className="text-foam">{conds.current.speed.toFixed(2)} m/s @ {Math.round(conds.current.bearing)}°</dd>
                  <dt>Wind:</dt>
                  <dd className="text-foam">{conds.wind.speed.toFixed(1)} m/s @ {Math.round(conds.wind.bearing)}°</dd>
                </dl>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Legend Drawer at bottom */}
      <div className="border-t hairline bg-abyss/80">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-display font-bold uppercase tracking-wider text-foam hover:text-ping"
        >
          <span>Map Symbol Legend</span>
          <span className="readout text-foamdim">{legendOpen ? '−' : '+'}</span>
        </button>
        {legendOpen && (
          <div className="border-t hairline px-4 py-3 text-xs">
            <ul className="space-y-1.5">
              {TIERS.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  <span className="text-foam">{t.label} priority target</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="h-0 w-5 border-t-2 border-dashed border-ping" />
                <span className="text-foamdim">Drift forecast track (6 h nodes)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-0 w-5 border-t-2 border-sun" />
                <span className="text-foamdim">Optimised mission route</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rotate-45 bg-sun" />
                <span className="text-foamdim">Home port departure / return</span>
              </li>
              {Object.entries(HAZARD_KINDS).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 border border-dashed" style={{ borderColor: v.color, background: `${v.color}33` }} />
                  <span className="text-foamdim">{v.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

