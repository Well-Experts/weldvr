// Coupon heat flow: a finite-difference model of the plates (2.5 mm cells, temperature averaged
// through the thickness) with EN 1993-1-2 temperature-dependent conductivity and enthalpy, surface
// losses by convection and radiation from both faces, and the arc as a moving heat source
// (P = k x U x I, EN 1011-1 thermal efficiency k).
//
// What it is for: heat build-up along the joint and between passes (interpass temperature), the
// local preheat that sizes the weld pool, plate glow and permanent heat tint, the contact
// thermometer and cooling readouts. What it is not: a 3-D or melt model. The molten pool is shaped
// by the moving-source solution in pool.js; this grid only carries the heat away.
//
// Layout: each plate is a grid in (x along the joint, s across the plate) in sim coordinates
// (x in the travel direction, as in the weld record). Plates are stacked in one array:
//   plate  (bead on plate)  one plate, s = u
//   butt                    one plate, s = u, the backing bar adds thickness under the joint
//   fillet (T-joint)        base plate (s along the base from the root; the web stands on
//                           s in [-t, 0]) and web (s up the web from the base surface), linked
//                           where the web stands on the base.
//   pipe (butt, open root)  the pipe wall unrolled: x around the pipe (periodic: the last column
//                           joins the first), s along the axis over both pipes; cells are as long
//                           around the pipe as the wall is at mid-thickness (radius R - t/2).
// Long waits with the arc off (interpass cooling) run on a 2:1 coarser copy of the grid and hand
// the energy change back to the fine cells, so a two-minute wait costs a few milliseconds.

import { T_AMBIENT, K_TABLE, K_TMAX, enthalpy, temperatureOf, surfaceLoss } from './material.js';

const S2 = Math.SQRT1_2;
export const CELL_MM = 2.5;

// Two-face surface loss (W/m2) table at 1 C steps.
const LOSS_TABLE = new Float32Array(K_TMAX + 1);
let LOSS_AMB = null;
function lossTable(Tamb) {
  if (LOSS_AMB !== Tamb) {
    for (let T = 0; T <= K_TMAX; T++) LOSS_TABLE[T] = 2 * surfaceLoss(T, Tamb);
    LOSS_AMB = Tamb;
  }
  return LOSS_TABLE;
}

export function thermalLayout(joint, h = CELL_MM) {
  const nx = Math.ceil(joint.L / h);
  const t = joint.t;
  const plates = [];
  if (joint.type === 'fillet') {
    const back = joint.backExt ?? 40;
    plates.push({ name: 'base', s0: -(t + back), ns: Math.round((t + back + 150) / h), d: t });
    plates.push({ name: 'web', s0: 0, ns: Math.round((joint.webH ?? 100) / h), d: t });
  } else if (joint.pipe) {
    // whole circumference: an even number of columns (the coarse grid halves them), each L / nx mm of x
    const nxp = 2 * Math.max(4, Math.round(joint.L / (2 * h)));
    const len = joint.pipe.length;
    plates.push({ name: 'pipe', s0: -len, ns: Math.round((2 * len) / h), d: t, backing: null });
    const hx = joint.L / nxp;
    const hxPhys = hx * (joint.pipe.R - t / 2) / joint.pipe.Rx;
    return finishLayout({ h, nx: nxp, plates, type: joint.type, t, L: joint.L, periodic: true, hx, hxPhys });
  } else if (joint.type === 'butt') {
    const pw = joint.plateW ?? 100;
    plates.push({ name: 'plates', s0: -pw, ns: Math.round((2 * pw) / h), d: t, backing: joint.backing });
  } else {
    const W = joint.width ?? 150;
    plates.push({ name: 'plate', s0: -W / 2, ns: Math.round(W / h), d: t });
  }
  return finishLayout({ h, nx, plates, type: joint.type, t, L: joint.L });
}

function finishLayout(lay) {
  const { h, t } = lay;
  let row = 0;
  for (const p of lay.plates) {
    p.row0 = row; // first texture row
    row += p.ns + 1; // one padding row between plates (no filtering across plates)
    p.dRow = new Float32Array(p.ns);
    for (let j = 0; j < p.ns; j++) {
      const s = p.s0 + (j + 0.5) * h;
      let d = p.d;
      if (p.backing && Math.abs(s) <= p.backing.width / 2) d += p.backing.thickness;
      p.dRow[j] = d / 1000; // m
    }
  }
  lay.rows = row - 1;
  lay.links = [];
  if (lay.type === 'fillet') {
    // web row 0 stands on the base cells under the web (base s in [-t, 0])
    const base = lay.plates[0];
    const jb = Math.min(base.ns - 1, Math.max(0, Math.floor((-t / 2 - base.s0) / h)));
    lay.links.push({ a: 1, ja: 0, b: 0, jb, area: (t / 1000) * (h / 1000), dist: (h / 2 + t / 2) / 1000 });
  }
  return lay;
}

function makeGrid(lay) {
  let n = 0;
  for (const p of lay.plates) {
    p.c0 = n;
    n += p.ns * lay.nx;
  }
  const g = {
    lay, nx: lay.nx, h: lay.h / 1000, n,
    H: new Float64Array(n), T: new Float32Array(n), k: new Float32Array(n), dH: new Float64Array(n),
    d: new Float32Array(n),
    // active rectangle per plate (cells that may differ from ambient); null = whole plate
    act: lay.plates.map(() => null),
    // pipe: cells hxPhys (around) x h (along the axis); x wraps
    periodic: !!lay.periodic,
    hx: (lay.hxPhys ?? lay.h) / 1000,
  };
  for (const p of lay.plates) for (let j = 0; j < p.ns; j++) for (let i = 0; i < lay.nx; i++) g.d[p.c0 + j * lay.nx + i] = p.dRow[j];
  return g;
}

// One explicit step of the grid (pending: optional J per cell to add). Returns J lost.
// Only each plate's active rectangle is stepped; cells outside it are still at ambient.
function stepGrid(g, dt, Tamb, pending = null) {
  if (g.periodic) return stepGridPeriodic(g, dt, Tamb, pending);
  const nx = g.nx, h = g.h, A = h * h;
  const H = g.H, T = g.T, k = g.k, d = g.d, dH = g.dH;
  const LT = lossTable(Tamb);
  const plates = g.lay.plates;
  // links tie the active areas of the two plates together
  for (const L of g.lay.links) {
    const ra = g.act[L.a], rb = g.act[L.b];
    if (!ra && !rb) continue;
    const i0 = Math.min(ra ? ra.i0 : nx, rb ? rb.i0 : nx), i1 = Math.max(ra ? ra.i1 : -1, rb ? rb.i1 : -1);
    g.act[L.a] = grow(ra, i0, i1, L.ja, L.ja, nx, plates[L.a].ns);
    g.act[L.b] = grow(rb, i0, i1, L.jb, L.jb, nx, plates[L.b].ns);
  }
  for (let p = 0; p < plates.length; p++) {
    const r = g.act[p];
    if (!r) continue;
    const pl = plates[p];
    for (let jj = r.j0; jj <= r.j1; jj++) {
      const row = pl.c0 + jj * nx;
      for (let i = r.i0; i <= r.i1; i++) {
        const c = row + i;
        const ti = T[c] < 0 ? 0 : T[c] > K_TMAX ? K_TMAX : T[c] | 0;
        k[c] = K_TABLE[ti];
      }
    }
  }
  let lost = 0;
  for (let p = 0; p < plates.length; p++) {
    const r = g.act[p];
    if (!r) continue;
    const pl = plates[p];
    const ns = pl.ns;
    for (let jj = r.j0; jj <= r.j1; jj++) {
      const row = pl.c0 + jj * nx;
      const dj = d[row];
      const up = jj + 1 < ns ? row + nx : -1;
      const dn = jj > 0 ? row - nx : -1;
      const dUp = up >= 0 ? Math.min(dj, d[up]) : 0;
      const dDn = dn >= 0 ? Math.min(dj, d[dn]) : 0;
      for (let i = r.i0; i <= r.i1; i++) {
        const c = row + i;
        const Tc = T[c], kc = k[c];
        let q = 0; // sum of k_f d_f (T_n - T_c) over the faces (W/K per metre of length)
        if (i > 0) q += 0.5 * (kc + k[c - 1]) * dj * (T[c - 1] - Tc);
        if (i < nx - 1) q += 0.5 * (kc + k[c + 1]) * dj * (T[c + 1] - Tc);
        if (up >= 0) q += 0.5 * (kc + k[up + i]) * dUp * (T[up + i] - Tc);
        if (dn >= 0) q += 0.5 * (kc + k[dn + i]) * dDn * (T[dn + i] - Tc);
        const ti = Tc < 0 ? 0 : Tc > K_TMAX ? K_TMAX : Tc | 0;
        const loss = LT[ti]; // both faces, W/m2
        lost += loss * A * dt;
        dH[c] = (dt * (q / A - loss) + (pending ? pending[c] / A : 0)) / dj;
      }
    }
  }
  // plate-to-plate links (web standing on the base)
  for (const L of g.lay.links) {
    const pa = plates[L.a], pb = plates[L.b];
    const ra = g.act[L.a];
    if (!ra) continue;
    for (let i = ra.i0; i <= ra.i1; i++) {
      const ca = pa.c0 + L.ja * nx + i, cb = pb.c0 + L.jb * nx + i;
      const G = (0.5 * (k[ca] + k[cb]) * L.area) / L.dist; // W/K for this column
      const Q = G * (T[cb] - T[ca]) * dt; // J into a
      dH[ca] += Q / (A * d[ca]);
      dH[cb] -= Q / (A * d[cb]);
    }
  }
  const lo = Tamb - 0.05, hi = Tamb + 0.05;
  for (let p = 0; p < plates.length; p++) {
    const r = g.act[p];
    if (!r) continue;
    const pl = plates[p];
    let ia = nx, ib = -1, ja = pl.ns, jb = -1;
    for (let jj = r.j0; jj <= r.j1; jj++) {
      const row = pl.c0 + jj * nx;
      for (let i = r.i0; i <= r.i1; i++) {
        const c = row + i;
        H[c] += dH[c];
        const Tn = temperatureOf(H[c]);
        T[c] = Tn;
        if (Tn > hi || Tn < lo) {
          if (i < ia) ia = i;
          if (i > ib) ib = i;
          if (jj < ja) ja = jj;
          if (jj > jb) jb = jj;
        }
      }
    }
    // next step: cells that differ from ambient, plus one cell of margin (heat spreads one cell)
    g.act[p] = ib < 0 ? null : grow(null, ia - 1, ib + 1, ja - 1, jb + 1, nx, pl.ns);
  }
  return lost;
}

// The pipe wall (one plate, x periodic, cells hx around by h along the axis): as stepGrid, with the
// conduction across each face weighted by face length / centre distance.
function stepGridPeriodic(g, dt, Tamb, pending) {
  const nx = g.nx, hs = g.h, hx = g.hx, A = hx * hs;
  const wx = hs / hx, ws = hx / hs;
  const H = g.H, T = g.T, k = g.k, d = g.d, dH = g.dH;
  const LT = lossTable(Tamb);
  const pl = g.lay.plates[0];
  const r = g.act[0];
  if (!r) return 0;
  for (let jj = r.j0; jj <= r.j1; jj++) {
    const row = pl.c0 + jj * nx;
    for (let i = r.i0; i <= r.i1; i++) {
      const c = row + i;
      const ti = T[c] < 0 ? 0 : T[c] > K_TMAX ? K_TMAX : T[c] | 0;
      k[c] = K_TABLE[ti];
    }
  }
  const full = r.i0 === 0 && r.i1 === nx - 1;
  let lost = 0;
  const ns = pl.ns;
  for (let jj = r.j0; jj <= r.j1; jj++) {
    const row = pl.c0 + jj * nx;
    const dj = d[row];
    const up = jj + 1 < ns ? row + nx : -1;
    const dn = jj > 0 ? row - nx : -1;
    const dUp = up >= 0 ? Math.min(dj, d[up]) : 0;
    const dDn = dn >= 0 ? Math.min(dj, d[dn]) : 0;
    for (let i = r.i0; i <= r.i1; i++) {
      const c = row + i;
      const Tc = T[c], kc = k[c];
      const il = i > 0 ? c - 1 : full ? row + nx - 1 : -1;
      const ir = i < nx - 1 ? c + 1 : full ? row : -1;
      let q = 0;
      if (il >= 0) q += 0.5 * (kc + k[il]) * dj * (T[il] - Tc) * wx;
      if (ir >= 0) q += 0.5 * (kc + k[ir]) * dj * (T[ir] - Tc) * wx;
      if (up >= 0) q += 0.5 * (kc + k[up + i]) * dUp * (T[up + i] - Tc) * ws;
      if (dn >= 0) q += 0.5 * (kc + k[dn + i]) * dDn * (T[dn + i] - Tc) * ws;
      const ti = Tc < 0 ? 0 : Tc > K_TMAX ? K_TMAX : Tc | 0;
      const loss = LT[ti];
      lost += loss * A * dt;
      dH[c] = (dt * (q / A - loss) + (pending ? pending[c] / A : 0)) / dj;
    }
  }
  const lo = Tamb - 0.05, hi = Tamb + 0.05;
  let ia = nx, ib = -1, ja = ns, jb = -1;
  for (let jj = r.j0; jj <= r.j1; jj++) {
    const row = pl.c0 + jj * nx;
    for (let i = r.i0; i <= r.i1; i++) {
      const c = row + i;
      H[c] += dH[c];
      const Tn = temperatureOf(H[c]);
      T[c] = Tn;
      if (Tn > hi || Tn < lo) {
        if (i < ia) ia = i;
        if (i > ib) ib = i;
        if (jj < ja) ja = jj;
        if (jj > jb) jb = jj;
      }
    }
  }
  g.act[0] = ib < 0 ? null : growP(null, ia - 1, ib + 1, ja - 1, jb + 1, nx, ns);
  return lost;
}

// Active rectangle on the periodic grid: a range that reaches either end of x takes the whole ring.
function growP(r, i0, i1, j0, j1, nx, ns) {
  const a = grow(r, i0, i1, j0, j1, nx, ns);
  if (i0 <= 0 || i1 >= nx - 1 || a.i0 === 0 || a.i1 === nx - 1) {
    a.i0 = 0;
    a.i1 = nx - 1;
  }
  return a;
}

function grow(r, i0, i1, j0, j1, nx, ns) {
  const a = { i0: Math.max(0, i0), i1: Math.min(nx - 1, i1), j0: Math.max(0, j0), j1: Math.min(ns - 1, j1) };
  if (!r) return a;
  return { i0: Math.min(r.i0, a.i0), i1: Math.max(r.i1, a.i1), j0: Math.min(r.j0, a.j0), j1: Math.max(r.j1, a.j1) };
}

function fullRect(g) {
  for (let p = 0; p < g.lay.plates.length; p++) g.act[p] = { i0: 0, i1: g.nx - 1, j0: 0, j1: g.lay.plates[p].ns - 1 };
}

export class ThermalModel {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.lay = thermalLayout(joint);
    this.g = makeGrid(this.lay);
    const lay = this.lay;
    this.nx = lay.nx;
    this.h = lay.h / 1000; // m
    this.n = this.g.n;
    this.H = this.g.H;
    this.T = this.g.T;
    this.dRow = this.g.d;
    this.Tamb = opts.ambient ?? T_AMBIENT;
    this.peak = new Float32Array(this.n);
    this.pending = new Float64Array(this.n); // J waiting to be added at the next step
    this.dtMax = opts.dtMax ?? 1 / 24;
    this.acc = 0;
    this.time = 0;
    this.energyIn = 0; // J delivered by the arc
    this.energyLost = 0; // J lost from the surfaces
    this.version = 0; // bumps every step (texture uploads)
    this.gc = null; // coarse grid for long waits
    this.reset();
  }

  reset(T = this.Tamb) {
    this.cm = false; // coarse (source-free cooling) mode, see cool()
    this.cacc = 0;
    this.fineDirty = false;
    const H0 = enthalpy(T);
    this.H.fill(H0);
    this.T.fill(T);
    this.g.k.fill(K_TABLE[Math.max(0, Math.min(K_TMAX, T | 0))]);
    this.g.act = this.lay.plates.map(() => null);
    if (T !== this.Tamb) fullRect(this.g);
    this.peak.fill(T);
    this.pending.fill(0);
    this.acc = 0;
    this.energyIn = 0;
    this.energyLost = 0;
    this.version++;
  }

  // Bring the coupon back to ambient (a cold coupon for inspection); peak temperatures stay.
  toAmbient() {
    this.sync();
    const pk = this.peak.slice();
    this.reset(this.Tamb);
    this.peak.set(pk);
  }

  // Total heat content above 0 C (J), for energy checks.
  heatContent() {
    this.sync();
    const A = this.g.periodic ? this.g.hx * this.h : this.h * this.h;
    let E = 0;
    for (let c = 0; c < this.n; c++) E += this.H[c] * A * this.dRow[c] + this.pending[c];
    return E;
  }

  // ---- geometry helpers ----------------------------------------------------------------------
  // Plate index and s coordinate (mm) for a point (u, v) on or near the coupon surface.
  locate(u, v) {
    const j = this.joint;
    if (j.type !== 'fillet') return { p: 0, s: u };
    const a = (u + v) * S2; // along the base plate (d1)
    const b = (v - u) * S2; // up the web (d2)
    if (b <= a || a < -j.t) return { p: 0, s: a };
    return { p: 1, s: b };
  }

  // Bilinear temperature at x (mm, sim coordinates) and plate coordinate s (mm).
  sampleT(p, x, s, field = this.T) {
    this.sync();
    const pl = this.lay.plates[p];
    const hm = this.lay.h;
    const fs = Math.min(Math.max((s - pl.s0) / hm - 0.5, 0), pl.ns - 1.0001);
    const jj = Math.floor(fs);
    const as = fs - jj;
    const j1 = Math.min(jj + 1, pl.ns - 1);
    let i, i1, ax;
    if (this.g.periodic) {
      // around the pipe: interpolate across the last and first columns
      const fx = x / this.lay.hx - 0.5;
      const f0 = Math.floor(fx);
      ax = fx - f0;
      i = ((f0 % this.nx) + this.nx) % this.nx;
      i1 = (i + 1) % this.nx;
    } else {
      const fx = Math.min(Math.max(x / hm - 0.5, 0), this.nx - 1.0001);
      i = Math.floor(fx);
      ax = fx - i;
      i1 = Math.min(i + 1, this.nx - 1);
    }
    const r0 = pl.c0 + jj * this.nx, r1 = pl.c0 + j1 * this.nx;
    return (field[r0 + i] * (1 - ax) + field[r0 + i1] * ax) * (1 - as) + (field[r1 + i] * (1 - ax) + field[r1 + i1] * ax) * as;
  }

  // Temperature at a surface point (x, u, v) in sim joint coordinates.
  at(x, u, v) {
    const { p, s } = this.locate(u, v);
    return this.sampleT(p, x, s);
  }

  peakAt(x, u, v) {
    const { p, s } = this.locate(u, v);
    return this.sampleT(p, x, s, this.peak);
  }

  // Temperature on the weld line (root of the fillet, centre of the groove, or lane centre).
  lineT(x, lane = 0) {
    return this.sampleT(0, x, this.joint.type === 'plate' ? lane : 0);
  }

  // Highest temperature within `ds` mm of the weld line between x0 and x1 (interpass check).
  maxNear(x0, x1, ds = 10, lane = 0) {
    this.sync();
    const j = this.joint;
    const hm = this.lay.h;
    let m = -Infinity;
    // columns x0..x1 (around a pipe: wrapped, the whole ring when the span covers it)
    const cols = [];
    if (this.g.periodic) {
      const a = Math.floor(x0 / this.lay.hx), b = Math.ceil(x1 / this.lay.hx);
      const cnt = Math.min(this.nx, b - a + 1);
      for (let q = 0; q < cnt; q++) cols.push((((a + q) % this.nx) + this.nx) % this.nx);
    } else {
      const ia = Math.max(0, Math.floor(x0 / hm)), ib = Math.min(this.nx - 1, Math.ceil(x1 / hm));
      for (let i = ia; i <= ib; i++) cols.push(i);
    }
    const plates = j.type === 'fillet' ? [[0, 0], [1, 0]] : [[0, j.type === 'plate' ? lane : 0]];
    for (const [p, sc] of plates) {
      const pl = this.lay.plates[p];
      const ja = Math.max(0, Math.floor((sc - ds - pl.s0) / hm)), jb = Math.min(pl.ns - 1, Math.ceil((sc + ds - pl.s0) / hm));
      for (let jj = ja; jj <= jb; jj++) {
        const r = pl.c0 + jj * this.nx;
        for (const i of cols) if (this.T[r + i] > m) m = this.T[r + i];
      }
    }
    return m;
  }

  // Highest temperature anywhere on the coupon.
  maxT() {
    this.sync();
    let m = -Infinity;
    for (let c = 0; c < this.n; c++) if (this.T[c] > m) m = this.T[c];
    return m;
  }

  // ---- heat input ------------------------------------------------------------------------------
  // Arc power P (W) for dt seconds at the hit point (x, u, v), spread over the cells under the pool.
  addArc(dt, x, u, v, P, sigmaMM = 3.0) {
    if (!(P > 0) || !(dt > 0)) return;
    if (this.cm) this.exitCoarse();
    const E = P * dt;
    this.energyIn += E;
    const j = this.joint;
    if (j.type === 'fillet') {
      // In the root region the pool bridges both plates: split the heat between the base and
      // the web by where the arc points (aim u > 0 is toward the base). Elsewhere (an arc on a
      // plate surface) the heat goes into that plate.
      const a = (u + v) * S2, b = (v - u) * S2;
      if (a > -j.t && b > -j.t && a < 16 && b < 16) {
        const wb = Math.min(0.85, Math.max(0.15, 0.5 + u / 8)); // seed split rule
        this.deposit(0, x, Math.max(0, a - b) * 0.5 + 1.25, E * wb, sigmaMM);
        this.deposit(1, x, Math.max(0, b - a) * 0.5 + 1.25, E * (1 - wb), sigmaMM);
      } else {
        const { p, s } = this.locate(u, v);
        this.deposit(p, x, s, E, sigmaMM);
      }
      return;
    }
    this.deposit(0, x, u, E, sigmaMM);
  }

  deposit(p, x, s, E, sig) {
    if (this.cm) this.exitCoarse();
    if (this.g.periodic) return this.depositPeriodic(x, s, E, sig);
    const pl = this.lay.plates[p];
    const hm = this.lay.h;
    const r = 2.5 * sig;
    const ia = Math.max(0, Math.floor((x - r) / hm)), ib = Math.min(this.nx - 1, Math.floor((x + r) / hm));
    const ja = Math.max(0, Math.floor((s - r - pl.s0) / hm)), jb = Math.min(pl.ns - 1, Math.floor((s + r - pl.s0) / hm));
    if (ia > ib || ja > jb) return;
    this.g.act[p] = grow(this.g.act[p], ia - 1, ib + 1, ja - 1, jb + 1, this.nx, pl.ns);
    let wsum = 0;
    const inv = 1 / (2 * sig * sig);
    for (let jj = ja; jj <= jb; jj++) {
      const ds = pl.s0 + (jj + 0.5) * hm - s;
      for (let i = ia; i <= ib; i++) {
        const dx = (i + 0.5) * hm - x;
        wsum += Math.exp(-(dx * dx + ds * ds) * inv);
      }
    }
    if (wsum <= 0) return;
    for (let jj = ja; jj <= jb; jj++) {
      const ds = pl.s0 + (jj + 0.5) * hm - s;
      const row = pl.c0 + jj * this.nx;
      for (let i = ia; i <= ib; i++) {
        const dx = (i + 0.5) * hm - x;
        this.pending[row + i] += (E * Math.exp(-(dx * dx + ds * ds) * inv)) / wsum;
      }
    }
  }

  // Pipe wall: Gaussian spot around x (wrapped), distances in physical millimetres.
  depositPeriodic(x, s, E, sig) {
    const lay = this.lay;
    const pl = lay.plates[0];
    const hm = lay.h, hx = lay.hx, kx = lay.hxPhys / lay.hx;
    const r = 2.5 * sig;
    const nx = this.nx;
    const ia = Math.floor((x - r / kx) / hx), ib = Math.floor((x + r / kx) / hx);
    const ja = Math.max(0, Math.floor((s - r - pl.s0) / hm)), jb = Math.min(pl.ns - 1, Math.floor((s + r - pl.s0) / hm));
    if (ja > jb) return;
    this.g.act[0] = growP(this.g.act[0], ia - 1, ib + 1, ja - 1, jb + 1, nx, pl.ns);
    const inv = 1 / (2 * sig * sig);
    let wsum = 0;
    for (let jj = ja; jj <= jb; jj++) {
      const ds = pl.s0 + (jj + 0.5) * hm - s;
      for (let i = ia; i <= ib; i++) {
        const dx = ((i + 0.5) * hx - x) * kx;
        wsum += Math.exp(-(dx * dx + ds * ds) * inv);
      }
    }
    if (wsum <= 0) return;
    for (let jj = ja; jj <= jb; jj++) {
      const ds = pl.s0 + (jj + 0.5) * hm - s;
      const row = pl.c0 + jj * nx;
      for (let i = ia; i <= ib; i++) {
        const dx = ((i + 0.5) * hx - x) * kx;
        this.pending[row + (((i % nx) + nx) % nx)] += (E * Math.exp(-(dx * dx + ds * ds) * inv)) / wsum;
      }
    }
  }

  // ---- time stepping ---------------------------------------------------------------------------
  // Advance by dt seconds in fixed sub-steps (deterministic for a given dt sequence).
  advance(dt, maxSteps = 64) {
    if (this.cm) {
      // source-free time while in coarse mode (see cool)
      this.coarseAdvance(dt);
      return 0;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.dtMax - 1e-9 && n < maxSteps) {
      this.stepFine(this.dtMax);
      this.acc -= this.dtMax;
      n++;
    }
    if (n >= maxSteps) this.acc = 0;
    return n;
  }

  step(dt) {
    if (this.cm) this.exitCoarse();
    this.stepFine(dt);
  }

  stepFine(dt) {
    const lost = stepGrid(this.g, dt, this.Tamb, this.pending);
    const T = this.T, peak = this.peak, pend = this.pending;
    const nx = this.nx;
    for (let p = 0; p < this.lay.plates.length; p++) {
      const r = this.g.act[p];
      if (!r) continue;
      const pl = this.lay.plates[p];
      for (let jj = r.j0; jj <= r.j1; jj++) {
        const row = pl.c0 + jj * nx;
        for (let i = r.i0; i <= r.i1; i++) {
          const c = row + i;
          pend[c] = 0;
          if (T[c] > peak[c]) peak[c] = T[c];
        }
      }
    }
    this.energyLost += lost;
    this.time += dt;
    this.version++;
  }

  // ---- source-free cooling on the coarse grid ----------------------------------------------------
  // Cooling with no heat source (interpass waits, accelerated time) runs on the 2:1 coarse grid.
  // Detail finer than a coarse cell decays within a fraction of a second once the arc has gone
  // (decay time h^2 / (pi^2 alpha): about 0.04 s for 2.5 mm cells and 0.16 s for 5 mm cells), so a
  // cooling field is resolved by 5 mm cells. Once entered, coarse mode lasts until the next heat
  // input, and every source-free advance runs on the coarse grid. The fine field is rebuilt from
  // it when something reads it: bilinear interpolation, then each 2 x 2 block corrected to its
  // coarse cell's energy (energy is conserved exactly).
  cool(seconds) {
    if (!(seconds > 0)) return;
    if (!this.cm) this.enterCoarse();
    this.coarseAdvance(seconds);
  }

  enterCoarse() {
    // deliver pending arc heat and any time still owed on the fine grid first
    let pend = 0;
    for (let c = 0; c < this.n; c++) pend += this.pending[c];
    if (pend > 0 || this.acc > 0) {
      this.stepFine(Math.max(this.acc, 1e-4));
      this.acc = 0;
    }
    const gc = this.coarse();
    const f = this.g;
    const nx = f.nx, ncx = gc.nx;
    // restrict: coarse enthalpy = thickness-weighted mean of its fine cells
    for (let pi = 0; pi < f.lay.plates.length; pi++) {
      const pf = f.lay.plates[pi], pc = gc.lay.plates[pi];
      for (let jc = 0; jc < pc.ns; jc++) {
        for (let ic = 0; ic < ncx; ic++) {
          let e = 0, cap = 0;
          for (let dj = 0; dj < 2; dj++) {
            const jf = 2 * jc + dj;
            if (jf >= pf.ns) continue;
            for (let di = 0; di < 2; di++) {
              const i = 2 * ic + di;
              if (i >= nx) continue;
              const c = pf.c0 + jf * nx + i;
              e += f.H[c] * f.d[c];
              cap += f.d[c];
            }
          }
          const cc = pc.c0 + jc * ncx + ic;
          const Hc = e / Math.max(cap, 1e-12);
          gc.H[cc] = Hc;
          gc.T[cc] = temperatureOf(Hc);
        }
      }
    }
    fullRect(gc);
    this.cm = true;
    this.cacc = 0;
    this.fineDirty = false;
  }

  coarseAdvance(seconds) {
    const DTC = 0.36; // s; stable for 5 mm cells (h^2 / 4 alpha_max = 0.40 s)
    this.cacc += seconds;
    this.time += seconds;
    let lost = 0, n = 0;
    while (this.cacc >= DTC - 1e-9) {
      lost += stepGrid(this.gc, DTC, this.Tamb, null);
      this.cacc -= DTC;
      n++;
    }
    if (n) {
      this.energyLost += lost;
      this.fineDirty = true;
      this.version++;
    }
  }

  // Rebuild the fine field from the coarse one (coarse mode, after it has stepped).
  sync() {
    if (!this.fineDirty) return;
    this.fineDirty = false;
    const gc = this.gc;
    const f = this.g;
    const nx = f.nx, ncx = gc.nx;
    const cells = [0, 0, 0, 0];
    for (let pi = 0; pi < f.lay.plates.length; pi++) {
      const pf = f.lay.plates[pi], pc = gc.lay.plates[pi];
      const per = !!this.lay.periodic;
      const Hc = (ic, jc) => gc.H[pc.c0 + Math.min(pc.ns - 1, Math.max(0, jc)) * ncx + (per ? ((ic % ncx) + ncx) % ncx : Math.min(ncx - 1, Math.max(0, ic)))];
      for (let jc = 0; jc < pc.ns; jc++) {
        for (let ic = 0; ic < ncx; ic++) {
          const cc = pc.c0 + jc * ncx + ic;
          let eSum = 0, cap = 0, m = 0;
          for (let dj = 0; dj < 2; dj++) {
            const jf = 2 * jc + dj;
            if (jf >= pf.ns) continue;
            for (let di = 0; di < 2; di++) {
              const i = 2 * ic + di;
              if (i >= nx) continue;
              const c = pf.c0 + jf * nx + i;
              const fx = (i + 0.5) / 2 - 0.5, fy = (jf + 0.5) / 2 - 0.5;
              const i0 = Math.floor(fx), j0 = Math.floor(fy);
              const ax = fx - i0, ay = fy - j0;
              f.H[c] = (Hc(i0, j0) * (1 - ax) + Hc(i0 + 1, j0) * ax) * (1 - ay) + (Hc(i0, j0 + 1) * (1 - ax) + Hc(i0 + 1, j0 + 1) * ax) * ay;
              eSum += f.H[c] * f.d[c];
              cap += f.d[c];
              cells[m++] = c;
            }
          }
          if (cap > 0) {
            // block energy equals the coarse cell's energy
            const corr = (gc.H[cc] * cap - eSum) / cap;
            for (let q = 0; q < m; q++) {
              const c = cells[q];
              f.H[c] += corr;
              const T = temperatureOf(f.H[c]);
              f.T[c] = T;
              // conduction can still raise the temperature away from the weld while it cools
              if (T > this.peak[c]) this.peak[c] = T;
            }
          }
        }
      }
    }
  }

  // Back to the fine grid (heat input arrives): the fine field continues from the coarse one.
  exitCoarse() {
    if (!this.cm) return;
    this.fineDirty = true;
    this.sync();
    this.cm = false;
    this.acc += this.cacc;
    this.cacc = 0;
    fullRect(this.g);
  }

  coarse() {
    if (this.gc) return this.gc;
    const f = this.lay;
    const lay = {
      h: f.h * 2, nx: Math.ceil(f.nx / 2), type: f.type, t: f.t, L: f.L,
      plates: f.plates.map((p) => ({ name: p.name, s0: p.s0, ns: Math.ceil(p.ns / 2), d: p.d, backing: p.backing })),
    };
    if (f.periodic) Object.assign(lay, { periodic: true, hx: f.hx * 2, hxPhys: f.hxPhys * 2 });
    finishLayout(lay);
    // coarse cell thickness = mean of its fine rows (keeps the backing bar's capacity)
    this.gc = makeGrid(lay);
    for (let pi = 0; pi < lay.plates.length; pi++) {
      const pf = f.plates[pi], pc = lay.plates[pi];
      for (let jc = 0; jc < pc.ns; jc++) {
        let ds = 0, nn = 0;
        for (let dj = 0; dj < 2; dj++) {
          const jf = 2 * jc + dj;
          if (jf < pf.ns) {
            ds += pf.dRow[jf];
            nn++;
          }
        }
        pc.dRow[jc] = ds / nn;
        for (let i = 0; i < lay.nx; i++) this.gc.d[pc.c0 + jc * lay.nx + i] = pc.dRow[jc];
      }
    }
    return this.gc;
  }

  // Copy current and peak temperatures into texture rows (row = plate row + padding, col = x).
  // out: Float32Array of size nx * rows * 2 (RG). Mirror flips x for left-handed coupons.
  fillTexture(out, mirror = false) {
    this.sync();
    const nx = this.nx;
    for (const pl of this.lay.plates) {
      for (let jj = 0; jj < pl.ns; jj++) {
        const src = pl.c0 + jj * nx;
        const dst = (pl.row0 + jj) * nx;
        for (let i = 0; i < nx; i++) {
          const o = (dst + (mirror ? nx - 1 - i : i)) * 2;
          out[o] = this.T[src + i];
          out[o + 1] = this.peak[src + i];
        }
      }
    }
    return out;
  }
}

// ---- cooling time estimate (Rosenthal thick and thin plate) --------------------------------------
// t8/5 from the moving-source solutions with EN 1993-1-2 mean properties between 500 and 800 C:
//   thick (3-D): t = Q / (Omega k) [1/(500 - T0) - 1/(800 - T0)]          (Omega = 2 pi half-space,
//                                                                          3 pi inside a T-joint)
//   thin  (2-D): t = (2/n)^2 (Q/d)^2 / (4 pi k rho c) [1/(500 - T0)^2 - 1/(800 - T0)^2]
//                (n plate branches meeting at the weld: 2 for a butt or bead on plate, 3 for a T-joint)
// The larger of the two applies (a plate thinner than the transition thickness cools as 2-D).
// An engineering estimate from the physics; NOT an EN 1011-2 calculation (whose constants and
// shape factors must be taken from the licensed standard).
export function coolingTimeEstimate(Q_kJmm, d_mm, T0, jointType) {
  if (!(Q_kJmm > 0) || T0 >= 480) return null;
  const k = 54 - 0.0333 * 650; // W/m.K, mean of the EN 1993-1-2 line over 500-800 C (32.4)
  const rhoC = (enthalpy(800) - enthalpy(500)) / 300; // J/m3.K including the 735 C peak
  const Q = Q_kJmm * 1e6; // J/m
  const d = d_mm / 1000;
  const a = 1 / (500 - T0), b = 1 / (800 - T0);
  const Omega = jointType === 'fillet' ? 3 * Math.PI : 2 * Math.PI;
  const n = jointType === 'fillet' ? 3 : 2;
  const t3 = (Q / (Omega * k)) * (a - b);
  const t2 = ((2 / n) ** 2 * (Q / d) ** 2 / (4 * Math.PI * k * rhoC)) * (a * a - b * b);
  return { t85: Math.max(t2, t3), regime: t2 > t3 ? '2D' : '3D', t2, t3 };
}
