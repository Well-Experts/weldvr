// Weld-pool size from the quasi-steady moving point source (Rosenthal):
//   T - T0 = P / (Omega k R) * exp(-v (R + xi) / (2 alpha))
// xi = distance ahead of the arc along the travel direction, R = distance from the arc, P = arc
// power into the work (k x U x I), T0 = local plate temperature before the arc arrives (from the
// coupon heat-flow model), k and alpha = EN 1993-1-2 high-temperature values (material.js).
//
// Omega is the solid angle of metal around the source. The solution satisfies the no-flux
// condition on any plane that contains the line of travel, so it holds for the open half-space
// (bead on plate, butt groove: Omega = 2 pi) and for the inside corner of a T-joint, where the
// metal fills three quarters of the space around the root (Omega = 3 pi). Finite plate
// thickness is added with image sources below the back face (half-space joints only).
//
// The scope names the Rosenthal source as the reference for pool size, cooling and heat tint and
// notes that a distributed (Gaussian) source explains weld shape better: this model sizes the pool
// and its response to preheat, heat build-up and weaving; bead shape and penetration stay with
// the empirical rules in record.js.

import { K_HOT, ALPHA_HOT, T_LIQ } from './material.js';

const LAMBDA = K_HOT / 1000; // W/mm.K
const ALPHA = ALPHA_HOT * 1e6; // mm2/s

export function solidAngle(joint) {
  return joint.type === 'fillet' ? 3 * Math.PI : 2 * Math.PI;
}

// Temperature rise (K) at (xi, y) on the surface, for amplitude A = P / (Omega lambda).
function rise(A, vh, xi, y, d2, images) {
  const r2 = xi * xi + y * y;
  const R0 = Math.max(Math.sqrt(r2), 0.05);
  let s = Math.exp(-vh * (R0 + xi)) / R0;
  for (let n = 1; n <= images; n++) {
    const Rn = Math.sqrt(r2 + n * n * d2);
    s += (2 * Math.exp(-vh * (Rn + xi))) / Rn;
  }
  return A * s;
}

// P in W, v in mm/s, T0 in C. opts: { Omega, thickness (mm), images, Tm, N, out }.
export function poolShape(P, v, T0, opts = {}) {
  const Omega = opts.Omega ?? 2 * Math.PI;
  const images = Omega <= 2 * Math.PI + 1e-6 ? opts.images ?? 2 : 0;
  const d = opts.thickness ?? 10;
  const Tm = opts.Tm ?? T_LIQ;
  const N = opts.N ?? 12;
  const t0 = Math.min(T0, Tm - 60);
  const A = P / (Omega * LAMBDA);
  const vh = Math.max(Math.abs(v), 0.3) / (2 * ALPHA);
  const d2 = 4 * d * d;
  const dT = Tm - t0;
  const out = opts.out || {};
  if (!out.profile || out.profile.length < N + 1) out.profile = new Float32Array(N + 1);
  out.N = N;
  out.A = A;
  out.vh = vh;
  out.T0 = t0;
  out.Tm = Tm;
  out.v = v;
  out.images = images;
  out.d = d;
  if (!(P > 0)) {
    out.Lf = out.Lb = out.w = out.xiw = 0;
    out.profile.fill(0);
    return out;
  }
  // rear length on the centreline: T = T0 + A (1/x + images) -> fixed-point from the image-free value
  let Lb = A / dT;
  for (let it = 0; it < 4 && images > 0; it++) {
    let s = 0;
    for (let n = 1; n <= images; n++) {
      const Rn = Math.sqrt(Lb * Lb + n * n * d2);
      s += (2 * Math.exp(-vh * (Rn - Lb))) / Rn;
    }
    Lb = 1 / Math.max(dT / A - s, 1e-6);
  }
  // front length: bisection (T decreasing ahead of the arc)
  let lo = 0.05, hi = Math.max(Lb, 0.1);
  if (rise(A, vh, lo, 0, d2, images) <= dT) hi = lo;
  else for (let it = 0; it < 22; it++) {
    const m = 0.5 * (lo + hi);
    if (rise(A, vh, m, 0, d2, images) > dT) lo = m;
    else hi = m;
  }
  const Lf = Math.max(1.0, 0.5 * (lo + hi));
  // half-width profile at N stations along the pool
  let w = 0, xiw = 0;
  const p = out.profile;
  const span = Lb + Lf;
  const yMax = Math.max(Lb, Lf) + 1;
  for (let k = 0; k <= N; k++) {
    const xi = -Lb + (span * k) / N;
    let y = 0;
    if (k > 0 && k < N && rise(A, vh, xi, 0, d2, images) > dT) {
      let a = 0, b = yMax;
      for (let it = 0; it < 18; it++) {
        const m = 0.5 * (a + b);
        if (rise(A, vh, xi, m, d2, images) > dT) a = m;
        else b = m;
      }
      y = 0.5 * (a + b);
    }
    p[k] = y;
    if (y > w) {
      w = y;
      xiw = xi;
    }
  }
  out.Lb = Lb;
  out.Lf = Lf;
  out.w = w; // max half-width (mm)
  out.xiw = xiw;
  return out;
}

// Surface temperature (C) at (xi, y) for a shape returned by poolShape (glow behind the arc).
export function poolTemperature(shape, xi, y) {
  if (!shape || !(shape.A > 0)) return shape ? shape.T0 : 20;
  return shape.T0 + rise(shape.A, shape.vh, xi, y, 4 * shape.d * shape.d, shape.images);
}

export const POOL_CONST = { LAMBDA, ALPHA };
