// Canvas silhouettes for the descent. Unit space roughly -1..1; caller
// translates and scales. `t` is seconds (pass 0 for a still frame).
//
// Sea life: solid near-black silhouette. Debris: orange outline.

import { mulberry32 } from './utils.js';

export const LIFE = '#020a10';
export const DEBRIS = '#e4572e';

/* ---------- sea life ---------- */

function fishPath(ctx, wag) {
  ctx.beginPath();
  ctx.moveTo(-0.9, 0);
  ctx.bezierCurveTo(-0.5, -0.48, 0.35, -0.5, 0.95, -0.05);
  ctx.bezierCurveTo(0.35, 0.5, -0.5, 0.48, -0.9, 0);
  ctx.closePath();
  ctx.moveTo(-0.8, 0);
  ctx.lineTo(-1.35, -0.42 + wag);
  ctx.lineTo(-1.2, wag * 0.5);
  ctx.lineTo(-1.35, 0.42 + wag);
  ctx.closePath();
  ctx.moveTo(-0.2, -0.38);
  ctx.lineTo(0.1, -0.7);
  ctx.lineTo(0.4, -0.38);
  ctx.closePath();
}

export function drawFish(ctx, t) {
  ctx.fillStyle = LIFE;
  fishPath(ctx, Math.sin(t * 4) * 0.1);
  ctx.fill();
}

const SHOAL = Array.from({ length: 18 }, (_, i) => {
  const r = mulberry32(1000 + i);
  return { x: (r() - 0.5) * 5, y: (r() - 0.5) * 2.4, s: 0.16 + r() * 0.14, ph: r() * Math.PI * 2 };
});

export function drawShoal(ctx, t) {
  for (const f of SHOAL) {
    ctx.save();
    ctx.translate(f.x + Math.sin(t * 1.3 + f.ph) * 0.08, f.y + Math.cos(t * 0.9 + f.ph) * 0.05);
    ctx.scale(f.s, f.s);
    drawFish(ctx, t + f.ph);
    ctx.restore();
  }
}

export function drawTurtle(ctx, t) {
  const flap = Math.sin(t * 1.6) * 0.25;
  ctx.fillStyle = LIFE;
  const flipper = (x, y, rot, len) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(len / 2, 0, len / 2, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  flipper(0.35, -0.35, -0.9 + flap, 0.9);
  flipper(0.35, 0.35, 0.9 - flap, 0.9);
  flipper(-0.55, -0.3, -2.4 - flap * 0.5, 0.55);
  flipper(-0.55, 0.3, 2.4 + flap * 0.5, 0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.75, 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.95, 0, 0.25, 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.7, -0.08);
  ctx.lineTo(-0.98, 0);
  ctx.lineTo(-0.7, 0.08);
  ctx.closePath();
  ctx.fill();
}

export function drawJelly(ctx, t) {
  ctx.fillStyle = LIFE;
  ctx.strokeStyle = LIFE;
  const pulse = 1 + Math.sin(t * 2) * 0.06;
  ctx.save();
  ctx.scale(pulse, 1 / pulse);
  ctx.beginPath();
  ctx.moveTo(-0.8, 0.1);
  ctx.bezierCurveTo(-0.85, -0.9, 0.85, -0.9, 0.8, 0.1);
  for (let i = 0; i < 6; i++) {
    const x0 = 0.8 - i * (1.6 / 6);
    const x1 = x0 - 1.6 / 6;
    ctx.quadraticCurveTo((x0 + x1) / 2, 0.28, x1, 0.1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = -0.6 + i * 0.2;
    const ph = i * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, 0.15);
    ctx.bezierCurveTo(
      x + Math.sin(t * 1.5 + ph) * 0.25, 0.8,
      x - Math.sin(t * 1.2 + ph) * 0.3, 1.4,
      x + Math.sin(t + ph) * 0.2, 2.0 + (i % 2) * 0.3
    );
    ctx.stroke();
  }
}

export function drawManta(ctx, t) {
  const flap = Math.sin(t * 1.4) * 0.35;
  ctx.fillStyle = LIFE;
  ctx.beginPath();
  ctx.moveTo(0, -0.55);
  ctx.bezierCurveTo(0.6, -0.5, 1.4, -0.3 + flap, 2.0, -0.2 + flap * 1.6);
  ctx.bezierCurveTo(1.3, 0.25 + flap * 0.5, 0.5, 0.45, 0.12, 0.5);
  ctx.lineTo(0.05, 1.9);
  ctx.lineTo(-0.05, 1.9);
  ctx.lineTo(-0.12, 0.5);
  ctx.bezierCurveTo(-0.5, 0.45, -1.3, 0.25 + flap * 0.5, -2.0, -0.2 + flap * 1.6);
  ctx.bezierCurveTo(-1.4, -0.3 + flap, -0.6, -0.5, 0, -0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.25, -0.5);
  ctx.lineTo(-0.35, -0.95);
  ctx.lineTo(-0.1, -0.55);
  ctx.closePath();
  ctx.moveTo(0.25, -0.5);
  ctx.lineTo(0.35, -0.95);
  ctx.lineTo(0.1, -0.55);
  ctx.closePath();
  ctx.fill();
}

export function drawSquid(ctx, t) {
  ctx.fillStyle = LIFE;
  ctx.strokeStyle = LIFE;
  // mantle
  ctx.beginPath();
  ctx.moveTo(0, -1.6);
  ctx.bezierCurveTo(0.55, -1.2, 0.5, 0.1, 0.32, 0.4);
  ctx.lineTo(-0.32, 0.4);
  ctx.bezierCurveTo(-0.5, 0.1, -0.55, -1.2, 0, -1.6);
  ctx.closePath();
  ctx.fill();
  // fins
  ctx.beginPath();
  ctx.moveTo(0, -1.55);
  ctx.bezierCurveTo(0.9, -1.4, 0.9, -0.7, 0.3, -0.6);
  ctx.bezierCurveTo(-0.3, -0.6, -0.9, -0.7, -0.9, -1.4);
  ctx.bezierCurveTo(-0.9, -1.4, -0.5, -1.55, 0, -1.55);
  ctx.closePath();
  ctx.fill();
  // arms
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const x = -0.28 + i * 0.08;
    const ph = i * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, 0.35);
    ctx.bezierCurveTo(x + Math.sin(t * 2 + ph) * 0.15, 0.8, x - Math.sin(t * 1.7 + ph) * 0.2, 1.1, x + Math.sin(t * 1.3 + ph) * 0.12, 1.45 + (i % 3) * 0.1);
    ctx.stroke();
  }
}

/* ---------- debris ---------- */

function debrisStroke(ctx, width) {
  ctx.strokeStyle = DEBRIS;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

export function drawBag(ctx, t) {
  debrisStroke(ctx, 0.06);
  const w1 = Math.sin(t * 1.1) * 0.08;
  const w2 = Math.cos(t * 0.8) * 0.1;
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.3);
  ctx.bezierCurveTo(-0.9 + w1, 0.2, -0.7, 0.9 + w2, -0.1, 0.95);
  ctx.bezierCurveTo(0.5, 1.0, 0.9 + w2, 0.5, 0.7, -0.2 + w1);
  ctx.bezierCurveTo(0.6, -0.5, 0.2, -0.45, 0.1, -0.35);
  ctx.bezierCurveTo(-0.1, -0.45, -0.5, -0.5, -0.6, -0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.45, -0.35);
  ctx.bezierCurveTo(-0.5, -0.95, -0.05, -0.95, -0.1, -0.4);
  ctx.moveTo(0.15, -0.4);
  ctx.bezierCurveTo(0.2, -0.9, 0.6, -0.85, 0.55, -0.3);
  ctx.stroke();
}

export function drawTyre(ctx) {
  debrisStroke(ctx, 0.06);
  ctx.save();
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, 1, 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.55, 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * 0.9, Math.sin(a) * 0.56);
    ctx.lineTo(Math.cos(a) * 1.0, Math.sin(a) * 0.62);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawDrum(ctx) {
  debrisStroke(ctx, 0.06);
  ctx.save();
  ctx.rotate(0.5);
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.9);
  ctx.lineTo(-0.5, 0.9);
  ctx.moveTo(0.5, -0.9);
  ctx.lineTo(0.5, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -0.9, 0.5, 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0.9, 0.5, 0.16, 0, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -0.3, 0.5, 0.16, 0, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0.3, 0.5, 0.16, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawNet(ctx, t) {
  debrisStroke(ctx, 0.04);
  const sway = Math.sin(t * 0.7) * 0.1;
  ctx.beginPath();
  ctx.moveTo(-1.6, -0.6);
  ctx.bezierCurveTo(-1.0, -1.1 + sway, 0.4, -1.0, 1.5, -0.7);
  ctx.bezierCurveTo(1.9, -0.1, 1.5, 0.7 + sway, 0.9, 0.9);
  ctx.bezierCurveTo(0.1, 1.2, -0.9, 0.9 - sway, -1.5, 0.4);
  ctx.closePath();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) {
    const o = i * 0.3;
    ctx.moveTo(-2 + o, -1.5);
    ctx.lineTo(0.2 + o + sway, 1.5);
    ctx.moveTo(2 - o, -1.5);
    ctx.lineTo(-0.2 - o + sway, 1.5);
  }
  ctx.stroke();
  ctx.restore();
  debrisStroke(ctx, 0.04);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-1.2 + i * 0.75, -0.85 + sway * 0.5, 0.09, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawContainer(ctx) {
  debrisStroke(ctx, 0.06);
  ctx.save();
  ctx.rotate(-0.18);
  // front face
  ctx.strokeRect(-1.4, -0.5, 2.2, 1.0);
  // top face
  ctx.beginPath();
  ctx.moveTo(-1.4, -0.5);
  ctx.lineTo(-1.0, -0.85);
  ctx.lineTo(1.2, -0.85);
  ctx.lineTo(0.8, -0.5);
  ctx.stroke();
  // side face
  ctx.beginPath();
  ctx.moveTo(0.8, -0.5);
  ctx.lineTo(1.2, -0.85);
  ctx.lineTo(1.2, 0.15);
  ctx.lineTo(0.8, 0.5);
  ctx.stroke();
  // corrugation
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = 1; i < 11; i++) {
    const x = -1.4 + i * 0.2;
    ctx.moveTo(x, -0.5);
    ctx.lineTo(x, 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- placement ---------- */

// depth: metres. x: fraction of viewport width. scale: size multiplier.
// rate: parallax multiplier (>1 passes faster, reads as nearer).
// drift: sway frequency (0 = still).
export const INHABITANTS = [
  { id: 'shoal', depth: 20, x: 0.62, scale: 0.9, rate: 0.85, debris: false, draw: drawShoal, drift: 0.4 },
  { id: 'turtle', depth: 33, x: 0.3, scale: 1.1, rate: 1.1, debris: false, draw: drawTurtle, drift: 0.3 },
  { id: 'bag', depth: 41, x: 0.76, scale: 0.7, rate: 1.3, debris: true, draw: drawBag, drift: 0.6 },
  { id: 'fish', depth: 56, x: 0.84, scale: 0.8, rate: 1.2, debris: false, draw: drawFish, drift: 0.5 },
  { id: 'jelly', depth: 70, x: 0.4, scale: 0.9, rate: 0.9, debris: false, draw: drawJelly, drift: 0.25 },
  { id: 'squid', depth: 92, x: 0.78, scale: 0.85, rate: 1.15, debris: false, draw: drawSquid, drift: 0.35 },
  { id: 'manta', depth: 106, x: 0.6, scale: 1.4, rate: 0.75, debris: false, draw: drawManta, drift: 0.2 },
  { id: 'tyre', depth: 120, x: 0.27, scale: 0.8, rate: 1.0, debris: true, draw: drawTyre, drift: 0 },
  { id: 'container', depth: 138, x: 0.7, scale: 1.1, rate: 0.95, debris: true, draw: drawContainer, drift: 0 },
  { id: 'drum', depth: 152, x: 0.3, scale: 0.75, rate: 1.05, debris: true, draw: drawDrum, drift: 0 },
  { id: 'net', depth: 170, x: 0.48, scale: 1.2, rate: 1.0, debris: true, draw: drawNet, drift: 0.15 },
];
