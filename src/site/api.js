// The only module the UI talks to. Switches between the browser mock and a
// live backend using API.mode in data.js. Shapes are identical either way.

import { API, SITE } from './data.js';
import { canonicalClassId } from '../lib/utils.js';
import { mock, enrich } from './mock.js';
import { notifyRecordsUpdated } from '../lib/useRecords.js';

export const isMock = API.mode !== 'live' || !API.baseUrl;

// Exact strings the backend stores in Detection.status. Taken from the ReviewUpdate
// schema and the review route docstring in app/api/v1/endpoints/detections.py — the
// endpoint does not validate against an enum, so these must match verbatim.
export const REVIEW_STATUSES = {
  candidate: 'Candidate',
  confirmed: 'Confirmed by review',
  rejected: 'Rejected',
};

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

// Same contract as getJson, but keeps the raw bytes. Exports are files (CSV is not even
// JSON), so they must not go through res.json().
async function getBlob(u, init) {
  const res = await fetch(u, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  return res.blob();
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
        // A detection with no navigation fix stays unlocated. Never substitute a
        // placeholder position — an invented coordinate is indistinguishable from a
        // real one once it reaches the map, the risk score and the exports.
        const located = d.lat != null && d.lon != null;
        const raw = {
          id: d.id,
          cls: canonicalClassId(SITE.classes, d.cls),
          conf: Number(d.conf ?? 0),
          located,
          lat: located ? Number(d.lat) : null,
          lon: located ? Number(d.lon) : null,
          depth: Number(d.depth_m ?? 30),
          range: Number(d.range_m ?? 25),
          side: d.side ?? 'starboard',
          line: d.line ?? 'L01',
          ping: Number(d.ping ?? 1000),
          status: d.status ?? 'Candidate',
          // Measured extents only, in metres, straight from the backend's acoustic
          // geometry. An axis the sonar did not measure stays null and renders as "—".
          //
          // width is always null: the backend has no width field. Side-scan resolves one
          // horizontal extent (echo_len_m) plus a shadow that encodes height; across-track
          // width is not observable from a single pass. The old `d.w * 15.0` multiplied a
          // normalised bbox fraction by a bare constant to manufacture one.
          dims: {
            length: d.echo_len_m != null ? Number(d.echo_len_m) : null,
            width: null,
            height: d.height_est_m != null ? Number(d.height_est_m) : null,
          },
          shadowLenM: d.shadow_len_m != null ? Number(d.shadow_len_m) : null,
          // Read the server's URL verbatim. The old fallback rebuilt the path here,
          // which hardcoded the backend's storage layout into the frontend — a move to a
          // CDN or signed URLs would have produced broken paths with no error to trace.
          tileUrl: d.image_url ?? null,
          tile: {
            x: Number(d.x ?? 0.5),
            y: Number(d.y ?? 0.5),
            size: Math.max(0.06, Number(d.w ?? 0.1)),
            w: Number(d.w ?? 0.1),
            h: Number(d.h ?? 0.1),
            shadow: 3,
          },
          notes: d.notes,
          created_at: d.created_at,
        };
        return enrich(raw, hours);
      });
    } catch (err) {
      // Let the failure through. Returning [] here made a backend outage look exactly
      // like an empty catalogue, so nobody could tell the difference.
      throw new Error(`Could not reach the detections service: ${err.message}`);
    }
  },

  async stats() {
    if (isMock) return { total_detections: SITE.detections.length, confirmed: 3, candidates: 4 };
    try {
      return await getJson(url('/stats'));
    } catch (err) {
      throw new Error(`Could not reach the stats service: ${err.message}`);
    }
  },

  // Not wrapped in a throw: /hazards is not implemented on the backend yet, so it 404s
  // on every call. Surfacing that as an outage would flag the whole app as down even
  // when detections load fine. Degrade to an empty layer until the endpoint exists.
  async hazards() {
    if (isMock) return mock.hazards();
    try {
      return await getJson(url(API.endpoints.hazards));
    } catch (err) {
      console.warn('Hazards endpoint not available (not yet implemented):', err.message);
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
    } catch (err) {
      throw new Error(err.message);
    }
  },

  // PATCH /detections/:id/review → the updated detection (a full DetectionResponse,
  // not a ReviewResponse — the route's response_model is DetectionResponse).
  //
  // The endpoint accepts { status, notes?, reviewer? }.
  //   notes    — deliberately never sent: update_review() assigns det.notes = notes when
  //              it is not None, which would overwrite the acoustic telemetry note the
  //              XTF pipeline wrote.
  //   reviewer — sent when the analyst has identified themselves, so the Review audit row
  //              records who made the call. Never a placeholder: an unattributed review is
  //              better than a fabricated name.
  // reviewed_at is set server-side and must not be sent.
  async reviewDetection(id, status, reviewer = null) {
    if (!id) throw new Error('reviewDetection requires a detection id');
    if (isMock) return { id, status };

    const payload = { status };
    const who = (reviewer || '').trim();
    if (who) payload.reviewer = who;

    try {
      return await getJson(url(`/detections/${encodeURIComponent(id)}/review`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(`Could not save the review: ${err.message}`);
    }
  },

  // GET /exports/geojson → Blob (FeatureCollection for nautical charting).
  // Both exports take `cls` so a download matches the class filter the page is showing;
  // "all" is sent as no filter, matching detection_service.list_detections.
  //
  // GeoJSON necessarily omits detections with no navigation fix — the backend query
  // requires lat/lon to build a geometry. The CSV export carries them.
  async exportGeoJSON(cls = null) {
    if (isMock) throw new Error('Exports require the live backend (API.mode is "mock").');
    const filter = cls && cls !== 'all' ? cls : null;
    try {
      return await getBlob(url('/exports/geojson', { cls: filter }));
    } catch (err) {
      throw new Error(`Could not export GeoJSON: ${err.message}`);
    }
  },

  // GET /exports/csv → Blob (review sheet, includes unlocated detections)
  async exportCSV(cls = null) {
    if (isMock) throw new Error('Exports require the live backend (API.mode is "mock").');
    const filter = cls && cls !== 'all' ? cls : null;
    try {
      return await getBlob(url('/exports/csv', { cls: filter }));
    } catch (err) {
      throw new Error(`Could not export CSV: ${err.message}`);
    }
  },

  // GET /xtf/stored-files → { total_files, processed_count, unprocessed_count, files: [...] }
  async getStoredXtfFiles() {
    if (isMock) {
      return {
        total_files: 143,
        processed_count: 4,
        unprocessed_count: 139,
        files: [
          { filename: '15CCT03_SSS_150528175600.xtf', size_bytes: 67761024, size_mb: 64.62, is_processed: true, survey_id: 1, line: 'L_15CCT03_SSS_150528175600', total_pings: 1249, total_tiles: 9, detection_count: 1 },
          { filename: '15CCT03_SSS_150528180500.xtf', size_bytes: 46429824, size_mb: 44.28, is_processed: false, survey_id: null, line: null, total_pings: null, total_tiles: 0, detection_count: 0 },
        ],
      };
    }
    try {
      return await getJson(url('/xtf/stored-files'));
    } catch (err) {
      throw new Error(`Could not fetch stored XTF files: ${err.message}`);
    }
  },

  // POST /xtf/process-stored → { survey, tiles, detections, metadata }
  async processStoredXtf(filename, force = false, lineName = null) {
    if (isMock) {
      throw new Error('Running stored XTF files requires the live backend.');
    }
    try {
      const res = await getJson(url('/xtf/process-stored'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, force, line_name: lineName }),
      });
      notifyRecordsUpdated();
      return res;
    } catch (err) {
      throw new Error(`Failed to process stored XTF file: ${err.message}`);
    }
  },

  // GET /xtf/surveys/:id/details → { survey, tiles, detections, metadata }
  async getSurveyDetails(surveyId) {
    if (isMock) {
      throw new Error('Viewing survey details requires the live backend.');
    }
    try {
      return await getJson(url(`/xtf/surveys/${encodeURIComponent(surveyId)}/details`));
    } catch (err) {
      throw new Error(`Could not fetch survey details: ${err.message}`);
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
