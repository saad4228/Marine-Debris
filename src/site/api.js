// The only module the UI talks to. Switches between the browser mock and a
// live backend using API.mode in data.js. Shapes are identical either way.

import { API, SITE } from './data.js';
import { mock, enrich } from './mock.js';
import { classInfo } from '../lib/utils.js';

export const isMock = API.mode !== 'live' || !API.baseUrl;

function url(path, query) {
  const base = API.baseUrl.startsWith('http')
    ? API.baseUrl
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000') + (API.baseUrl || '');
  const u = new URL(base + path);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  return u.toString();
}

async function getJson(u, init) {
  const res = await fetch(u, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  return res.json();
}

export const api = {
  // Full records: detection + weight + track + risk, at a forecast horizon.
  async records(hours = 48) {
    if (isMock) return mock.records(hours);
    // Backend doesn't provide forecast/risk endpoints yet, so use client-side simulation
    try {
      if (!API.endpoints?.forecast || !API.endpoints?.risk) return mock.records(hours);
      return await Promise.all(
        SITE.detections.map(async (d) => {
          const [f, r] = await Promise.all([
            getJson(url(`${API.endpoints.forecast}/${d.id}`, { hours })),
            getJson(url(`${API.endpoints.risk}/${d.id}`, { hours })),
          ]);
          const cls = classInfo(SITE.classes, d.cls);
          const local = enrich(d, hours);
          return { ...local, clsInfo: cls, track: f.track, risk: r, forecastEnd: f.track[f.track.length - 1] };
        })
      );
    } catch (err) {
      console.warn('Forecast/risk endpoints unavailable on backend, using simulation fallback:', err);
      return mock.records(hours);
    }
  },

  async hazards() {
    if (isMock) return mock.hazards();
    try {
      return await getJson(url(API.endpoints.hazards));
    } catch {
      return mock.hazards();
    }
  },

  async conditions(p, tHours = 0) {
    return mock.conditions(p, tHours); // TODO: live endpoint when available
  },

  async currentGrid(bounds, step, tHours) {
    return mock.currentGrid(bounds, step, tHours); // TODO: live endpoint when available
  },

  async mission(payload) {
    if (isMock) return mock.mission(payload);
    try {
      return await getJson(url(API.endpoints.mission), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      return mock.mission(payload);
    }
  },

  // POST multipart "image" → { detections: [{cls, conf, x, y, w, h}] }
  async detect(file) {
    if (isMock) return mock.detect(file);
    const fd = new FormData();
    fd.append('image', file);
    const json = await getJson(url(API.endpoints.detect), { method: 'POST', body: fd });
    if (!json || !Array.isArray(json.detections)) throw new Error('response has no "detections" array');
    return {
      detections: json.detections.map((d) => ({
        cls: String(d.cls ?? 'unknown'),
        conf: Number(d.conf ?? 0),
        x: Number(d.x ?? 0),
        y: Number(d.y ?? 0),
        w: Number(d.w ?? 0),
        h: Number(d.h ?? 0),
        side: d.side ?? null,
        range_m: d.range_m != null ? Number(d.range_m) : null,
        depth_m: d.depth_m != null ? Number(d.depth_m) : null,
        lat: d.lat != null ? Number(d.lat) : null,
        lon: d.lon != null ? Number(d.lon) : null,
        echo_len_m: d.echo_len_m != null ? Number(d.echo_len_m) : null,
        shadow_len_m: d.shadow_len_m != null ? Number(d.shadow_len_m) : null,
        height_est_m: d.height_est_m != null ? Number(d.height_est_m) : null,
        line: d.line ?? null,
        ping: d.ping != null ? Number(d.ping) : null,
        notes: d.notes ?? null,
      })),
    };
  },
};
