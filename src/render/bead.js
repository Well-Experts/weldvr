// Weld bead surface mesh built from the weld record, in joint-local millimetres.
// One continuous mesh shows the current top surface (the latest pass at each sample).

import * as THREE from 'three';
import { grooveWidthAt } from '../sim/joint.js';
import { rng, hashSeed, clamp } from '../sim/util.js';
import { pipePoint, wrapIndex } from '../sim/pipe.js';
import { GLSL_GLOW, GLSL_THERM } from './thermalTex.js';

// Linear colours of slag on the bead face (visual choice): flux-cored wire, and covered electrodes by
// coating type.
const SLAG_COLOR = { flux: [0.2, 0.15, 0.11], basic: [0.05, 0.042, 0.035], rutile: [0.11, 0.09, 0.07], cellulosic: [0.075, 0.068, 0.06] };

const S2 = Math.SQRT1_2;
export const PROFILE_N = 17;
const FACE0 = 3, FACE1 = 13; // face indices (inclusive), toe-to-toe

export class BeadMesh {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.mirror = opts.mirror || false; // left-handed travel: sample i sits at x = L - i
    this.passIndex = opts.passIndex ?? null; // bead on plate: one mesh per pass
    const n = joint.n;
    const M = PROFILE_N;
    this.n = n;
    this.pos = new Float32Array(n * M * 3);
    this.nor = new Float32Array(n * M * 3);
    this.col = new Float32Array(n * M * 3);
    this.heat = new Float32Array(n * M); // surface temperature (C) for incandescence
    this.slag = new Float32Array(n * M);
    this.rip = new Float32Array(n * M * 2); // ripple spacing (mm), amplitude
    this.tau = new Float32Array(n * M).fill(-1); // position across the face 0..1, -1 off the face
    this.has = new Uint8Array(n);
    this.tLast = new Float32Array(n).fill(-1);
    this.prof = new Float32Array(M * 2);
    // pipe: the bead is laid round the pipe (positions mapped by sim/pipe.js pipePoint) and closes on itself
    this.pipe = !!joint.pipe;
    this.jx = new Float32Array(n * M); // x along the joint (ripples), also on a pipe
    this.pp = [0, 0, 0];
    const idx = [];
    // faces toward +v: with x mirrored (left-handed travel), or round a pipe (whose pipe-local frame has
    // t x u = -v, where a plate's joint-local frame has x x u = +v), the winding and normals flip
    this.flip = this.mirror !== this.pipe;
    for (let i = 0; i < (this.pipe ? n : n - 1); i++) {
      for (let k = 0; k < M - 1; k++) {
        const i2 = (i + 1) % n;
        const a = i * M + k, b = i2 * M + k, c = i2 * M + k + 1, d = i * M + k + 1;
        if (this.flip) idx.push(a, d, b, b, d, c);
        else idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aHeat = new THREE.BufferAttribute(this.heat, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSlag = new THREE.BufferAttribute(this.slag, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRip = new THREE.BufferAttribute(this.rip, 2).setUsage(THREE.DynamicDrawUsage);
    this.aTau = new THREE.BufferAttribute(this.tau, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) for (let k = FACE0; k <= FACE1; k++) this.tau[i * M + k] = (k - FACE0) / (FACE1 - FACE0);
    for (let i = 0; i < n; i++) for (let k = 0; k < M; k++) this.jx[i * M + k] = this.x(i);
    this.aJx = new THREE.BufferAttribute(this.jx, 1);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNor);
    g.setAttribute('color', this.aCol);
    g.setAttribute('heat', this.aHeat);
    g.setAttribute('slag', this.aSlag);
    g.setAttribute('rip', this.aRip);
    g.setAttribute('tau', this.aTau);
    g.setAttribute('jx', this.aJx);
    g.boundingSphere = this.pipe ? new THREE.Sphere(new THREE.Vector3(0, 0, 0), joint.pipe.R + 60) : new THREE.Sphere(new THREE.Vector3(joint.L / 2, 0, 0), joint.L);
    this.geometry = g;
    this.material = beadMaterial(this.mirror ? -1 : 1, opts.uniforms);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'bead';
    for (let i = 0; i < n; i++) this.collapse(i);
    this.computeNormals(0, n - 1);
    // dirty sample ranges, uploaded once per rendered frame by flush()
    this.dirtyA = Infinity;
    this.dirtyB = -1;
    this.heatA = Infinity;
    this.heatB = -1;
  }

  markDirty(a, b) {
    if (a < this.dirtyA) this.dirtyA = a;
    if (b > this.dirtyB) this.dirtyB = b;
  }

  // Upload the samples changed since the last rendered frame.
  flush() {
    const M = PROFILE_N;
    if (this.dirtyB >= this.dirtyA) {
      const a = this.dirtyA * M, cnt = (this.dirtyB - this.dirtyA + 1) * M;
      for (const [attr, size] of [[this.aPos, 3], [this.aNor, 3], [this.aCol, 3], [this.aHeat, 1], [this.aSlag, 1], [this.aRip, 2]]) {
        attr.addUpdateRange(a * size, cnt * size);
        attr.needsUpdate = true;
      }
    }
    if (this.heatB >= this.heatA) {
      this.aHeat.addUpdateRange(this.heatA * M, (this.heatB - this.heatA + 1) * M);
      this.aHeat.needsUpdate = true;
    }
    this.dirtyA = this.heatA = Infinity;
    this.dirtyB = this.heatB = -1;
  }

  x(i) {
    return this.mirror && !this.pipe ? this.joint.L - (i + 0.5) : i + 0.5;
  }

  // write vertex (i, q) from joint-local (x, u, v): plates as they are, pipe mapped round the pipe
  setPos(o, x, u, v) {
    if (this.pipe) {
      const p = pipePoint(this.joint, x, u, v, this.pp);
      this.pos[o] = p[0];
      this.pos[o + 1] = p[1];
      this.pos[o + 2] = p[2];
    } else {
      this.pos[o] = x;
      this.pos[o + 1] = u;
      this.pos[o + 2] = v;
    }
  }

  collapse(i) {
    const M = PROFILE_N;
    const j = this.joint;
    const v = j.type === 'fillet' || j.type === 'plate' ? -0.05 : -j.t - 0.05;
    for (let k = 0; k < M; k++) {
      const o = (i * M + k) * 3;
      this.setPos(o, this.x(i), 0, v);
      this.heat[i * M + k] = 0;
    }
    this.has[i] = 0;
  }

  // Rebuild samples i0..i1 from the record.
  update(rec, i0, i1, now) {
    const n = this.n;
    if (this.pipe) {
      // round the pipe: wrapped samples; a range across x = 0 marks the whole bead for upload
      const a = i0 - 2, b = i1 + 2;
      for (let i = a; i <= b; i++) this.buildSample(rec, wrapIndex(this.joint, i), now);
      for (let i = a - 1; i <= b + 1; i++) this.computeNormals(wrapIndex(this.joint, i), wrapIndex(this.joint, i));
      const wa = wrapIndex(this.joint, a - 1), wb = wrapIndex(this.joint, b + 1);
      if (wa <= wb) this.markDirty(wa, wb);
      else this.markDirty(0, n - 1);
      return;
    }
    i0 = Math.max(0, i0 - 2);
    i1 = Math.min(n - 1, i1 + 2);
    for (let i = i0; i <= i1; i++) this.buildSample(rec, i, now);
    this.computeNormals(Math.max(0, i0 - 1), Math.min(n - 1, i1 + 1));
    this.markDirty(Math.max(0, i0 - 1), Math.min(n - 1, i1 + 1));
  }

  // Surface temperatures (C) of the bead: tempOf(i) for every sample that has metal. Only samples
  // that are hot, or were hot at the last update, are written.
  updateHeat(tempOf) {
    const M = PROFILE_N;
    let a = -1, b = -1;
    for (let i = 0; i < this.n; i++) {
      if (!this.has[i]) continue;
      const T = tempOf(i);
      // the face centre carries the full value (the toes are scaled down)
      const was = this.heat[i * M + ((FACE0 + FACE1) >> 1)];
      if (T < 380 && was < 380) continue;
      for (let k = FACE0 - 1; k <= FACE1 + 1; k++) {
        const tau = (k - FACE0) / (FACE1 - FACE0);
        // toes run cooler than the centre of the bead; outside the toes it is the plate
        const edge = k < FACE0 || k > FACE1 ? 0.82 : 1 - 0.1 * Math.abs(tau - 0.5) * 2;
        this.heat[i * M + k] = T > 380 ? 20 + (T - 20) * edge : 20;
      }
      if (a < 0) a = i;
      b = i;
    }
    if (a >= 0) {
      if (a < this.heatA) this.heatA = a;
      if (b > this.heatB) this.heatB = b;
    }
  }

  buildSample(rec, i, now) {
    const j = this.joint;
    const M = PROFILE_N;
    const k = this.passIndex != null ? (rec.passes[this.passIndex] && rec.passes[this.passIndex].area[i] > 0.05 ? this.passIndex : -1) : rec.topPassAt(i);
    if (k < 0) {
      this.collapse(i);
      return;
    }
    const smp = rec.sample(k, i);
    if (!smp) {
      this.collapse(i);
      return;
    }
    const pass = rec.passes[k];
    const has = (q) => (this.passIndex != null ? rec.passes[k].area[q] > 0.05 : rec.topPassAt(q) >= 0);
    const prevHas = this.pipe ? has(wrapIndex(j, i - 1)) : i > 0 && has(i - 1);
    const nextHas = this.pipe ? has(wrapIndex(j, i + 1)) : i < j.n - 1 && has(i + 1);
    const taper = prevHas && nextHas ? 1 : 0.55;
    // crater depression from unfilled stops of this pass
    let crater = 0;
    for (const st of pass.stops) {
      if (st.filled) continue;
      let d = Math.abs(i + 0.5 - st.s);
      if (this.pipe) d = Math.min(d, j.L - d);
      const r = st.d / 2 + 1;
      if (d < r) crater = Math.max(crater, st.pipe * (1 - (d / r) ** 2));
    }
    const P = this.prof;
    if (j.type === 'fillet') filletProfile(smp, taper, crater, P);
    else if (j.type === 'plate') plateProfile(smp, taper, crater, P);
    else buttProfile(j, smp, taper, crater, P);

    // ripples are shaded in the fragment shader from these per-sample values (no geometry,
    // so 1 mm samples do not alias the 0.5-2.5 mm ripple spacing)
    const lam = clamp(0.6 + smp.speed * 0.12, 0.6, 2.5);
    const ripAmp = (smp.mode === 'spray' ? 0.4 : smp.mode === 'globular' ? 0.8 : 1.0) * taper;
    // colours (linear): silver centre, bronze oxide toward the toes, dark silicon islands (GMAW),
    // glassy slag (FCAW, until brushed), dark toe line / undercut groove beside the toes
    let slagged = pass.slagProcess && !pass.cleaned && !pass.cleanMask[i];
    // SMAW: bulk slag chipped off, not brushed yet: a dull grey residue on the bead
    const residue = slagged && pass.chipFirst && pass.chipMask[i];
    if (residue) slagged = false;
    const rand = rng(hashSeed(rec.seed, k * 977 + i, 29));
    // silicon islands: glassy brown patches a few mm long near the bead centre (GMAW)
    const isl = rec.noise ? rec.noise(i * 0.37 + k * 101) : 0;
    const island = !slagged && !pass.slagProcess && isl > 0.8;
    const islW = 0.08 + 0.5 * (isl - 0.8);
    const shade = 0.94 + 0.12 * rand();
    for (let q = 0; q < M; q++) {
      const o = (i * M + q) * 3;
      this.setPos(o, this.x(i), P[q * 2], P[q * 2 + 1]);
      let r, g, b;
      const face = q >= FACE0 && q <= FACE1;
      if (!face) {
        const ucq = j.type === 'fillet' ? (q <= 2 ? smp.uc2 || 0 : smp.uc1 || 0) : q <= 2 ? smp.uc1 || 0 : smp.uc2 || 0;
        const d = Math.min(1, ucq / 0.8);
        r = 0.2 - 0.15 * d; g = 0.18 - 0.14 * d; b = 0.16 - 0.12 * d;
      } else if (slagged) {
        // glassy slag; covered-electrode slags drawn darker by coating type (visual choice)
        const s2 = 0.85 + 0.3 * rand();
        const sc = SLAG_COLOR[pass.coating] || SLAG_COLOR.flux;
        r = sc[0] * s2; g = sc[1] * s2; b = sc[2] * s2;
      } else if (residue) {
        const s2 = 0.8 + 0.4 * rand();
        r = 0.115 * s2; g = 0.108 * s2; b = 0.1 * s2;
      } else {
        const tau = (q - FACE0) / (FACE1 - FACE0);
        const edge = Math.abs(tau - 0.5) * 2;
        // as-welded MAG bead: grey metal with a thin golden-blue oxide film, darker toward the toes
        r = 0.17 * shade; g = 0.172 * shade; b = 0.18 * shade;
        const film = 0.5 + 0.5 * Math.sin(i * 0.21 + k * 1.7);
        r += 0.03 * film; g += 0.02 * film; b += 0.035 * (1 - film);
        const tint = Math.max(0, (edge - 0.55) / 0.45);
        r += (0.2 - r) * tint; g += (0.16 - g) * tint; b += (0.11 - b) * tint;
        if (pass.slagProcess) { r *= 0.85; g *= 0.85; b *= 0.85; }
        if (island && Math.abs(tau - 0.5) < islW) { r = 0.09; g = 0.065; b = 0.04; }
      }
      this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b;
      this.slag[i * M + q] = slagged && face ? 1 : 0;
      this.rip[(i * M + q) * 2] = lam;
      this.rip[(i * M + q) * 2 + 1] = slagged ? 0 : residue ? ripAmp * 0.4 : ripAmp;
    }
    if (!this.has[i]) for (let q = 0; q < M; q++) this.heat[i * M + q] = 20;
    this.has[i] = 1;
    this.tLast[i] = pass.tLast[i];
    void now;
  }

  computeNormals(i0, i1) {
    const M = PROFILE_N;
    const p = this.pos;
    const nrm = this.nor;
    const s = this.flip ? -1 : 1;
    for (let i = i0; i <= i1; i++) {
      const ia = this.pipe ? (i + this.n - 1) % this.n : Math.max(0, i - 1);
      const ib = this.pipe ? (i + 1) % this.n : Math.min(this.n - 1, i + 1);
      for (let k = 0; k < M; k++) {
        const ka = Math.max(0, k - 1), kb = Math.min(M - 1, k + 1);
        const o = (i * M + k) * 3;
        const oa = (ia * M + k) * 3, ob = (ib * M + k) * 3;
        const oc = (i * M + ka) * 3, od = (i * M + kb) * 3;
        const tx = [p[ob] - p[oa], p[ob + 1] - p[oa + 1], p[ob + 2] - p[oa + 2]];
        const ty = [p[od] - p[oc], p[od + 1] - p[oc + 1], p[od + 2] - p[oc + 2]];
        let nx = tx[1] * ty[2] - tx[2] * ty[1];
        let ny = tx[2] * ty[0] - tx[0] * ty[2];
        let nz = tx[0] * ty[1] - tx[1] * ty[0];
        let l = Math.hypot(nx, ny, nz);
        if (l < 1e-9) { nx = 0; ny = 0; nz = 1; l = 1; }
        nrm[o] = (s * nx) / l;
        nrm[o + 1] = (s * ny) / l;
        nrm[o + 2] = (s * nz) / l;
      }
    }
  }

  refreshAll(rec, now) {
    for (let i = 0; i < this.n; i++) this.buildSample(rec, i, now);
    this.computeNormals(0, this.n - 1);
    this.markDirty(0, this.n - 1);
  }
}

function filletProfile(s, taper, crater, P) {
  const d1u = S2, d1v = S2; // base plate (+u)
  const d2u = -S2, d2v = S2; // web plate (-u)
  const n1u = -S2, n1v = S2; // base outward normal
  const n2u = S2, n2v = S2; // web outward normal
  const z1 = s.z1 * (0.75 + 0.25 * taper), z2 = s.z2 * (0.75 + 0.25 * taper);
  const c = (s.c - crater * 0.9) * taper;
  const t1u = z1 * d1u, t1v = z1 * d1v;
  const t2u = z2 * d2u, t2v = z2 * d2v;
  const ov1 = s.ov1 || 0, ov2 = s.ov2 || 0, uc1 = s.uc1 || 0, uc2 = s.uc2 || 0;
  const set = (q, u, v) => { P[q * 2] = u; P[q * 2 + 1] = v; };
  // web side (-u): outer point just inside the plate, toe line / undercut groove drawn just above
  // the plate surface (the plate mesh is not cut, so the groove is shown by shading), lip
  const w2 = 0.5 + ov2 + 1.5 * uc2;
  set(0, t2u + (w2 + 0.7) * d2u - 0.12 * n2u, t2v + (w2 + 0.7) * d2v - 0.12 * n2v);
  set(1, t2u + w2 * d2u + 0.03 * n2u, t2v + w2 * d2v + 0.03 * n2v);
  set(2, t2u + ov2 * d2u + (ov2 > 0 ? 0.35 : 0.04) * n2u, t2v + ov2 * d2v + (ov2 > 0 ? 0.35 : 0.04) * n2v);
  // face from toe2 (web) to toe1 (base)
  const hu = t1u - t2u, hv = t1v - t2v;
  const hl = Math.hypot(hu, hv) || 1;
  let nu = -hv / hl, nv = hu / hl;
  if (nu * (t1u + t2u) + nv * (t1v + t2v) < 0) { nu = -nu; nv = -nv; }
  for (let q = FACE0; q <= FACE1; q++) {
    const tau = (q - FACE0) / (FACE1 - FACE0);
    const bulge = 4 * c * tau * (1 - tau);
    set(q, t2u + tau * hu + bulge * nu, t2v + tau * hv + bulge * nv);
  }
  const w1 = 0.5 + ov1 + 1.5 * uc1;
  set(14, t1u + ov1 * d1u + (ov1 > 0 ? 0.35 : 0.04) * n1u, t1v + ov1 * d1v + (ov1 > 0 ? 0.35 : 0.04) * n1v);
  set(15, t1u + w1 * d1u + 0.03 * n1u, t1v + w1 * d1v + 0.03 * n1v);
  set(16, t1u + (w1 + 0.7) * d1u - 0.12 * n1u, t1v + (w1 + 0.7) * d1v - 0.12 * n1v);
}

// Bead on plate: parabolic cap of width wb centred on the bead centre, on the base left by
// earlier beads (pads).
function plateProfile(s, taper, crater, P) {
  const set = (q, u, v) => { P[q * 2] = u; P[q * 2 + 1] = v; };
  const W = s.wb * (0.8 + 0.2 * taper);
  const h = Math.max(0.05, (s.h - crater) * taper);
  // toes on the surface the bead was laid on (plate or the previous bead), cap over the chord
  const vL = s.vL ?? s.base ?? 0, vR = s.vR ?? s.base ?? 0;
  const uL = s.uc - W / 2, uR = s.uc + W / 2;
  const ovL = s.ov1 || 0, ovR = s.ov2 || 0, ucL = s.uc1 || 0, ucR = s.uc2 || 0;
  const wL = 0.5 + ovL + 1.5 * ucL, wR = 0.5 + ovR + 1.5 * ucR;
  set(0, uL - wL - 0.7, vL - 0.12);
  set(1, uL - wL, vL + 0.03);
  set(2, uL - ovL, vL + (ovL > 0 ? 0.35 : 0.04));
  for (let q = FACE0; q <= FACE1; q++) {
    const tau = (q - FACE0) / (FACE1 - FACE0);
    const u = uL + tau * (uR - uL);
    const x = (2 * (u - s.uc)) / W;
    set(q, u, vL + (vR - vL) * tau + h * (1 - x * x));
  }
  set(14, uR + ovR, vR + (ovR > 0 ? 0.35 : 0.04));
  set(15, uR + wR, vR + 0.03);
  set(16, uR + wR + 0.7, vR - 0.12);
}

function buttProfile(j, s, taper, crater, P) {
  const set = (q, u, v) => { P[q * 2] = u; P[q * 2 + 1] = v; };
  const mis = j.misalignment || 0;
  if (s.h > 0 && s.wcap) {
    const W = s.wcap * (0.8 + 0.2 * taper);
    const h = (s.h - crater) * taper;
    const uL = -W / 2, uR = W / 2;
    const ovL = s.ov1 || 0, ovR = s.ov2 || 0, ucL = s.uc1 || 0, ucR = s.uc2 || 0;
    const wL = 0.5 + ovL + 1.5 * ucL, wR = 0.5 + ovR + 1.5 * ucR;
    set(0, uL - wL - 0.7, -0.12);
    set(1, uL - wL, 0.03);
    set(2, uL - ovL, ovL > 0 ? 0.35 : 0.04);
    for (let q = FACE0; q <= FACE1; q++) {
      const tau = (q - FACE0) / (FACE1 - FACE0);
      const u = uL + tau * (uR - uL);
      const x = (2 * u) / W;
      const base = u > 0 ? -mis * tau : 0;
      set(q, u, base + h * (1 - x * x));
    }
    set(14, uR + ovR, -mis + (ovR > 0 ? 0.35 : 0.04));
    set(15, uR + wR, -mis + 0.03);
    set(16, uR + wR + 0.7, -mis - 0.12);
    return;
  }
  // pass below the plate face: bead inside the groove
  const level = s.level - crater * 0.5;
  const Wg = grooveWidthAt(j, Math.min(level, 0));
  const W = Math.min(s.wb, Wg) * (0.85 + 0.15 * taper);
  const c0 = clamp(s.aim, -(Wg - W) / 2, (Wg - W) / 2);
  const prevLevel = s.levelPrev ?? -j.t;
  const WgPrev = grooveWidthAt(j, Math.min(prevLevel + 0.6, 0));
  const reach = W >= Wg - 0.4;
  const uL = c0 - W / 2, uR = c0 + W / 2;
  const edgeV = reach ? level : Math.max(prevLevel, level - 0.6);
  set(0, -WgPrev / 2, prevLevel + 0.3);
  set(1, reach ? uL : (-WgPrev / 2 + uL) / 2, reach ? level : prevLevel + 0.2);
  set(2, uL, edgeV);
  for (let q = FACE0; q <= FACE1; q++) {
    const tau = (q - FACE0) / (FACE1 - FACE0);
    const u = uL + tau * (uR - uL);
    const x = (2 * (u - c0)) / W;
    set(q, u, level + s.c * taper * (1 - x * x));
  }
  set(14, uR, edgeV);
  set(15, reach ? uR : (uR + WgPrev / 2) / 2, reach ? level : prevLevel + 0.2);
  set(16, WgPrev / 2, prevLevel + 0.3);
}

// The bead's surface temperature is the larger of the near-field value carried per vertex (hot
// metal just behind the pool, from the moving-source solution) and the plate field under it
// (thermal texture), so the bead keeps cooling with the plate after the near field has gone.
export function beadMaterial(dir, uniforms = null) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.48, side: THREE.DoubleSide });
  const therm = !!(uniforms && uniforms.thermTex);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDir = { value: dir };
    if (uniforms) Object.assign(shader.uniforms, uniforms);
    else shader.uniforms.thermView = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float heat; attribute float slag; attribute vec2 rip; attribute float tau; attribute float jx;
${therm ? 'uniform vec4 thermPipe;' : ''}
varying float vHeat; varying float vSlag; varying vec2 vRip; varying float vTau; varying float vX; varying vec3 vAxis; varying vec3 vJoint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHeat = heat; vSlag = slag; vRip = rip; vTau = tau; vX = jx; vJoint = position;
vec3 tl = vec3(1.0, 0.0, 0.0);
${therm ? 'if (thermPipe.z > 0.5) { float aa = atan(position.x, -position.z); tl = vec3(cos(aa), 0.0, sin(aa)); }' : ''}
vAxis = normalize((modelViewMatrix * vec4(tl, 0.0)).xyz);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uDir; uniform float thermView;
varying float vHeat; varying float vSlag; varying vec2 vRip; varying float vTau; varying float vX; varying vec3 vAxis; varying vec3 vJoint;
${GLSL_GLOW}
${therm ? GLSL_THERM : ''}
float beadTemp() { return ${therm ? 'max(vHeat, thermSample(jointCoord(vJoint)).x)' : 'vHeat'}; }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if (vTau >= 0.0 && vRip.y > 0.0) {
  float edge = (vTau - 0.5) * 2.0;
  float ph = vX * uDir / max(vRip.x, 0.3) + 1.4 * edge * edge;
  float aa = clamp(1.5 - fwidth(ph) * 3.0, 0.0, 1.0);
  float d = cos(6.2831853 * ph) * vRip.y * sin(3.14159 * clamp(vTau, 0.0, 1.0)) * aa;
  normal = normalize(normal + vAxis * d * 0.38 * (gl_FrontFacing ? 1.0 : -1.0));
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float Tb = beadTemp();
if (thermView > 0.5) diffuseColor.rgb = thermalPalette(Tb) * 0.35;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, vSlag);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.05, vSlag);\nif (thermView > 0.5) metalnessFactor = 0.0;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += incandescence(Tb) * (1.0 - 0.35 * vSlag);
if (thermView > 0.5) totalEmissiveRadiance += thermalPalette(Tb) * 0.6;`);
  };
  return mat;
}
