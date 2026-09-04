// Geodesy helpers. Distances in km unless suffixed. Bearings in degrees clockwise from north.

const R_KM = 6371.0088;
export const KM_PER_NM = 1.852;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Move from a point along a bearing by a distance.
export function destination(a, bearing, distKm) {
  const d = distKm / R_KM;
  const br = toRad(bearing);
  const la1 = toRad(a.lat);
  const lo1 = toRad(a.lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 =
    lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 };
}

// Ray-casting point-in-polygon. polygon: [[lat, lon], ...]
export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Approximate distance from a point to a polygon edge (0 if inside), in km.
export function distanceToPolygonKm(p, polygon) {
  if (pointInPolygon(p, polygon)) return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = { lat: polygon[i][0], lon: polygon[i][1] };
    const b = { lat: polygon[(i + 1) % polygon.length][0], lon: polygon[(i + 1) % polygon.length][1] };
    best = Math.min(best, distancePointToSegmentKm(p, a, b));
  }
  return best;
}

function distancePointToSegmentKm(p, a, b) {
  // Flat-earth approximation over short distances.
  const kx = Math.cos(toRad(p.lat)) * 111.32;
  const ky = 110.574;
  const ax = (a.lon - p.lon) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lon - p.lon) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

export function polygonCentroid(polygon) {
  const n = polygon.length;
  const lat = polygon.reduce((s, p) => s + p[0], 0) / n;
  const lon = polygon.reduce((s, p) => s + p[1], 0) / n;
  return { lat, lon };
}

export function formatLatLon(lat, lon, digits = 4) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}

export function kmToNm(km) {
  return km / KM_PER_NM;
}
