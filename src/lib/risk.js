// Risk scoring. Weighted sum of transparent factors, 0..100, mapped to a tier.
// Every factor is reported back so a reviewer can argue with it.

import { distanceToPolygonKm } from './geo.js';
import { trackDisplacementKm, ENABLE_DRIFT_PHYSICS } from './drift.js';
import { clamp, formatDims } from './utils.js';

export const TIERS = [
  { id: 'immediate', label: 'Immediate', min: 75, color: '#ff4d3d' },
  { id: 'high', label: 'High', min: 55, color: '#f2a93b' },
  { id: 'moderate', label: 'Moderate', min: 35, color: '#8fd8db' },
  { id: 'low', label: 'Low', min: 0, color: '#93aab0' },
];

export const HAZARD_KINDS = {
  current: { label: 'Strong current', color: '#8fd8db' },
  protected: { label: 'Protected area', color: '#4fd18b' },
  shipping: { label: 'Shipping lane', color: '#f2a93b' },
  restricted: { label: 'Restricted / government', color: '#ff4d3d' },
  fishing: { label: 'Fishing ground', color: '#c9a3ff' },
  tourism: { label: 'Tourist beach', color: '#ffd68c' },
  wildlife: { label: 'Dangerous wildlife', color: '#ff8fb1' },
  toxic: { label: 'Toxic / outfall', color: '#b6ff5c' },
};

// TODO: calibrate weights with the domain mentor
const WEIGHTS = {
  hazard: 0.35,
  severity: 0.22,
  confidence: 0.12,
  mass: 0.1,
  mobility: 0.11,
  displacement: 0.1,
};

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

// Exposure of a point to a hazard: 1 inside, decaying to 0 at 2.5 km.
function exposure(p, hazard) {
  const d = distanceToPolygonKm(p, hazard.polygon);
  return clamp(1 - d / 2.5) * hazard.weight;
}

/**
 * @param det     detection record
 * @param cls     class prior { severity, mobility }
 * @param track   forecast track from drift.js
 * @param hazards hazard zones
 * @param weightKg estimated mass
 */
export function scoreRisk(det, cls, track, hazards, weightKg) {
  const now = { lat: det.lat, lon: det.lon };
  const end = track[track.length - 1];

  // Hazard exposure: worst case across now, forecast end, and mid-track samples.
  const samples = [{ p: now, when: 'now' }, { p: end, when: `+${end.hours} h` }];
  for (let i = 6; i < track.length - 1; i += 6) samples.push({ p: track[i], when: `+${track[i].hours} h` });

  let hazardScore = 0;
  const hits = [];
  for (const h of hazards) {
    let best = 0;
    let when = null;
    for (const s of samples) {
      const e = exposure(s.p, h);
      if (e > best) {
        best = e;
        when = s.when;
      }
    }
    if (best > 0.15) hits.push({ id: h.id, name: h.name, kind: h.kind, exposure: best, when });
    hazardScore = Math.max(hazardScore, best);
  }
  // Two or more overlapping hazards add a little
  if (hits.length > 1) hazardScore = clamp(hazardScore + 0.1 * (hits.length - 1));
  hits.sort((a, b) => b.exposure - a.exposure);

  // weightKg is null when the target was never sized; score mass as 0 and say so
  // rather than printing a mass that was never measured.
  const massNorm = weightKg == null ? 0 : clamp(Math.log10(Math.max(1, weightKg)) / 3.5);
  const dispKm = trackDisplacementKm(track);
  const dispNorm = clamp(dispKm / 3);
  const dimsStr = formatDims(det.dims);

  const factors = [
    { key: 'hazard', label: 'Hazard exposure', value: hazardScore, weight: WEIGHTS.hazard, detail: hits.length ? hits.map((h) => `${h.name} (${h.when})`).join('; ') : 'No hazard zone within 2.5 km of the track' },
    { key: 'severity', label: 'Debris severity', value: cls.severity, weight: WEIGHTS.severity, detail: `${cls.label} class prior` },
    { key: 'confidence', label: 'Detection confidence', value: det.conf, weight: WEIGHTS.confidence, detail: `Model confidence ${(det.conf || 0).toFixed(2)}` },
    { key: 'mass', label: 'Estimated mass', value: massNorm, weight: WEIGHTS.mass, detail: weightKg == null ? 'Not measured — no echo length or height for this target' : `${Math.round(weightKg)} kg from ${dimsStr} m (square footprint assumed; sonar measures one horizontal extent)` },
    { key: 'mobility', label: 'Mobility', value: cls.mobility, weight: WEIGHTS.mobility, detail: cls.mobility > 0.5 ? 'Likely to move under current' : 'Likely to stay put' },
    { key: 'displacement', label: 'Forecast displacement', value: dispNorm, weight: WEIGHTS.displacement, detail: !ENABLE_DRIFT_PHYSICS ? 'Bypassed in prototype (stationary target at sonar fix)' : `${dispKm.toFixed(2)} km over ${end.hours} h` },
  ].map((f) => ({ ...f, contribution: f.value * f.weight }));

  const raw = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.round(clamp(raw) * 100);
  return { score, tier: tierFor(score), factors, hazardsHit: hits, displacementKm: dispKm, positional: true };
}

/**
 * Risk for a detection with no navigation fix.
 *
 * Hazard exposure and forecast displacement are both positional, so neither can be
 * assessed without a coordinate. Rather than scoring them as zero — which would push
 * every unlocated target into the lowest tier and bury it — the remaining factors are
 * renormalised over the weight actually available, giving a score that stays comparable
 * with located targets. The two missing factors are reported with value null so the
 * detail panel can say plainly that they were not assessed.
 *
 * @param cls      class prior { severity, mobility, label }
 * @param conf     model confidence 0..1
 * @param weightKg estimated mass
 */
export function scoreRiskWithoutPosition(cls, conf, weightKg) {
  const massNorm = weightKg == null ? 0 : clamp(Math.log10(Math.max(1, weightKg)) / 3.5);
  const confidence = Number(conf) || 0;

  const assessed = [
    { key: 'severity', label: 'Debris severity', value: cls.severity, weight: WEIGHTS.severity, detail: `${cls.label} class prior` },
    { key: 'confidence', label: 'Detection confidence', value: confidence, weight: WEIGHTS.confidence, detail: `Model confidence ${confidence.toFixed(2)}` },
    { key: 'mass', label: 'Estimated mass', value: massNorm, weight: WEIGHTS.mass, detail: weightKg == null ? 'Not measured — no echo length or height for this target' : `${Math.round(weightKg)} kg from the echo (square footprint assumed)` },
    { key: 'mobility', label: 'Mobility', value: cls.mobility, weight: WEIGHTS.mobility, detail: cls.mobility > 0.5 ? 'Likely to move under current' : 'Likely to stay put' },
  ].map((f) => ({ ...f, contribution: f.value * f.weight }));

  const unavailable = [
    { key: 'hazard', label: 'Hazard exposure', value: null, weight: WEIGHTS.hazard, contribution: 0, detail: 'Not assessed — no coordinates for this target' },
    { key: 'displacement', label: 'Forecast displacement', value: null, weight: WEIGHTS.displacement, contribution: 0, detail: 'Not assessed — drift needs a start position' },
  ];

  // Renormalise over the weight we could actually assess.
  const availableWeight = assessed.reduce((s, f) => s + f.weight, 0);
  const raw = assessed.reduce((s, f) => s + f.contribution, 0) / (availableWeight || 1);
  const score = Math.round(clamp(raw) * 100);

  return {
    score,
    tier: tierFor(score),
    factors: [...assessed, ...unavailable],
    hazardsHit: [],
    displacementKm: null,
    positional: false,
  };
}
