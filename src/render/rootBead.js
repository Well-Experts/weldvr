// Inside of an open-root weld (pipe): the underside of the root run as seen from the bore. Built from the
// root run's samples of the weld record (sim/record.js openRootSide): the inside bead (protrusion), a
// concave root (suck-back), a burn-through, and no metal where the root did not penetrate (the gap stays
// open there). Joint-local profile mapped round the pipe like the bead (sim/pipe.js pipePoint).

import * as THREE from 'three';
import { pipePoint, wrapIndex } from '../sim/pipe.js';
import { beadMaterial } from './bead.js';
import { rng, hashSeed } from '../sim/util.js';

const M = 11; // points across: 0 and 10 on the bore beside the bead, 1..9 the bead face

export class RootMesh {
  constructor(joint, opts = {}) {
    this.joint = joint;
    const n = joint.n;
    this.n = n;
    this.pos = new Float32Array(n * M * 3);
    this.nor = new Float32Array(n * M * 3);
    this.col = new Float32Array(n * M * 3);
    this.heat = new Float32Array(n * M);
    this.zero1 = new Float32Array(n * M);
    this.rip = new Float32Array(n * M * 2);
    this.tau = new Float32Array(n * M).fill(-1); // no ripple shading on the inside
    this.jx = new Float32Array(n * M);
    for (let i = 0; i < n; i++) for (let k = 0; k < M; k++) this.jx[i * M + k] = i + 0.5;
    this.pp = [0, 0, 0];
    const idx = [];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      for (let k = 0; k < M - 1; k++) {
        const a = i * M + k, b = i2 * M + k, c = i2 * M + k + 1, d = i * M + k + 1;
        idx.push(a, b, d, b, c, d); // faces the pipe axis: t x u = -v
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNor);
    g.setAttribute('color', this.aCol);
    g.setAttribute('heat', new THREE.BufferAttribute(this.heat, 1));
    g.setAttribute('slag', new THREE.BufferAttribute(this.zero1, 1));
    g.setAttribute('rip', new THREE.BufferAttribute(this.rip, 2));
    g.setAttribute('tau', new THREE.BufferAttribute(this.tau, 1));
    g.setAttribute('jx', new THREE.BufferAttribute(this.jx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), joint.pipe.R + 20);
    this.geometry = g;
    this.material = beadMaterial(1, opts.uniforms);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'rootBead';
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.collapse(i);
    this.computeNormals(0, n - 1);
    this.dirtyA = Infinity;
    this.dirtyB = -1;
  }

  set(o, x, u, v) {
    const p = pipePoint(this.joint, x, u, v, this.pp);
    this.pos[o] = p[0];
    this.pos[o + 1] = p[1];
    this.pos[o + 2] = p[2];
  }

  // no root metal: a flat strip just above the bore, hidden in the gap
  collapse(i) {
    const j = this.joint;
    for (let k = 0; k < M; k++) {
      this.set((i * M + k) * 3, i + 0.5, 0, -j.t + j.rootFace * 0.5);
      const o = (i * M + k) * 3;
      this.col[o] = 0.02; this.col[o + 1] = 0.02; this.col[o + 2] = 0.02;
    }
  }

  buildSample(rec, i) {
    const j = this.joint;
    const p0 = rec.passes[0];
    const s = p0 && p0.area[i] > 0.05 ? rec.sample(0, i) : null;
    if (!s || s.rootH == null || s.lop > 0) {
      this.collapse(i);
      return;
    }
    const W = s.rootW;
    const h = s.rootH;
    const rand = rng(hashSeed(rec.seed, i, 41));
    const ripple = 0.08 * Math.sin(i * 1.9) + 0.05 * (rand() - 0.5); // an uneven inside bead (visual)
    const x = i + 0.5;
    const base = -j.t - 0.03;
    for (let k = 0; k < M; k++) {
      const o = (i * M + k) * 3;
      let u, v;
      if (k === 0 || k === M - 1) {
        u = (k === 0 ? -1 : 1) * (W / 2 + 0.8);
        v = base;
      } else {
        const f = (k - 1) / (M - 3); // 0..1 across the bead face
        u = -W / 2 + f * W;
        const xx = 2 * f - 1;
        v = base - (h + ripple) * (1 - xx * xx);
      }
      this.set(o, x, u, v);
      // oxidised root metal (dark grey-blue); a burn-through shows as a dark hole with sagged metal
      let r = 0.12, g = 0.12, b = 0.135;
      if (s.burn) { r = 0.025; g = 0.022; b = 0.02; }
      else if (h < 0) { r = 0.1; g = 0.095; b = 0.1; }
      const sh = 0.9 + 0.2 * rand();
      this.col[o] = r * sh; this.col[o + 1] = g * sh; this.col[o + 2] = b * sh;
    }
  }

  update(rec, i0, i1) {
    const a = i0 - 2, b = i1 + 2;
    for (let i = a; i <= b; i++) this.buildSample(rec, wrapIndex(this.joint, i));
    for (let i = a - 1; i <= b + 1; i++) this.computeNormals(wrapIndex(this.joint, i), wrapIndex(this.joint, i));
    const wa = wrapIndex(this.joint, a - 1), wb = wrapIndex(this.joint, b + 1);
    if (wa <= wb) this.markDirty(wa, wb);
    else this.markDirty(0, this.n - 1);
  }

  refreshAll(rec) {
    for (let i = 0; i < this.n; i++) this.buildSample(rec, i);
    this.computeNormals(0, this.n - 1);
    this.markDirty(0, this.n - 1);
  }

  markDirty(a, b) {
    if (a < this.dirtyA) this.dirtyA = a;
    if (b > this.dirtyB) this.dirtyB = b;
  }

  flush() {
    if (this.dirtyB < this.dirtyA) return;
    const a = this.dirtyA * M, cnt = (this.dirtyB - this.dirtyA + 1) * M;
    for (const [attr, size] of [[this.aPos, 3], [this.aNor, 3], [this.aCol, 3]]) {
      attr.addUpdateRange(a * size, cnt * size);
      attr.needsUpdate = true;
    }
    this.dirtyA = Infinity;
    this.dirtyB = -1;
  }

  computeNormals(i0, i1) {
    const p = this.pos, nrm = this.nor, n = this.n;
    for (let i = i0; i <= i1; i++) {
      const ia = (i + n - 1) % n, ib = (i + 1) % n;
      for (let k = 0; k < M; k++) {
        const ka = Math.max(0, k - 1), kb = Math.min(M - 1, k + 1);
        const o = (i * M + k) * 3;
        const oa = (ia * M + k) * 3, ob = (ib * M + k) * 3, oc = (i * M + ka) * 3, od = (i * M + kb) * 3;
        const tx = [p[ob] - p[oa], p[ob + 1] - p[oa + 1], p[ob + 2] - p[oa + 2]];
        const ty = [p[od] - p[oc], p[od + 1] - p[oc + 1], p[od + 2] - p[oc + 2]];
        // the inside bead faces the pipe axis: t x u = -v
        const nx = tx[1] * ty[2] - tx[2] * ty[1];
        const ny = tx[2] * ty[0] - tx[0] * ty[2];
        const nz = tx[0] * ty[1] - tx[1] * ty[0];
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[o] = nx / l; nrm[o + 1] = ny / l; nrm[o + 2] = nz / l;
      }
    }
  }
}
