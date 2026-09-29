import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Polygon, CircleMarker, Circle, useMap,
} from 'react-leaflet';
import { SITE } from '../site/data.js';
import { api } from '../site/api.js';
import { HAZARD_KINDS } from '../lib/risk.js';
import { destination, formatLatLon } from '../lib/geo.js';
import { formatKg, prefersReducedMotion, cx, formatDims } from '../lib/utils.js';
import { ENABLE_DRIFT_PHYSICS } from '../lib/drift.js';
import TierBadge from './TierBadge.jsx';

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; Sources: Esri, OpenStreetMap contributors';
const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

const CLASS_ICONS = {
  'tyre': '🍩', 'tire': '🍩', 'drum': '🛢️', 'container': '📦',
  'ghost-net': '🕸️', 'ghost_net': '🕸️', 'chain': '⛓️', 'bottle': '🍾',
  'can': '🥫', 'drink_carton': '🧃', 'hook': '🪝', 'propeller': '⚓',
  'valve': '🚰', 'plane': '✈️', 'ship': '⛴️', 'human': '🤿',
  'crab_pot': '🦀', 'fishing_gear': '🎣', 'unknown': '❓'
};

const iconCache = new Map();
function debrisIcon(color, selected, cls) {
  const iconChar = CLASS_ICONS[cls] || '❓';
  const key = `${color}|${selected ? 1 : 0}|${cls}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        html: `<div class="debris-marker${selected ? ' is-selected' : ''}" style="--tier:${color}; width: 26px; height: 26px; display: grid; place-items: center; background: ${color}44; border-radius: 50%; box-shadow: 0 0 0 2px var(--color-abyss) inset;">
                 <span class="ring" style="${selected ? '' : 'display:none;'}"></span>
                 <span style="font-size: 14px; line-height: 1;">${iconChar}</span>
               </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -13],
      })
    );
  }
  return iconCache.get(key);
}

const portIcon = L.divIcon({ className: '', html: '<div class="port-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

function seqIcon(n) {
  return L.divIcon({
    className: '',
    html: `<div style="font:700 11px 'Chivo',sans-serif;background:#8fd8db;color:#03070c;width:18px;height:18px;display:grid;place-items:center;box-shadow:0 0 0 2px #03070c">${n}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/* ---------- helpers that need the map instance ---------- */

function FitOnce({ points }) {
  const map = useMap();
  const lastKey = useRef('');
  useEffect(() => {
    if (!points || !points.length) return;
    const key = `${points.length}_${points[0]?.[0] || 0}_${points[0]?.[1] || 0}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    try {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    } catch {
      // ignore
    }
  }, [map, points]);
  return null;
}

function FlyToSelected({ record }) {
  const map = useMap();
  useEffect(() => {
    if (!record) return;
    const target = [record.lat, record.lon];
    const zoom = Math.max(map.getZoom(), 13);
    if (prefersReducedMotion()) map.setView(target, zoom);
    else map.flyTo(target, zoom, { duration: 0.8 });
  }, [map, record]);
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/* ---------- layers ---------- */

function HazardLayer({ hazards, onSelectHazard }) {
  return hazards.map((h) => {
    const kind = HAZARD_KINDS[h.kind] || { color: '#93aab0', label: h.kind };
    return (
      <Polygon
        key={h.id}
        positions={h.polygon}
        pathOptions={{ color: kind.color, weight: 1.2, dashArray: '4 4', fillColor: kind.color, fillOpacity: 0.12 }}
        eventHandlers={onSelectHazard ? { click: () => onSelectHazard(h) } : undefined}
      >
        <Tooltip sticky>{kind.label}: {h.name}</Tooltip>
      </Polygon>
    );
  });
}

// Sample the current field over the area the targets are actually in. Previously this
// always sampled a fixed box around SITE.area.center, so with a survey anywhere else the
// flow arrows were drawn thousands of km from the detections they were meant to describe.
function CurrentLayer({ hours, bounds }) {
  const [grid, setGrid] = useState([]);
  useEffect(() => {
    let alive = true;
    api.currentGrid(bounds, 0.018, hours).then((g) => alive && setGrid(g));
    return () => { alive = false; };
  }, [hours, bounds]);
  return grid.map((c, i) => {
    const lenKm = 0.25 + c.speed * 1.4;
    const head = destination({ lat: c.lat, lon: c.lon }, c.bearing, lenKm);
    const a = Math.min(0.8, 0.2 + c.speed * 0.9);
    return (
      <Polyline
        key={i}
        positions={[[c.lat, c.lon], [head.lat, head.lon]]}
        pathOptions={{ color: `rgba(143,216,219,${a})`, weight: 1 }}
        interactive={false}
      />
    );
  });
}

function DriftLayer({ records, hours, selectedId }) {
  if (!ENABLE_DRIFT_PHYSICS || hours <= 0) return null;
  return records.map((r) => {
    if (!r.track || r.track.length < 2) return null;
    const pts = r.track.slice(0, hours + 1).map((p) => [p.lat, p.lon]);
    const end = r.track[Math.min(hours, r.track.length - 1)] || { spreadM: 0, lat: r.lat, lon: r.lon };
    const sel = r.id === selectedId;
    const nodes = [];
    for (let h = 6; h <= hours; h += 6) {
      const p = r.track[h];
      if (p) nodes.push({ ...p });
    }
    return (
      <g key={`drift-${r.id}`}>
        <Polyline positions={pts} pathOptions={{ color: '#f2a93b', weight: sel ? 2.2 : 1.4, dashArray: '4 7', opacity: sel ? 0.95 : 0.6 }} interactive={false} />
        {nodes.map((n) => (
          <CircleMarker key={n.hours} center={[n.lat, n.lon]} radius={sel ? 3.5 : 2.5} pathOptions={{ color: '#f2a93b', weight: 1.2, fillColor: '#03070c', fillOpacity: 1 }}>
            <Tooltip direction="top">+{n.hours} h</Tooltip>
          </CircleMarker>
        ))}
        {end && end.spreadM > 0 && (
          <Circle center={[end.lat, end.lon]} radius={end.spreadM} pathOptions={{ color: '#f2a93b', weight: 0.8, opacity: 0.5, fillColor: '#f2a93b', fillOpacity: sel ? 0.12 : 0.06 }} interactive={false} />
        )}
      </g>
    );
  });
}

function RouteLayer({ route }) {
  if (!route || !route.points || route.points.length < 2) return null;
  const pts = route.points.map((p) => [p.lat, p.lon]);
  const stops = route.points.slice(1, route.points.length - 1);
  return (
    <>
      <Polyline positions={pts} pathOptions={{ color: '#8fd8db', weight: 2.4, opacity: 0.9 }} interactive={false} />
      <Polyline positions={pts} pathOptions={{ color: '#03070c', weight: 5, opacity: 0.35 }} interactive={false} />
      {stops.map((p, i) => (
        <Marker key={`${p.id}-${i}`} position={[p.lat, p.lon]} icon={seqIcon(i + 1)} interactive={false} />
      ))}
    </>
  );
}

function DebrisPopup({ r, hours }) {
  const end = r.track?.[Math.min(hours, (r.track?.length || 1) - 1)] || { lat: r.lat, lon: r.lon, hours: 0 };
  const dimsStr = formatDims(r.dims);

  const shadowVal = r.shadowM ?? r.shadow_len_m ?? 1.5;
  const dispKm = r.risk?.displacementKm ?? 0;
  const label = r.clsInfo?.label || r.cls || 'Debris';
  const conf = typeof r.conf === 'number' ? r.conf : 0;

  return (
    <div className="min-w-56">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-base font-black">{r.id}</span>
        {r.risk?.tier && <TierBadge tier={r.risk.tier} score={r.risk.score} />}
      </div>
      <p className="mt-1 font-display font-bold">
        {label} <span className="num text-ping">{conf.toFixed(2)}</span>
      </p>
      <dl className="readout mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-foamdim">
        <dt>now</dt><dd className="text-foam">{formatLatLon(r.lat, r.lon)}</dd>
        {hours > 0 && (<><dt>+{end.hours} h</dt><dd className="text-foam">{formatLatLon(end.lat, end.lon)}</dd></>)}
        <dt>L×W×H</dt><dd className="text-foam">{dimsStr} m</dd>
        <dt>shadow</dt><dd className="text-foam">{typeof shadowVal === 'number' ? shadowVal.toFixed(1) : shadowVal} m</dd>
        <dt>weight</dt><dd className="text-foam">{formatKg(r.weightKg || 500)} est.</dd>
        <dt>drift</dt><dd className="text-foam">{ENABLE_DRIFT_PHYSICS && typeof dispKm === 'number' ? `${dispKm.toFixed(2)} km` : '0.00 km (static)'}</dd>
      </dl>
      {r.risk?.hazardsHit?.length > 0 && (
        <p className="mt-2 text-xs text-foamdim">Hazards: {r.risk.hazardsHit.map((h) => h.name).join('; ')}</p>
      )}
      <Link to={`/detections/${r.id}`} className="readout mt-3 inline-block text-ping">open detail</Link>
    </div>
  );
}

/* ---------- the map ---------- */

export default function DebrisMap({
  records = [],
  hazards = [],
  hours = 48,
  selectedId,
  onSelect,
  layers = { drift: true, hazards: true, currents: false, seamarks: false, route: true },
  route,
  port,
  onPortMove,
  className,
  zoomControl = true,
}) {
  const validRecords = useMemo(() => {
    return (records || []).filter(
      (r) => r && typeof r.lat === 'number' && typeof r.lon === 'number' && !isNaN(r.lat) && !isNaN(r.lon)
    );
  }, [records]);

  // Disperse overlapping coordinates in a small cluster circle so all targets are individually visible and clickable
  const displayRecords = useMemo(() => {
    const coordGroups = new Map();
    for (const r of validRecords) {
      const key = `${r.lat.toFixed(5)}_${r.lon.toFixed(5)}`;
      if (!coordGroups.has(key)) coordGroups.set(key, []);
      coordGroups.get(key).push(r);
    }

    const out = [];
    for (const [, group] of coordGroups) {
      if (group.length === 1) {
        out.push({ ...group[0], displayLat: group[0].lat, displayLon: group[0].lon, clusterSize: 1, clusterIndex: 1 });
      } else {
        group.forEach((r, idx) => {
          const angle = (idx / group.length) * 2 * Math.PI;
          const radiusM = 12 + Math.min(10, group.length * 1.5); // 12-22m visual separation
          const dLat = (radiusM * Math.cos(angle)) / 111111;
          const dLon = (radiusM * Math.sin(angle)) / (111111 * Math.cos((r.lat * Math.PI) / 180));
          out.push({
            ...r,
            displayLat: Number((r.lat + dLat).toFixed(6)),
            displayLon: Number((r.lon + dLon).toFixed(6)),
            clusterSize: group.length,
            clusterIndex: idx + 1,
          });
        });
      }
    }
    return out;
  }, [validRecords]);

  const fitPoints = useMemo(() => {
    const pts = validRecords
      .map((r) => [Number(r.lat), Number(r.lon)])
      .filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0));

    if (pts.length > 0) return pts;
    if (port && port.lat && port.lon) return [[port.lat, port.lon]];
    return [SITE.area.center];
  }, [validRecords, port]);

  // Box around the located targets, clamped to a sane sampling span. Falls back to the
  // configured survey area only when nothing is located.
  const currentBounds = useMemo(() => {
    const pts = validRecords.map((r) => [Number(r.lat), Number(r.lon)]);
    if (pts.length === 0) {
      const [lat, lon] = SITE.area.center;
      return { south: lat - 0.13, north: lat + 0.13, west: lon - 0.15, east: lon + 0.15 };
    }
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    const padLat = Math.max(0.02, (Math.max(...lats) - Math.min(...lats)) * 0.25);
    const padLon = Math.max(0.02, (Math.max(...lons) - Math.min(...lons)) * 0.25);
    return {
      south: Math.min(...lats) - padLat,
      north: Math.max(...lats) + padLat,
      west: Math.min(...lons) - padLon,
      east: Math.max(...lons) + padLon,
    };
  }, [validRecords]);

  const selected = validRecords.find((r) => r.id === selectedId) || null;

  return (
    <div className={cx('relative h-full w-full', className)}>
      <MapContainer
        center={SITE.area.center}
        zoom={SITE.area.zoom}
        preferCanvas
        zoomControl={zoomControl}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={19} />
        {layers.seamarks && <TileLayer url={SEAMARK_URL} opacity={0.9} maxZoom={18} />}

        <ResizeFix />
        <FitOnce points={fitPoints} />
        <FlyToSelected record={selected} />

        {layers.hazards && <HazardLayer hazards={hazards} />}
        {layers.currents && <CurrentLayer hours={hours} bounds={currentBounds} />}
        {layers.drift && <DriftLayer records={validRecords} hours={hours} selectedId={selectedId} />}
        {layers.route && <RouteLayer route={route} />}

        {displayRecords.map((r) => {
          const tierColor = r.risk?.tier?.color || '#8fd8db';
          const label = r.clsInfo?.label || r.cls || 'Debris';
          const clusterNote = r.clusterSize > 1 ? ` (${r.clusterIndex}/${r.clusterSize} at site)` : '';
          return (
            <Marker
              key={r.id}
              position={[r.displayLat, r.displayLon]}
              icon={debrisIcon(tierColor, r.id === selectedId, r.cls)}
              eventHandlers={{ click: () => onSelect && onSelect(r.id) }}
              zIndexOffset={r.id === selectedId ? 1000 : 0}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {r.id} · {label}{clusterNote}
              </Tooltip>
              <Popup><DebrisPopup r={r} hours={hours} /></Popup>
            </Marker>
          );
        })}

        {port && (
          <Marker
            position={[port.lat, port.lon]}
            icon={portIcon}
            draggable={Boolean(onPortMove)}
            eventHandlers={onPortMove ? { dragend: (e) => { const ll = e.target.getLatLng(); onPortMove({ lat: ll.lat, lon: ll.lng }); } } : undefined}
          >
            <Tooltip direction="top" offset={[0, -8]}>{port.name}{onPortMove ? ' (drag to move)' : ''}</Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
