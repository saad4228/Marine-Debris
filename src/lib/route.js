// Mission planner: visiting order for the clean-up vessel.
// Nearest-neighbour construction followed by 2-opt improvement.
// Straight-line legs (fine offshore; a land mask belongs in the backend).

import { haversineKm, kmToNm } from './geo.js';

function tourLength(points, order, closed) {
  let km = 0;
  for (let i = 1; i < order.length; i++) km += haversineKm(points[order[i - 1]], points[order[i]]);
  if (closed) km += haversineKm(points[order[order.length - 1]], points[order[0]]);
  return km;
}

function nearestNeighbour(points) {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const order = [0];
  visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = points[order[order.length - 1]];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversineKm(last, points[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    visited[best] = true;
  }
  return order;
}

// 2-opt: reverse segments while it shortens the tour. Index 0 stays fixed (the start).
function twoOpt(points, order, closed) {
  let improved = true;
  let best = tourLength(points, order, closed);
  const n = order.length;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        const len = tourLength(points, candidate, closed);
        if (len + 1e-9 < best) {
          order = candidate;
          best = len;
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * @param start    { lat, lon, name }
 * @param targets  [{ id, lat, lon, ... }]
 * @param vessel   { speedKn, fuelLPerNm, minutesPerRecovery }
 * @param opts     { returnToStart }
 */
export function planRoute(start, targets, vessel, opts = {}) {
  const returnToStart = opts.returnToStart !== false;
  if (!targets.length) {
    return { order: [], legs: [], totalKm: 0, totalNm: 0, transitHours: 0, workHours: 0, hours: 0, fuelL: 0, points: [start] };
  }
  const points = [start, ...targets];
  let order = nearestNeighbour(points);
  order = twoOpt(points, order, returnToStart);

  const seq = order.map((i) => points[i]);
  if (returnToStart) seq.push(start);

  const legs = [];
  let totalKm = 0;
  for (let i = 1; i < seq.length; i++) {
    const km = haversineKm(seq[i - 1], seq[i]);
    totalKm += km;
    legs.push({ from: seq[i - 1], to: seq[i], km, nm: kmToNm(km) });
  }
  const totalNm = kmToNm(totalKm);
  const transitHours = totalNm / vessel.speedKn;
  const workHours = (targets.length * vessel.minutesPerRecovery) / 60;
  return {
    order: order.slice(1).map((i) => points[i].id),
    points: seq,
    legs,
    totalKm,
    totalNm,
    transitHours,
    workHours,
    hours: transitHours + workHours,
    fuelL: totalNm * vessel.fuelLPerNm,
  };
}
