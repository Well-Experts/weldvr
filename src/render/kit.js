// Welding kit around the bench: wire feeder with a turning spool, the gun cable hanging from the
// gun (a rope simulation that drapes over the bench), the work lead and earth clamp, and the gas
// hose from the regulator. Everything is in the bench (workstation) frame, metres.

import * as THREE from 'three';
import { mergeStatic } from './merge.js';

const UP = new THREE.Vector3(0, 1, 0);

// Verlet rope with pinned ends, gravity and collision with the bench top and the floor, drawn
// as a tube whose vertices are rewritten in place (no allocation per frame).
export class Rope {
  constructor({ n = 24, length = 1.6, radius = 0.011, color = 0x17181a, sides = 10, sub = 3, roughness = 0.85 } = {}) {
    this.n = n;
    this.rest = length / (n - 1);
    this.radius = radius;
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3); // previous positions
    this.pinA = new THREE.Vector3();
    this.pinB = new THREE.Vector3();
    this.floorY = -0.9;
    this.table = { x0: -0.6, x1: 0.6, z0: -0.345, z1: 0.305, y: 0 };
    this.sides = sides;
    this.sub = sub;
    this.rings = (n - 1) * sub + 1;
    const nv = this.rings * (sides + 1);
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    const idx = [];
    for (let r = 0; r < this.rings - 1; r++) {
      for (let s = 0; s < sides; s++) {
        const a = r * (sides + 1) + s, b = (r + 1) * (sides + 1) + s;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNor);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 }));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'rope';
    this.inited = false;
    this.c = [];
    for (let k = 0; k < this.rings; k++) this.c.push(new THREE.Vector3());
    this.t0 = new THREE.Vector3();
    this.nn = new THREE.Vector3();
    this.bb = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  pin(a, b) {
    this.pinA.copy(a);
    this.pinB.copy(b);
    if (!this.inited) {
      // start as a sagging line between the pins
      for (let k = 0; k < this.n; k++) {
        const f = k / (this.n - 1);
        const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        const y = a.y + (b.y - a.y) * f - Math.sin(Math.PI * f) * 0.3;
        this.p[k * 3] = this.q[k * 3] = x;
        this.p[k * 3 + 1] = this.q[k * 3 + 1] = y;
        this.p[k * 3 + 2] = this.q[k * 3 + 2] = z;
      }
      this.inited = true;
    }
  }

  step(dt, iters = 6) {
    const n = this.n, p = this.p, q = this.q;
    const h = Math.min(dt, 1 / 30);
    const g = -9.81 * h * h;
    for (let k = 1; k < n - 1; k++) {
      for (let c = 0; c < 3; c++) {
        const o = k * 3 + c;
        const v = (p[o] - q[o]) * 0.97;
        q[o] = p[o];
        p[o] += v + (c === 1 ? g : 0);
      }
    }
    for (let it = 0; it < iters; it++) {
      p[0] = this.pinA.x; p[1] = this.pinA.y; p[2] = this.pinA.z;
      const e = (n - 1) * 3;
      p[e] = this.pinB.x; p[e + 1] = this.pinB.y; p[e + 2] = this.pinB.z;
      for (let k = 0; k < n - 1; k++) {
        const a = k * 3, b = a + 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d <= this.rest) continue; // a cable is slack in compression
        const corr = (d - this.rest) / d;
        const wa = k === 0 ? 0 : 0.5, wb = k + 1 === n - 1 ? 0 : 0.5;
        const s = wa + wb > 0 ? 1 / (wa + wb) : 0;
        p[a] += dx * corr * wa * s; p[a + 1] += dy * corr * wa * s; p[a + 2] += dz * corr * wa * s;
        p[b] -= dx * corr * wb * s; p[b + 1] -= dy * corr * wb * s; p[b + 2] -= dz * corr * wb * s;
      }
      // collisions: bench top and floor
      const T = this.table, r = this.radius;
      for (let k = 1; k < n - 1; k++) {
        const o = k * 3;
        if (p[o] > T.x0 && p[o] < T.x1 && p[o + 2] > T.z0 && p[o + 2] < T.z1 && p[o + 1] < T.y + r && p[o + 1] > T.y - 0.05) p[o + 1] = T.y + r;
        if (p[o + 1] < this.floorY + r) p[o + 1] = this.floorY + r;
      }
    }
    this.build();
  }

  settle(steps = 200) {
    for (let k = 0; k < steps; k++) this.step(1 / 60);
  }

  build() {
    const n = this.n, p = this.p, sub = this.sub;
    // Catmull-Rom through the nodes
    let r = 0;
    const P = (k, out) => out.set(p[Math.max(0, Math.min(n - 1, k)) * 3], p[Math.max(0, Math.min(n - 1, k)) * 3 + 1], p[Math.max(0, Math.min(n - 1, k)) * 3 + 2]);
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    for (let k = 0; k < n - 1; k++) {
      P(k - 1, p0); P(k, p1); P(k + 1, p2); P(k + 2, p3);
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        this.c[r++].set(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
          0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        );
      }
    }
    P(n - 1, this.c[r++]);
    // rings with a rotation-minimising frame
    const sides = this.sides;
    const T = this.t0, N = this.nn, B = this.bb;
    T.subVectors(this.c[1], this.c[0]).normalize();
    N.copy(Math.abs(T.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).cross(T).normalize();
    let o = 0;
    for (let k = 0; k < this.rings; k++) {
      const a = this.c[Math.max(0, k - 1)], b = this.c[Math.min(this.rings - 1, k + 1)];
      const Tn = this.tmp.subVectors(b, a);
      if (Tn.lengthSq() > 1e-12) {
        Tn.normalize();
        // project the previous normal onto the new tangent plane
        N.addScaledVector(Tn, -N.dot(Tn)).normalize();
        T.copy(Tn);
      }
      B.crossVectors(T, N);
      const c = this.c[k];
      for (let s = 0; s <= sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = N.x * cs + B.x * sn, ny = N.y * cs + B.y * sn, nz = N.z * cs + B.z * sn;
        this.pos[o * 3] = c.x + nx * this.radius;
        this.pos[o * 3 + 1] = c.y + ny * this.radius;
        this.pos[o * 3 + 2] = c.z + nz * this.radius;
        this.nor[o * 3] = nx; this.nor[o * 3 + 1] = ny; this.nor[o * 3 + 2] = nz;
        o++;
      }
    }
    this.aPos.needsUpdate = true;
    this.aNor.needsUpdate = true;
  }
}

function spoolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20232a';
  ctx.fillRect(0, 0, 256, 256);
  // copper-coated wire windings
  for (let r = 40; r < 120; r += 2.2) {
    ctx.strokeStyle = r % 4.4 < 2.2 ? '#b8733f' : '#9a5c30';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3f47';
  ctx.beginPath();
  ctx.arc(128, 128, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9cdd3';
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * 22, 128 + Math.sin(a) * 22, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wire feeder case on top of the power source, with a window onto the spool and drive rolls.
export function buildFeeder() {
  const g = new THREE.Group();
  g.name = 'feeder';
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.55, metalness: 0.2 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.4), caseMat);
  box.position.set(0, 0.12, 0);
  g.add(box);
  // window on the side (+x) showing the spool
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.35 }));
  win.position.set(0.1205, 0.12, -0.04);
  win.rotation.y = Math.PI / 2;
  g.add(win);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.09, 32), [
    new THREE.MeshStandardMaterial({ color: 0x9a5c30, roughness: 0.4, metalness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: spoolTexture(), roughness: 0.45, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: spoolTexture(), roughness: 0.45, metalness: 0.5 }),
  ]);
  spool.rotation.z = Math.PI / 2;
  spool.position.set(0.06, 0.12, -0.04);
  g.add(spool);
  // drive rolls and the gun connector on the front (+z)
  const rollMat = new THREE.MeshStandardMaterial({ color: 0xb0b4ba, roughness: 0.3, metalness: 0.9 });
  for (const dy of [-0.012, 0.012]) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), rollMat);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0.11, 0.17 + dy, 0.12);
    g.add(roll);
  }
  const euro = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 }));
  euro.rotation.x = Math.PI / 2;
  euro.position.set(0, 0.07, 0.21);
  g.add(euro);
  const outlet = new THREE.Object3D();
  outlet.position.set(0, 0.07, 0.235);
  g.add(outlet);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 20, Math.PI), dark);
  handle.position.set(0, 0.24, -0.02);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  mergeStatic(g, [spool]);
  return { group: g, spool, outlet };
}

// Earth (work) clamp: spring clamp with copper jaws; `jaw` is where the work lead leaves it.
export function buildEarthClamp() {
  const g = new THREE.Group();
  g.name = 'earthClamp';
  const copper = new THREE.MeshStandardMaterial({ color: 0xc27a45, roughness: 0.35, metalness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.8, metalness: 0.05 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.026), copper);
    arm.position.set(0.045, s * 0.012, 0);
    arm.rotation.z = s * 0.12;
    g.add(arm);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.03), black);
    grip.position.set(0.085, s * 0.02, 0);
    grip.rotation.z = s * 0.12;
    g.add(grip);
  }
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, 6, 16), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 }));
  spring.position.set(0.035, 0, 0);
  g.add(spring);
  const lead = new THREE.Object3D();
  lead.position.set(0.12, 0, 0);
  g.add(lead);
  mergeStatic(g);
  return { group: g, lead };
}

// All the kit, attached to the bench group. env: buildEnvironment() result.
export class Kit {
  constructor(env) {
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'kit';
    env.bench.add(this.group);
    const f = buildFeeder();
    this.feeder = f;
    f.group.position.set(0, 0.3, -0.01);
    env.machine.add(f.group);
    this.gunCable = new Rope({ n: 26, length: 1.7, radius: 0.011, color: 0x141517 });
    this.group.add(this.gunCable.mesh);
    this.workLead = new Rope({ n: 20, length: 1.25, radius: 0.008, color: 0x1b1c1e });
    this.group.add(this.workLead.mesh);
    this.gasHose = new Rope({ n: 16, length: 1.3, radius: 0.0045, color: 0x2a4f9a, roughness: 0.6 });
    this.group.add(this.gasHose.mesh);
    const c = buildEarthClamp();
    this.clamp = c;
    this.group.add(c.group);
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.m = new THREE.Matrix4();
    this.staticDirty = true;
    this.spoolAngle = 0;
    this.circuit = { smaw: false, tig: false, polarity: 'DCEP' };
    this.leadStart = new THREE.Vector3(); // SMAW electrode lead at its output socket (bench frame)
  }

  // Welding circuit: MIG/MAG takes the gun cable from the wire feeder; SMAW plugs the electrode lead
  // and GTAW the torch's power cable into an output socket (the TIG argon hose then runs to the gas
  // inlet at the back of the power source). DCEP: electrode positive (red +), work lead on the negative
  // socket; DCEN the reverse; AC has no polarity (work lead on the left socket).
  setCircuit(process, polarity) {
    const smaw = process === '111' || process === '141'; // lead from an output socket
    const tig = process === '141';
    if (smaw === this.circuit.smaw && tig === this.circuit.tig && polarity === this.circuit.polarity) return;
    this.circuit = { smaw, tig, polarity };
    this.staticDirty = true;
  }

  setFloor(benchHeight) {
    for (const r of [this.gunCable, this.workLead, this.gasHose]) r.floorY = -benchHeight;
    this.staticDirty = true;
  }

  // Place the earth clamp on the bench edge on the machine side, and re-drape the static leads.
  layout(sx = 1) {
    // jaws over the front edge of the 25 mm table top, handles toward the welder
    this.clamp.group.position.set(0.5 * sx, -0.0125, 0.296);
    this.clamp.group.rotation.set(0, Math.PI / 2, 0);
    this.staticDirty = true;
  }

  // point of an Object3D in the bench frame
  benchPoint(obj, out) {
    obj.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(obj.matrixWorld);
    return this.env.bench.worldToLocal(out);
  }

  // gunEnd: world position of the cable end on the gun (or null to let the cable rest).
  update(dt, gunEnd, feeding, wfs = 0) {
    this.env.bench.updateWorldMatrix(true, false);
    if (this.staticDirty) {
      this.staticDirty = false;
      const m = this.env.machine;
      // output sockets on the machine front: x -0.06 black (-), +0.06 red (+)
      const pol = this.circuit.polarity;
      const workX = pol === 'DCEN' ? 0.06 : -0.06;
      this.leadStart.set(-workX, 0.035, 0.225);
      m.localToWorld(this.leadStart);
      this.env.bench.worldToLocal(this.leadStart);
      // work lead: machine front-lower socket to the clamp
      const sock = new THREE.Vector3(workX, 0.035, 0.225);
      m.localToWorld(sock);
      this.env.bench.worldToLocal(sock);
      const lead = this.benchPoint(this.clamp.lead, new THREE.Vector3());
      this.workLead.inited = false;
      this.workLead.pin(sock, lead);
      this.workLead.settle(240);
      // gas hose: regulator outlet to the back of the feeder (GTAW: to the power source's gas inlet)
      const cyl = this.env.flowAnchor;
      const ra = this.benchPoint(cyl, new THREE.Vector3());
      const fb = new THREE.Vector3(0, 0.12, -0.2);
      if (this.circuit.tig) {
        fb.set(0.06, 0.24, -0.212);
        m.localToWorld(fb);
      } else this.feeder.group.localToWorld(fb);
      this.env.bench.worldToLocal(fb);
      this.gasHose.inited = false;
      this.gasHose.pin(ra, fb);
      this.gasHose.settle(240);
      // the gun cable / electrode lead re-drapes from its new start
      if (this.cableFromSocket !== this.circuit.smaw) {
        this.cableFromSocket = this.circuit.smaw;
        this.gunCable.inited = false;
      }
    }
    const a = this.circuit.smaw ? this.v1.copy(this.leadStart) : this.benchPoint(this.feeder.outlet, this.v1);
    let b;
    if (gunEnd) b = this.env.bench.worldToLocal(this.v2.copy(gunEnd));
    else b = this.v2.set(a.x - 0.25, 0.02, a.z + 0.25);
    this.gunCable.pin(a, b);
    this.gunCable.step(dt);
    // spool turns with the wire feed (radius about 85 mm)
    if (feeding) this.spoolAngle += ((wfs / 60) / 0.085) * dt;
    this.feeder.spool.rotation.x = this.spoolAngle;
  }
}
