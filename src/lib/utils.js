export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(seed) {
  return mulberry32(hashString(String(seed)));
}

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function zoneForDepth(d) {
  if (d < 30) return 'SURFACE';
  if (d < 80) return 'SUNLIT';
  if (d < 150) return 'TWILIGHT';
  return 'SEABED';
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatKg(kg) {
  // null means the target was never sized — say nothing rather than "0 kg".
  if (kg == null || !Number.isFinite(Number(kg))) return '—';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

export function formatHours(h) {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole} h ${mins} min` : `${whole} h`;
}

// Fold a spelling variant onto its canonical class id (tire -> tyre, ghost_net ->
// ghost-net), so only one id per real class ever flows through filters and counts.
export function canonicalClassId(classes, id) {
  const entry = classes.find((k) => k.id === id);
  return entry?.aliasOf ?? id;
}

export function classInfo(classes, id) {
  return classes.find((k) => k.id === id) || { id, label: id, density: 300, mobility: 0.3, windage: 0.01, severity: 0.5 };
}

export function classLabel(classes, id) {
  return classInfo(classes, id).label;
}

// Estimated mass from bounding dimensions and a per-class bulk density.
// Normalise the two dims shapes (mock uses [L, W, H], the API uses an object) into one
// object of numbers-or-null. Nothing is substituted: an unmeasured axis stays null.
export function normalizeDims(dims) {
  if (Array.isArray(dims)) {
    const [L, W, H] = dims;
    return { length: num(L), width: num(W), height: num(H) };
  }
  if (dims && typeof dims === 'object') {
    return { length: num(dims.length ?? dims.L), width: num(dims.width ?? dims.W), height: num(dims.height ?? dims.H) };
  }
  return { length: null, width: null, height: null };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "6.2 × — × 1.4" — an unmeasured axis renders as a dash, never as a plausible number.
export function formatDims(dims) {
  const d = normalizeDims(dims);
  const axis = (v) => (v == null ? '—' : v.toFixed(1));
  if (d.length == null && d.width == null && d.height == null) return '—';
  return `${axis(d.length)} × ${axis(d.width)} × ${axis(d.height)}`;
}

// Mass from measured extents and a per-class bulk density. Returns null when the target
// was never sized, so callers can say "not measured" instead of printing a made-up mass.
//
// Side-scan sonar resolves ONE horizontal extent per target (the echo) plus a shadow that
// encodes height. Across-track width is not observable from a single pass, so when width
// is absent the footprint is taken as square (W = L). That is a stated modelling
// assumption, not a measurement — which is exactly why it lives here and is documented,
// rather than being a bare constant multiplied in somewhere.
export function estimateWeightKg(cls, dims) {
  const d = normalizeDims(dims);
  if (d.length == null || d.height == null) return null;
  const width = d.width ?? d.length;
  return Math.max(1, d.length * width * d.height * (cls?.density || 300));
}

// Hand a Blob to the browser as a file. Revoking the object URL matters: the blob is
// held in memory until released.
export function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// Filename for a single detection's sonar tile, e.g. "NDR-73798_ship.jpg".
// The extension is taken from the stored path so a PNG upload does not get saved as .jpg.
export function detectionImageName(id, cls, url) {
  const ext = (String(url || '').split('?')[0].match(/\.(jpe?g|png|tiff?|bmp|webp)$/i) || [null, 'jpg'])[1];
  const safe = (v) => String(v ?? 'target').replace(/[^A-Za-z0-9._-]+/g, '-');
  return `${safe(id)}_${safe(cls)}.${ext.toLowerCase()}`;
}

// Fetch an image and save it. Fetch-then-blob rather than a bare <a download> because
// the download attribute is ignored cross-origin — if the API ever moves to another host
// or a CDN, a plain link would silently navigate instead of saving.
export async function downloadImage(url, filename) {
  if (!url) throw new Error('This detection has no stored image.');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  saveBlob(await res.blob(), filename);
}

// Confidence -> colour, as a continuous red->amber->green ramp rather than three
// buckets, so 0.48 and 0.52 are visibly different instead of snapping across a boundary.
// Hue runs 0deg (red) to 120deg (green) across the 0..1 range; lightness is held high
// enough to stay legible on the near-black ground.
//
// Colour is an ADDITION to the number, never a replacement: red/green alone is the
// classic failure for colour-blind readers, so the numeric value always stays visible.
// The detector never emits anything below its confidence threshold, so no detection can
// ever score near 0. Spreading the ramp over 0..1 wasted its whole red end on values that
// cannot occur — the weakest real detection came out orange. The ramp therefore starts at
// the threshold, so the weakest detection you can actually see is genuinely red.
export const CONF_FLOOR = 0.25; // mirrors YoloDetector.conf_threshold

export function confidenceColor(conf) {
  const v = Number(conf) || 0;
  const scaled = (v - CONF_FLOOR) / (1 - CONF_FLOOR);
  const hue = Math.max(0, Math.min(1, scaled)) * 120;
  return `hsl(${hue.toFixed(0)} 72% 52%)`;
}

// Coarse band, for tooltips and screen readers where a hue means nothing.
// Bands are cut on the same scale as the ramp, so the word and the hue always agree.
export function confidenceBand(conf) {
  // Parenthesise the ?? default: `Number(conf) || 0 - CONF_FLOOR` parses as
  // `Number(conf) || (0 - CONF_FLOOR)`, which silently skips the floor subtraction.
  const scaled = ((Number(conf) || 0) - CONF_FLOOR) / (1 - CONF_FLOOR);
  if (scaled < 0.34) return 'low';
  if (scaled < 0.67) return 'medium';
  return 'high';
}

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
