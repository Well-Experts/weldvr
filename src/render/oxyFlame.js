// The flame at the cutting tip, in the tip frame (origin at the centre of the tip face, the flame along local
// -Y, metres). From the outfit's flame state (sim/ofc.js flameOf):
//   acetylene only: a long, luminous yellow flame that smokes at low flow and stands off the tip at high
//     flow (Victor 0056-3260 5.06 step 7 "until the flame stops smoking"; Harris: "leaves the end of tip about
//     1/8"");
//   carburizing: the preheat cones with the white acetylene feather beyond them (Smith 9-2: "a long white
//     flame will appear; this is known as the acetylene feather");
//   neutral: "a sharp, light blue inner cone surrounded by a darker blue outer envelope" (Smith 7-2);
//   oxidizing: the inner cones "a lighter shade of blue" (Victor 0056-3260).
// The preheat cones sit on a ring of six ports round the cutting bore (display). Lengths are display values
// scaled with the flow (seed).

import * as THREE from 'three';
import { softDot } from './textures.js';
import { RO_ARC } from './effects.js';

const RING_R = 0.0032; // m, ring of preheat ports (display)

// six unit cones (base radius 1 at y = 0, apex at y = -1) round the ring, merged, with their base centres
function ringCones(n = 6, seg = 12) {
  const pos = [], cen = [], hh = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const cx = Math.cos(a) * RING_R, cz = Math.sin(a) * RING_R;
    for (let q = 0; q < seg; q++) {
      const a0 = (q / seg) * Math.PI * 2, a1 = ((q + 1) / seg) * Math.PI * 2;
      const tri = [[Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], [0, -1, 0]];
      for (const p of tri) {
        pos.push(cx + p[0], p[1], cz + p[2]);
        cen.push(cx, 0, cz);
        hh.push(-p[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('hh', new THREE.Float32BufferAttribute(hh, 1));
  return g;
}

function oneCone(seg = 20) {
  const pos = [], cen = [], hh = [];
  for (let q = 0; q < seg; q++) {
    const a0 = (q / seg) * Math.PI * 2, a1 = ((q + 1) / seg) * Math.PI * 2;
    // a rounded body: four rings from the base to the tip
    const prof = [[1, 0], [0.92, 0.35], [0.62, 0.72], [0, 1]];
    for (let r = 0; r < prof.length - 1; r++) {
      const [r0, y0] = prof[r], [r1, y1] = prof[r + 1];
      const p00 = [Math.cos(a0) * r0, -y0, Math.sin(a0) * r0], p01 = [Math.cos(a1) * r0, -y0, Math.sin(a1) * r0];
      const p10 = [Math.cos(a0) * r1, -y1, Math.sin(a0) * r1], p11 = [Math.cos(a1) * r1, -y1, Math.sin(a1) * r1];
      for (const p of [p00, p01, p11, p00, p11, p10]) {
        pos.push(...p);
        cen.push(0, 0, 0);
        hh.push(-p[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('hh', new THREE.Float32BufferAttribute(hh, 1));
  return g;
}

const coneVS = `
attribute vec3 center; attribute float hh;
uniform float uLen; uniform float uR; uniform float uOff; uniform float uTime; uniform float uWob;
varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 l = position - center;
  float wob = 1.0 + uWob * sin(uTime * 37.0 + center.x * 900.0) * hh;
  l.xz *= uR * (1.0 + 0.35 * hh * uWob);
  l.y *= uLen * wob;
  vec3 p = center + l + vec3(0.0, -uOff, 0.0);
  vH = hh;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normalize(vec3(l.x, 0.35 * uR, l.z) + 1e-6));
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const coneFS = `
uniform vec3 uColor; uniform vec3 uTipColor; uniform float uGain; uniform float uPow; uniform float uEdge;
varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  float along = pow(clamp(1.0 - vH, 0.0, 1.0), uPow);
  float edge = mix(1.0, pow(abs(dot(vN, vV)), 0.8), uEdge);
  vec3 c = mix(uColor, uTipColor, smoothstep(0.4, 1.0, vH));
  gl_FragColor = vec4(c * uGain * along * edge, 1.0);
}`;

function coneMaterial(o) {
  return new THREE.ShaderMaterial({
    vertexShader: coneVS,
    fragmentShader: coneFS,
    uniforms: {
      uLen: { value: o.len ?? 0.0025 }, uR: { value: o.r ?? 0.0006 }, uOff: { value: 0 }, uTime: { value: 0 }, uWob: { value: o.wob ?? 0.04 },
      uColor: { value: new THREE.Color(...(o.color || [0.6, 0.8, 1.6])) }, uTipColor: { value: new THREE.Color(...(o.tip || o.color || [0.6, 0.8, 1.6])) },
      uGain: { value: o.gain ?? 1 }, uPow: { value: o.pow ?? 0.5 }, uEdge: { value: o.edge ?? 0.3 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// The flame spreading over the work when the tip is close to it: a flat, faint disc on the surface round the
// jet (the outer envelope turned aside by the plate; display).
const SPREAD_VS = `
varying vec2 vXY;
void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPREAD_FS = `
uniform vec3 uColor; uniform float uGain; uniform float uR; uniform float uTime;
varying vec2 vXY;
void main(){
  float r = length(vXY) / uR;
  float a = atan(vXY.y, vXY.x);
  float flick = 0.8 + 0.2 * sin(a * 7.0 + uTime * 23.0) * sin(a * 3.0 - uTime * 17.0);
  float k = smoothstep(0.05, 0.3, r) * (1.0 - smoothstep(0.45 * flick, 1.0, r));
  gl_FragColor = vec4(uColor * uGain * k, 1.0);
}`;

export class OxyFlame {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'oxyFlame';
    this.time = 0;
    // inner cones (sharp, light blue)
    this.cones = new THREE.Mesh(ringCones(), coneMaterial({ color: [0.55, 0.8, 1.9], tip: [0.85, 0.95, 2.2], len: 0.0025, r: 0.00055, gain: 1.4, pow: 0.25, edge: 0.15 }));
    // acetylene feather (white, soft, longer)
    this.feather = new THREE.Mesh(ringCones(), coneMaterial({ color: [1.2, 1.15, 1.0], tip: [0.9, 0.75, 0.5], len: 0.006, r: 0.0011, gain: 0.55, pow: 1.2, edge: 0.6, wob: 0.08 }));
    // outer envelope (darker blue, warmer at its end)
    this.envelope = new THREE.Mesh(oneCone(), coneMaterial({ color: [0.12, 0.2, 0.75], tip: [0.55, 0.22, 0.12], len: 0.03, r: 0.0055, gain: 0.35, pow: 0.9, edge: 0.75, wob: 0.06 }));
    // acetylene alone: luminous yellow-orange flame
    this.fuelFlame = new THREE.Mesh(oneCone(), coneMaterial({ color: [2.4, 1.4, 0.45], tip: [1.4, 0.45, 0.08], len: 0.08, r: 0.007, gain: 0.8, pow: 0.7, edge: 0.7, wob: 0.18 }));
    // cutting oxygen in free air: a thin stream in the middle of the preheat flames
    this.stream = new THREE.Mesh(oneCone(), coneMaterial({ color: [0.3, 0.45, 1.2], tip: [0.15, 0.2, 0.6], len: 0.06, r: 0.0011, gain: 0.35, pow: 0.6, edge: 0.4, wob: 0.02 }));
    // the envelope spreading on the work (a disc across the flame axis, at the work)
    const disc = new THREE.CircleGeometry(1, 40);
    disc.rotateX(Math.PI / 2);
    this.spread = new THREE.Mesh(disc, new THREE.ShaderMaterial({
      vertexShader: SPREAD_VS.replace('vXY = position.xy', 'vXY = position.xz'),
      fragmentShader: SPREAD_FS,
      uniforms: { uColor: { value: new THREE.Color(0.18, 0.26, 0.9) }, uGain: { value: 0.2 }, uR: { value: 1 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    for (const m of [this.cones, this.feather, this.envelope, this.fuelFlame, this.stream, this.spread]) {
      m.frustumCulled = false;
      m.renderOrder = RO_ARC + 1;
      m.visible = false;
      this.group.add(m);
    }
    // soot from a smoking acetylene flame (normal blending, dark)
    this.SOOT = 60;
    this.soot = { p: new Float32Array(this.SOOT * 3), v: new Float32Array(this.SOOT * 3), life: new Float32Array(this.SOOT), next: 0 };
    const sg = new THREE.BufferGeometry();
    this.sootAttr = new THREE.BufferAttribute(this.soot.p, 3).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.sootAttr);
    this.sootPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x141414, size: 0.012, map: softDot('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 32, 0.2), transparent: true, opacity: 0.55, depthWrite: false }));
    this.sootPts.frustumCulled = false;
    this.group.add(this.sootPts);
    this.sootAcc = 0;
    // light of the flame
    this.light = new THREE.PointLight(0x8fb0ff, 0, 0.9, 1.6);
    this.light.position.set(0, -0.008, 0);
    this.group.add(this.light);
    this.state = null;
  }

  // f: { lit, type, ratio, size, feather, smoke, separated }, lever 0..1, dt s, cutting: the jet is in a cut,
  // gap: distance (m) from the tip face to the work along the flame (null when the work is not under the tip)
  update(dt, f, lever = 0, cutting = false, gap = null) {
    this.time += dt;
    const t = this.time;
    for (const m of [this.cones, this.feather, this.envelope, this.fuelFlame, this.stream]) m.material.uniforms.uTime.value = t;
    const on = !!(f && f.lit);
    const size = on ? Math.max(0.2, f.size || 1) : 0;
    const fuel = on && f.type === 'fuel';
    const cones = on && !fuel;
    const flick = 1 + 0.06 * Math.sin(t * 53.0) * Math.sin(t * 17.3 + 1.1);
    this.cones.visible = cones;
    this.feather.visible = cones && f.feather > 0.01;
    this.envelope.visible = cones;
    this.fuelFlame.visible = fuel;
    this.stream.visible = cones && lever > 0.3 && !cutting;
    if (!cones) this.spread.visible = false;
    if (cones) {
      const u = this.cones.material.uniforms;
      // the cones shorten and turn a lighter blue as the flame goes oxidizing
      const ox = f.type === 'oxidizing' ? Math.min(1, (f.ratio - 1.15) / 0.4) : 0;
      u.uLen.value = 0.0026 * Math.sqrt(size) * (1 - 0.35 * ox) * flick;
      u.uR.value = 0.00055 * (0.8 + 0.2 * Math.sqrt(size));
      u.uColor.value.setRGB(0.55 + 0.25 * ox, 0.8 + 0.1 * ox, 1.9);
      u.uTipColor.value.setRGB(0.85 + 0.2 * ox, 0.95, 2.2);
      const fu = this.feather.material.uniforms;
      fu.uLen.value = 0.0026 * Math.sqrt(size) * (1.3 + 4.5 * f.feather) * flick;
      fu.uR.value = 0.0008 + 0.0008 * f.feather;
      fu.uGain.value = 0.25 + 0.6 * f.feather;
      const eu = this.envelope.material.uniforms;
      const envLen = 0.018 + 0.016 * size + (lever > 0.3 ? 0.012 : 0);
      // at the work the envelope is turned aside and spreads over the surface
      const blocked = gap != null && gap < envLen;
      eu.uLen.value = blocked ? Math.max(0.001, gap) : envLen;
      eu.uR.value = (0.0045 + 0.0018 * size) * (blocked ? 0.75 : 1);
      eu.uGain.value = (0.3 + 0.08 * size) * (blocked ? 0.45 : 1);
      this.spread.visible = blocked;
      if (blocked) {
        const sp = this.spread.material.uniforms;
        const rr = Math.min(0.03, 0.006 + 0.5 * (envLen - gap));
        this.spread.scale.setScalar(rr);
        this.spread.position.set(0, -gap + 0.0003, 0);
        sp.uR.value = 1;
        sp.uTime.value = t;
        sp.uGain.value = 0.16 + 0.05 * size;
      }
      const su = this.stream.material.uniforms;
      su.uLen.value = 0.05 + 0.03 * lever;
    }
    if (fuel) {
      const fu = this.fuelFlame.material.uniforms;
      const gap = f.separated ? 0.0032 : 0;
      fu.uOff.value = gap;
      fu.uLen.value = (0.05 + 0.08 * Math.min(2, size)) * flick;
      fu.uR.value = 0.005 + 0.004 * Math.min(2, size);
      fu.uGain.value = 0.55 + 0.25 * Math.min(1.5, size);
    }
    // soot while it smokes
    const s = this.soot;
    if (fuel && f.smoke > 0) {
      this.sootAcc += dt * 40 * f.smoke;
      while (this.sootAcc >= 1) {
        this.sootAcc -= 1;
        const k = s.next;
        s.next = (s.next + 1) % this.SOOT;
        const along = 0.03 + Math.random() * 0.05;
        s.p[k * 3] = (Math.random() - 0.5) * 0.01;
        s.p[k * 3 + 1] = -along;
        s.p[k * 3 + 2] = (Math.random() - 0.5) * 0.01;
        s.v[k * 3] = (Math.random() - 0.5) * 0.02;
        s.v[k * 3 + 1] = -0.02;
        s.v[k * 3 + 2] = (Math.random() - 0.5) * 0.02;
        s.life[k] = 2.5;
      }
    }
    // soot rises in the world: the flame frame's "up" is not known here, so it drifts back along the axis
    // (toward the tip, local +Y) and spreads
    for (let k = 0; k < this.SOOT; k++) {
      if (s.life[k] <= 0) {
        s.p[k * 3 + 1] = 1e3;
        continue;
      }
      s.life[k] -= dt;
      s.v[k * 3 + 1] += dt * 0.05;
      s.p[k * 3] += s.v[k * 3] * dt;
      s.p[k * 3 + 1] += s.v[k * 3 + 1] * dt;
      s.p[k * 3 + 2] += s.v[k * 3 + 2] * dt;
    }
    this.sootAttr.needsUpdate = true;
    // light
    if (fuel) {
      this.light.color.setRGB(1.0, 0.75, 0.4);
      this.light.intensity = 0.35 + 0.2 * Math.min(2, size);
    } else if (cones) {
      this.light.color.setRGB(0.55, 0.7, 1.0);
      this.light.intensity = 0.12 + 0.06 * size;
    } else this.light.intensity = 0;
  }
}
