// Module-level pub/sub for scroll progress, with inertia.
//
// The Landing page writes a TARGET progress on every scroll event. This store
// eases the published value toward that target once per animation frame, so
// the ruler, water and creatures glide instead of jumping. Nothing here
// touches React state; subscribers write to the DOM through refs.

import { clamp, prefersReducedMotion } from './utils.js';

const listeners = new Set();
let target = 0;
let current = 0;
let frame = 0;
let instant = false;

export const MAX_DEPTH = 180;

const EASE = 0.14; // fraction of the remaining distance covered per frame
const EPS = 0.0004;

export function getProgress() {
  return current;
}

export function getTarget() {
  return target;
}

export function depthFor(p) {
  return p * MAX_DEPTH;
}

function tick() {
  frame = 0;
  const diff = target - current;
  if (instant || Math.abs(diff) < EPS) current = target;
  else current += diff * EASE;
  const p = current;
  listeners.forEach((fn) => fn(p));
  if (current !== target) frame = requestAnimationFrame(tick);
}

export function setProgress(next) {
  target = clamp(next);
  if (!frame) frame = requestAnimationFrame(tick);
}

// Jump without easing (used on mount so the page does not animate from 0).
export function snapProgress(next) {
  target = clamp(next);
  current = target;
  if (!frame) frame = requestAnimationFrame(tick);
}

// Subscribe. Called once immediately with the current value.
// Returns an unsubscribe function, so it can be returned from useEffect.
export function onProgress(fn) {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

export function resetProgress() {
  target = 0;
  current = 0;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

// Honour reduced motion: no inertia, values snap.
if (typeof window !== 'undefined') {
  instant = prefersReducedMotion();
}
