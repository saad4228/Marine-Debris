// Demo drift model.
//
// A simplified Lagrangian advection: each hour, the object moves with a
// fraction of the local current (per-class mobility, attenuated with depth,
// zero below a critical speed) plus a windage term for anything near the
// surface. The current field is analytic and seeded so it is deterministic.
//
// The production backend should replace this with OpenDrift driven by
// INCOIS / CMEMS currents and Open-Meteo wind, returning the same shape:
//   [{ lat, lon, hours, spreadM }]

import { destination, pointInPolygon } from './geo.js';
import { rngFor } from './utils.js';

const TIDAL_PERIOD_H = 12.42;

// Build a deterministic field for the survey area from a seed.
export function makeCurrentField(seed, center) {
  const rng = rngFor(seed);
  const eddies = Array.from({ length: 4 }, () => ({
    lat: center[0] + (rng() - 0.5) * 0.18,
    lon: center[1] + (rng() - 0.5) * 0.18,
    radiusDeg: 0.03 + rng() * 0.04,
    strength: (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.2), // m/s at radius
  }));
  return {
    // TODO: replace with real forecast fields
    baseSpeed: 0.22, // m/s, residual monsoon current
    baseBearing: 205, // toward SSW
    tidalAmp: 0.28, // m/s
    tidalBearing: 300, // ebb direction
    eddies,
  };
}

// Current velocity (m/s, bearing deg) at a point and time.
export function currentAt(field, p, tHours, hazards = []) {
  // residual + tide
  let vx = field.baseSpeed * Math.sin((field.baseBearing * Math.PI) / 180);
  let vy = field.baseSpeed * Math.cos((field.baseBearing * Math.PI) / 180);
  const tide = field.tidalAmp * Math.sin((2 * Math.PI * tHours) / TIDAL_PERIOD_H);
  vx += tide * Math.sin((field.tidalBearing * Math.PI) / 180);
  vy += tide * Math.cos((field.tidalBearing * Math.PI) / 180);

  // eddies: tangential velocity falling off outside the core
  for (const e of field.eddies) {
    const dx = (p.lon - e.lon) * Math.cos((p.lat * Math.PI) / 180);
    const dy = p.lat - e.lat;
    const r = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const mag = e.strength * (r / e.radiusDeg) * Math.exp(1 - (r / e.radiusDeg) ** 2);
    vx += (-dy / r) * mag;
    vy += (dx / r) * mag;
  }

  // strong-current zones amplify
  for (const h of hazards) {
    if (h.kind === 'current' && pointInPolygon(p, h.polygon)) {
      vx *= 1.8;
      vy *= 1.8;
    }
  }

  const speed = Math.sqrt(vx * vx + vy * vy);
  const bearing = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
  return { speed, bearing, vx, vy };
}

// Wind (m/s, bearing the wind blows TOWARD).
export function windAt(tHours) {
  // TODO: replace with Open-Meteo 10 m wind
  const speed = 4.5 + 1.5 * Math.sin(tHours / 9);
  const bearing = 235 + 12 * Math.sin(tHours / 15);
  return { speed, bearing };
}

// Bottom current is weaker than surface current.
function depthAttenuation(depthM) {
  if (depthM <= 10) return 1;
  if (depthM >= 80) return 0.35;
  return 1 - ((depthM - 10) / 70) * 0.65;
}

// Critical current speed (m/s) below which the object stays put.
function criticalSpeed(cls) {
  return 0.55 * (1 - cls.mobility) + 0.05;
}

/**
 * Forecast a track for one detection.
 * @param det   detection { lat, lon, depthM, dims }
 * @param cls   class prior { mobility, windage }
 * @param hours horizon (6..48)
 * @param env   { field, hazards }
 */
export function forecastTrack(det, cls, hours, env) {
  const pts = [{ lat: det.lat, lon: det.lon, hours: 0, spreadM: 0 }];
  let p = { lat: det.lat, lon: det.lon };
  const att = depthAttenuation(det.depthM || 40);
  const crit = criticalSpeed(cls);
  let moved = false;

  for (let h = 1; h <= hours; h++) {
    const cur = currentAt(env.field, p, h, env.hazards);
    const wind = windAt(h);
    const bottom = cur.speed * att;

    let vx = 0;
    let vy = 0;
    if (bottom >= crit) {
      const f = cls.mobility * (0.35 + 0.65 * Math.min(1, (bottom - crit) / 0.4));
      vx += cur.vx * att * f;
      vy += cur.vy * att * f;
      moved = true;
    }
    if (cls.windage > 0 && (det.depthM || 40) < 25) {
      vx += wind.speed * cls.windage * Math.sin((wind.bearing * Math.PI) / 180);
      vy += wind.speed * cls.windage * Math.cos((wind.bearing * Math.PI) / 180);
    }

    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 0) {
      const bearing = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
      p = destination(p, bearing, (speed * 3600) / 1000);
    }
    pts.push({ lat: p.lat, lon: p.lon, hours: h, spreadM: moved ? 60 + h * 38 : 0 });
  }
  return pts;
}

export function trackDisplacementKm(track) {
  if (track.length < 2) return 0;
  const a = track[0];
  const b = track[track.length - 1];
  const kx = Math.cos((a.lat * Math.PI) / 180) * 111.32;
  return Math.sqrt(((b.lon - a.lon) * kx) ** 2 + ((b.lat - a.lat) * 110.574) ** 2);
}
