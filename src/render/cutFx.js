// Effects of the cut in the bench frame (metres): the stream of sparks and molten slag blown out of the
// bottom of the kerf by the cutting oxygen (leaning back with the drag of the cut; Harris: "The correct
// cutting speed is accompanied by a sputtering sound, and a steady stream of sparks"), slag spraying back up
// out of a cut that is not through (a pierce, or a lost cut: "slag fills the kerf"), slag drops falling into
// the tray and cooling there, the iron-oxide fume, and the orange light of the burning front.
// Particles fly ballistically and cool by radiation and convection (as render/effects.js); counts, speeds and
// sizes are display values.

import * as THREE from 'three';
import { softDot } from './textures.js';
import { incandescenceCPU } from './thermalTex.js';
import { RO_ARC } from './effects.js';
import { EMISSIVITY, SIGMA_SB } from '../sim/material.js';

const MAX_SPARKS = 1600;
const MAX_DROPS = 64;
const MAX_LANDED = 240;
const MAX_FUME = 80;

// The stream of burning steel and slag out of the bottom of the kerf, seen as a bright sheet in the plane of the
// cut (the kerf is a slot), narrow at the kerf and spreading as it falls, with streaks running down it (additive;
// display).
const STREAM_VS = /* glsl */ `
attribute vec2 sw; // s along the stream 0..1, w across -1..1
uniform vec3 uP0; uniform vec3 uDir; uniform vec3 uAcross; uniform float uLen; uniform float uW0; uniform float uW1;
varying vec2 vSW;
void main() {
  vec3 p = uP0 + uDir * (uLen * sw.x) + uAcross * (mix(uW0, uW1, sw.x) * sw.y);
  vSW = sw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STREAM_FS = /* glsl */ `
uniform float uTime; uniform float uGain; uniform vec3 uColor; uniform vec3 uColor2; uniform float uSeed;
varying vec2 vSW;
float h1(float n) { return fract(sin(n * 12.9898 + uSeed) * 43758.5453); }
void main() {
  float s = vSW.x, w = vSW.y;
  float core = exp(-w * w * 3.0);
  float fall = pow(1.0 - s, 1.3) * smoothstep(0.0, 0.04, s);
  float k = floor(w * 11.0 + 11.0);
  float streak = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(s * 38.0 * (0.7 + 0.6 * h1(k)) - uTime * (55.0 + 30.0 * h1(k + 3.0)) + 6.28 * h1(k + 7.0)), 3.0);
  gl_FragColor = vec4(mix(uColor, uColor2, smoothstep(0.0, 0.8, s)) * (uGain * core * fall * streak), 1.0);
}`;

function streamSheet() {
  const NS = 10, NW = 6;
  const sw = [], idx = [];
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NW; j++) sw.push(i / NS, (j / NW) * 2 - 1);
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NW; j++) {
      const a = i * (NW + 1) + j, b = a + 1, c = a + NW + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('sw', new THREE.Float32BufferAttribute(sw, 2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sw.length * 1.5), 3));
  g.setIndex(idx);
  return g;
}

export class CutFX {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cutfx';
    this.time = 0;
    // sparks: motion-blurred streaks
    // a ring buffer (n: its size; dead sparks have life <= 0), read by the safety monitor for hits on the hands
    this.sp = { p: new Float32Array(MAX_SPARKS * 3), q: new Float32Array(MAX_SPARKS * 3), v: new Float32Array(MAX_SPARKS * 3), T: new Float32Array(MAX_SPARKS), D: new Float32Array(MAX_SPARKS), life: new Float32Array(MAX_SPARKS), next: 0, n: MAX_SPARKS };
    this.spPos = new Float32Array(MAX_SPARKS * 6);
    this.spCol = new Float32Array(MAX_SPARKS * 6);
    const sg = new THREE.BufferGeometry();
    this.spPosAttr = new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.spColAttr = new THREE.BufferAttribute(this.spCol, 3).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.spPosAttr);
    sg.setAttribute('color', this.spColAttr);
    this.sparks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = RO_ARC;
    this.group.add(this.sparks);
    // molten slag drops (glowing spheres)
    this.dr = { p: new Float32Array(MAX_DROPS * 3), v: new Float32Array(MAX_DROPS * 3), T: new Float32Array(MAX_DROPS), r: new Float32Array(MAX_DROPS), life: new Float32Array(MAX_DROPS), next: 0 };
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_DROPS);
    this.dropMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 3), 3);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.dropMesh.renderOrder = RO_ARC;
    this.group.add(this.dropMesh);
    // landed slag in the tray (cooling beads)
    this.ld = { p: new Float32Array(MAX_LANDED * 3), T: new Float32Array(MAX_LANDED), r: new Float32Array(MAX_LANDED), n: 0, next: 0 };
    this.landMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_LANDED);
    this.landMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LANDED * 3), 3);
    this.landMesh.count = 0;
    this.landMesh.frustumCulled = false;
    this.group.add(this.landMesh);
    // fume
    this.fm = { p: new Float32Array(MAX_FUME * 3), v: new Float32Array(MAX_FUME * 3), life: new Float32Array(MAX_FUME), next: 0 };
    const fg = new THREE.BufferGeometry();
    this.fmAttr = new THREE.BufferAttribute(this.fm.p, 3).setUsage(THREE.DynamicDrawUsage);
    fg.setAttribute('position', this.fmAttr);
    this.fume = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0x6d5a4a, size: 0.045, map: softDot('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)', 64, 0.0), transparent: true, opacity: 0.22, depthWrite: false }));
    this.fume.frustumCulled = false;
    this.group.add(this.fume);
    for (let k = 0; k < MAX_FUME; k++) this.fm.p[k * 3 + 1] = -100;
    // the slag stream: one sheet in the plane of the cut and a narrower one across it
    const sheetGeo = streamSheet();
    // hotter at the kerf, cooling as it falls (colours of 2000 C and 1600 C steel, normalised)
    const col = incandescenceCPU(2000), col2 = incandescenceCPU(1600);
    const mx = Math.max(...col), mx2 = Math.max(...col2);
    this.sheets = [0, 1].map((k) => {
      const m = new THREE.Mesh(sheetGeo, new THREE.ShaderMaterial({
        vertexShader: STREAM_VS,
        fragmentShader: STREAM_FS,
        uniforms: {
          uP0: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, -1, 0) }, uAcross: { value: new THREE.Vector3(1, 0, 0) },
          uLen: { value: 0.1 }, uW0: { value: 0.001 }, uW1: { value: 0.02 }, uTime: { value: 0 }, uGain: { value: 0 },
          uColor: { value: new THREE.Color(col[0] / mx, col[1] / mx, col[2] / mx) }, uColor2: { value: new THREE.Color(col2[0] / mx2, col2[1] / mx2, col2[2] / mx2) }, uSeed: { value: k * 17.3 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }));
      m.frustumCulled = false;
      m.renderOrder = RO_ARC;
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.across = new THREE.Vector3();
    // light of the burning front
    this.light = new THREE.PointLight(0xff8a3a, 0, 1.2, 1.4);
    this.group.add(this.light);
    this.light2 = new THREE.PointLight(0xffa04a, 0, 0.8, 1.6);
    this.group.add(this.light2);
    this.acc = { sp: 0, dr: 0, fm: 0, bl: 0 };
    this.M = new THREE.Matrix4();
    this.tmp = new THREE.Vector3();
    this.floorY = 0;
    this.trayY = 0.03;
    this.tray = null; // { xa, xb, tz0, tz1 } bench rectangle of the sand tray
  }

  // spread: random spread round `dir`; along / spreadAlong: extra spread along one direction (the kerf is a slot:
  // the stream leaves the bottom as a sheet in the plane of the cut)
  emitSpark(p, dir, speed, spread, T, D, along = null, spreadAlong = 0) {
    const s = this.sp;
    const k = s.next;
    s.next = (s.next + 1) % MAX_SPARKS;
    const r = () => (Math.random() - 0.5) * 2 * spread;
    const ra = along ? (Math.random() - 0.5) * 2 * spreadAlong : 0;
    const vx = dir.x + r() + (along ? along.x * ra : 0), vy = dir.y + r() + (along ? along.y * ra : 0), vz = dir.z + r() + (along ? along.z * ra : 0);
    const n = Math.hypot(vx, vy, vz) || 1;
    const sp = speed * (0.6 + 0.8 * Math.random());
    s.p[k * 3] = p.x; s.p[k * 3 + 1] = p.y; s.p[k * 3 + 2] = p.z;
    s.q[k * 3] = p.x; s.q[k * 3 + 1] = p.y; s.q[k * 3 + 2] = p.z;
    s.v[k * 3] = (vx / n) * sp; s.v[k * 3 + 1] = (vy / n) * sp; s.v[k * 3 + 2] = (vz / n) * sp;
    s.T[k] = T;
    s.D[k] = D;
    s.life[k] = 1.6;
  }

  // st: { cutting, through, blow (0..1), rate (0..1), bottom, front (Vector3 bench), jet (unit, down the kerf),
  //       back (unit, behind the front), dragAng (rad), glow (0..1 heat at the front) }
  update(dt, st) {
    this.time += dt;
    const on = !!(st && st.cutting);
    if (on && st.through) {
      // stream out of the bottom, leaning back by the drag
      const dir = this.tmp.copy(st.jet).addScaledVector(st.back, Math.tan(Math.min(1.1, st.dragAng || 0)) * 0.9).normalize();
      this.acc.sp += dt * (500 + 1100 * st.rate);
      while (this.acc.sp >= 1) {
        this.acc.sp -= 1;
        this.emitSpark(st.bottom, dir, 7, 0.07, 1750 + 250 * Math.random(), 0.00025 + 0.0004 * Math.random(), st.back, 0.22);
      }
      this.acc.dr += dt * (10 + 20 * st.rate);
      while (this.acc.dr >= 1) {
        this.acc.dr -= 1;
        this.emitDrop(st.bottom, dir, 0.8 + Math.random() * 1.2);
      }
    }
    // the sheet of the stream down to the sand or the floor
    const sheetOn = on && st.through;
    for (const m of this.sheets) m.visible = sheetOn;
    if (sheetOn) {
      const dir = this.tmp.copy(st.jet).addScaledVector(st.back, Math.tan(Math.min(1.1, st.dragAng || 0)) * 0.9).normalize();
      const gy = this.ground(st.bottom.x, st.bottom.z);
      const len = Math.min(0.35, Math.max(0.02, (st.bottom.y - gy) / Math.max(0.2, -dir.y)));
      this.across.crossVectors(dir, st.back).normalize();
      const gain = (1.6 + 1.4 * Math.min(1.2, st.rate)) * (0.85 + 0.3 * Math.random());
      for (let k = 0; k < 2; k++) {
        const u = this.sheets[k].material.uniforms;
        u.uP0.value.copy(st.bottom);
        u.uDir.value.copy(dir);
        u.uLen.value = len;
        u.uTime.value = this.time;
        if (k === 0) {
          // in the plane of the cut: spreads along the travel
          u.uAcross.value.copy(st.back);
          u.uW0.value = 0.0015;
          u.uW1.value = 0.012 + 0.12 * len;
          u.uGain.value = gain;
        } else {
          u.uAcross.value.copy(this.across);
          u.uW0.value = 0.0008;
          u.uW1.value = 0.004 + 0.05 * len;
          u.uGain.value = gain * 0.6;
        }
      }
    }
    if (on && st.blow > 0) {
      // slag blown back up out of a cut that does not go through
      const up = this.tmp.copy(st.jet).multiplyScalar(-1).addScaledVector(st.back, 0.6).normalize();
      this.acc.bl += dt * 500 * st.blow;
      while (this.acc.bl >= 1) {
        this.acc.bl -= 1;
        this.emitSpark(st.front, up, 3.2, 0.45, 1700 + 200 * Math.random(), 0.0003 + 0.0004 * Math.random());
      }
    }
    if (on) {
      this.acc.fm += dt * 18;
      while (this.acc.fm >= 1) {
        this.acc.fm -= 1;
        const f = this.fm, k = f.next;
        f.next = (f.next + 1) % MAX_FUME;
        const src = Math.random() < 0.5 || !st.through ? st.front : st.bottom;
        f.p[k * 3] = src.x + (Math.random() - 0.5) * 0.01;
        f.p[k * 3 + 1] = src.y;
        f.p[k * 3 + 2] = src.z + (Math.random() - 0.5) * 0.01;
        f.v[k * 3] = (Math.random() - 0.5) * 0.05;
        f.v[k * 3 + 1] = 0.12 + Math.random() * 0.08;
        f.v[k * 3 + 2] = (Math.random() - 0.5) * 0.05;
        f.life[k] = 3;
      }
    }
    // light of the front (just above the plate, among the flame and the burning steel) and of the stream under it
    if (on) {
      this.light.position.copy(st.front);
      this.light.position.y += 0.005;
      this.light.intensity = (0.25 + 0.5 * st.rate) * (0.85 + 0.3 * Math.random());
    } else if (st && st.glow > 0) {
      this.light.position.copy(st.front);
      this.light.position.y += 0.005;
      this.light.intensity = 0.25 * st.glow;
    } else this.light.intensity = 0;
    if (on && st.through) {
      this.light2.position.copy(st.bottom);
      this.light2.position.y -= 0.03;
      this.light2.intensity = (0.4 + 0.8 * st.rate) * (0.8 + 0.4 * Math.random());
    } else this.light2.intensity = 0;
    this.stepSparks(dt);
    this.stepDrops(dt);
    this.stepLanded(dt);
    this.stepFume(dt);
  }

  emitDrop(p, dir, speed) {
    const d = this.dr, k = d.next;
    d.next = (d.next + 1) % MAX_DROPS;
    d.p[k * 3] = p.x; d.p[k * 3 + 1] = p.y; d.p[k * 3 + 2] = p.z;
    d.v[k * 3] = dir.x * speed + (Math.random() - 0.5) * 0.3;
    d.v[k * 3 + 1] = dir.y * speed;
    d.v[k * 3 + 2] = dir.z * speed + (Math.random() - 0.5) * 0.3;
    d.T[k] = 1500 + Math.random() * 150;
    d.r[k] = 0.0008 + Math.random() * 0.0012;
    d.life[k] = 3;
  }

  ground(x, z) {
    const t = this.tray;
    if (t && x > t.xa - 0.03 && x < t.xb + 0.03 && z > t.tz0 && z < t.tz1) return this.trayY;
    return this.floorY;
  }

  stepSparks(dt) {
    const s = this.sp;
    let m = 0;
    const g = 9.81;
    for (let k = 0; k < MAX_SPARKS; k++) {
      if (s.life[k] <= 0) continue;
      s.life[k] -= dt;
      const i = k * 3;
      s.q[i] = s.p[i]; s.q[i + 1] = s.p[i + 1]; s.q[i + 2] = s.p[i + 2];
      // drag (small drops slow quickly) and gravity
      const kd = Math.exp(-dt * (0.6 + 0.0004 / Math.max(s.D[k], 1e-4)));
      s.v[i] *= kd; s.v[i + 1] = s.v[i + 1] * kd - g * dt; s.v[i + 2] *= kd;
      s.p[i] += s.v[i] * dt; s.p[i + 1] += s.v[i + 1] * dt; s.p[i + 2] += s.v[i + 2] * dt;
      const gy = this.ground(s.p[i], s.p[i + 2]);
      if (s.p[i + 1] < gy) {
        // most sparks die in the sand; some skip off low
        s.p[i + 1] = gy;
        s.v[i + 1] = Math.abs(s.v[i + 1]) * 0.12;
        s.v[i] *= 0.4;
        s.v[i + 2] *= 0.4;
        if (Math.random() < 0.6) s.life[k] = 0;
      }
      // radiative + convective cooling of a small drop (EN 1993-1-2 emissivity)
      const T = s.T[k], Tk = T + 273.15;
      const q = EMISSIVITY * SIGMA_SB * (Tk ** 4 - 293 ** 4) + 60 * (T - 20);
      s.T[k] = T - (6 * q * dt) / (7000 * 700 * Math.max(s.D[k], 1e-4));
      if (s.T[k] < 500) s.life[k] = 0;
      if (s.life[k] <= 0) continue;
      // streak of a fixed exposure (12 ms) behind the spark, coloured by its temperature (as effects.js)
      const c = incandescenceCPU(s.T[k]);
      const mx = Math.max(c[0], c[1], c[2]) || 1;
      const br = Math.min(3, Math.max(0, (s.T[k] - 550) / 420) ** 1.5) * (this.sparkGain || 1);
      const j = m * 6;
      const blur = 0.012;
      this.spPos[j] = s.p[i]; this.spPos[j + 1] = s.p[i + 1]; this.spPos[j + 2] = s.p[i + 2];
      this.spPos[j + 3] = s.p[i] - s.v[i] * blur; this.spPos[j + 4] = s.p[i + 1] - s.v[i + 1] * blur; this.spPos[j + 5] = s.p[i + 2] - s.v[i + 2] * blur;
      this.spCol[j] = (c[0] / mx) * br; this.spCol[j + 1] = (c[1] / mx) * br; this.spCol[j + 2] = (c[2] / mx) * br;
      this.spCol[j + 3] = (c[0] / mx) * br * 0.15; this.spCol[j + 4] = (c[1] / mx) * br * 0.1; this.spCol[j + 5] = (c[2] / mx) * br * 0.05;
      m++;
    }
    this.sparks.geometry.setDrawRange(0, m * 2);
    this.spPosAttr.needsUpdate = true;
    this.spColAttr.needsUpdate = true;
  }

  stepDrops(dt) {
    const d = this.dr;
    let m = 0;
    for (let k = 0; k < MAX_DROPS; k++) {
      if (d.life[k] <= 0) continue;
      d.life[k] -= dt;
      const i = k * 3;
      d.v[i + 1] -= 9.81 * dt;
      d.p[i] += d.v[i] * dt; d.p[i + 1] += d.v[i + 1] * dt; d.p[i + 2] += d.v[i + 2] * dt;
      d.T[k] -= dt * 120;
      const gy = this.ground(d.p[i], d.p[i + 2]);
      if (d.p[i + 1] <= gy + d.r[k]) {
        this.land(d.p[i], gy + d.r[k] * 0.4, d.p[i + 2], d.T[k], d.r[k]);
        d.life[k] = 0;
        continue;
      }
      this.M.makeScale(d.r[k], d.r[k] * 1.4, d.r[k]).setPosition(d.p[i], d.p[i + 1], d.p[i + 2]);
      this.dropMesh.setMatrixAt(m, this.M);
      const c = incandescenceCPU(d.T[k]);
      this.dropMesh.instanceColor.setXYZ(m, Math.min(6, c[0] * 0.01), Math.min(6, c[1] * 0.01), Math.min(6, c[2] * 0.01));
      m++;
    }
    this.dropMesh.count = m;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    this.dropMesh.instanceColor.needsUpdate = true;
  }

  land(x, y, z, T, r) {
    const L = this.ld, k = L.next;
    L.next = (L.next + 1) % MAX_LANDED;
    L.n = Math.min(MAX_LANDED, L.n + 1);
    L.p[k * 3] = x; L.p[k * 3 + 1] = y; L.p[k * 3 + 2] = z;
    L.T[k] = T;
    L.r[k] = r;
  }

  stepLanded(dt) {
    const L = this.ld;
    for (let k = 0; k < L.n; k++) {
      // a bead on sand cools in some tens of seconds (display rate)
      L.T[k] = 20 + (L.T[k] - 20) * Math.exp(-dt / 12);
      this.M.makeScale(L.r[k], L.r[k] * 0.6, L.r[k]).setPosition(L.p[k * 3], L.p[k * 3 + 1], L.p[k * 3 + 2]);
      this.landMesh.setMatrixAt(k, this.M);
      // a dark slag bead, glowing while it is hot
      const c = incandescenceCPU(L.T[k]);
      this.landMesh.instanceColor.setXYZ(k, Math.max(0.035, Math.min(4, c[0] * 0.004)), Math.max(0.03, Math.min(4, c[1] * 0.004)), Math.max(0.028, Math.min(4, c[2] * 0.004)));
    }
    this.landMesh.count = L.n;
    this.landMesh.instanceMatrix.needsUpdate = true;
    this.landMesh.instanceColor.needsUpdate = true;
  }

  stepFume(dt) {
    const f = this.fm;
    for (let k = 0; k < MAX_FUME; k++) {
      if (f.life[k] <= 0) {
        f.p[k * 3 + 1] = -100;
        continue;
      }
      f.life[k] -= dt;
      f.p[k * 3] += f.v[k * 3] * dt;
      f.p[k * 3 + 1] += f.v[k * 3 + 1] * dt;
      f.p[k * 3 + 2] += f.v[k * 3 + 2] * dt;
    }
    this.fmAttr.needsUpdate = true;
  }

  clear() {
    this.sp.life.fill(0);
    this.dr.life.fill(0);
    this.ld.n = 0;
    this.fm.life.fill(0);
    this.light.intensity = 0;
    this.light2.intensity = 0;
    for (const m of this.sheets) m.visible = false;
  }
}
