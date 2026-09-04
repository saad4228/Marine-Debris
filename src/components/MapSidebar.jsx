import { useEffect, useState } from 'react';
import { SITE } from '../site/data.js';
import { api, isMock } from '../site/api.js';
import { TIERS, HAZARD_KINDS } from '../lib/risk.js';
import { formatHours, formatKg, cx } from '../lib/utils.js';
import TierBadge from './TierBadge.jsx';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b hairline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-display font-bold hover:text-ping"
      >
        {title}
        <span className="readout text-foamdim" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#f2a93b]" />
      {children}
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
}) {
  const [conds, setConds] = useState(null);
  const [planTiers, setPlanTiers] = useState(new Set(['immediate', 'high']));

  useEffect(() => {
    let alive = true;
    api.conditions({ lat: SITE.area.center[0], lon: SITE.area.center[1] }, hours).then((c) => alive && setConds(c));
    return () => { alive = false; };
  }, [hours]);

  const counts = TIERS.reduce((m, t) => ({ ...m, [t.id]: records.filter((r) => r.risk.tier.id === t.id).length }), {});
  const planTargets = visible.filter((r) => planTiers.has(r.risk.tier.id));

  const toggleSet = (key, id) =>
    setFilters((f) => {
      const next = new Set(f[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, [key]: next };
    });

  const sorted = [...visible].sort((a, b) => b.risk.score - a.risk.score);

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l hairline bg-abyss" aria-label="Map controls">
      <div className="border-b hairline px-4 py-4">
        <p className="font-display text-lg font-black">{SITE.area.name}</p>
        <p className="readout mt-1 text-foamdim">
          {records.length} targets · {isMock ? 'mock forecast' : 'live forecast'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <span key={t.id} className={cx('tier', `tier-${t.id}`)}>{t.label} <span className="num">{counts[t.id]}</span></span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Forecast horizon">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-foamdim">Positions shown at</span>
            <span className="readout-md text-ping">{hours === 0 ? 'now' : `+${hours} h`}</span>
          </div>
          <input
            type="range" min={0} max={48} step={6} value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            aria-label="Forecast horizon in hours"
            className="mt-2 w-full accent-[#f2a93b]"
          />
          <div className="readout flex justify-between text-foamdim"><span>now</span><span>24 h</span><span>48 h</span></div>
          {conds && (
            <dl className="readout mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-foamdim">
              <dt>current</dt>
              <dd className="text-foam">{conds.current.speed.toFixed(2)} m/s toward {Math.round(conds.current.bearing)}°</dd>
              <dt>wind</dt>
              <dd className="text-foam">{conds.wind.speed.toFixed(1)} m/s toward {Math.round(conds.wind.bearing)}°</dd>
            </dl>
          )}
        </Section>

        <Section title="Mission planner">
          <p className="text-sm text-foamdim">
            Optimised visiting order from {port.name} for the selected tiers, using positions at the chosen horizon.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={planTiers.has(t.id)}
                onClick={() => setPlanTiers((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-solid btn-sm" disabled={mission.running || planTargets.length === 0} onClick={() => onPlan(planTargets.map((r) => r.id))}>
              {mission.running ? 'Planning' : `Plan route for ${planTargets.length}`}
            </button>
            {mission.route && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRoute}>Clear</button>
            )}
          </div>
          {mission.error && <p className="mt-3 border-l-2 border-flag pl-3 text-sm text-foamdim">{mission.error}</p>}
          {mission.route && (
            <div className="mt-4">
              <dl className="grid grid-cols-3 gap-2 border hairline text-center">
                <div className="border-r hairline p-2"><dd className="font-display text-xl font-black">{mission.route.totalNm.toFixed(1)}</dd><dt className="readout text-foamdim">nm</dt></div>
                <div className="border-r hairline p-2"><dd className="font-display text-xl font-black">{formatHours(mission.route.hours)}</dd><dt className="readout text-foamdim">incl. recovery</dt></div>
                <div className="p-2"><dd className="font-display text-xl font-black">{Math.round(mission.route.fuelL)}</dd><dt className="readout text-foamdim">L fuel</dt></div>
              </dl>
              <ol className="mt-3 space-y-1">
                {mission.route.order.map((id, i) => {
                  const r = records.find((x) => x.id === id);
                  const leg = mission.route.legs[i];
                  return (
                    <li key={id}>
                      <button type="button" onClick={() => onSelect(id)} className="flex w-full items-center gap-3 py-1 text-left text-sm hover:text-ping">
                        <span className="grid h-5 w-5 place-items-center bg-sun font-display text-xs font-bold text-abyss">{i + 1}</span>
                        <span className="font-display font-bold">{id}</span>
                        <span className="text-foamdim">{r ? r.clsInfo.label : ''}</span>
                        <span className="num ml-auto text-foamdim">{leg ? `${leg.nm.toFixed(1)} nm` : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="readout mt-3 text-foamdim">
                Straight-line legs at {SITE.vessel.speedKn} kn, {SITE.vessel.minutesPerRecovery} min per recovery, return to port included.
              </p>
            </div>
          )}
        </Section>

        <Section title="Filters">
          <p className="readout text-foamdim">priority</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={filters.tiers.has(t.id)} onClick={() => toggleSet('tiers', t.id)}>{t.label}</button>
            ))}
          </div>
          <p className="readout mt-3 text-foamdim">class</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {SITE.classes.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={filters.classes.has(c.id)} onClick={() => toggleSet('classes', c.id)}>{c.label}</button>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="readout text-foamdim">min confidence</span>
            <span className="readout-md text-ping">{filters.minConf.toFixed(2)}</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={filters.minConf} onChange={(e) => setFilters((f) => ({ ...f, minConf: Number(e.target.value) }))} aria-label="Minimum confidence" className="w-full accent-[#f2a93b]" />
        </Section>

        <Section title="Layers">
          <Toggle checked={layers.drift} onChange={(v) => setLayers((l) => ({ ...l, drift: v }))}>Drift tracks (dotted, 6 h nodes)</Toggle>
          <Toggle checked={layers.hazards} onChange={(v) => setLayers((l) => ({ ...l, hazards: v }))}>Hazard zones</Toggle>
          <Toggle checked={layers.currents} onChange={(v) => setLayers((l) => ({ ...l, currents: v }))}>Current field</Toggle>
          <Toggle checked={layers.seamarks} onChange={(v) => setLayers((l) => ({ ...l, seamarks: v }))}>OpenSeaMap seamarks</Toggle>
          <Toggle checked={layers.route} onChange={(v) => setLayers((l) => ({ ...l, route: v }))}>Mission route</Toggle>
        </Section>

        <Section title={`Targets (${sorted.length})`}>
          <ul className="divide-y hairline">
            {sorted.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  aria-current={r.id === selectedId ? 'true' : undefined}
                  className={cx('flex w-full flex-col gap-0.5 py-2 text-left hover:bg-mid/30', r.id === selectedId && 'bg-ping/10')}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="font-display font-bold">{r.id}</span>
                    <TierBadge tier={r.risk.tier} score={r.risk.score} />
                  </span>
                  <span className="readout text-foamdim">
                    {r.clsInfo.label} · {r.conf.toFixed(2)} · {formatKg(r.weightKg)} · drift {r.risk.displacementKm.toFixed(2)} km
                  </span>
                </button>
              </li>
            ))}
            {sorted.length === 0 && <li className="py-2 text-sm text-foamdim">Nothing matches the filters.</li>}
          </ul>
        </Section>

        <Section title="Legend" defaultOpen={false}>
          <ul className="space-y-1 text-sm">
            {TIERS.map((t) => (
              <li key={t.id} className="flex items-center gap-2"><span className="h-3 w-3" style={{ background: t.color }} />{t.label} priority</li>
            ))}
            <li className="flex items-center gap-2"><span className="h-0 w-6 border-t-2 border-dashed border-ping" />drift track, nodes every 6 h</li>
            <li className="flex items-center gap-2"><span className="h-0 w-6 border-t-2 border-sun" />mission route</li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rotate-45 bg-sun" />home port</li>
            {Object.entries(HAZARD_KINDS).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2"><span className="h-3 w-3 border border-dashed" style={{ borderColor: v.color, background: `${v.color}22` }} />{v.label}</li>
            ))}
          </ul>
        </Section>
      </div>
    </aside>
  );
}
