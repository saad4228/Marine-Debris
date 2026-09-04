// Procedural side-scan sonar renderer.
//
// Paints a convincing waterfall tile from a seed string, with no image files.
// The same seed always produces the same tile (mulberry32 seeded by FNV-1a).
//
// Physical conventions:
//   - the nadir strip runs vertically down the centre (the towfish track),
//   - range increases outward from the nadir on both sides,
//   - an acoustic shadow always falls AWAY from the nadir, on whichever side
//     the target sits, because the sound came from the centre.

import { rngFor } from './utils.js';

const BASE = '#07060a';
const AMBER = '242,169,59';
const FLAG = '#e4572e';
const ABYSS = '#03070c';

export function defaultTargets(rng, count) {
  const n = count ?? 1 + Math.floor(rng() * 3);
  const targets = [];
  for (let i = 0; i < n; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    targets.push({
      x: 0.5 + side * (0.15 + rng() * 0.3),
      y: 0.12 + rng() * 0.76,
      size: 0.035 + rng() * 0.045,
      shadow: 1.6 + rng() * 2.4,
    });
  }
  return targets;
}

// Box (px) enclosing a target's echo and its shadow.
export function targetBounds(t, w, h) {
  const cx = w / 2;
  const tx = t.x * w;
  const ty = t.y * h;
  const s = t.size * Math.min(w, h);
  const dir = tx < cx ? -1 : 1;
  const L = s * t.shadow;
  const far = tx + dir * (s * 0.3 + L);
  const near = tx - dir * s * 1.4;
  const x0 = Math.min(near, far);
  const x1 = Math.max(near, far);
  return { x: x0, y: ty - s * 0.9, w: x1 - x0, h: s * 1.8 };
}

export function paintSonar(ctx, w, h, opts = {}) {
  const {
    seed = 'nadir',
    targets,
    targetCount,
    showBox = false,
    label = '',
    nadirWidth = 0.11,
    density = 1,
    bandStep = 2,
  } = opts;

  const rng = rngFor(seed);
  const cx = w / 2;
  const list = targets && targets.length ? targets : defaultTargets(rng, targetCount);

  ctx.save();

  // base
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, w, h);

  // ping banding
  for (let y = 0; y < h; y += bandStep) {
    const spike = rng() < 0.04 ? 0.12 : 0;
    ctx.fillStyle = `rgba(${AMBER},${0.025 + rng() * 0.07 + spike})`;
    ctx.fillRect(0, y, w, bandStep);
  }

  // range falloff
  const fall = ctx.createLinearGradient(0, 0, w, 0);
  fall.addColorStop(0, 'rgba(7,6,10,0.55)');
  fall.addColorStop(0.3, 'rgba(7,6,10,0)');
  fall.addColorStop(0.7, 'rgba(7,6,10,0)');
  fall.addColorStop(1, 'rgba(7,6,10,0.55)');
  ctx.fillStyle = fall;
  ctx.fillRect(0, 0, w, h);

  // sand ripples
  const ripples = Math.round(8 * density + rng() * 6);
  ctx.lineWidth = 1;
  for (let i = 0; i < ripples; i++) {
    const y0 = rng() * h;
    const amp = 2 + rng() * 6;
    const freq = 0.02 + rng() * 0.04;
    const phase = rng() * Math.PI * 2;
    const x0 = rng() * w * 0.6;
    const len = w * (0.2 + rng() * 0.5);
    ctx.strokeStyle = `rgba(${AMBER},${0.05 + rng() * 0.08})`;
    ctx.beginPath();
    for (let x = x0; x < x0 + len; x += 3) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // targets: shadow, then echo
  for (const t of list) {
    const tx = t.x * w;
    const ty = t.y * h;
    const s = t.size * Math.min(w, h);
    const dir = tx < cx ? -1 : 1;
    const L = s * t.shadow;

    ctx.fillStyle = 'rgba(3,4,8,0.9)';
    ctx.beginPath();
    ctx.moveTo(tx + dir * s * 0.3, ty - s * 0.55);
    ctx.lineTo(tx + dir * (s * 0.3 + L), ty - s * 0.75);
    ctx.lineTo(tx + dir * (s * 0.3 + L), ty + s * 0.75);
    ctx.lineTo(tx + dir * s * 0.3, ty + s * 0.55);
    ctx.closePath();
    ctx.fill();

    const tail = ctx.createLinearGradient(tx + dir * (s * 0.3 + L * 0.7), 0, tx + dir * (s * 0.3 + L * 1.15), 0);
    tail.addColorStop(0, 'rgba(3,4,8,0.9)');
    tail.addColorStop(1, 'rgba(3,4,8,0)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(tx + dir * (s * 0.3 + L * 0.7), ty - s * 0.72);
    ctx.lineTo(tx + dir * (s * 0.3 + L * 1.15), ty - s * 0.8);
    ctx.lineTo(tx + dir * (s * 0.3 + L * 1.15), ty + s * 0.8);
    ctx.lineTo(tx + dir * (s * 0.3 + L * 0.7), ty + s * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(1.35, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,250,240,1)');
    g.addColorStop(0.25, 'rgba(255,214,140,0.95)');
    g.addColorStop(0.55, `rgba(${AMBER},0.6)`);
    g.addColorStop(1, `rgba(${AMBER},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // nadir strip
  const nw = nadirWidth * w;
  const ng = ctx.createLinearGradient(cx - nw, 0, cx + nw, 0);
  ng.addColorStop(0, 'rgba(7,6,10,0)');
  ng.addColorStop(0.35, 'rgba(3,3,6,0.92)');
  ng.addColorStop(0.5, 'rgba(2,2,4,0.97)');
  ng.addColorStop(0.65, 'rgba(3,3,6,0.92)');
  ng.addColorStop(1, 'rgba(7,6,10,0)');
  ctx.fillStyle = ng;
  ctx.fillRect(cx - nw, 0, nw * 2, h);

  ctx.strokeStyle = `rgba(${AMBER},0.35)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - nw * 0.5, 0);
  ctx.lineTo(cx - nw * 0.5, h);
  ctx.moveTo(cx + nw * 0.5, 0);
  ctx.lineTo(cx + nw * 0.5, h);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,225,170,0.75)';
  ctx.beginPath();
  for (let y = 0; y < h; y += 2) {
    const j = (rng() - 0.5) * 1.2;
    if (y === 0) ctx.moveTo(cx + j, y);
    else ctx.lineTo(cx + j, y);
  }
  ctx.stroke();

  // speckle
  const n = Math.floor(((w * h) / 90) * density);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${AMBER},${0.08 + rng() * 0.35})`;
    ctx.fillRect(rng() * w, rng() * h, rng() < 0.2 ? 2 : 1, 1);
  }

  // box
  if (showBox && list.length) {
    const b = targetBounds(list[0], w, h);
    const pad = 5;
    const bx = b.x - pad;
    const by = b.y - pad;
    const bw = b.w + pad * 2;
    const bh = b.h + pad * 2;
    ctx.strokeStyle = FLAG;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);
    if (label) {
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 10;
      const th = 18;
      const ly = by - th >= 0 ? by - th : by + bh;
      ctx.fillStyle = FLAG;
      ctx.fillRect(bx - 0.75, ly, tw, th);
      ctx.fillStyle = ABYSS;
      ctx.fillText(label, bx + 4, ly + th / 2 + 0.5);
    }
  }

  ctx.restore();
  return list;
}

export function renderSonarCanvas(canvas, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = opts.width || canvas.clientWidth || 320;
  const h = opts.height || canvas.clientHeight || Math.round(w * (opts.aspect || 0.75));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return paintSonar(ctx, w, h, opts);
}
