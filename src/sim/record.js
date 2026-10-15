// Weld record: deposition along the joint, per-sample bead geometry and imperfections.
// Every 1 mm sample keeps volume-weighted means of the technique and arc conditions that
// deposited it. Geometry and imperfections are derived from those means with explicit,
// labelled seed rules (see README "Model status"). Discrete events (pores, spatter, craters,
// arc strikes) use per-sample seeded random streams, so a recorded attempt re-scores identically.
//
// Thermal coupling (this release): each sample also keeps the local plate temperature before the
// arc arrived (T0, from the coupon heat-flow model) and the weld-pool width (Rosenthal moving
// source). Hotter plate -> wider pool -> wider, flatter bead and deeper fusion; a wider pool is
// more fluid, so gravity effects out of position scale with (pool width / reference)^2. Both
// factors equal 1 on a cold plate at the reference pool width, so the calibrated behaviour of the
// earlier build is unchanged at those conditions.

import { clamp, rng, hashSeed, poisson, valueNoise1D, DEG } from './util.js';
import { depositionRate, penetration, PROCESSES } from './process.js';
import { levelForArea, grooveWidthAt, grooveAreaBelow } from './joint.js';
import { T_LIQ, T_AMBIENT } from './material.js';
import { wrapIndex, wrapX, diffX, metricAt } from './pipe.js';

const S2 = Math.SQRT1_2;
const KEYS = ['dU', 'wet', 'I', 'U', 'stab', 'spray', 'glob', 'wa', 'ta', 'aim', 'ctwd', 'shield', 'contam',
  'weave', 'dwell', 'speed', 'vt', 'cold', 'spat', 'time', 'T0', 'pw', 'uc', 'smaw', 'pen', 'ihi', 'gtaw',
  // gravity in the joint frame where the metal was laid (pipe joints: it changes around the pipe)
  'gt', 'gu', 'gv',
  // share of the metal laid while weaving without a pause at the toes
  'nodw'];
// Weave without a pause at the toes (undercut seed rule): weave amplitude above WEAVE_NODW_AMP mm with a toe
// dwell share below WEAVE_DWELL_MIN (a weave with a pause at each side spends about 70% of its time near
// the edges, a plain sine about 35%: session.js). seed values
export const WEAVE_NODW_AMP = 1.5;
export const WEAVE_DWELL_MIN = 0.55;

// Share of an open root's section left in the gap where its start or end is ground to a feathered edge
// (the gap is not ground open again). seed
export const FEATHER_ROOT_KEEP = 0.35;
export const POOL_W_REF = 7.5; // mm, reference pool width for the gravity (fluidity) factor. seed
const CRATER_FILL_MM = 2.0; // crater volume = pass section x this length (mm). seed
// Open root (pipe): penetration reach through the land K = OPEN_ROOT_K x F x sqrt(gap / 3.2 mm) / land;
// at K = OPEN_ROOT_NOM the inside bead in a vertical position is the C2.420 minimum (1.6 mm); above
// OPEN_ROOT_BURN the root burns through. All seeds, tuned on the scripted root run of the training WPS.
export const OPEN_ROOT_K = 2.4;
export const OPEN_ROOT_NOM = 1.3;
export const OPEN_ROOT_BURN = 1.95;
const INSIDE_TARGET = 1.6; // mm

// Width scale from preheat: Rosenthal half-width r^2 ~ 1 / (Tm - T0) at high travel-speed number.
export function thermalWidthFactor(T0) {
  return Math.sqrt((T_LIQ - T_AMBIENT) / Math.max(150, T_LIQ - Math.max(T_AMBIENT, T0)));
}

// Gravity (fluidity) factor from pool width: 1 up to the reference width (the calibrated
// behaviour), then rising as (width / reference)^2 (Bond number ~ width^2). seed
export function fluidityFactor(pw) {
  if (!(pw > POOL_W_REF)) return 1;
  return clamp((pw / POOL_W_REF) ** 2, 1, 3);
}

function makePass(n, index, kind, target) {
  const acc = {};
  for (const k of KEYS) acc[k] = new Float32Array(n);
  return {
    index, kind, target,
    area: new Float32Array(n), // mm^2 deposited in this pass
    energy: new Float32Array(n), // J/mm
    // open root: energy laid here by the current run over the sample, and the most any one run laid
    // (a run that comes back over frozen metal of the same pass, at a tie-in or restart, starts a new
    // count); the root is formed by the run that penetrated best, not by the sum of the runs
    eRun: new Float32Array(n),
    eBest: new Float32Array(n),
    aRun: new Float32Array(n), // area laid by the current run over the sample
    rewelded: new Uint8Array(n),
    weight: new Float32Array(n), // deposited volume per sample (weighting)
    tFirst: new Float32Array(n).fill(-1),
    tLast: new Float32Array(n).fill(-1),
    acc,
    dirty: new Uint8Array(n),
    cache: new Array(n).fill(null),
    events: new Array(n).fill(null),
    stops: [],
    starts: [],
    cleaned: false,
    cleanMask: new Uint8Array(n), // samples brushed clean of slag
    // SMAW slag is chipped off before brushing (Hobart/Miller 155095F: "Use a chipping hammer and wire
    // brush to remove slag"): samples whose bulk slag has been chipped off
    chipMask: new Uint8Array(n),
    chipFirst: false,
    coldMin: new Float32Array(n).fill(1), // lowest cold-start factor of metal laid here (cold lap)
    closed: false,
    lane: null, // bead-on-plate lane centre (u, mm)
    interpass: null, // plate temperature next to the joint at the first arc start (C)
  };
}

export class WeldRecord {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.seed = opts.seed ?? 12345;
    this.passes = [];
    this.arcStrikes = [];
    this.time = 0;
    this.noise = valueNoise1D(this.seed, 9);
    this.stillV = 0; // metal laid during the current still dwell (crater fill)
    this.craterOpen = null; // restart over a crater left unfilled: {s, room} (arcStart)
    this.newPass();
  }

  get pass() {
    return this.passes[this.passes.length - 1];
  }

  newPass() {
    const j = this.joint;
    const k = this.passes.length;
    const plan = j.passPlan[Math.min(k, j.passPlan.length - 1)];
    if (this.passes.length) this.pass.closed = true;
    this.passes.push(makePass(j.n, k, plan.kind, plan.target));
    return this.pass;
  }

  // Sample indices i0..i1 (inclusive): clamped to the joint on plates, wrapped round on a pipe.
  range(i0, i1) {
    const j = this.joint;
    const out = [];
    if (j.pipe) {
      const n = Math.min(j.n, i1 - i0 + 1);
      for (let q = 0; q < n; q++) out.push(wrapIndex(j, i0 + q));
    } else for (let i = Math.max(0, i0); i <= Math.min(j.n - 1, i1); i++) out.push(i);
    return out;
  }

  canAddPass() {
    if (this.joint.type === 'plate') return this.passes.length < 12;
    return this.joint.type === 'butt' && this.passes.length < 6;
  }

  // Remove slag from the current top pass (chipping hammer and wire brush, done completely).
  clean() {
    this.pass.cleaned = true;
    this.pass.cleanMask.fill(1);
    this.pass.chipMask.fill(1);
  }

  // Exposed pass at sample i (on a pad: the last bead under the tool), or -1.
  exposedPass(i, u) {
    if (this.joint.type === 'plate') {
      const ks = this.passesAt(i, u);
      return ks.length ? ks[ks.length - 1] : -1;
    }
    return this.topPassAt(i);
  }

  // Chipping hammer blow over samples i0..i1: knocks the bulk slag off (SMAW); flux-cored slag
  // comes off completely. Returns the number of samples changed.
  chip(i0, i1, u = null) {
    let n = 0;
    const touched = new Set();
    for (const i of this.range(i0, i1)) {
      const k = this.exposedPass(i, u);
      if (k < 0) continue;
      const p = this.passes[k];
      if (!p.slagProcess || p.cleanMask[i] || !(p.area[i] > 0.05)) continue;
      if (p.chipFirst) {
        if (p.chipMask[i]) continue;
        p.chipMask[i] = 1;
      } else p.cleanMask[i] = 1;
      p.cache[i] = null;
      touched.add(k);
      n++;
    }
    for (const k of touched) this.updateCleaned(k);
    return n;
  }

  // Brush the visible pass at samples i0..i1. Returns the number of newly cleaned samples; samples of
  // SMAW slag that has not been chipped yet stay (count in this.lastBrushBlocked).
  brush(i0, i1, u = null) {
    let n = 0;
    this.lastBrushBlocked = 0;
    const touched = new Set();
    for (const i of this.range(i0, i1)) {
      // only the exposed bead can be brushed (on a pad: the last bead under the brush)
      const k = this.exposedPass(i, u);
      if (k < 0) continue;
      const p = this.passes[k];
      if (!p.slagProcess || p.cleanMask[i]) continue;
      if (p.chipFirst && !p.chipMask[i]) {
        if (p.area[i] > 0.05) this.lastBrushBlocked++;
        continue;
      }
      p.cleanMask[i] = 1;
      p.cache[i] = null;
      touched.add(k);
      n++;
    }
    for (const k of touched) this.updateCleaned(k);
    return n;
  }

  updateCleaned(k) {
    const p = this.passes[k];
    let dep = 0, cl = 0;
    for (let i = 0; i < this.joint.n; i++) {
      if (p.area[i] > 0.05) {
        dep++;
        if (p.cleanMask[i]) cl++;
      }
    }
    if (dep > 0 && cl / dep >= 0.95) p.cleaned = true;
  }

  // Fraction of the deposited length of pass k with its bulk slag chipped off (1 when no chipping
  // is needed).
  chipFraction(k = this.passes.length - 1) {
    const p = this.passes[k];
    if (!p.slagProcess || !p.chipFirst || p.cleaned) return 1;
    let dep = 0, ch = 0;
    for (let i = 0; i < this.joint.n; i++) {
      if (p.area[i] > 0.05) {
        dep++;
        if (p.chipMask[i] || p.cleanMask[i]) ch++;
      }
    }
    return dep ? ch / dep : 1;
  }

  // Fraction of the deposited length of pass k that is free of slag.
  cleanFraction(k = this.passes.length - 1) {
    const p = this.passes[k];
    if (!p.slagProcess || p.cleaned) return 1;
    let dep = 0, cl = 0;
    for (let i = 0; i < this.joint.n; i++) {
      if (p.area[i] > 0.05) {
        dep++;
        if (p.cleanMask[i]) cl++;
      }
    }
    return dep ? cl / dep : 1;
  }

  // Deposit metal for one frame. `arc` = arcState(); `tech` = technique metrics;
  // `env.contamAt(s)` = 0..1 contamination at that position.
  deposit(dt, sPool, settings, arc, tech, env = {}) {
    const j = this.joint;
    const p = this.pass;
    p.process = settings.process;
    p.slagProcess = PROCESSES[settings.process].slag;
    p.chipFirst = settings.process === '111';
    if (arc.coating) p.coating = arc.coating; // SMAW electrode coating type (slag look)
    const vdot = arc.vdot ?? depositionRate(settings, arc.mode); // mm^3/s (SMAW: from the electrode data)
    let dV = vdot * dt;
    // Crater fill: metal laid while the arc is held still at the end of a run first fills the crater
    // the pool would leave behind; only the rest builds the bead up. Crater volume taken as the pass
    // section x CRATER_FILL_MM (seed).
    if (tech.still) {
      const room = Math.max(0, p.target * CRATER_FILL_MM - this.stillV);
      this.stillV += dV;
      dV -= Math.min(room, dV);
    } else this.stillV = 0;
    // restart over a crater left unfilled: the metal the pool lays on it first fills it
    const co = this.craterOpen;
    if (co && co.room > 0 && Math.abs(diffX(j, sPool, co.s)) <= 3) {
      const use = Math.min(co.room, dV);
      co.room -= use;
      dV -= use;
    }
    const dE = arc.k * arc.U * arc.I * dt; // J
    const vt = vdot / p.target; // target travel speed for this pass (mm/s)
    const halfLen = clamp(2.2 + 0.25 * Math.sqrt(p.target), 2.5, 5); // pool half-length (mm). seed
    // pipe: the joint is closed, the pool spreads across x = 0 / L
    const pipe = !!j.pipe;
    const i0 = pipe ? Math.floor(sPool - halfLen) : Math.max(0, Math.floor(sPool - halfLen));
    const i1 = pipe ? Math.ceil(sPool + halfLen) : Math.min(j.n - 1, Math.ceil(sPool + halfLen));
    let wsum = 0;
    const ws = [];
    for (let i = i0; i <= i1; i++) {
      const w = Math.max(0, 1 - Math.abs(i + 0.5 - sPool) / halfLen);
      ws.push(w);
      wsum += w;
    }
    if (wsum <= 0) return;
    const contam = Math.max(env.contamAt ? env.contamAt(sPool) : 0, arc.contam ?? 0);
    const vals = {
      dU: arc.dU, wet: arc.wetting, I: arc.I, U: arc.U, stab: arc.stability,
      spray: arc.mode === 'spray' ? 1 : 0, glob: arc.mode === 'globular' ? 1 : 0,
      wa: tech.workAngle, ta: tech.travelAngle, aim: tech.aim, ctwd: tech.ctwd, shield: arc.shielding,
      contam, weave: tech.weaveAmp, dwell: tech.toeDwell, speed: Math.max(0, tech.speed), vt,
      cold: tech.coldStart ?? 1, T0: tech.T0 ?? T_AMBIENT, pw: tech.poolW ?? POOL_W_REF, uc: tech.u ?? 0,
      // SMAW: electrode penetration factor and the current above which undercut grows (top of the
      // data-sheet range: Kobelco, "welding current is too high")
      smaw: arc.mode === 'smaw' ? 1 : 0, pen: arc.pen ?? 1, ihi: arc.Ihi ?? 0,
      // GTAW: an oxidised filler-rod end melted into the pool acts as contamination (porosity)
      gtaw: arc.mode === 'gtaw' ? 1 : 0,
      gt: (tech.g || j.gravity).t, gu: (tech.g || j.gravity).u, gv: (tech.g || j.gravity).v,
      nodw: tech.weaveAmp > WEAVE_NODW_AMP && tech.toeDwell < WEAVE_DWELL_MIN ? 1 : 0,
    };
    // pipe: a sample (1 mm of x at the outside surface) is shorter at the level the metal is laid
    const lenS = pipe ? j.ds * metricAt(j, tech.v ?? 0) : j.ds;
    for (let ii = i0, q = 0; ii <= i1; ii++, q++) {
      const w = ws[q] / wsum;
      if (w <= 0) continue;
      const i = pipe ? wrapIndex(j, ii) : ii;
      const dA = (dV * w) / lenS;
      p.area[i] += dA;
      p.energy[i] += (dE * w) / lenS;
      if (p.tLast[i] >= 0 && this.time - p.tLast[i] > 1.0) {
        p.rewelded[i] = 1; // the earlier metal has frozen: a new run over this sample
        p.eRun[i] = 0;
        p.aRun[i] = 0;
        // pipe: a run going over frozen metal of its own pass (the second half over the first half's start
        // or end) remelts it; how cold that metal was laid no longer decides its fusion
        if (pipe) p.coldMin[i] = 1;
      }
      p.eRun[i] += (dE * w) / lenS;
      p.aRun[i] += dA;
      if (p.eRun[i] > p.eBest[i]) p.eBest[i] = p.eRun[i];
      p.weight[i] += dA;
      for (const k in vals) p.acc[k][i] += vals[k] * dA;
      p.acc.time[i] += dt * w;
      p.acc.spat[i] += arc.spatterRate * dt * w;
      // a cold start laid here (cold lap). GTAW with no filler going in lays no metal to lap: the arc held on
      // the crater of a restart until the pool matches it, before filler is added (weldingtipsandtricks.com,
      // "TIG restarts")
      if (w > 0.15 && vals.cold < p.coldMin[i] && (dA > 0 || !vals.gtaw)) p.coldMin[i] = vals.cold;
      if (p.tFirst[i] < 0) p.tFirst[i] = this.time;
      p.tLast[i] = this.time;
      p.dirty[i] = 1;
      p.cache[i] = null;
    }
    // later passes on a bead-on-plate pad sit on this one: their base depends on it
    if (j.type === 'plate') for (let k = p.index + 1; k < this.passes.length; k++) for (let i = i0; i <= i1; i++) this.passes[k].cache[i] = null;
  }

  tick(dt) {
    this.time += dt;
  }

  mean(p, key, i) {
    const w = p.weight[i];
    return w > 0 ? p.acc[key][i] / w : 0;
  }

  // Sample truth: geometry and imperfection features of pass p at sample i.
  sample(pi, i) {
    const p = this.passes[pi];
    if (p.cache[i]) return p.cache[i];
    const s = this.compute(pi, i);
    p.cache[i] = s;
    return s;
  }

  compute(pi, i) {
    const j = this.joint;
    const p = this.passes[pi];
    const A = p.area[i];
    if (A <= 0.05) return null;
    const m = (k) => this.mean(p, k, i);
    const dU = m('dU'), wet = m('wet'), I = m('I'), U = m('U');
    const wa = m('wa'), ta = m('ta'), aim = m('aim');
    const shield = m('shield'), contam = m('contam'), weave = m('weave'), dwell = m('dwell'), nodw = m('nodw');
    const speed = m('speed'), vt = Math.max(0.3, m('vt')), cold = m('cold');
    const spray = m('spray'), glob = m('glob'), smawF = m('smaw'), gtawF = m('gtaw');
    const T0 = m('T0') || T_AMBIENT, pw = m('pw') || POOL_W_REF;
    const mode = smawF > 0.5 ? 'smaw' : gtawF > 0.5 ? 'gtaw' : spray > 0.5 ? 'spray' : glob > 0.5 ? 'globular' : 'short';
    const Ihi0 = mode === 'smaw' || mode === 'gtaw' ? m('ihi') || 200 : mode === 'spray' ? 330 : 240;
    // gravity in the joint frame where the metal was laid (constant on plates); the position flags the
    // plate joints carry are taken from it on a pipe (positionClassAt thresholds)
    const g = j.pipe ? { t: m('gt'), u: m('gu'), v: m('gv') } : j.gravity;
    const overhead = j.pipe ? g.v > 0.5 : j.overhead;
    const vertical = j.pipe ? Math.abs(g.t) > 0.6 : j.vertical;
    const fT = thermalWidthFactor(T0);
    const Fg = fluidityFactor(pw);

    // ---- Penetration and fusion ------------------------------------------------------------
    const Q = p.energy[i] / 1000; // kJ/mm actually delivered at this sample
    const P = penetration(I, Q, mode, ta, dU, mode === 'smaw' || mode === 'gtaw' ? m('pen') || 1 : 1) * fT;
    const vRatio = speed / vt;
    // Pool running ahead of the arc (cold lap): slow travel, downhill, cold arc. seed rule
    const vCrit = 0.55 * (1 + 1.0 * Math.max(0, g.t)); // downhill needs faster travel to stay ahead
    let fCold = vRatio >= vCrit ? 1 : Math.pow(Math.max(vRatio, 0.02) / vCrit, mode === 'short' ? 1.5 : 0.4);
    if (mode === 'short' && g.t > 0.5) fCold *= 0.85; // short-circuit downhill: pool tends to lead
    fCold *= clamp(1 + 0.08 * Math.min(0, dU + 1), 0.5, 1);
    // Short-circuit transfer on thick sections: low-energy runs fuse poorly into the previous pass
    // and the side walls (cold lap). seed rule
    const fShort = mode === 'short' && j.t >= 8 ? clamp((I / 170) ** 2, 0.35, 1) : 1;
    const F = P * fCold * cold * fShort; // effective fusion depth (mm)

    const coldLow = p.coldMin[i]; // a cold start laid here at some moment (cold lap at a start)
    const out = { pass: pi, i, A, P, F, fCold, I, U, dU, mode, wa, ta, aim, speed, vt, shield, T0, pw, fT, Fg, cold, coldLow, weave, dwell, nodw, ihi: Ihi0 };
    const nz = this.noise(i + pi * 37);

    if (j.type === 'plate') {
      this.computePlate(pi, i, out, { A, wet, weave, dwell, nodw, dU, I, mode, vRatio, fCold, F, nz, p, fT });
    } else if (j.type === 'fillet') {
      // Leg ratio: gravity sag toward +u (base) reduces the web leg; torch angle and aim shift metal.
      let r = Math.exp(-0.2 * g.u * Fg);
      r *= Math.exp(0.022 * (45 - wa));
      r *= Math.exp(-0.12 * aim);
      r = clamp(r, 0.4, 2.5);
      let c = 0.15 * Math.sqrt(A) * (1 - 1.6 * (wet - 0.5)) + 0.5 * Math.max(0, g.v) * Fg;
      if (g.t < -0.5 && weave < 1) c += 0.3 * Fg; // uphill without weave builds convexity. seed
      c -= 0.8 * (fT - 1); // a hotter, wider pool wets out flatter. seed
      c = clamp(c, -1.5, 4);
      // Area = triangle 0.5*r*z1^2 + face cap (2/3)*c*hyp, hyp = z1*sqrt(1+r^2); concave c < 0.
      const k = (2 / 3) * c * Math.sqrt(1 + r * r);
      const z1 = Math.max(0.3, (-k + Math.sqrt(Math.max(0, k * k + 2 * r * A))) / r);
      const z2 = r * z1;
      const b = Math.hypot(z1, z2);
      const aTh = (z1 * z2) / b;
      const aA = aTh + c;
      const capAng = Math.atan((4 * c) / b) / DEG;
      out.z1 = z1; out.z2 = z2; out.c = c; out.b = b; out.aA = aA; out.wb = b;
      out.toe1 = 180 - (Math.atan(z2 / z1) / DEG + capAng);
      out.toe2 = 180 - (Math.atan(z1 / z2) / DEG + capAng);
      // Root fusion depends on aim at the root (internal, visible on a macro section).
      const Froot = F * Math.exp(-((aim / 3) ** 2));
      out.lofRoot = Froot < 0.5 ? clamp(0.5 - Froot + 0.3, 0.2, 2.5) : 0;
      // Surface cold lap at the lower toe(s).
      out.lofSurface = fCold < 0.6 || (dU < -3.5 && I < 140) || coldLow < 0.8 ? 1 : 0;
      // Undercut (seed rules; see README).
      const vtR = Math.max(0, vRatio - 1.25);
      const Ihi = Ihi0;
      let ucB = 0.22 * Math.max(0, dU - 1.0) + 0.9 * vtR + 0.5 * Math.max(0, (I - Ihi) / 100);
      ucB += 0.3 * nodw; // weave without a pause at the toes (share of the metal laid so). seed
      let uc1 = ucB + 0.05 * Math.max(0, wa - 45 - 8) + 0.15 * Math.max(0, aim - 1.5);
      let uc2 = ucB + 0.05 * Math.max(0, 45 - wa - 5) + 0.15 * Math.max(0, -aim - 1);
      if (g.u > 0) uc2 *= 1 + 0.5 * g.u * Fg; // upper toe (web) on PB
      else if (g.u < 0) uc1 *= 1 + 0.5 * -g.u * Fg; // upper toe on PD
      if (overhead) { uc1 *= 1 + 0.2 * Fg; uc2 *= 1 + 0.2 * Fg; }
      if (vertical) { uc1 *= 1 + 0.1 * Fg; uc2 *= 1 + 0.1 * Fg; }
      const vary = 0.75 + 0.5 * nz;
      uc1 *= vary; uc2 *= vary;
      out.uc1 = uc1 < 0.08 ? 0 : Math.min(uc1, 2.5);
      out.uc2 = uc2 < 0.08 ? 0 : Math.min(uc2, 2.5);
      // Overlap at the lower toe when the pool is large and cold, or sags out of position.
      const aR = A / p.target;
      let ov = 0;
      if (aR > 1.25 && (dU < -0.5 || vRatio < 0.75)) ov = clamp(0.25 * (aR - 1.2) * b, 0, 3);
      if (Fg > 1.4 && (Math.abs(g.u) > 0.3 || overhead || vertical)) ov += clamp(0.6 * (Fg - 1.4), 0, 2); // seed
      if (out.lofSurface) ov += 0.5;
      // Lower toe: gravity toward +u (PB) puts it on the base plate, toward -u (PD) on the web.
      out.ov1 = g.u > 0.2 ? ov : g.u < -0.2 ? 0 : ov * 0.5;
      out.ov2 = g.u < -0.2 ? ov : g.u > 0.2 ? 0 : ov * 0.5;
      out.surface = true;
    } else {
      // ---- Butt groove, multi-pass -----------------------------------------------------------
      // Open root (pipe, no backing): part of the root run's metal goes through the gap and forms the
      // inside bead; a root that does not penetrate leaves the bottom of the gap empty. Either way the
      // groove levels above are shifted by that area.
      let rootOff = 0;
      if (j.openRoot) {
        if (pi === 0) {
          // the root forms under the run that first went over the gap; a later run over it (a tie-in or
          // restart) remelts the face side of that metal
          const F1 = p.rewelded[i] ? F * Math.pow(Math.max(p.eBest[i], 1) / Math.max(p.energy[i], 1), 0.35) : F;
          this.openRootSide(out, { F: F1, aim, g, Fg, A });
        }
        const r0 = pi === 0 ? out : this.sample(0, i);
        rootOff = r0 && r0.rootA != null ? r0.rootA - r0.voidA : 0;
      }
      let cum = -rootOff;
      for (let k = 0; k <= pi; k++) cum += this.passes[k].area[i];
      let below = -rootOff;
      for (let k = 0; k < pi; k++) below += this.passes[k].area[i];
      const levelPrev = below > 0 ? levelForArea(j, below) : -j.t;
      const groove = j.grooveArea;
      const W0 = 1.6 * Math.sqrt(A) * (0.8 + 0.5 * wet) * fT;
      const wb = W0 + 1.6 * weave;
      out.wb = wb;
      out.levelPrev = levelPrev;
      if (cum <= groove) {
        const level = levelForArea(j, cum);
        out.level = level;
        out.c = clamp(0.12 * Math.sqrt(A) * (1 - 1.4 * (wet - 0.5)), -0.5, 2);
        out.h = 0;
        out.fill = -level; // depth below plate face (mm), incompletely filled groove 511 if final
        out.surface = level > -0.8; // a pass near the face is a surface pass
      } else {
        const excess = cum - groove;
        const wcap = (j.topWidth + 2 * (1 + 2 * wet)) * Math.sqrt(fT) + 1.2 * weave;
        out.level = 0;
        out.wcap = wcap;
        out.h = (1.5 * excess) / wcap; // reinforcement height (parabolic cap)
        if (g.v > 0.5) out.h *= 1 + 0.15 * Fg; // overhead caps sag. seed
        out.c = out.h;
        out.fill = 0;
        out.surface = true;
        out.toe1 = 180 - Math.atan((4 * out.h) / wcap) / DEG;
        out.toe2 = out.toe1;
      }
      // Fusion to the root faces and backing (root pass), side walls, and previous pass.
      out.lofRoot = 0;
      out.lofSide1 = 0;
      out.lofSide2 = 0;
      out.lofInter = 0;
      if (pi === 0 && j.openRoot) {
        out.lofRoot = Math.max(out.lofRoot1, out.lofRoot2); // a land not fused at the root (open root)
      } else if (pi === 0) {
        const Froot = F * Math.exp(-((aim / 2.5) ** 2)) * (wb >= j.rootGap + 1 ? 1 : 0.6);
        if (Froot < 0.6) out.lofRoot = clamp(0.8 - Froot + 0.4, 0.3, 3);
      } else if (F < 0.6) {
        out.lofInter = clamp(0.7 - F + 0.3, 0.2, 1.5);
      }
      if (levelPrev > -j.t + j.rootFace - 0.01 || pi > 0) {
        const lv = out.level;
        const Wlev = grooveWidthAt(j, Math.min(lv, 0));
        if (wb < Wlev - 0.6 && cum <= groove * 1.02) {
          const th = clamp((lv - levelPrev) * 0.9, 0.5, 4);
          if (aim > 1) out.lofSide1 = th;
          else if (aim < -1) out.lofSide2 = th;
          else { out.lofSide1 = th; out.lofSide2 = th; }
        } else if (F < 0.45) {
          if (aim > 0.5) out.lofSide1 = 1.0;
          else if (aim < -0.5) out.lofSide2 = 1.0;
        }
      }
      // Undercut on the cap toes only.
      if (cum > groove) {
        const vtR = Math.max(0, vRatio - 1.25);
        const Ihi = Ihi0;
        let ucB = 0.22 * Math.max(0, dU - 1.0) + 0.9 * vtR + 0.5 * Math.max(0, (I - Ihi) / 100);
        ucB += 0.3 * nodw; // weave without a pause at the toes (share of the metal laid so). seed
        let uc1 = ucB + 0.12 * Math.max(0, -aim - 2);
        let uc2 = ucB + 0.12 * Math.max(0, aim - 2);
        if (g.u < -0.2) uc2 *= 1 + 0.5 * -g.u * Fg; // PC: upper plate (+u) toe
        else if (g.u > 0.2) uc1 *= 1 + 0.5 * g.u * Fg;
        if (overhead) { uc1 *= 1 + 0.2 * Fg; uc2 *= 1 + 0.2 * Fg; }
        const vary = 0.75 + 0.5 * nz;
        uc1 *= vary; uc2 *= vary;
        out.uc1 = uc1 < 0.08 ? 0 : Math.min(uc1, 2.5);
        out.uc2 = uc2 < 0.08 ? 0 : Math.min(uc2, 2.5);
        // Overlap at the lower toe in PC, or anywhere when the cap is large and cold.
        const aR = A / p.target;
        let ov = 0;
        if (aR > 1.3 && (dU < -0.5 || vRatio < 0.75)) ov = clamp(0.2 * (aR - 1.25) * (out.wcap || 10), 0, 3);
        if (fCold < 0.6) ov += 0.4;
        if (Fg > 1.4 && (Math.abs(g.u) > 0.3 || overhead || vertical)) ov += clamp(0.6 * (Fg - 1.4), 0, 2); // seed
        out.ov1 = g.u < -0.2 ? ov : ov * 0.5;
        out.ov2 = g.u < -0.2 ? 0 : ov * 0.5;
      } else {
        out.uc1 = 0; out.uc2 = 0; out.ov1 = 0; out.ov2 = 0;
      }
      out.lofSurface = cum > groove && (fCold < 0.55 || coldLow < 0.8) ? 1 : 0;
    }

    // ---- Solidification cracking (deep, narrow beads at high current). seed rule ------------
    const depthToWidth = (P + Math.sqrt(A) * 0.8) / Math.max(out.wb, 1);
    out.dtw = depthToWidth;
    out.crackCentre = 0;
    if (depthToWidth > 0.95 && I > 260) {
      const rr = rng(hashSeed(this.seed, pi * 4099 + i, 11))();
      if (rr < clamp((depthToWidth - 0.95) * 6, 0, 0.9)) out.crackCentre = 1;
    }

    // ---- Slag trapped from an uncleaned previous flux-cored pass --------------------------
    out.slag = 0;
    if (pi > 0 && out.slag === 0) {
      const prev = this.passes[pi - 1];
      const overlaps = j.type !== 'plate' || out.overlapPrev > 0.2;
      if (overlaps && prev.slagProcess && !prev.cleaned && !prev.cleanMask[i] && prev.area[i] > 0.05) {
        const rr = rng(hashSeed(this.seed, pi * 7919 + i, 13))();
        out.slag = 0.5 + 0.8 * rr; // mm
        // chipped but not brushed: only a residue is left (seed: half the size)
        if (prev.chipFirst && prev.chipMask[i]) out.slag *= 0.5;
      }
    }

    // ---- Porosity and spatter events ------------------------------------------------------
    out.events = this.events(pi, i, { shield, contam, dU, glob, A, wb: out.wb, uc: j.type === 'plate' ? out.uc : 0, out });
    return out;
  }

  // Open root (pipe, no backing ring): the inside of the joint after the root run, from the root run's
  // penetration and the gravity where it was laid. Directions from Lincoln C2.420 (in-plant pipe, vertical
  // up without a backup ring): "the penetration must be complete on both lips and there must be some
  // buildup on the inside of the joint", "This inside bead should have an even surface and be at least
  // 1/16" (1.6 mm)"; (cross-country root) "The required current decreases as the gap size increases",
  // stopping at 6 o'clock "can contribute to burnthrough, tie-in or suck-back problems". The numbers are
  // seeds: K is how far the root run's penetration reaches through the land (1 = just through it).
  openRootSide(out, c) {
    const j = this.joint;
    const f = j.rootFace, gap = j.rootGap;
    const K = (OPEN_ROOT_K * c.F * Math.sqrt(gap / 3.2)) / f;
    const span = gap / 2 + 1;
    const K1 = K * Math.exp(-((Math.max(0, c.aim) / span) ** 2)); // land of the first pipe (-u): arc aimed to +u
    const K2 = K * Math.exp(-((Math.max(0, -c.aim) / span) ** 2)); // land of the second pipe (+u)
    out.rootK = K;
    out.lop = 0;
    out.burn = 0;
    out.rootH = 0;
    out.rootW = gap;
    out.rootA = 0;
    out.voidA = 0;
    out.lofRoot1 = 0;
    out.lofRoot2 = 0;
    if (K < 1) {
      // incomplete root penetration (4021): the bottom of the lands is not melted, the gap stays open there
      out.lop = clamp(f * (1 - K) + 0.2, 0.3, f);
      out.voidA = gap * out.lop;
      return;
    }
    // a land not fused at the root when the arc is held off the centre of the gap
    if (K1 < 1) out.lofRoot1 = clamp(f * (1 - K1) + 0.2, 0.3, f);
    if (K2 < 1) out.lofRoot2 = clamp(f * (1 - K2) + 0.2, 0.3, f);
    // inside bead: the metal pushed through the gap grows with the penetration margin e, except overhead
    // where the extra fluid metal sags back out of the root; gravity pulls the root pool into the pipe at
    // the top (12 o'clock, g.v < 0) and back out overhead (6 o'clock, g.v > 0: concave root, suck-back),
    // more so the hotter (more fluid) it is
    const e = K - OPEN_ROOT_NOM;
    let h = INSIDE_TARGET + 3.0 * e * (1 - Math.max(0, c.g.v)) - 1.0 * c.g.v * (1 + Math.max(0, 2 * e));
    // burn-through (510): the keyhole grows faster than the pool can bridge it, sooner where gravity
    // pulls the pool into the pipe
    if (K > OPEN_ROOT_BURN + 0.4 * c.g.v) {
      out.burn = 1;
      h = Math.max(h, 2.5);
    }
    out.rootH = clamp(h, -2.5, 6);
    out.rootW = gap + clamp(0.8 + 1.2 * (K - 1), 0.5, 2.5);
    out.rootA = clamp((2 / 3) * out.rootW * out.rootH, -0.6 * c.A, 0.8 * c.A);
  }

  // Bead on plate: a parabolic cap on the surface left by earlier passes (pads stack).
  computePlate(pi, i, out, c) {
    const j = this.joint;
    const uc = this.mean(c.p, 'uc', i);
    // width follows the molten pool (moving-source width, which already carries preheat and
    // weave), widened by higher voltage (Kobelco direction) and by the weave. seed coefficients
    const pw = this.mean(c.p, 'pw', i) || POOL_W_REF;
    const W0 = 1.15 * pw * (0.85 + 0.3 * c.wet);
    const wb = W0 + 1.8 * c.weave;
    // The toes sit on the surface the bead is laid on (plate or earlier beads) and the face is a
    // parabolic cap over the chord between them, sized so that the metal above the old surface
    // equals the deposited area (an earlier crown standing above the chord counts against it).
    const uL = uc - wb / 2;
    const vL = plateHeight(this, i, uL, pi), vR = plateHeight(this, i, uc + wb / 2, pi);
    let gap = 0, nOver = 0;
    const NQ = 9;
    for (let q = 0; q < NQ; q++) {
      const f = (q + 0.5) / NQ;
      const v = plateHeight(this, i, uL + wb * f, pi);
      gap += ((vL + (vR - vL) * f - v) * wb) / NQ;
      if (v > 0.05) nOver++;
    }
    const h = Math.max(0.15, (c.A - gap) / ((2 / 3) * wb));
    const base = (vL + vR) / 2;
    out.uc = uc;
    out.wb = wb;
    out.vL = vL;
    out.vR = vR;
    out.base = base;
    out.h = h;
    out.c = h;
    out.level = base;
    out.fill = 0;
    out.surface = true;
    out.overlapPrev = nOver / NQ; // share of this bead's footprint on earlier beads
    out.toe1 = 180 - Math.atan((4 * h) / wb) / DEG;
    out.toe2 = out.toe1;
    // undercut at free toes (same seed rule as a butt cap)
    const vtR = Math.max(0, c.vRatio - 1.25);
    const Ihi = c.ihi ?? (c.mode === 'spray' ? 330 : 240);
    let ucB = 0.22 * Math.max(0, c.dU - 1.0) + 0.9 * vtR + 0.5 * Math.max(0, (c.I - Ihi) / 100);
    ucB += 0.3 * c.nodw; // weave without a pause at the toes (share of the metal laid so). seed
    const vary = 0.75 + 0.5 * c.nz;
    const uc1 = ucB * vary, uc2 = ucB * vary;
    // a toe that lands on an earlier bead is not a free toe
    const lowOnPrev = plateHeight(this, i, uc - wb / 2 - 0.5, pi) > 0.3;
    const highOnPrev = plateHeight(this, i, uc + wb / 2 + 0.5, pi) > 0.3;
    out.uc1 = lowOnPrev || uc1 < 0.08 ? 0 : Math.min(uc1, 2.5);
    out.uc2 = highOnPrev || uc2 < 0.08 ? 0 : Math.min(uc2, 2.5);
    const aR = c.A / c.p.target;
    let ov = 0;
    if (aR > 1.3 && (c.dU < -0.5 || c.vRatio < 0.75)) ov = clamp(0.2 * (aR - 1.25) * wb, 0, 3);
    if (c.fCold < 0.6) ov += 0.4;
    out.ov1 = lowOnPrev ? 0 : ov * 0.5;
    out.ov2 = highOnPrev ? 0 : ov * 0.5;
    out.lofSurface = c.fCold < 0.55 || out.coldLow < 0.8 ? 1 : 0;
    out.lofRoot = 0;
    out.lofSide1 = 0;
    out.lofSide2 = 0;
    // lack of inter-run fusion where this bead sits on an earlier one and fuses poorly. seed rule
    out.lofInter = out.overlapPrev > 0.2 && c.F < 0.6 ? clamp(0.7 - c.F + 0.3, 0.2, 1.5) : 0;
    void j;
  }

  events(pi, i, c) {
    const p = this.passes[pi];
    const rand = rng(hashSeed(this.seed, pi * 104729 + i, 3));
    // Porosity rate (pores per mm). seed rule: shielding loss dominates.
    const rate = 0.0004 + (1 - c.shield) * 0.35 + c.contam * 0.12 + Math.max(0, c.dU - 3) * 0.01 + c.glob * 0.002;
    const nP = poisson(rand, rate * this.joint.ds);
    const pores = [];
    for (let q = 0; q < nP; q++) {
      const surfaceFrac = c.contam > 0.5 ? 0.55 : c.shield < 0.8 ? 0.35 : 0.15;
      const surface = rand() < surfaceFrac;
      let d = 0.4 + 1.6 * Math.pow(rand(), 1.5);
      if (c.shield < 0.3) d += 0.5;
      pores.push({ s: i + rand(), u: c.uc + (rand() - 0.5) * 0.8 * c.wb, d, surface, pass: pi });
    }
    // Spatter particles on the plates near this sample.
    const nS = poisson(rand, p.acc.spat[i] * 0.12);
    const spatter = [];
    for (let q = 0; q < Math.min(nS, 6); q++) {
      spatter.push({ s: i + rand(), side: rand() < 0.5 ? -1 : 1, r: 3 + 40 * Math.pow(rand(), 1.7), d: 0.3 + 1.2 * rand() });
    }
    return { pores, spatter };
  }

  // Arc start event: strikes away from the joint leave an arc strike (ISO 6520-1 601).
  // A start between 10 mm behind and 25 mm ahead of a stop of this pass is a restart (tie-in).
  // sigma: travel direction of the new run if known (+1 / -1, 0 = not yet); a restart continues the run
  // that stopped there, in its direction.
  arcStart(s, uOff, onJoint, t, sigma = 1) {
    if (!onJoint) this.arcStrikes.push({ s, u: uOff, t, pass: this.passes.length - 1 });
    const j = this.joint;
    const p = this.pass;
    // the stop this start restarts from: the most recent one it is near (a pipe pass has stops of several
    // runs close together, e.g. the first half's end where the second half also passes)
    let best = null;
    for (const st of p.stops) {
      const end = st.sEnd ?? st.s; // end of the bead before the stop (beyond a crater back-up)
      const d = (st.sigma ?? 1) * diffX(j, s, end);
      if (d > -10 && d < 25 && (!best || st.t > best.st.t || (st.t === best.st.t && Math.abs(d) < Math.abs(best.d)))) best = { st, d, end };
    }
    const sg = best ? best.st.sigma ?? 1 : sigma;
    const start = { s, t, restart: !!best, gap: best ? best.d : 0, stopS: best ? best.end : null, sMin: s, backed: false, done: false, sigma: sg };
    if (best) Object.defineProperty(start, 'stop', { value: best.st, enumerable: false }); // the stop restarted from
    // a crater left unfilled at that stop: the first metal the new pool lays over it fills it (CWB, GMAW tests:
    // "if the weld is to be restarted the crater must be shallow and unfilled"); crater volume as in deposit()
    this.craterOpen = best && !best.st.filled ? { s: best.end, room: p.target * CRATER_FILL_MM } : null;
    p.starts.push(start);
    return start;
  }

  // End of the start phase of a restart: did the welder back up into the crater (tie-in)?
  // The Fabricator ("Minimizing start/stop welding defects"): begin ahead of the start point by
  // about 1.5 x the weld size, then back up quickly to the start point.
  finishStart(start, sMin) {
    if (!start || start.done) return;
    start.done = true;
    start.sMin = sMin;
    const j = this.joint;
    const sg = start.sigma || 1;
    if (!start.restart) {
      // pipe (no run-on tab: every start is in the weld): a start struck ahead and moved back the same
      // way (The Fabricator: "begin ahead of the start point by about 1.5 x the weld size, then back up")
      // remelts the metal laid while striking
      if (j.pipe && sg * diffX(j, start.s, sMin) > 2) {
        start.backed = true;
        const a = sg > 0 ? sMin : start.s, b = sg > 0 ? start.s : sMin;
        this.remelt(Math.floor(a) - 2, Math.ceil(a + Math.abs(diffX(j, b, a))) + 2);
      }
      return;
    }
    start.gap = sg * diffX(j, sMin, start.stopS); // > 0: unwelded gap left between the crater and the new bead
    start.backed = sg * diffX(j, start.s, sMin) > 2 && start.gap <= 1.5;
    // the start metal laid ahead was remelted on the way back: no cold-start penalty there, and
    // the quick back-up does not count as travel speed
    if (start.backed) {
      const a = sg > 0 ? sMin : start.s, b = sg > 0 ? start.s : sMin;
      this.remelt(Math.floor(a) - (sg > 0 ? 2 : 3), Math.ceil(a + Math.abs(diffX(j, b, a))) + (sg > 0 ? 3 : 2));
      // back into the crater: the crater is remelted and filled by the new pool, its pipe and crater crack
      // with it (LWTech pipe welding, "tracing around the crater to re-establish the weld pool. The crater
      // should be filled completely before resuming normal travel"; CWB: a back-loop on restarts "aids weld
      // fusion at these critical areas")
      const st = start.stop;
      if (st && !st.filled) {
        st.filled = true;
        st.pipe = 0;
        st.crack = false;
        st.crackLen = 0;
        st.method = `${st.method} + remelted at the restart`;
      }
    }
  }

  // Samples i0..i1 of the current pass were remelted by the welder's own technique (restart
  // back-up, crater back-up): judge them at the planned speed with no cold start.
  remelt(i0, i1) {
    const p = this.pass;
    for (const i of this.range(i0, i1)) {
      const w = p.weight[i];
      if (!(w > 0)) continue;
      const vt = p.acc.vt[i] / w;
      p.acc.cold[i] = w;
      p.acc.speed[i] = w * vt;
      p.coldMin[i] = 1;
      p.cache[i] = null;
    }
  }

  // Grinding a start or a stop to a feathered edge (Lincoln C2.420: "Fewer defects will be seen if
  // restarts and stops (craters) are ground out, with the stops ground down to a feathered edge"; ISO
  // 9606-1 6.3 allows the stop and restart of the capping run to be ground). Pass k loses metal on a taper
  // from xZero (ground to the surface below) to xFull (untouched), and everything within `beyond` mm on
  // the far side of xZero; craters and crater cracks in the ground length are removed. The root run keeps
  // its root (at least a third of its section: the grinding stops above the inside bead). Returns the
  // samples changed.
  feather(xZero, xFull, opts = {}) {
    const j = this.joint;
    const k = opts.pass ?? this.passes.length - 1;
    const p = this.passes[k];
    if (!p) return 0;
    const span = diffX(j, xFull, xZero);
    const len = Math.abs(span);
    if (len < 1) return 0;
    const dirn = Math.sign(span);
    const beyond = opts.beyond ?? 3;
    const keep = k === 0 && j.openRoot ? FEATHER_ROOT_KEEP : 0;
    let n = 0;
    // samples from `beyond` mm behind xZero to xFull (unwrapped: the loop runs through x = 0 on a pipe)
    const lo = dirn > 0 ? Math.floor(xZero - beyond) : Math.floor(xZero - len);
    const hi = dirn > 0 ? Math.ceil(xZero + len) : Math.ceil(xZero + beyond);
    for (let ii = lo; ii <= hi; ii++) {
      const i = j.pipe ? wrapIndex(j, ii) : ii;
      if (i < 0 || i >= j.n || !(p.area[i] > 0.05)) continue;
      const d = dirn * diffX(j, ii + 0.5, xZero); // mm from xZero toward xFull
      const f = Math.max(keep, clamp(d / len, 0, 1));
      if (f >= 1) continue;
      p.area[i] *= f;
      p.weight[i] *= f;
      for (const key of KEYS) p.acc[key][i] *= f;
      p.acc.time[i] *= f;
      p.acc.spat[i] = 0; // spatter ground off with the bead
      p.ground = p.ground || new Uint8Array(j.n);
      p.ground[i] = 1;
      p.cleanMask[i] = 1; // ground metal is bright, no slag
      p.chipMask[i] = 1;
      p.cache[i] = null;
      n++;
    }
    // craters ground out
    for (const st of p.stops) {
      const d = dirn * diffX(j, st.s, xZero);
      if (d > -beyond && d < len) {
        st.filled = true;
        st.pipe = 0;
        st.crack = false;
        st.ground = true;
      }
    }
    for (const sr of p.starts) {
      const d = dirn * diffX(j, sr.s, xZero);
      if (d > -beyond - 10 && d < len) sr.ground = true;
    }
    for (let q = k + 1; q < this.passes.length; q++) for (let ii = lo; ii <= hi; ii++) this.passes[q].cache[j.pipe ? wrapIndex(j, ii) : ii] = null;
    return n;
  }

  // Arc stop event: crater filled if the welder paused (dwell) or backed up over the end of the
  // bead (about 1.5 x the weld size per The Fabricator) before breaking the arc.
  // sEnd: furthest point the bead reached (beyond a crater back-up); sigma: travel direction of the run.
  arcStop(s, t, dwellBeforeStop, arc, backStep = 0, u = 0, sEnd = s, sigma = 1) {
    const j = this.joint;
    const p = this.pass;
    const size = j.weldSize || 6;
    const backedUp = backStep >= 0.6 * 1.5 * size; // seed share of the recommended back-up
    if (backedUp) {
      // the metal the back-up went over (from the stop forward by the back-up length)
      const a = sigma > 0 ? s : j.pipe ? wrapX(j, s - backStep) : s - backStep;
      this.remelt(Math.floor(a) - 1, Math.ceil(a + backStep) + 1);
    }
    // pipe: a run that ends on frozen metal of its own pass (the second half running onto the first half's
    // end) leaves no crater of its own: the pool runs into the bead already there (a tie-in)
    const tieIn = !!j.pipe && this.range(Math.round(s) - 1, Math.round(s) + 1).some((i) => p.rewelded[i]);
    const filled = dwellBeforeStop >= 0.35 || backedUp || tieIn; // s. seed rule (crater-fill technique)
    const rand = rng(hashSeed(this.seed, p.index * 31 + p.stops.length, 17));
    let pipe = 0, crack = false, d = 0;
    if (!filled) {
      pipe = clamp(0.4 + 0.9 * rand(), 0.3, 2.0);
      d = clamp(2 + 2 * rand(), 1.5, 4.5);
      const pc = (arc?.mode === 'spray' ? 0.5 : 0.3) + Math.max(0, ((arc?.I ?? 150) - 180) / 600);
      crack = rand() < pc;
    }
    const end = j.pipe ? sEnd : Math.max(s, sEnd);
    const st = { s, u, t, sEnd: end, sigma, filled, pipe, d, crack, crackLen: crack ? 1.5 + 2.5 * rand() : 0, backStep, dwell: dwellBeforeStop, method: backedUp ? 'back-up' : dwellBeforeStop >= 0.35 ? 'pause' : tieIn ? 'tie-in' : 'none' };
    p.stops.push(st);
    return st;
  }

  // ---- Queries used by rendering and evaluation ---------------------------------------------
  topPassAt(i) {
    for (let k = this.passes.length - 1; k >= 0; k--) if (this.passes[k].area[i] > 0.05) return k;
    return -1;
  }

  // Bead-on-plate: passes whose bead covers lateral position u at sample i (all passes if u null).
  passesAt(i, u = null) {
    const out = [];
    for (let k = 0; k < this.passes.length; k++) {
      if (this.passes[k].area[i] <= 0.05) continue;
      if (u == null) {
        out.push(k);
        continue;
      }
      const s = this.sample(k, i);
      if (s && Math.abs(u - s.uc) <= s.wb / 2 + 2) out.push(k);
    }
    return out;
  }

  // Collect the final weld state along the length for rule evaluation.
  summary() {
    const j = this.joint;
    const n = j.n;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const k = this.topPassAt(i);
      rows.push(k >= 0 ? this.sample(k, i) : null);
    }
    const pores = [];
    const spatter = [];
    const internal = [];
    const plate = j.type === 'plate';
    for (let k = 0; k < this.passes.length; k++) {
      const p = this.passes[k];
      for (let i = 0; i < n; i++) {
        if (p.area[i] <= 0.05) continue;
        const smp = this.sample(k, i);
        if (!smp) continue;
        for (const po of smp.events.pores) {
          const covered = plate ? this.coveredOnPlate(k, i, po.u) : k < this.topPassAt(i);
          pores.push({ ...po, surface: po.surface && !covered });
        }
        if (plate || k === this.topPassAt(i)) spatter.push(...smp.events.spatter.map((sp) => ({ ...sp, pass: k })));
        if (smp.lofRoot) internal.push({ type: 'lofRoot', s: i, h: smp.lofRoot, pass: k });
        if (smp.lop) internal.push({ type: 'lop', s: i, h: smp.lop, pass: k }); // incomplete root penetration (open root)
        if (smp.lofSide1) internal.push({ type: 'lofSide', s: i, h: smp.lofSide1, side: 1, pass: k });
        if (smp.lofSide2) internal.push({ type: 'lofSide', s: i, h: smp.lofSide2, side: 2, pass: k });
        if (smp.lofInter) internal.push({ type: 'lofInter', s: i, h: smp.lofInter, pass: k });
        if (smp.slag) internal.push({ type: 'slag', s: i, h: smp.slag, pass: k });
        if (smp.crackCentre) internal.push({ type: 'crack', s: i, h: 1, pass: k, surface: plate ? !this.coveredOnPlate(k, i, smp.uc) : k === this.topPassAt(i) });
      }
    }
    // GTAW: tungsten inclusions where the tungsten touched the pool or was scratched on the work
    for (const w of this.tungsten || []) internal.push({ type: 'tungsten', s: Math.round(w.s), h: 0.5, u: w.u, pass: w.pass });
    const stops = [];
    const restarts = [];
    for (const p of this.passes) {
      for (const st of p.stops) stops.push({ ...st, pass: p.index, top: plate ? !this.coveredOnPlate(p.index, clamp(Math.round(st.s), 0, n - 1), st.u ?? 0) : this.isTopAt(p.index, st.s) });
      for (const sr of p.starts) if (sr.restart) restarts.push({ ...sr, pass: p.index });
    }
    // Evaluation view: only the evaluation length between the run-on and run-off zones,
    // positions re-based to its start (0 .. evalL).
    const a = j.tab ?? 0;
    const b = a + (j.evalL ?? j.L);
    const inEval = (s) => s >= a && s < b;
    const shift = (o) => ({ ...o, s: o.s - a });
    const shiftRS = (o) => ({ ...o, s: o.s - a, stopS: o.stopS != null ? o.stopS - a : null, sMin: o.sMin != null ? o.sMin - a : null });
    const passRows = plate ? this.passes.map((p) => {
      const r = [];
      for (let i = a; i < b; i++) r.push(p.area[i] > 0.05 ? this.sample(p.index, i) : null);
      return r;
    }) : null;
    // open root (pipe): the inside of the joint is the root run's underside (inside bead, concavity,
    // burn-through, unfused root), seen from inside the pipe
    const rootRows = j.openRoot ? Array.from({ length: n }, (_, i) => (this.passes[0].area[i] > 0.05 ? this.sample(0, i) : null)).slice(a, b) : null;
    return {
      joint: { ...j, L: b - a },
      physical: j,
      rows: rows.slice(a, b),
      rootRows,
      passRows,
      pores: pores.filter((p) => inEval(p.s)).map(shift),
      spatter: spatter.filter((p) => inEval(p.s)).map(shift),
      internal: internal.filter((p) => inEval(p.s)).map(shift),
      stops: stops.filter((p) => inEval(p.s)).map(shift),
      restarts: restarts.filter((p) => inEval(p.s)).map(shiftRS),
      arcStrikes: this.arcStrikes.filter((p) => inEval(p.s)).map(shift),
      passes: this.passes.length,
      interpass: this.passes.map((p) => p.interpass),
      offset: a,
    };
  }

  // Bead on plate: is a point of pass k at (i, u) covered by a later bead?
  coveredOnPlate(k, i, u) {
    for (let q = k + 1; q < this.passes.length; q++) {
      if (this.passes[q].area[i] <= 0.05) continue;
      const s = this.sample(q, i);
      if (!s) continue;
      if (u == null) return true;
      if (Math.abs(u - s.uc) <= s.wb / 2) return true;
    }
    return false;
  }

  isTopAt(k, s) {
    const i = this.joint.pipe ? wrapIndex(this.joint, Math.round(s)) : clamp(Math.round(s), 0, this.joint.n - 1);
    return this.topPassAt(i) === k;
  }
}

// Surface height of a bead-on-plate coupon at sample i, lateral u, from passes 0..kMax-1.
export function plateHeight(rec, i, u, kMax = rec.passes.length) {
  let v = 0;
  for (let k = 0; k < kMax; k++) {
    const p = rec.passes[k];
    if (!p || p.area[i] <= 0.05) continue;
    const s = rec.sample(k, i);
    if (s) v = Math.max(v, plateBeadSurface(s, u));
  }
  return v;
}

// Face height of one bead-on-plate sample at u: the parabolic cap over the chord between its toes.
export function plateBeadSurface(s, u, width = s.wb) {
  if (!(width > 0)) return -Infinity;
  const x = (2 * (u - s.uc)) / width;
  if (Math.abs(x) > 1) return -Infinity;
  const vL = s.vL ?? s.base ?? 0, vR = s.vR ?? s.base ?? 0;
  return vL + (vR - vL) * (x + 1) * 0.5 + s.h * (1 - x * x);
}

export { KEYS as ACC_KEYS };
export function grooveFillFraction(j, area) {
  return clamp(area / grooveAreaBelow(j, 0), 0, 2);
}
