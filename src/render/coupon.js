// Coupon (test plates) for each joint type, built in joint-local millimetres and placed on the
// bench by the joint frame. Holds the bead mesh(es), surface marks, the thermal view (plate glow
// and heat tint from the heat-flow model) and the weld pool.

import * as THREE from 'three';
import { boxFromAxes, extrudeUV, mergeGeometries, jointPlacement, quadsToGeometry } from './frames.js';
import { heatTintMaterial } from './heat.js';
import { BeadMesh } from './bead.js';
import { Marks } from './marks.js';
import { millScale } from './textures.js';
import { ThermalView } from './thermalTex.js';
import { ThermalModel } from '../sim/thermal.js';
import { PoolMesh } from './pool.js';
import { RootMesh } from './rootBead.js';
import { pipePoint, pipeFrame, xAtClock } from '../sim/pipe.js';

const S2 = Math.SQRT1_2;
let MILL = null;

function ccw(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a < 0 ? poly.slice().reverse() : poly;
}

function addVec(a, b, k = 1) {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

// Surface of revolution about the pipe axis (pipe-local Y) of the profile segment p0 -> p1, points
// [r, u] (mm): vertex at angle a is (r sin a, u, -r cos a) as in sim/pipe.js. The normal is the profile
// normal (du, -dr) turned round; uv in units of 100 mm (mill-scale texture).
function revolve(p0, p1, N, R) {
  const pos = [], nor = [], uv = [];
  const dr = p1[0] - p0[0], du = p1[1] - p0[1];
  const len = Math.hypot(dr, du) || 1;
  const nr = du / len, nu = -dr / len;
  const ring = (a, p) => [p[0] * Math.sin(a), p[1], -p[0] * Math.cos(a)];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    const q = [ring(a0, p0), ring(a1, p0), ring(a1, p1), ring(a0, p1)];
    const n = (a) => [nr * Math.sin(a), nu, -nr * Math.cos(a)];
    const nq = [n(a0), n(a1), n(a1), n(a0)];
    const uq = [[(a0 * R) / 100, 0], [(a1 * R) / 100, 0], [(a1 * R) / 100, len / 100], [(a0 * R) / 100, len / 100]];
    // winding so that the front face looks along the normal
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const front = c[0] * nq[0][0] + c[1] * nq[0][1] + c[2] * nq[0][2] >= 0;
    const tri = front ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const t of tri) {
      pos.push(...q[t]);
      nor.push(...nq[t]);
      uv.push(...uq[t]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Two pipes with a single-V groove and an open root (sim/pipe.js): outside, bevel, land (root face),
// bore and end face of each.
export function pipeGeometry(joint) {
  const p = joint.pipe;
  const R = p.R, t = joint.t, f = joint.rootFace, g = joint.rootGap, len = p.length;
  const bev = (t - f) * joint.halfTan;
  const N = R > 50 ? 144 : 72;
  const one = [[R, -len], [R, -(g / 2 + bev)], [R - t + f, -g / 2], [R - t, -g / 2], [R - t, -len], [R, -len]];
  const geos = [];
  for (const side of [1, -1]) {
    const pts = side === 1 ? one : one.map(([r, u]) => [r, -u]).reverse();
    for (let k = 0; k < pts.length - 1; k++) geos.push(revolve(pts[k], pts[k + 1], N, R));
  }
  return mergeGeometries(geos);
}

export function plateGeometry(joint) {
  if (joint.pipe) return pipeGeometry(joint);
  const L = joint.L, t = joint.t;
  if (joint.type === 'plate') {
    const W = joint.width;
    return extrudeUV(ccw([[-W / 2, -t], [W / 2, -t], [W / 2, 0], [-W / 2, 0]]), L);
  }
  if (joint.type === 'fillet') {
    // T-joint: the base plate runs `backExt` mm beyond the back face of the web
    const back = joint.backExt ?? 40;
    const d1 = [0, S2, S2], n1 = [0, -S2, S2];
    const d2 = [0, -S2, S2], n2 = [0, S2, S2];
    const baseO = addVec(addVec([0, 0, 0], d1, -(t + back)), n1, -t);
    const base = boxFromAxes(baseO, [L, 0, 0], [0, d1[1] * (150 + t + back), d1[2] * (150 + t + back)], [0, n1[1] * t, n1[2] * t]);
    const webO = addVec([0, 0, 0], n2, -t);
    const webH = joint.webH ?? 100;
    const web = boxFromAxes(webO, [L, 0, 0], [0, d2[1] * webH, d2[2] * webH], [0, n2[1] * t, n2[2] * t]);
    return mergeGeometries([base, web]);
  }
  const g = joint.rootGap, f = joint.rootFace;
  const bev = (t - f) * joint.halfTan;
  const W = joint.plateW ?? 100;
  const p1 = ccw([[-g / 2, -t], [-g / 2, -t + f], [-(g / 2 + bev), 0], [-W, 0], [-W, -t]]);
  const mis = joint.misalignment || 0;
  const p2 = ccw([[g / 2, -t - mis], [W, -t - mis], [W, -mis], [g / 2 + bev, -mis], [g / 2, -t + f - mis]]);
  const bk = joint.backing;
  const back = ccw([[-bk.width / 2, -t - bk.thickness], [bk.width / 2, -t - bk.thickness], [bk.width / 2, -t], [-bk.width / 2, -t]]);
  return mergeGeometries([extrudeUV(p1, L), extrudeUV(p2, L), extrudeUV(back, L)]);
}

// Pipe: soapstone marks on the first pipe beside the joint at the clock positions, the 12 o'clock one
// long (ISO 9606-1 6.1: "for fixed pipe welds, the 12 o'clock welding position shall also be marked").
// Each mark is a thin strip on the outside surface, mapped round the pipe.
function pipeScribe(joint) {
  const geos = [];
  const u0 = -(joint.topWidth / 2 + 16);
  const strip = (x, len, w) => {
    // corners in joint-local (x, u, v) just above the surface, mapped to pipe-local
    const c = [[x - w / 2, u0 - len, 0.04], [x + w / 2, u0 - len, 0.04], [x + w / 2, u0, 0.04], [x - w / 2, u0, 0.04]].map(([a, b, v]) => pipePoint(joint, a, b, v));
    geos.push(quadsToGeometry([[c[0], c[1], c[2], c[3]]]));
  };
  const clocks = joint.pipe.axis === 'vertical' ? [] : [12, 3, 6, 9];
  for (const h of clocks) strip(xAtClock(joint, h), h === 12 ? 22 : 9, h === 12 ? 1.6 : 1.1);
  if (!clocks.length) strip(0, 9, 1.1);
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}

// Scribed lines marking the evaluation length (run-on / run-off zones are not judged), the lanes
// of a drill plate and any stop marks (B7). x here is physical (mirrored for left-handers).
function scribeMarks(joint, mirror) {
  const geos = [];
  const X = (x) => (mirror ? joint.L - x : x);
  const xs = [joint.tab, joint.L - joint.tab];
  for (const xx of xs) {
    const x = X(xx);
    if (joint.type === 'fillet') {
      geos.push(boxFromAxes([x - 0.3, 9 * S2, 9 * S2 + 0.05], [0.6, 0, 0], [0, 14 * S2, 14 * S2], [0, -0.2 * S2, 0.2 * S2]));
      geos.push(boxFromAxes([x - 0.3, -9 * S2, 9 * S2 + 0.05], [0.6, 0, 0], [0, -14 * S2, 14 * S2], [0, 0.2 * S2, 0.2 * S2]));
    } else if (joint.type === 'plate') {
      for (const c of joint.lanes) geos.push(boxFromAxes([x - 0.3, c - 7, 0.02], [0.6, 0, 0], [0, 14, 0], [0, 0, 0.12]));
    } else {
      const half = joint.topWidth / 2 + 3;
      geos.push(boxFromAxes([x - 0.3, -half - 14, 0.02], [0.6, 0, 0], [0, 14, 0], [0, 0, 0.15]));
      geos.push(boxFromAxes([x - 0.3, half, 0.02 - (joint.misalignment || 0)], [0.6, 0, 0], [0, 14, 0], [0, 0, 0.15]));
    }
  }
  if (joint.type === 'plate') {
    // dotted lane centre lines (soapstone) along the plate
    for (const c of joint.lanes) {
      for (let x = 4; x < joint.L - 4; x += 8) geos.push(boxFromAxes([x, c - 0.35, 0.02], [4, 0, 0], [0, 0.7, 0], [0, 0, 0.1]));
    }
  }
  for (const m of joint.marks || []) {
    const x = X(m);
    if (joint.type === 'fillet') geos.push(boxFromAxes([x - 0.4, 11 * S2, 11 * S2 + 0.05], [0.8, 0, 0], [0, 18 * S2, 18 * S2], [0, -0.2 * S2, 0.2 * S2]));
    else if (joint.type === 'plate') for (const c of joint.lanes) geos.push(boxFromAxes([x - 0.4, c + 7, 0.02], [0.8, 0, 0], [0, 12, 0], [0, 0, 0.14]));
    else geos.push(boxFromAxes([x - 0.4, joint.topWidth / 2 + 4, 0.02], [0.8, 0, 0], [0, 14, 0], [0, 0, 0.15]));
  }
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}

export class Coupon {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.mirror = !!opts.mirror;
    this.place = jointPlacement(joint);
    this.group = new THREE.Group();
    this.group.name = 'coupon';
    this.group.matrixAutoUpdate = false;
    this.group.matrix.copy(this.place.jointToBench);
    this.group.matrixWorldNeedsUpdate = true;
    this.thermal = opts.thermal || new ThermalModel(joint);
    this.view = new ThermalView(this.thermal, { mirror: this.mirror });
    if (!MILL) MILL = millScale();
    this.plateMat = heatTintMaterial({ map: MILL, color: 0xffffff, metalness: 0.35, roughness: 0.68, side: THREE.DoubleSide }, this.view, joint);
    this.plates = new THREE.Mesh(plateGeometry(joint), this.plateMat);
    this.plates.name = 'plates';
    this.group.add(this.plates);
    const scribe = new THREE.Mesh(joint.pipe ? pipeScribe(joint) : scribeMarks(joint, this.mirror), new THREE.MeshBasicMaterial({ color: 0xd8d2c0, side: THREE.DoubleSide }));
    scribe.name = 'scribe';
    this.group.add(scribe);
    if (opts.oily) this.addContamination(opts.oily);
    // bead: one mesh showing the top pass (joints) or one mesh per pass (bead-on-plate drills)
    this.beads = [];
    if (joint.type === 'plate') {
      this.beadGroup = new THREE.Group();
      this.group.add(this.beadGroup);
    } else {
      this.bead = new BeadMesh(joint, { mirror: this.mirror, uniforms: this.view.uniforms });
      this.beads.push(this.bead);
      this.group.add(this.bead.mesh);
    }
    // open root (pipe): the inside of the root run, seen from the bore
    if (joint.openRoot) {
      this.root = new RootMesh(joint, { uniforms: this.view.uniforms });
      this.group.add(this.root.mesh);
    }
    this.marks = new Marks(joint, { mirror: this.mirror });
    this.group.add(this.marks.group);
    this.pool = new PoolMesh(joint, { mirror: this.mirror, uniforms: this.view.uniforms });
    this.group.add(this.pool.mesh);
  }

  // Bead mesh for pass k (bead-on-plate drills create them on demand).
  beadFor(k) {
    if (this.joint.type !== 'plate') return this.bead;
    while (this.beads.length <= k) {
      const b = new BeadMesh(this.joint, { mirror: this.mirror, passIndex: this.beads.length, uniforms: this.view.uniforms });
      this.beads.push(b);
      this.beadGroup.add(b.mesh);
    }
    return this.beads[k];
  }

  // Rebuild samples i0..i1 of the bead(s) carrying pass k (or every bead).
  updateBead(rec, i0, i1, now, k = null) {
    if (this.root && rec.passes.length === 1) this.root.update(rec, i0, i1);
    if (this.joint.type !== 'plate') return this.bead.update(rec, i0, i1, now);
    if (k != null) return this.beadFor(k).update(rec, i0, i1, now);
    for (let q = 0; q < rec.passes.length; q++) this.beadFor(q).update(rec, i0, i1, now);
  }

  refreshBeads(rec, now) {
    if (this.root) this.root.refreshAll(rec);
    if (this.joint.type !== 'plate') return this.bead.refreshAll(rec, now);
    for (let q = 0; q < rec.passes.length; q++) this.beadFor(q).refreshAll(rec, now);
  }

  flushBeads() {
    for (const b of this.beads) b.flush();
    if (this.root) this.root.flush();
  }

  // Pipe rotated during welding (1G): turn the coupon about its axis (the weld record does not change).
  setRoll(roll) {
    if (!this.joint.pipe) return;
    this.joint.pipe.roll = roll;
    this.place = jointPlacement(this.joint);
    this.group.matrix.copy(this.place.jointToBench);
    this.group.matrixWorldNeedsUpdate = true;
  }

  // Oil / thick primer patch (troubleshoot scenario): a dark glossy film along part of the joint.
  addContamination({ s0, s1 }) {
    const j = this.joint;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1408, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const geos = [];
    const xa = this.mirror ? j.L - s1 : s0, xb = this.mirror ? j.L - s0 : s1;
    if (j.type === 'fillet') {
      geos.push(boxFromAxes([xa, 0.2 * S2, 0.2 * S2 + 0.02], [xb - xa, 0, 0], [0, 25 * S2, 25 * S2], [0, -0.05, 0.05]));
      geos.push(boxFromAxes([xa, -0.2 * S2, 0.2 * S2 + 0.02], [xb - xa, 0, 0], [0, -25 * S2, 25 * S2], [0, 0.05, 0.05]));
    } else {
      geos.push(boxFromAxes([xa, -30, 0.03], [xb - xa, 0, 0], [0, 60, 0], [0, 0, 0.05]));
    }
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.name = 'contamination';
    this.contamination = m;
    this.group.add(m);
  }

  clearContamination() {
    if (this.contamination) {
      this.group.remove(this.contamination);
      this.contamination.geometry.dispose();
      this.contamination = null;
    }
  }

  // world <-> joint-local helpers (bench = parent workstation group)
  benchToJoint() {
    return this.place.benchToJoint;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.view.dispose();
  }
}

// Physical x (mm along the plates) for record sample position s, honouring left-handed mirroring.
export function physX(coupon, s) {
  return coupon.mirror ? coupon.joint.L - s : s;
}
