// In-browser stand-in for the backend. Same shapes as the live API.
// Everything is deterministic from the seeds in data.js.

import { SITE } from './data.js';
import { makeCurrentField, forecastTrack, currentAt, windAt } from '../lib/drift.js';
import { scoreRisk, scoreRiskWithoutPosition } from '../lib/risk.js';
import { planRoute } from '../lib/route.js';
import { classInfo, estimateWeightKg, rngFor, wait } from '../lib/utils.js';

const field = makeCurrentField('nadir-currents', SITE.area.center);
const env = { field, hazards: SITE.hazards };

function findDetection(id) {
  const d = SITE.detections.find((x) => x.id === id);
  if (!d) throw new Error(`No detection ${id}`);
  return d;
}

export function enrich(det, hours) {
  const cls = classInfo(SITE.classes, det.cls);
  const weightKg = estimateWeightKg(cls, det.dims);
  const located = det.lat != null && det.lon != null;

  // Drift and hazard exposure are both positional. Running them on an unlocated
  // detection seeds the track with null and yields a NaN score that tierFor() would
  // silently round down to the lowest tier. Score the position-independent factors
  // instead and mark the rest unavailable, so the record still ranks and still renders.
  if (!located) {
    return {
      ...det,
      located: false,
      clsInfo: cls,
      weightKg,
      track: [],
      forecastEnd: null,
      risk: scoreRiskWithoutPosition(cls, det.conf, weightKg),
    };
  }

  const track = forecastTrack(det, cls, hours, env);
  const risk = scoreRisk(det, cls, track, SITE.hazards, weightKg);
  return { ...det, located: true, clsInfo: cls, weightKg, track, risk, forecastEnd: track[track.length - 1] };
}

export const mock = {
  async records(hours = 48) {
    return SITE.detections.map((d) => enrich(d, hours));
  },

  async forecast(id, hours = 48) {
    const d = findDetection(id);
    return { track: forecastTrack(d, classInfo(SITE.classes, d.cls), hours, env) };
  },

  async risk(id, hours = 48) {
    return enrich(findDetection(id), hours).risk;
  },

  async hazards() {
    return { hazards: SITE.hazards };
  },

  async conditions(p, tHours = 0) {
    return { current: currentAt(field, p, tHours, SITE.hazards), wind: windAt(tHours) };
  },

  // Sample the current field on a grid for the map's flow arrows.
  async currentGrid(bounds, step = 0.02, tHours = 0) {
    const out = [];
    for (let lat = bounds.south; lat <= bounds.north; lat += step) {
      for (let lon = bounds.west; lon <= bounds.east; lon += step) {
        const c = currentAt(field, { lat, lon }, tHours, SITE.hazards);
        out.push({ lat, lon, speed: c.speed, bearing: c.bearing });
      }
    }
    return out;
  },

  async mission({ start, ids, hours = 48 }) {
    const targets = ids.map((id) => {
      const r = enrich(findDetection(id), hours);
      const p = hours > 0 ? r.forecastEnd : r;
      return { id, lat: p.lat, lon: p.lon, tier: r.risk.tier.id, cls: r.cls };
    });
    return planRoute(start, targets, SITE.vessel, { returnToStart: true });
  },

  // Demo detection for the upload page: deterministic from name and size.
  async detect(file) {
    await wait(300);
    const rng = rngFor(`${file.name}:${file.size}`);
    const n = rng() < 0.22 ? 0 : 1 + Math.floor(rng() * 3);
    const detections = [];
    for (let i = 0; i < n; i++) {
      const cls = SITE.classes[Math.floor(rng() * SITE.classes.length)].id;
      const w = 0.08 + rng() * 0.14;
      const h = 0.08 + rng() * 0.14;
      detections.push({ cls, conf: Number((0.55 + rng() * 0.42).toFixed(2)), x: rng() * (1 - w), y: rng() * (1 - h), w, h });
    }
    return { detections };
  },
};
