// The only module the UI talks to. Switches between the browser mock and a
// live backend using API.mode in data.js. Shapes are identical either way.

import { API, SITE } from './data.js';
import { mock, enrich } from './mock.js';
import { classInfo } from '../lib/utils.js';
import { notifyRecordsUpdated } from '../lib/useRecords.js';

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
    try {
      // Query live detections from backend database
      const res = await getJson(url('/detections', { page_size: 200 }));
      const dbDets = res.detections || [];

      return dbDets.map((d) => {
        const raw = {
          id: d.id,
          cls: d.cls,
          conf: Number(d.conf ?? 0),
          lat: Number(d.lat ?? SITE.area.center[0]),
          lon: Number(d.lon ?? SITE.area.center[1]),
          depth: Number(d.depth_m ?? 30),
          range: Number(d.range_m ?? 25),
          side: d.side ?? 'starboard',
          line: d.line ?? 'L01',
          ping: Number(d.ping ?? 1000),
          status: d.status ?? 'Candidate',
          dims: {
            length: Number(d.echo_len_m ?? 2.4),
            width: Math.max(0.5, Number((d.w ?? 0.1) * 15.0)),
            height: Number(d.height_est_m ?? 1.2),
          },
          tileUrl: d.image_url || (d.image_path ? (d.image_path.startsWith('/') ? d.image_path : `/${d.image_path}`) : null),
          tile: {
            x: Number(d.x ?? 0.5),
            y: Number(d.y ?? 0.5),
            size: Math.max(0.06, Number(d.w ?? 0.1)),
            w: Number(d.w ?? 0.1),
            h: Number(d.h ?? 0.1),
            shadow: 3,
          },
          notes: d.notes,
        };
        return enrich(raw, hours);
      });
    } catch (err) {
      console.warn('Backend detections endpoint unavailable:', err);
      return [];
    }
  },

  async stats() {
    if (isMock) return { total_detections: SITE.detections.length, confirmed: 3, candidates: 4 };
    try {
      return await getJson(url('/stats'));
    } catch (err) {
      console.warn('Backend stats endpoint unavailable:', err);
      return { total_detections: 0, confirmed: 0, candidates: 0, rejected: 0, by_class: [] };
    }
  },

  async hazards() {
    if (isMock) return mock.hazards();
    try {
      return await getJson(url(API.endpoints.hazards));
    } catch (err) {
      console.warn('Backend hazards endpoint unavailable:', err);
      return { hazards: [] };
    }
  },

  async conditions(p, tHours = 0) {
    return mock.conditions(p, tHours);
  },

  async currentGrid(bounds, step, tHours) {
    return mock.currentGrid(bounds, step, tHours);
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

  // POST multipart "file" → full XTF processing, tiling, YOLO inference, and DB persistence
  async processXtf(file, lineName = null) {
    const fd = new FormData();
    fd.append('file', file);
    if (lineName) fd.append('line_name', lineName);

    const json = await getJson(url(API.endpoints.xtfUpload || '/xtf/upload'), {
      method: 'POST',
      body: fd,
    });
    // Broadcast update so all map views, sidebars, and tables reload live
    notifyRecordsUpdated();
    return json;
  },

  // POST multipart "image" → { detections: [{cls, conf, x, y, w, h}] }
  async detect(file) {
    if (isMock) return mock.detect(file);
    const fd = new FormData();
    fd.append('image', file);
    const json = await getJson(url(API.endpoints.detect), { method: 'POST', body: fd });
    if (!json || !Array.isArray(json.detections)) throw new Error('response has no "detections" array');

    // Broadcast update
    notifyRecordsUpdated();

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
