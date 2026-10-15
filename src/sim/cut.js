// Oxy-fuel cutting of a plate: the start (preheat to the kindling temperature, then the cutting oxygen), the
// cut front following the jet, loss of the cut, restarts, the drop of the cut-off strip, and the quality of
// the cut face along the cut (drag lines, top edge, slag on the bottom edge, pressure marks and gouges, the
// face angle, the kerf), judged by the cut-quality categories of a manufacturer's cutting guide and the
// perpendicularity tolerance ranges of ISO 9013.
//
// Coordinates (mm): x along the marked line from the start edge (0) to the far edge (L); u across the plate,
// 0 on the line, the strip that drops off on u < 0; v up, 0 on the top surface, -t on the bottom. A face angle
// (bevel) is positive when the kerf runs toward the strip as it goes down: the bottom edge of the kept part's
// face lies at u = uTop - t tan(face).
//
// Sources (see README "Oxy-fuel cutting sources"):
//   Start of the cut: Victor 0056-0138 4.01 steps 18-20 ("position the cutting tip preheat flames approximately
//     1/4" from the base metal"; "preheat the starting point of the metal to a bright cherry red kindling
//     temperature. When the red spot appears, depress the cutting oxygen lever slowly and fully." "Moving too
//     slowly allows the cut to fuse together." "Moving too fast will not preheat the metal and the cut will be
//     lost."); Smith OM-262659J 9-2 ("positioning the bright inner cones approximately 1/8-1/4 in. (3-6 mm) away
//     from the steel surface"; "When the metal turns bright red (approx. 1500F/816C) slowly depress the cutting
//     lever"); Hobart 7-3 ("bright red (about 1550 F or 843 C)").
//   Speeds and kerf: Victor 0056-0138 Section 7 tip chart (ofc.js).
//   Cut quality: Harris "Machine Cutting Guide", PN 9700208 (03/2017), and Harris oxy-fuel manual Fig. 20:
//     perfect cut ("Regular surface with slightly sloping drag lines"), production cut ("Moderately sloping
//     drag lines and a reasonably smooth surface"), slightly too fast ("Drag lines incline backwards, but a
//     "drop cut" is still attained"), extremely fast ("slag adheres to the bottom side and there is danger of
//     losing the cut"; "Cut face often slightly concave"), slightly too slow ("some surface roughness caused by
//     vertical drag lines"; "Top edge is usually slightly beaded"), extremely slow ("Pressure marks indicate too
//     much oxygen for cutting conditions"; "rounded or beaded top edge"), tip too close ("Grooves and deep drag
//     lines caused by unstable cutting action"), tip too high ("Top edge is beaded or rounded, cut face is not
//     smooth and often is slightly beveled"; "Cutting speed is reduced because of the danger of losing the
//     cut"), too much cutting oxygen ("Pressure marks"), too hot preheat ("Rounded top edge"), dirty tip
//     ("Excess slag on the steel, an irregular cut surface, pitting and undercutting"); bevel cutting ("Cutting
//     speed is slower than vertical cutting because preheat effect is partially deflected from plate").
//     Fig. 20 B: "slag fills the kerf and the two pieces are not severed" (too fast).
//   Perpendicularity or angularity tolerance u (ISO 9013:2017 Table 4, as reproduced by Lincoln Electric, "The
//     PythonX Guide to Plasma Cutting in Codes and Standards", from EN 1090-2:2018): range 1: 0.05 + 0.003 a;
//     2: 0.15 + 0.007 a; 3: 0.4 + 0.01 a; 4: 0.8 + 0.02 a; 5: 1.2 + 0.035 a (mm, a = cut thickness);
//     EN 1090-2: "EXC2 Range 5"; "EXC3 and EXC4 Range 4"; EXC1: "dross shall be removed".
// Values marked `seed` are model coefficients of this build (uncalibrated): the speed bands of the categories,
// the drag, top-edge, slag and kerf functions, the loss-of-cut speed and the heat of the burning front.

import { clamp, DEG, rng } from './util.js';
import { ThermalModel } from './thermal.js';
import { T_AMBIENT } from './material.js';
import { chartRow, mid, tipData, IPM_MMS, IN_MM, ATM_PSI, TIP_CHART, preheatPower } from './ofc.js';

export const KINDLING_C = 816; // Smith "bright red (approx. 1500F/816C)": the start cue used as the ignition threshold
export const CONE_MM = 2.5; // seed: inner cone length of a neutral preheat flame at the middle of the printed flows
export const CONE_WINDOW = [3, 6]; // Smith: inner cones 1/8-1/4 in (3-6 mm) from the steel
export const BEVEL_SPEED = 0.85; // seed: speed factor for a bevel cut (Harris: slower than vertical cutting)
// Top-surface temperature under the flame. The plate grid (thermal.js) carries the heat averaged through the
// thickness; the surface under the preheat cones runs hotter than that average. The excess is a field of its
// own that rises toward a local equilibrium under the flame and relaxes back when the flame moves on:
//   E_eq = P * K_SKIN * edge, P = the preheat heat (W), K_SKIN = 1 / (sqrt(pi) k a) for a Gaussian spot of
//   radius a on a semi-infinite steel body (k = 35 W/mK), doubled at an edge (seed: 1 + exp(-d/a));
//   time constant SKIN_TAU, longer on thicker plate (seed). The kindling check and the glow use the top
//   surface: the plate average plus this excess.
export const SKIN_A = 8; // mm, seed
// Spatial profile of the excess round the flame axis: the steady surface temperature of a semi-infinite body under
// a Gaussian heat flux exp(-r^2 / a^2), exp(-x) I0(x) with x = r^2 / (2 a^2) (1 on the axis, about 0.65 at r = a,
// falling as 1/r further out), tapered to 0 between 2a and 4a.
export function skinProfile(r, a = SKIN_A) {
  const x = (r * r) / (2 * a * a);
  let f;
  if (x <= 3.75) {
    // Abramowitz and Stegun 9.8.1 (I0) times exp(-x)
    const t = (x / 3.75) ** 2;
    f = Math.exp(-x) * (1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813))))));
  } else {
    // Abramowitz and Stegun 9.8.2: x^0.5 exp(-x) I0(x)
    const t = 3.75 / x;
    f = (0.39894228 + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) / Math.sqrt(x);
  }
  const k = clamp((r / a - 2) / 2, 0, 1);
  return f * (1 - k * k * (3 - 2 * k));
}
export let SKIN_GAIN = 0.4; // seed: share of the semi-infinite excess (edge starts of about 3-12 s from 6 to 25 mm plate)
export function setSkinGain(g) {
  SKIN_GAIN = g;
}
export const K_SKIN = 1 / (Math.sqrt(Math.PI) * 35 * SKIN_A / 1000); // K/W
export const SKIN_TAU = 30; // s at 12.7 mm, x sqrt(t / 12.7) (seed)
export const SKIN_FALL = 2.5; // s, seed: the surface excess relaxing into the plate once the flame has gone
export const SKIN_DEPTH = 4; // mm, seed: depth over which the surface excess fades into the plate average
// the kerf walls behind the front: from the burning temperature, cooling with the age of the cut (display; seed:
// a visible red trail of one to two centimetres behind the torch at the chart speed on 12.7 mm plate)
export const KERF_EDGE_C = 1300;
export const KERF_EDGE_TAU = 3.5;
export const MELT_TOP = 1450; // C at the top surface: the corner melts (preheat too long: rounded top edge, seed)

// Cut quality categories (Harris PN 9700208), worst first; `text` is the guide's description.
export const CUT_CATEGORIES = {
  notSevered: { label: 'Not severed', text: 'Slag fills the kerf and the two pieces are not severed.', ok: false },
  dirtyTip: { label: 'Dirty tip', text: 'Dirt or scale in the tip deflects the oxygen stream: excess slag, an irregular cut surface, pitting and undercutting.', ok: false },
  tooClose: { label: 'Tip too close', text: 'Grooves and deep drag lines caused by unstable cutting action.', ok: false },
  tooHigh: { label: 'Tip too high', text: 'Top edge beaded or rounded, cut face not smooth and often slightly bevelled.', ok: false },
  tooMuchO2: { label: 'Too much cutting oxygen', text: 'Pressure marks: more oxygen than can be consumed goes around the slag and gouges the face.', ok: false },
  preheatHot: { label: 'Preheat too hot', text: 'Rounded top edge caused by too much preheat; it does not increase the cutting speed.', ok: false },
  extremelyFast: { label: 'Extremely fast', text: 'Rake angle of the drag lines; slag adheres to the bottom; danger of losing the cut; face often slightly concave.', ok: false },
  extremelySlow: { label: 'Extremely slow', text: 'Pressure marks (too much oxygen for the cutting conditions) and a rounded or beaded top edge.', ok: false },
  slightlyFast: { label: 'Slightly too fast', text: 'Drag lines incline backwards, but a drop cut is still attained; quality satisfactory for much production work.', ok: true },
  slightlySlow: { label: 'Slightly too slow', text: 'Some surface roughness from vertical drag lines; top edge usually slightly beaded.', ok: true },
  production: { label: 'Production cut', text: 'Moderately sloping drag lines and a reasonably smooth surface.', ok: true },
  perfect: { label: 'Perfect cut', text: 'Regular surface with slightly sloping drag lines; usable without machining.', ok: true },
};
export const CATEGORY_ORDER = ['notSevered', 'dirtyTip', 'tooClose', 'tooHigh', 'tooMuchO2', 'preheatHot', 'extremelyFast', 'extremelySlow', 'slightlyFast', 'slightlySlow', 'production', 'perfect'];
// speed ratio bands (actual / middle of the chart speed), seed
export const SPEED_BANDS = { extremelySlow: 0.65, slightlySlow: 0.85, production: 1.05, slightlyFast: 1.12, extremelyFast: 1.3 };

// ISO 9013 perpendicularity or angularity tolerance u (mm) for cut thickness a (mm), ranges 1-5.
export const ISO9013_U = [
  null,
  (a) => 0.05 + 0.003 * a,
  (a) => 0.15 + 0.007 * a,
  (a) => 0.4 + 0.01 * a,
  (a) => 0.8 + 0.02 * a,
  (a) => 1.2 + 0.035 * a,
];
export function iso9013Range(u, a) {
  for (let r = 1; r <= 5; r++) if (u <= ISO9013_U[r](a) + 1e-9) return r;
  return null; // outside range 5
}

// The coupon: a plate with a line marked on it (soapstone) at `drop` mm from the edge that drops off.
export function makeCutCoupon(opts = {}) {
  const row = chartRow(opts.plate || 'P12');
  const t = opts.t ?? row.tIn * IN_MM;
  const L = opts.L ?? 250;
  const drop = opts.drop ?? 50; // strip width, u in [-drop, 0]
  const keep = opts.keep ?? 100; // u in [0, keep]
  const bevel = opts.bevel ?? 0; // target face angle (deg) from the vertical, the bevel on the kept part
  return { plate: opts.plate || 'P12', row, t, L, drop, keep, bevel, n: Math.ceil(L), tip: opts.tip ?? row.tip, label: opts.label ?? row.label };
}

// Middle of the chart speed (mm/s) for the coupon (bevel: the chart speed at the longer cut, times the bevel
// factor).
export function nominalSpeed(c) {
  const v = mid(c.row.speed) * IPM_MMS;
  return c.bevel ? v * BEVEL_SPEED : v;
}
export function chartSpeedRange(c) {
  const f = c.bevel ? BEVEL_SPEED : 1;
  return [c.row.speed[0] * IPM_MMS * f, c.row.speed[1] * IPM_MMS * f];
}

const KEYS = ['depth', 'drag', 'top', 'dross', 'adh', 'pm', 'gr', 'face', 'conc', 'kerf', 'uTop', 'v', 'cg', 'P', 't', 'cat', 'restart'];

export class CutRecord {
  constructor(coupon) {
    this.coupon = coupon;
    const n = coupon.n;
    this.n = n;
    for (const k of KEYS) this[k] = new Float32Array(n);
    this.depth.fill(0);
    this.cat.fill(-1);
    this.t.fill(-1);
    this.starts = []; // { x, t, restart }
    this.losses = []; // { x, t }
    this.severedAt = null;
  }

  // sample i written by the front at time t with the local values
  write(i, s) {
    if (i < 0 || i >= this.n) return;
    if (this.depth[i] >= 0.999) return; // the jet passing an open kerf again does not change its faces
    for (const k of KEYS) if (k in s) this[k][i] = s[k];
  }

  // the kerf behind a jet that has stood too long fuses together again (slag welds the faces): not severed
  fuse(x0, x1) {
    const nsv = CATEGORY_ORDER.indexOf('notSevered');
    for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(this.n - 1, Math.floor(x1)); i++) {
      if (this.t[i] < 0) continue;
      this.depth[i] = Math.min(this.depth[i], 0.9);
      this.cat[i] = nsv;
      this.fused = (this.fused || 0) + 1;
    }
  }

  severed() {
    for (let i = 0; i < this.n; i++) if (this.depth[i] < 0.999) return false;
    return true;
  }

  // contiguous stretches not cut through (x0, x1)
  gaps() {
    const out = [];
    let a = -1;
    for (let i = 0; i <= this.n; i++) {
      const open = i < this.n && this.depth[i] < 0.999;
      if (open && a < 0) a = i;
      if (!open && a >= 0) {
        out.push([a, i]);
        a = -1;
      }
    }
    return out;
  }
}

// Category of a sample from its values (Harris PN 9700208; bands seed).
export function categorize(s, coupon) {
  if (!(s.depth >= 0.999)) return 'notSevered';
  if (s.dirty) return 'dirtyTip';
  if (s.c < 1) return 'tooClose';
  if (s.c > 9) return 'tooHigh';
  if (s.Pr > 1.15) return 'tooMuchO2';
  if (s.pr > 1.35) return 'preheatHot';
  const r = s.rho;
  if (r > SPEED_BANDS.extremelyFast) return 'extremelyFast';
  if (r < SPEED_BANDS.extremelySlow) return 'extremelySlow';
  if (r > SPEED_BANDS.slightlyFast) return 'slightlyFast';
  if (r < SPEED_BANDS.slightlySlow) return 'slightlySlow';
  if (r > SPEED_BANDS.production) return 'production';
  void coupon;
  return 'perfect';
}

// Face values at a sample from the cutting conditions (seed functions, shaped after the guide's descriptions).
//   rho: speed / nominal; c: inner-cone gap (mm); Pr: cutting oxygen pressure / top of the chart range;
//   pr: preheat power / nominal; dBevel: face angle error (deg); dirty: tip dirty.
export function faceValues(coupon, k, tip = null) {
  const t = coupon.t / Math.cos((coupon.bevel || 0) * DEG);
  const { rho, c, Pr, pr } = k;
  const dragF = 0.02 + 0.18 * Math.pow(clamp((rho - 0.7) / 0.7, 0, 1.5), 1.5);
  let top = 0.1;
  if (rho < SPEED_BANDS.slightlySlow) top += 2.0 * (SPEED_BANDS.slightlySlow - rho) / 0.5;
  if (pr > 1.3) top += 1.0 * (pr - 1.3);
  if (c > 8) top += 0.08 * (c - 8);
  let dross = 0, adh = 0;
  if (rho > 1.15) {
    dross = 0.5 + 2 * (rho - 1.15);
    adh = 1;
  } else if (rho < 0.75) dross = 0.5 + 2 * (0.75 - rho) / 0.25;
  if (k.dirty) dross = Math.max(dross, 0.8);
  let pm = 0;
  if (Pr > 1.1) pm = Math.max(pm, (Pr - 1.1) / 0.4);
  if (rho < 0.6) pm = Math.max(pm, (0.6 - rho) / 0.3);
  let gr = 0;
  if (c < 1) gr = Math.max(gr, 1 - c);
  if (k.dirty) gr = Math.max(gr, 0.6);
  gr = Math.max(gr, clamp((k.speedSd || 0) - 0.15, 0, 1) * 0.8);
  const face = (k.bevelAct ?? 0) + (c > 8 ? 1.5 * Math.min(1, (c - 8) / 6) : 0);
  const conc = rho > 1.3 ? 0.3 * Math.min(2, (rho - 1.3) / 0.3) : 0;
  const tipRow = tip && tip !== coupon.row.tip ? TIP_CHART.find((r) => r.tip === tip) : null;
  const kerf = (tipRow || coupon.row).kerf * IN_MM * (1 + 0.5 * Math.max(0, Pr - 1) + 0.3 * Math.max(0, 0.85 - rho) + (c < 1 ? 0.1 : 0));
  return {
    drag: dragF * t,
    top: clamp(top, 0, 3),
    dross: clamp(dross, 0, 3),
    adh,
    pm: clamp(pm, 0, 1),
    gr: clamp(gr, 0, 1),
    face,
    conc,
    kerf,
  };
}

// The cutting session: the outfit's flame and oxygen at the torch pose, the plate's heat, the cut front.
export const LOSS_TIME = 0.25; // s above the loss speed before the cut is lost (seed)
export const FUSE_RHO = 0.35; // seed: below this speed ratio for FUSE_TIME the cut fuses together behind the jet
export const FUSE_TIME = 1.0; // s, seed (Victor 0056-0138 4.01: "Moving too slowly allows the cut to fuse together.")
export class CutSession {
  constructor({ coupon, outfit, seed = 1, thermalDt = 1 / 24, dirtyTip = false } = {}) {
    this.c = coupon;
    this.outfit = outfit;
    this.record = new CutRecord(coupon);
    this.rand = rng(seed);
    this.dirty = dirtyTip;
    // thermal grid: the plate as a 'plate' joint, s across the plate (the line at s = sLine)
    const W = coupon.drop + coupon.keep;
    this.sLine = -W / 2 + coupon.drop;
    this.thermal = new ThermalModel({ type: 'plate', L: coupon.L, t: coupon.t, width: W }, { dtMax: thermalDt });
    this.time = 0;
    this.cutting = false;
    this.lostT = 0;
    this.slowT = 0;
    this.speed = 0;
    this.v2 = 0;
    this.lastHit = null;
    this.front = null; // x of the cut front while cutting
    this.events = [];
    this.state = null;
    this.vNom = nominalSpeed(coupon);
    this.leverT = 0;
    this.pierce = 1;
    this.restartX = null;
    this.kcChart = tipData(coupon.row.tip).kc;
    const lay = this.thermal.lay;
    this.hs = lay.h; // mm per cell
    this.nxs = lay.nx;
    this.pl = lay.plates[0];
    this.E = new Float32Array(this.nxs * this.pl.ns); // top-surface excess (K) per cell
    this.tauSkin = SKIN_TAU * Math.sqrt(coupon.t / 12.7);
    this.maxTop = 0; // highest top-surface temperature at the start spot before the cut began
  }

  // cell of (x, u) in the skin field (or -1 off the plate)
  cell(x, u) {
    const i = Math.floor(x / this.hs), j = Math.floor((u + this.sLine - this.pl.s0) / this.hs);
    if (i < 0 || i >= this.nxs || j < 0 || j >= this.pl.ns) return -1;
    return j * this.nxs + i;
  }

  // distance (mm) from (x, u) to the nearest free edge: the plate edges and the kerf already cut
  edgeDist(x, u) {
    const c = this.c;
    let d = Math.min(x, c.L - x, u + c.drop, c.keep - u);
    const i0 = Math.max(0, Math.floor(x - 8)), i1 = Math.min(c.n - 1, Math.ceil(x + 8));
    for (let i = i0; i <= i1; i++) {
      if (this.record.depth[i] >= 0.999) {
        const dx = Math.max(0, Math.abs(i + 0.5 - x) - 0.5);
        const du = Math.max(0, Math.abs(u - this.record.uTop[i]) - this.record.kerf[i] / 2);
        d = Math.min(d, Math.hypot(dx, du));
      }
    }
    return Math.max(0, d);
  }

  // top-surface temperature (C): the plate average plus the excess under the flame
  surfaceT(x, u) {
    const k = this.cell(x, u);
    return this.tempAt(x, u) + (k >= 0 ? this.E[k] : 0);
  }

  // the skin field: under the flame it rises toward its equilibrium (time constant tauSkin, calibrated to the
  // preheat times); where the flame has gone it relaxes into the plate (SKIN_FALL, seed)
  skin(dt, J, Pheat) {
    const E = this.E;
    const kf = Math.exp(-dt / SKIN_FALL);
    const stamp = (this.stampN = (this.stampN || 0) + 1);
    const st = this.stampA || (this.stampA = new Uint32Array(E.length));
    if (J && Pheat > 0) {
      const hs = this.hs, a = SKIN_A;
      const eq = SKIN_GAIN * Pheat * K_SKIN;
      const kr = 1 - Math.exp(-dt / this.tauSkin);
      const r = Math.ceil((4 * a) / hs);
      const ic = Math.floor(J.x / hs), jc = Math.floor((J.u + this.sLine - this.pl.s0) / hs);
      for (let jj = jc - r; jj <= jc + r; jj++) {
        if (jj < 0 || jj >= this.pl.ns) continue;
        const u = this.pl.s0 + (jj + 0.5) * hs - this.sLine;
        for (let ii = ic - r; ii <= ic + r; ii++) {
          if (ii < 0 || ii >= this.nxs) continue;
          const x = (ii + 0.5) * hs;
          const w = skinProfile(Math.hypot(x - J.x, u - J.u), a);
          if (w < 0.01) continue;
          const target = eq * w * (1 + Math.exp(-this.edgeDist(x, u) / a));
          const k = jj * this.nxs + ii;
          st[k] = stamp;
          if (target > E[k]) E[k] += (target - E[k]) * kr;
          else E[k] += (target - E[k]) * (1 - kf);
        }
      }
    }
    for (let k = 0; k < E.length; k++) if (st[k] !== stamp && E[k] > 0.01) E[k] *= kf;
  }

  // temperature at depth d (mm) below the top surface at (x, u): the excess under the flame fades into the plate
  // average over SKIN_DEPTH (the same display seed as the plate view)
  tempAtDepth(x, u, d) {
    const k = this.cell(x, u);
    return this.tempAt(x, u) + (k >= 0 ? this.E[k] * Math.exp(-Math.max(0, d) / SKIN_DEPTH) : 0);
  }

  // temperature of the plate grid at (x, u): the through-thickness average (C)
  tempAt(x, u) {
    return this.thermal.at(clamp(x, 0, this.c.L), u + this.sLine, 0);
  }

  // Jet geometry from the tip position and direction (plate frame, mm).
  jet(tip, dir) {
    if (!tip || !dir || !(dir[2] < -0.2)) return null;
    const s = -tip[2] / dir[2]; // along the axis to the top surface
    if (!(s > -1)) return null;
    const x = tip[0] + s * dir[0];
    const u = tip[1] + s * dir[1];
    // the jet and the flame act on the plate from close to it only (30 mm, seed)
    const onPlate = s <= 30 && x >= -2 && x <= this.c.L + 2 && u >= -this.c.drop && u <= this.c.keep;
    // tilt across the cut: positive when the jet runs toward the strip (-u) as it goes down, so that the kept
    // part (u > 0) gets a bevel wider at the bottom, as a weld preparation (target `bevel`)
    const bevelAct = Math.atan2(-dir[1], -dir[2]) / DEG;
    const travel = Math.atan2(dir[0], -dir[2]) / DEG; // lead (+) / lag (-) along the cut
    return { x, u, s, onPlate, bevelAct, travel };
  }

  // cutting oxygen as the gauge pressure that would pass the same flow through the chart tip for the plate,
  // relative to the top of the chart range (a bigger tip, a higher pressure or a throttled valve all show here)
  oxygenRatio(f) {
    if (!(f.cutO2 > 0)) return 0;
    const Peq = f.cutO2 / this.kcChart - ATM_PSI;
    return Math.max(0, Peq) / this.c.row.cutP[1];
  }

  // Advance dt s with the torch tip at `tip` pointing along `dir` (unit, toward the work). Returns the state.
  update(dt, tip, dir) {
    const o = this.outfit;
    const c = this.c;
    this.events = [];
    this.time += dt;
    const J = this.jet(tip, dir);
    const flameSize = Math.max(0.3, o.flame && o.flame.size ? o.flame.size : 1);
    const coneLen = CONE_MM * Math.sqrt(flameSize);
    const cone = J ? J.s - coneLen : null;
    // outfit: flame, a backfire if the tip touches the work, tip heat from the hot plate (seed); while the cut
    // runs, the tip is over the burning front (the burning temperature of the kerf model)
    const hotT = J && J.onPlate ? Math.max(this.surfaceT(J.x, J.u), this.cutting ? KERF_EDGE_C : 0) : T_AMBIENT;
    // the tip heats up when its preheat cones are buried in hot metal (too close; seed)
    const hot = J && J.onPlate && cone != null ? clamp((hotT - 600) / 800, 0, 1) * clamp((1.5 - cone) / 1.5, 0, 1) : 0;
    const ev = o.step(dt, { tipGap: J && J.onPlate ? J.s : null, hot });
    for (const e of ev) this.events.push(e);
    const f = o.flow;
    // preheat heat into the plate
    const Pheat = o.lit && J && J.onPlate ? preheatPower(f.fuel, o.flame, cone) : 0;
    // speed along the cut (EMA, tau 0.3 s) and its spread
    if (J && this.lastHit) {
      const v = (J.x - this.lastHit.x) / Math.max(dt, 1e-4);
      const a = 1 - Math.exp(-dt / 0.3);
      this.speed += (v - this.speed) * a;
      this.v2 += (v * v - this.v2) * a;
    }
    this.lastHit = J ? { x: J.x, u: J.u } : null;
    const speedSd = Math.sqrt(Math.max(0, this.v2 - this.speed * this.speed));
    const fullO2 = o.lever >= 0.9 && f.cutO2 > 0.5;
    const Pr = this.oxygenRatio(f);
    const pr = Pheat > 0 ? Pheat / Math.max(1, preheatPower(mid(c.row.fuelQ), { type: 'neutral', separated: false }, 3)) : 0;
    const rho = this.speed / this.vNom;
    let mode = 'idle';
    if (J && J.onPlate) {
      const T = this.surfaceT(J.x, J.u);
      if (!this.cutting) this.maxTop = Math.max(this.maxTop, T);
      if (!this.cutting && fullO2) {
        if (T >= KINDLING_C) {
          // the start: at the edge, a restart in the kerf, or a pierce (the jet must go through first)
          const i = clamp(Math.floor(J.x), 0, c.n - 1);
          const atEdge = J.x <= 3;
          const restart = this.record.t[i] >= 0 || this.record.starts.length > 0;
          this.cutting = true;
          this.front = atEdge ? 0 : J.x; // a start at the edge cuts from the edge
          this.pierce = atEdge || this.record.depth[i] >= 0.999 ? 1 : 0;
          this.record.starts.push({ x: J.x, t: this.time, restart, edge: atEdge, pierce: this.pierce < 1 });
          this.restartX = restart ? J.x : null;
          this.startMelt = this.maxTop > MELT_TOP; // the corner was melted by too long a preheat (seed)
          this.maxTop = 0;
          this.events.push(restart ? 'restart' : 'start');
          this.lostT = 0;
          this.slowT = 0;
        } else if (this.leverT === 0) this.events.push('cold'); // oxygen on steel below the kindling temperature
      }
      if (this.cutting) {
        if (!fullO2) {
          this.cutting = false;
          this.events.push('stop');
        } else {
          if (this.pierce < 1) {
            this.pierce = Math.min(1, this.pierce + (dt * 2.5) / c.t); // seed pierce rate 2.5 mm/s
            if (this.pierce >= 1) this.events.push('pierced');
          }
          const vMax = this.maxSpeed(cone, Pr, pr, J);
          // the conditions' capacity: a weak oxygen stream or preheat, or a high tip, cut like a faster travel
          const cap = vMax / (chartSpeedRange(c)[1] * 1.4);
          const rhoEff = rho / Math.max(0.2, Math.min(1, cap));
          this.lostT = this.speed > vMax ? this.lostT + dt : Math.max(0, this.lostT - dt);
          this.slowT = this.pierce >= 1 && rho < FUSE_RHO ? this.slowT + dt : 0;
          if (this.lostT > LOSS_TIME) {
            this.cutting = false;
            this.record.losses.push({ x: J.x, t: this.time });
            this.events.push('lost');
          } else {
            mode = this.pierce < 1 ? 'pierce' : 'cut';
            const k = { rho: rhoEff, c: cone, Pr, pr, dirty: this.dirty, speedSd: speedSd / Math.max(this.vNom, 1e-3), bevelAct: J.bevelAct };
            const fv = faceValues(c, k, o.tip);
            const fused = this.slowT > FUSE_TIME;
            const depth = fused ? 0.9 : this.pierce;
            const cat = CATEGORY_ORDER.indexOf(categorize({ depth, dirty: this.dirty, c: cone, Pr, pr, rho: rhoEff }, c));
            const a = Math.min(this.front, J.x), b = Math.max(this.front, J.x);
            for (let i = Math.max(0, Math.floor(a)); i <= Math.min(c.n - 1, Math.floor(b)); i++) {
              const s = { ...fv, depth, uTop: J.u, v: this.speed, cg: cone, P: f.Po, t: this.time, cat, restart: 0 };
              if (this.restartX != null && Math.abs(i + 0.5 - this.restartX) < 2) {
                s.gr = Math.max(s.gr, 0.7); // the restart leaves a gouge (seed)
                s.restart = 1;
              }
              const st0 = this.record.starts[this.record.starts.length - 1];
              if (this.startMelt && st0 && Math.abs(i + 0.5 - st0.x) < 4) s.top = Math.max(s.top, 1.5); // melted corner at the start
              this.record.write(i, s);
            }
            if (fused) {
              if (!this.fusing) this.events.push('fused');
              this.fusing = true;
              this.record.fuse(J.x - 3, J.x);
            } else this.fusing = false;
            this.front = J.x;
            // the burning front heats the kerf walls (seed: 6 W per mm of thickness per mm/s)
            this.thermal.addArc(dt, clamp(J.x, 0, c.L), J.u + this.sLine, 0, 6 * c.t * Math.max(0.5, Math.abs(this.speed)), 2.5);
            if (J.x >= c.L - 0.5 && this.record.severedAt == null && this.record.severed()) {
              this.record.severedAt = this.time;
              this.events.push('severed');
            }
          }
        }
      }
      if (Pheat > 0) this.thermal.addArc(dt, clamp(J.x, 0, c.L), J.u + this.sLine, 0, Pheat, 4);
      this.skin(dt, J, Pheat);
    } else {
      if (this.cutting) {
        this.cutting = false;
        this.events.push('stop');
      }
      this.skin(dt, null, 0);
    }
    this.leverT = fullO2 ? this.leverT + dt : 0;
    this.thermal.advance(dt);
    const out = {
      J, cone, flame: o.flame, lit: o.lit, flow: f, lever: o.lever, cutting: this.cutting, mode, speed: this.speed, rho,
      Pheat, T: J && J.onPlate ? this.surfaceT(J.x, J.u) : null, Pr, pr, events: this.events,
      through: this.cutting && this.pierce >= 1, vNom: this.vNom,
    };
    this.state = out;
    return out;
  }

  // Speed above which the cut is lost (mm/s, seed): the top of the chart range x 1.4, less with low cutting
  // oxygen, a weak or missing preheat flame, the tip held too high (Harris: "Cutting speed is reduced because of
  // the danger of losing the cut"), a steep travel angle or a dirty tip.
  maxSpeed(cone, Pr, pr, J) {
    const c = this.c;
    const vHi = chartSpeedRange(c)[1];
    const fO2 = clamp(Math.sqrt(Math.max(0, Pr) / 0.93), 0.4, 1.2);
    const fPre = this.outfit.lit ? clamp(0.6 + 0.4 * pr, 0.6, 1.1) : 0.35;
    const fCone = cone == null ? 1 : cone <= 6 ? 1 : clamp(1 - (cone - 6) / 22, 0.55, 1);
    const fAng = J ? clamp(1 - Math.max(0, Math.abs(J.travel) - 20) / 40, 0.5, 1) : 1;
    const fDirt = this.dirty ? 0.8 : 1;
    return vHi * 1.4 * fO2 * fPre * fCone * fAng * fDirt;
  }
}

// ---- evaluation ------------------------------------------------------------------------------------------
// Summary of a cut: categories along it, through cut, slag, top edge, ISO 9013 u and range, line accuracy.
export function summarizeCut(rec, opts = {}) {
  const c = rec.coupon;
  const n = rec.n;
  const a = c.t / Math.cos((c.bevel || 0) * DEG);
  const evalA = opts.trim ?? 5; // mm left out at each end (start and run-off)
  const cats = {};
  let len = 0, okLen = 0, uMax = 0, topMax = 0, drossAdh = 0, drossLen = 0, devMax = 0, dev15 = 0, kerfSum = 0, cnt = 0;
  const uVals = [];
  for (let i = evalA; i < n - evalA; i++) {
    len++;
    const k = rec.cat[i] >= 0 ? CATEGORY_ORDER[rec.cat[i]] : 'notSevered';
    cats[k] = (cats[k] || 0) + 1;
    if (CUT_CATEGORIES[k].ok) okLen++;
    if (rec.depth[i] >= 0.999) {
      const u = a * Math.abs(Math.tan((rec.face[i] - (c.bevel || 0)) * DEG)) + rec.conc[i] + 0.1 * rec.top[i];
      uVals.push(u);
      uMax = Math.max(uMax, u);
      topMax = Math.max(topMax, rec.top[i]);
      if (rec.adh[i] > 0 && rec.dross[i] > 0) drossAdh++;
      if (rec.dross[i] > 0) drossLen++;
      const dv = Math.abs(rec.uTop[i]);
      devMax = Math.max(devMax, dv);
      if (dv > 1.5) dev15++;
      kerfSum += rec.kerf[i];
      cnt++;
    }
  }
  uVals.sort((p, q) => p - q);
  const u95 = uVals.length ? uVals[Math.min(uVals.length - 1, Math.floor(0.95 * uVals.length))] : null;
  return {
    a, len, trim: evalA, cats, okShare: len ? okLen / len : 0, severed: rec.severed(), gaps: rec.gaps(), starts: rec.starts.length,
    restarts: rec.starts.filter((s) => s.restart).length, losses: rec.losses.length,
    u: uMax, u95, range: u95 != null ? iso9013Range(u95, a) : null, topMax, drossAdhShare: len ? drossAdh / len : 0,
    drossShare: len ? drossLen / len : 0, devMax, devShare: len ? dev15 / len : 0, kerf: cnt ? kerfSum / cnt : null,
  };
}
