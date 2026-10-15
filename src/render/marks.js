// Discrete surface features from the weld record: surface pores, spatter balls, arc strikes,
// crater cracks and surface centreline cracks. All in joint-local millimetres.

import * as THREE from 'three';
import { surfaceHeight } from '../sim/session.js';
import { pipePoint, dirFromJoint } from '../sim/pipe.js';

const S2 = Math.SQRT1_2;
const MAX_PORES = 400, MAX_SPATTER = 900, MAX_STRIKES = 40;

function strikeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(210,205,195,1)');
  g.addColorStop(0.25, 'rgba(90,80,70,1)');
  g.addColorStop(0.55, 'rgba(25,22,20,0.9)');
  g.addColorStop(0.8, 'rgba(60,45,90,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Marks {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.mirror = opts.mirror || false;
    this.group = new THREE.Group();
    this.group.name = 'marks';
    const sph = new THREE.SphereGeometry(0.5, 10, 8);
    this.pores = new THREE.InstancedMesh(sph, new THREE.MeshStandardMaterial({ color: 0x0b0907, roughness: 0.9, metalness: 0.1 }), MAX_PORES);
    this.spatter = new THREE.InstancedMesh(sph, new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.35, metalness: 0.85 }), MAX_SPATTER);
    this.strikes = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ map: strikeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX_STRIKES);
    for (const m of [this.pores, this.spatter, this.strikes]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.crackGeo = new THREE.BufferGeometry();
    this.cracks = new THREE.LineSegments(this.crackGeo, new THREE.LineBasicMaterial({ color: 0x050403 }));
    this.cracks.frustumCulled = false;
    this.group.add(this.cracks);
    this.tmp = new THREE.Object3D();
  }

  x(s) {
    return this.mirror && !this.joint.pipe ? this.joint.L - s : s;
  }

  // joint-local point (x along the joint, u, v) -> coupon frame (mapped round a pipe)
  at(x, u, v, out) {
    if (this.joint.pipe) {
      const p = pipePoint(this.joint, x, u, v, this.pp || (this.pp = [0, 0, 0]));
      return out.set(p[0], p[1], p[2]);
    }
    return out.set(this.x(x), u, v);
  }

  plateNormal(u) {
    if (this.joint.type === 'fillet') return u >= 0 ? [-S2, S2] : [S2, S2];
    return [0, 1];
  }

  // Place an instance on the weld/plate surface at sample s (mm), lateral u.
  put(mesh, idx, rec, s, u, scale, sink = 0, flat = false) {
    const v = surfaceHeight(rec, Math.floor(s), u);
    const t = this.tmp;
    this.at(s, u, v - sink, t.position);
    t.scale.set(scale, scale, scale);
    if (flat) {
      const [nu, nv] = this.plateNormal(u);
      if (this.joint.pipe) {
        const d = dirFromJoint(this.joint, s, [0, nu, nv]);
        t.lookAt(t.position.x + d[0], t.position.y + d[1], t.position.z + d[2]);
      } else t.lookAt(this.x(s), u + nu, v + nv);
    } else t.rotation.set(0, 0, 0);
    t.updateMatrix();
    mesh.setMatrixAt(idx, t.matrix);
  }

  rebuild(rec, upTo = Infinity) {
    const j = this.joint;
    let np = 0, ns = 0;
    const crackPts = [];
    for (let k = 0; k < rec.passes.length; k++) {
      const p = rec.passes[k];
      const plate = j.type === 'plate';
      for (let i = 0; i < j.n && i <= upTo; i++) {
        if (p.area[i] <= 0.05) continue;
        if (!plate && rec.topPassAt(i) !== k) continue;
        const smp = rec.sample(k, i);
        if (!smp) continue;
        for (const po of smp.events.pores) {
          if (!po.surface || np >= MAX_PORES) continue;
          if (plate && rec.coveredOnPlate(k, i, po.u)) continue;
          this.put(this.pores, np++, rec, po.s, po.u, po.d, po.d * 0.3);
        }
        for (const sp of smp.events.spatter) {
          if (ns >= MAX_SPATTER) break;
          let u, v;
          if (plate) {
            u = smp.uc + sp.side * (smp.wb / 2 + sp.r);
            v = surfaceHeight(rec, i, u);
          } else if (j.type === 'fillet') {
            const leg = sp.side > 0 ? smp.z1 : smp.z2;
            const r = leg + sp.r;
            u = sp.side > 0 ? r * S2 : -r * S2;
            v = r * S2;
          } else {
            const half = (smp.wcap || smp.wb || 10) / 2;
            u = sp.side * (half + sp.r);
            v = 0;
          }
          const t = this.tmp;
          const [nu, nv] = this.plateNormal(u);
          this.at(sp.s, u + nu * sp.d * 0.3, v + nv * sp.d * 0.3 - (j.type === 'butt' && u > 0 ? j.misalignment : 0), t.position);
          t.scale.setScalar(sp.d);
          t.rotation.set(0, 0, 0);
          t.updateMatrix();
          this.spatter.setMatrixAt(ns++, t.matrix);
        }
        if (smp.crackCentre && !(plate && rec.coveredOnPlate(k, i, smp.uc))) {
          const c0 = plate ? smp.uc : 0;
          const v = surfaceHeight(rec, i, c0) + 0.05;
          const wig = Math.sin(i * 1.7) * 0.25;
          const q0 = this.at(i, c0 + wig, v, this.tmpA || (this.tmpA = new THREE.Vector3()));
          const q1 = this.at(i + 1, c0 + Math.sin((i + 1) * 1.7) * 0.25, v, this.tmpB || (this.tmpB = new THREE.Vector3()));
          crackPts.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z);
        }
      }
      for (const st of p.stops) {
        const c0 = plate ? st.u ?? 0 : 0;
        const ii = Math.max(0, Math.min(j.n - 1, Math.round(st.s)));
        if (!st.crack || (plate ? rec.coveredOnPlate(k, ii, c0) : rec.topPassAt(ii) !== k)) continue;
        const v = surfaceHeight(rec, Math.floor(st.s), c0) + 0.05;
        for (let q = 0; q < 4; q++) {
          const a = (q / 4) * Math.PI * 2 + 0.4;
          const l = st.crackLen * (0.6 + 0.4 * ((q * 37) % 5) / 5);
          const q0 = this.at(st.s, c0, v, this.tmpA || (this.tmpA = new THREE.Vector3()));
          const q1 = this.at(st.s + Math.cos(a) * l, c0 + Math.sin(a) * l, v, this.tmpB || (this.tmpB = new THREE.Vector3()));
          crackPts.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z);
        }
      }
    }
    let nk = 0;
    for (const as of rec.arcStrikes) {
      if (nk >= MAX_STRIKES) break;
      this.put(this.strikes, nk++, rec, as.s, as.u, 2.4, -0.03, true);
    }
    this.pores.count = np;
    this.spatter.count = ns;
    this.strikes.count = nk;
    for (const m of [this.pores, this.spatter, this.strikes]) m.instanceMatrix.needsUpdate = true;
    this.crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPts, 3));
    this.crackGeo.computeBoundingSphere();
  }
}
