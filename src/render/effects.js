// Arc, glare, arc light, wire-tip droplet, spatter and fume. Lives in the bench frame (metres).
// (The weld pool is drawn by render/pool.js on the coupon.)
// Render order: helmet lens (9000) < arc effects (9500) < helmet shell (10000), so the arc stays
// bright through the darkened lens and is hidden outside the lens window.
//
// Metal transfer seen at the wire tip follows CWB Group's transfer-mode articles: short-circuit
// transfer shorts "typically up to 200 times per second" (the arc goes out during each short, seen
// here as flicker); globular drops reach 1.5 to 3 times the wire diameter and fall under gravity;
// spray droplets are smaller than the wire diameter. Spatter drops fly ballistically, cool by
// radiation and convection (EN 1993-1-2 emissivity, convection coefficient a seed inside the
// forced-convection range for gases), and stick or bounce where they land on the coupon or bench.
// Fume rate by process and transfer mode follows TWI's ranking (flux-cored arc > solid-wire MAG;
// dip transfer low; spray higher at higher current and arc length); magnitudes are seeds.

import * as THREE from 'three';
import { softDot, glare as glareTex } from './textures.js';
import { incandescenceCPU } from './thermalTex.js';
import { surfaceHeight } from '../sim/session.js';
import { plateSurface } from '../sim/joint.js';
import { pipeLocal, dirFromJoint } from '../sim/pipe.js';
import { EMISSIVITY, SIGMA_SB } from '../sim/material.js';

const MAX_SPARKS = 600;
const MAX_LANDED = 320;
const MAX_SMOKE = 96;
const MAX_CHIPS = 48;
export const RO_LENS = 9000, RO_ARC = 9500, RO_SHELL = 10000;

const billVS = `
attribute vec3 offset; attribute float size; attribute float alpha;
varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){
  vUv = uv; vA = alpha;
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec4 wp = modelMatrix * vec4(offset, 1.0);
  vW = offset;
  wp.xyz += (r * position.x + u * position.y) * size;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const smokeFS = `
uniform sampler2D map; uniform vec3 color; uniform float vis; uniform vec3 arcPos; uniform float arcLight; uniform vec3 arcColor;
varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){
  vec4 t = texture2D(map, vUv);
  float d = length(vW - arcPos);
  vec3 lit = arcColor * arcLight / (1.0 + (d / 0.035) * (d / 0.035));
  gl_FragColor = vec4(color * vis + lit, t.a * vA * mix(0.35, 1.0, vis));
}`;

// Arc column: a bell from the wire tip (top, y = 1) to the work (bottom, y = 0).
const arcVS = `
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const arcFS = `
uniform vec3 color; uniform float intensity;
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(f, 2.2);
  float hot = mix(1.0, 1.8, smoothstep(0.35, 1.0, vY));
  gl_FragColor = vec4(color * intensity * hot * (0.15 + 1.6 * core), 1.0);
}`;

function bellGeometry() {
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const y = k / 12;
    // wide root on the work, narrowing to the wire tip
    const r = 0.18 + 0.82 * Math.pow(1 - y, 1.6);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 20);
}

// Display colour of a sub-pixel hot drop: the blackbody hue at its temperature with a brightness
// that rises steeply with temperature (a drop is far smaller than a pixel, so its radiance is
// spread over the pixel: a display mapping, seed).
function sparkColour(T, out) {
  const c = incandescenceCPU(T);
  const m = Math.max(c[0], c[1], c[2]);
  if (!(m > 0)) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  const b = Math.min(3, Math.max(0, (T - 550) / 420) ** 1.5); // 0 at 550 C, ~2 at 1700 C
  out[0] = (c[0] / m) * b;
  out[1] = (c[1] / m) * b;
  out[2] = (c[2] / m) * b;
  return out;
}

export class WeldFX {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'weldfx';
    this.time = 0;
    // arc column
    this.arcMat = new THREE.ShaderMaterial({
      vertexShader: arcVS, fragmentShader: arcFS,
      uniforms: { color: { value: new THREE.Color(0.75, 0.84, 1.0) }, intensity: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.arc = new THREE.Mesh(bellGeometry(), this.arcMat);
    this.arc.renderOrder = RO_ARC + 1;
    this.arc.visible = false;
    this.arc.frustumCulled = false;
    this.group.add(this.arc);
    // molten drop at the wire tip
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.drop.renderOrder = RO_ARC + 2;
    this.drop.visible = false;
    this.group.add(this.drop);
    this.dropR = 0;
    this.dropPhase = 0;
    // spray droplet stream
    this.stream = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.drop.material, 6);
    this.stream.renderOrder = RO_ARC + 2;
    this.stream.count = 0;
    this.stream.frustumCulled = false;
    this.group.add(this.stream);
    // arc core and glare
    const dot = softDot('rgba(255,255,255,1)', 'rgba(170,200,255,0)', 128, 0.12);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(1.6, 1.8, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.core.renderOrder = RO_ARC + 3;
    this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTex(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.8, toneMapped: false }));
    this.glare.renderOrder = RO_ARC + 4;
    this.core.visible = this.glare.visible = false;
    this.group.add(this.core, this.glare);
    // arc light and pool light
    this.light = new THREE.PointLight(0xdfe8ff, 0, 0, 2);
    this.group.add(this.light);
    this.poolLight = new THREE.PointLight(0xff8a3a, 0, 1.0, 1.0);
    this.group.add(this.poolLight);
    this.poolHeat = 0;
    // spatter in flight (motion-blurred streaks); colour from the drop temperature
    this.sp = {
      p: new Float32Array(MAX_SPARKS * 3), v: new Float32Array(MAX_SPARKS * 3), T: new Float32Array(MAX_SPARKS),
      D: new Float32Array(MAX_SPARKS), life: new Float32Array(MAX_SPARKS), n: 0,
    };
    this.spPos = new Float32Array(MAX_SPARKS * 6);
    this.spCol = new Float32Array(MAX_SPARKS * 6);
    const sg = new THREE.BufferGeometry();
    this.spPosAttr = new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.spColAttr = new THREE.BufferAttribute(this.spCol, 3).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.spPosAttr);
    sg.setAttribute('color', this.spColAttr);
    sg.setDrawRange(0, 0);
    this.sparks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = RO_ARC;
    this.group.add(this.sparks);
    // landed drops cooling on the plate or bench
    this.ld = { p: new Float32Array(MAX_LANDED * 3), T: new Float32Array(MAX_LANDED), D: new Float32Array(MAX_LANDED), n: 0, next: 0 };
    this.ldCol = new Float32Array(MAX_LANDED * 3);
    const lg = new THREE.BufferGeometry();
    this.ldPosAttr = new THREE.BufferAttribute(this.ld.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ldColAttr = new THREE.BufferAttribute(this.ldCol, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', this.ldPosAttr);
    lg.setAttribute('color', this.ldColAttr);
    lg.setDrawRange(0, 0);
    this.landed = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.0016, sizeAttenuation: true, vertexColors: true, map: softDot('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32, 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.landed.frustumCulled = false;
    this.landed.renderOrder = RO_ARC;
    this.group.add(this.landed);
    // fume
    const quad = new THREE.PlaneGeometry(1, 1);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = quad.index;
    ig.attributes.position = quad.attributes.position;
    ig.attributes.uv = quad.attributes.uv;
    this.smOff = new Float32Array(MAX_SMOKE * 3);
    this.smSize = new Float32Array(MAX_SMOKE);
    this.smAlpha = new Float32Array(MAX_SMOKE);
    this.smVel = new Float32Array(MAX_SMOKE * 3);
    this.smLife = new Float32Array(MAX_SMOKE);
    this.smMax = new Float32Array(MAX_SMOKE);
    ig.setAttribute('offset', new THREE.InstancedBufferAttribute(this.smOff, 3).setUsage(THREE.DynamicDrawUsage));
    ig.setAttribute('size', new THREE.InstancedBufferAttribute(this.smSize, 1).setUsage(THREE.DynamicDrawUsage));
    ig.setAttribute('alpha', new THREE.InstancedBufferAttribute(this.smAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    ig.instanceCount = MAX_SMOKE;
    this.smokeU = {
      map: { value: softDot('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64, 0.0) }, color: { value: new THREE.Color(0.62, 0.62, 0.6) }, vis: { value: 1 },
      arcPos: { value: new THREE.Vector3() }, arcLight: { value: 0 }, arcColor: { value: new THREE.Color(0.75, 0.84, 1.0) },
    };
    this.smoke = new THREE.Mesh(ig, new THREE.ShaderMaterial({ vertexShader: billVS, fragmentShader: smokeFS, uniforms: this.smokeU, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);
    this.smNext = 0;
    // slag chips knocked off by the chipping hammer (bench frame): small glassy flakes
    this.chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 0.8), new THREE.MeshStandardMaterial({ color: 0x2b241f, roughness: 0.25, metalness: 0.15 }), MAX_CHIPS);
    this.chipMesh.count = 0;
    this.chipMesh.frustumCulled = false;
    this.group.add(this.chipMesh);
    this.ch = { p: new Float32Array(MAX_CHIPS * 3), v: new Float32Array(MAX_CHIPS * 3), rot: new Float32Array(MAX_CHIPS * 3), s: new Float32Array(MAX_CHIPS), life: new Float32Array(MAX_CHIPS), n: 0 };
    this.chipM = new THREE.Matrix4();
    this.chipE = new THREE.Euler();
    this.chipQ = new THREE.Quaternion();
    this.chipS = new THREE.Vector3();
    this.extractor = null; // bench-frame point the fume is drawn toward
    this.wind = null; // bench-frame wind velocity (m/s) from a fan
    this.emitAcc = 0;
    this.smokeAcc = 0;
    // scratch
    this.inv = new THREE.Matrix4();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.nrm = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.wander = new THREE.Vector3();
    this.dropMat = new THREE.Matrix4();
  }

  // state: { arcOn, pool (bench), tip (contact tip, bench), axis (bench unit, toward the work),
  //          frame: {t,u,v}, poolW, poolL (m), arc (arcState), helmetDown, arcVis, arcLight,
  //          smokeVis, process, gas, wire (mm), couponToBench (Matrix4), joint, mirror, record }
  update(dt, st) {
    this.time += dt;
    const on = !!st.arcOn;
    if (on) this.poolHeat = 1;
    else this.poolHeat = Math.max(0, this.poolHeat - dt / 0.6);
    const arc = st.arc;
    const mode = arc ? arc.mode : 'short';
    const smaw = st.process === '111';
    // flux processes (FCAW and SMAW): the arc burns in the gases and vapour of the flux, warmer in
    // colour than an argon-rich arc (visual, seed); heavier fume and spatter
    const fcaw = st.process === '136' || st.process === '114' || smaw;
    const argon = !fcaw && st.gas !== 'CO2';
    const col = argon ? [0.72, 0.82, 1.0] : [1.0, 0.9, 0.76];
    this.arcMat.uniforms.color.value.setRGB(col[0], col[1], col[2]);
    this.smokeU.arcColor.value.setRGB(col[0], col[1], col[2]);
    const vis = st.arcVis ?? 1;
    // short circuits put the arc out many times a second: some frames catch it dark
    let flick = 0;
    if (on) {
      if (mode === 'short') flick = Math.random() < 0.22 ? 0.06 : 0.62 + 0.5 * Math.random() * (1.2 - (arc ? arc.stability : 1) * 0.5);
      else if (mode === 'globular') flick = 0.55 + 0.6 * Math.random();
      else if (mode === 'smaw') flick = 0.72 + 0.42 * Math.random() * (1.4 - (arc ? arc.stability : 1) * 0.6);
      // GTAW: a steady arc; a contaminated tungsten or a long arc makes it erratic (DGP, ESAB)
      else if (mode === 'gtaw') flick = 0.94 + 0.08 * Math.random() - 0.5 * Math.random() * (1 - (arc ? arc.stability : 1));
      else flick = 0.92 + 0.12 * Math.random();
      if (arc && !arc.polarityOk) flick *= 0.4 + 0.8 * Math.random();
    }
    this.arc.visible = on && !!st.tip;
    this.core.visible = on;
    this.glare.visible = on;
    this.drop.visible = false;
    this.stream.count = 0;
    if (on && st.tip && st.axis) {
      const wireD = (st.wire || 1.2) / 1000;
      const so = (arc ? arc.stickOut : 15) / 1000;
      const al = Math.max(0.0005, (arc ? arc.arcLen : 3) / 1000);
      const wireEnd = this.tmp.copy(st.tip).addScaledVector(st.axis, so);
      // globular arcs wander; spray arcs stay on the axis
      const wAmp = mode === 'globular' ? 0.35 : mode === 'short' ? 0.12 : mode === 'smaw' ? 0.1 + 0.3 * (1 - (arc ? arc.stability : 1)) : mode === 'gtaw' ? 0.02 + 0.5 * (1 - (arc ? arc.stability : 1)) : 0.03;
      this.wander.set((Math.random() - 0.5) * wAmp, (Math.random() - 0.5) * wAmp, (Math.random() - 0.5) * wAmp).multiplyScalar(1 - Math.exp(-dt * 30));
      const ax = this.tmp2.copy(st.axis).add(this.wander).normalize();
      const len = mode === 'short' && flick < 0.1 ? al * 0.2 : al * (0.85 + 0.3 * Math.random());
      // SMAW: the arc spreads over the electrode end, about the coated diameter (seed)
      // GTAW: a bell-shaped arc from the tungsten point, a few millimetres wide at the work (display)
      const rootR = mode === 'gtaw' ? 0.0022 + 0.000004 * (arc ? arc.I : 120) : mode === 'smaw' ? 0.8 * wireD * 1.6 : (mode === 'spray' ? 2.6 : mode === 'globular' ? 2.0 : 1.6) * wireD * 2.2; // seed
      this.q.setFromUnitVectors(this.up, this.nrm.copy(ax).negate());
      this.arc.quaternion.copy(this.q);
      this.arc.position.copy(wireEnd).addScaledVector(ax, len);
      this.arc.scale.set(rootR, len, rootR);
      this.arcMat.uniforms.intensity.value = 1.4 * flick * Math.min(1.2, vis);
      // drop on the wire tip
      let r;
      if (mode === 'globular') {
        this.dropPhase += dt / 0.12;
        if (this.dropPhase >= 1) {
          this.dropPhase = 0;
          this.emitDrop(wireEnd, ax, 1.5 * wireD, 2.2);
        }
        r = wireD * (0.6 + 0.9 * this.dropPhase); // up to 1.5 x radius -> 3 x diameter at release
      } else if (mode === 'short') r = wireD * (0.3 + 0.25 * Math.random());
      else if (mode === 'smaw') r = wireD * (0.22 + 0.2 * Math.random());
      else r = wireD * 0.3;
      this.drop.visible = mode !== 'gtaw'; // GTAW: no metal crosses the arc (the filler melts in the pool)
      this.drop.position.copy(wireEnd).addScaledVector(ax, r * 0.6);
      this.drop.scale.set(r, mode === 'spray' ? r * 2.2 : r, r);
      this.drop.quaternion.copy(this.q);
      this.drop.material.opacity = Math.min(1, vis);
      if (mode === 'spray') {
        // stream of droplets smaller than the wire, crossing the arc
        const n = 5;
        for (let k = 0; k < n; k++) {
          const f = (k / n + this.time * 9) % 1;
          const p = this.tmp2.copy(wireEnd).addScaledVector(st.axis, len * f);
          const s = wireD * 0.32;
          this.dropMat.makeScale(s, s, s).setPosition(p);
          this.stream.setMatrixAt(k, this.dropMat);
        }
        this.stream.count = n;
        this.stream.instanceMatrix.needsUpdate = true;
      }
      // core and glare
      const mid = this.tmp2.copy(wireEnd).addScaledVector(st.axis, len * 0.6);
      this.core.position.copy(mid);
      const cs = (mode === 'spray' ? 0.009 : 0.006) * Math.max(flick, 0.2);
      this.core.scale.set(cs, cs, cs);
      this.glare.position.copy(st.pool || mid);
      // lens and eye scatter around the arc: small and faint through the filter, large without it
      const gs = (st.helmetDown ? 0.045 : 0.42) * (0.85 + 0.3 * Math.random()) * (0.4 + 0.6 * Math.max(flick, 0.2));
      this.glare.scale.set(gs, gs, gs);
      this.glare.material.opacity = (st.helmetDown ? 0.28 : 1.0) * Math.min(1, vis);
      this.core.material.color.setRGB(col[0] * 1.8 * vis, col[1] * 1.9 * vis, col[2] * 2.2 * vis);
      this.light.color.setRGB(col[0], col[1], col[2]);
      this.light.position.copy(st.pool || mid).addScaledVector(st.axis, -0.03);
      // physically based falloff (decay 2): through a dark lens only the joint near the arc stays
      // visible; with the helmet up the arc lights the booth. st.arcLight scales for the viewer.
      this.light.intensity = (st.arcLight ?? 0.19) * Math.max(flick, 0.1) * (mode === 'spray' ? 1.3 : 1);
    } else {
      this.light.intensity = 0;
    }
    this.poolLight.position.copy(st.pool || this.poolLight.position);
    this.poolLight.intensity = this.poolHeat * 0.08;
    this.updateSparks(dt, st, on, mode, fcaw);
    this.updateSmoke(dt, st, on, mode, fcaw, flick);
    if (this.ch.n) this.updateChips(dt);
  }

  // A chipping-hammer blow at a world point: a few slag flakes fly off (visual; sizes and speeds are
  // design values).
  chips(edgeW, bench) {
    const C = this.ch;
    const p = bench.worldToLocal(this.tmp.copy(edgeW));
    for (let k = 0; k < 6; k++) {
      let i = C.n;
      if (i >= MAX_CHIPS) {
        i = Math.floor(Math.random() * MAX_CHIPS);
      } else C.n++;
      C.p[i * 3] = p.x; C.p[i * 3 + 1] = p.y + 0.002; C.p[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.35 + Math.random() * 0.6;
      C.v[i * 3] = Math.cos(a) * sp * 0.6; C.v[i * 3 + 1] = sp; C.v[i * 3 + 2] = Math.sin(a) * sp * 0.6;
      C.rot[i * 3] = Math.random() * 6; C.rot[i * 3 + 1] = Math.random() * 6; C.rot[i * 3 + 2] = Math.random() * 6;
      C.s[i] = 0.0015 + Math.random() * 0.003;
      C.life[i] = 0.9 + Math.random() * 0.5;
    }
  }

  updateChips(dt) {
    const C = this.ch;
    let w = 0;
    for (let i = 0; i < C.n; i++) {
      C.life[i] -= dt;
      if (C.life[i] <= 0) continue;
      C.v[i * 3 + 1] -= 9.81 * dt;
      for (let a = 0; a < 3; a++) {
        C.p[i * 3 + a] += C.v[i * 3 + a] * dt;
        C.rot[i * 3 + a] += dt * 14;
      }
      this.chipE.set(C.rot[i * 3], C.rot[i * 3 + 1], C.rot[i * 3 + 2]);
      this.chipQ.setFromEuler(this.chipE);
      this.chipS.setScalar(C.s[i]);
      this.chipM.compose(this.tmp.set(C.p[i * 3], C.p[i * 3 + 1], C.p[i * 3 + 2]), this.chipQ, this.chipS);
      this.chipMesh.setMatrixAt(w++, this.chipM);
    }
    // compact the live chips to the front
    if (w < C.n) {
      let o = 0;
      for (let i = 0; i < C.n; i++) {
        if (C.life[i] <= 0) continue;
        if (o !== i) {
          for (let a = 0; a < 3; a++) {
            C.p[o * 3 + a] = C.p[i * 3 + a];
            C.v[o * 3 + a] = C.v[i * 3 + a];
            C.rot[o * 3 + a] = C.rot[i * 3 + a];
          }
          C.s[o] = C.s[i];
          C.life[o] = C.life[i];
        }
        o++;
      }
      C.n = o;
    }
    this.chipMesh.count = w;
    if (w) this.chipMesh.instanceMatrix.needsUpdate = true;
  }

  emitDrop(p, axis, D, speed) {
    const S = this.sp;
    if (S.n >= MAX_SPARKS) return;
    const i = S.n++;
    S.p[i * 3] = p.x; S.p[i * 3 + 1] = p.y; S.p[i * 3 + 2] = p.z;
    S.v[i * 3] = axis.x * speed; S.v[i * 3 + 1] = axis.y * speed; S.v[i * 3 + 2] = axis.z * speed;
    S.T[i] = 2300;
    S.D[i] = D;
    S.life[i] = 1.5;
  }

  // Spatter: ballistic drops with radiative/convective cooling; stick or bounce on landing.
  updateSparks(dt, st, on, mode, fcaw) {
    const S = this.sp;
    if (on && st.pool && st.frame) {
      const arc = st.arc;
      // visual drops per second: the model's spatter rate scaled for what the eye sees (seed)
      // GTAW: no spatter from a stable arc; a few sparks when it is erratic (seed)
      const rate = mode === 'gtaw' ? 3 * (1 - (arc ? arc.stability : 1)) : (mode === 'short' ? 70 : mode === 'globular' ? 120 : 14) * (fcaw ? 1.4 : 1) + (arc ? arc.spatterRate * 6 : 0);
      this.emitAcc += rate * dt;
      const nrm = st.frame.v;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        if (S.n >= MAX_SPARKS) break;
        const i = S.n++;
        const sp = 0.8 + Math.random() * (mode === 'globular' ? 3.4 : 2.6); // m/s, seed
        const d = this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        if (d.dot(nrm) < 0) d.addScaledVector(nrm, -2 * d.dot(nrm));
        d.addScaledVector(nrm, 0.5).addScaledVector(st.frame.t, (Math.random() - 0.3) * 0.6).normalize();
        S.p[i * 3] = st.pool.x + nrm.x * 0.001; S.p[i * 3 + 1] = st.pool.y + nrm.y * 0.001; S.p[i * 3 + 2] = st.pool.z + nrm.z * 0.001;
        S.v[i * 3] = d.x * sp; S.v[i * 3 + 1] = d.y * sp; S.v[i * 3 + 2] = d.z * sp;
        S.T[i] = 1700 + 600 * Math.random(); // C, seed
        S.D[i] = (0.15 + 0.9 * Math.pow(Math.random(), 2)) / 1000; // m, seed
        S.life[i] = 3;
      }
    }
    // coupon frame for collisions
    const hasCoupon = !!(st.couponToBench && st.joint);
    if (hasCoupon) this.inv.copy(st.couponToBench).invert();
    const j = st.joint;
    const rec = st.record;
    const tableY = 0.0005;
    const sig = EMISSIVITY * SIGMA_SB;
    let w = 0;
    for (let i = 0; i < S.n; i++) {
      S.life[i] -= dt;
      if (S.life[i] <= 0) continue;
      let px = S.p[i * 3], py = S.p[i * 3 + 1], pz = S.p[i * 3 + 2];
      let vx = S.v[i * 3], vy = S.v[i * 3 + 1] - 9.81 * dt, vz = S.v[i * 3 + 2];
      const D = S.D[i];
      // drag on a small sphere (seed coefficient), cooling: dT/dt = -6/(rho c D) (h dT + eps sigma (T^4 - Ta^4))
      const drag = 1 - Math.min(0.5, (0.0004 / Math.max(D, 1e-4)) * dt);
      vx *= drag; vy *= drag; vz *= drag;
      const Tk = S.T[i] + 273.15;
      const q = 150 * (S.T[i] - 20) + sig * (Tk * Tk * Tk * Tk - 293.15 ** 4); // h = 150 W/m2K seed
      S.T[i] = Math.max(20, S.T[i] - ((6 / (5.5e6 * D)) * q) * dt);
      const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      let landed = false;
      // coupon surfaces (joint-local mm)
      if (hasCoupon) {
        const lp = this.tmp.set(nx, ny, nz).applyMatrix4(this.inv);
        // pipe: unwrap the point (x round the pipe, u along the axis, v out of the wall)
        let xs = st.mirror ? j.L - lp.x : lp.x, uu = lp.y, vv = lp.z;
        if (j.pipe) {
          const q = pipeLocal(j, lp.x, lp.y, lp.z, this.pq || (this.pq = [0, 0, 0]));
          xs = q[0]; uu = q[1]; vv = q[2];
        }
        if (xs > -2 && xs < j.L + 2) {
          let surf = plateSurface(j, uu);
          if (Math.abs(uu) < 14 && rec) surf = Math.max(surf, surfaceHeight(rec, Math.floor(xs), uu));
          const half = j.pipe ? j.pipe.length : j.width ? j.width / 2 : 100;
          const below = j.type === 'fillet' ? vv < surf && vv > surf - j.t - 1 : vv < surf && vv > surf - j.t - 1 && Math.abs(uu) < half;
          if (below) {
            const speed = Math.hypot(vx, vy, vz);
            if (S.T[i] > 1250 && speed < 3.2) {
              this.land(this.tmp2.set(px, py, pz), S.T[i], D);
              landed = true;
            } else {
              // bounce about the surface normal (fillet planes or plate face), lose energy
              const fn = j.type === 'fillet' ? (uu >= 0 ? [0, -Math.SQRT1_2, Math.SQRT1_2] : [0, Math.SQRT1_2, Math.SQRT1_2]) : [0, 0, 1];
              const fq = j.pipe ? dirFromJoint(j, xs, fn, this.pn || (this.pn = [0, 0, 0])) : fn;
              const n = this.nrm.set(fq[0], fq[1], fq[2]).transformDirection(st.couponToBench);
              const vn = vx * n.x + vy * n.y + vz * n.z;
              if (vn < 0) {
                vx = (vx - 1.25 * vn * n.x) * 0.45; vy = (vy - 1.25 * vn * n.y) * 0.45; vz = (vz - 1.25 * vn * n.z) * 0.45;
              }
              S.life[i] *= 0.8;
              S.p[i * 3] = px; S.p[i * 3 + 1] = py; S.p[i * 3 + 2] = pz;
            }
          }
        }
      }
      if (landed) continue;
      if (ny < tableY && vy < 0 && Math.abs(nx) < 0.6 && nz > -0.34 && nz < 0.3) {
        if (S.T[i] > 1250 && Math.abs(vy) < 2.5) {
          this.land(this.tmp2.set(nx, tableY + 0.0003, nz), S.T[i], D);
          continue;
        }
        vy = -vy * 0.3; vx *= 0.45; vz *= 0.45;
        S.life[i] *= 0.7;
      }
      if (S.T[i] < 450 && S.life[i] > 0.4) S.life[i] = 0.4; // dark now; let it go
      px = px + vx * dt; py = py + vy * dt; pz = pz + vz * dt;
      if (py < -1.5) continue;
      // compact live particles to the front
      S.p[w * 3] = px; S.p[w * 3 + 1] = py; S.p[w * 3 + 2] = pz;
      S.v[w * 3] = vx; S.v[w * 3 + 1] = vy; S.v[w * 3 + 2] = vz;
      S.T[w] = S.T[i]; S.D[w] = S.D[i]; S.life[w] = S.life[i];
      const c = sparkColour(S.T[w], this.cTmp || (this.cTmp = [0, 0, 0]));
      const k = Math.min(1, (S.D[w] * 1000) / 0.6); // small drops look fainter
      const o = w * 6;
      const blur = 0.012;
      this.spPos[o] = px; this.spPos[o + 1] = py; this.spPos[o + 2] = pz;
      this.spPos[o + 3] = px - vx * blur; this.spPos[o + 4] = py - vy * blur; this.spPos[o + 5] = pz - vz * blur;
      const s = k * (st.sparkGain ?? 1);
      this.spCol[o] = c[0] * s; this.spCol[o + 1] = c[1] * s; this.spCol[o + 2] = c[2] * s;
      this.spCol[o + 3] = c[0] * s * 0.15; this.spCol[o + 4] = c[1] * s * 0.1; this.spCol[o + 5] = c[2] * s * 0.05;
      w++;
    }
    S.n = w;
    this.sparks.geometry.setDrawRange(0, w * 2);
    this.spPosAttr.clearUpdateRanges();
    this.spPosAttr.addUpdateRange(0, w * 6);
    this.spPosAttr.needsUpdate = true;
    this.spColAttr.clearUpdateRanges();
    this.spColAttr.addUpdateRange(0, w * 6);
    this.spColAttr.needsUpdate = true;
    this.updateLanded(dt);
  }

  land(p, T, D) {
    const L = this.ld;
    const i = L.next;
    L.next = (L.next + 1) % MAX_LANDED;
    L.n = Math.min(MAX_LANDED, L.n + 1);
    L.p[i * 3] = p.x; L.p[i * 3 + 1] = p.y; L.p[i * 3 + 2] = p.z;
    L.T[i] = T;
    L.D[i] = D;
  }

  updateLanded(dt) {
    const L = this.ld;
    let any = false;
    for (let i = 0; i < L.n; i++) {
      if (L.T[i] <= 400) {
        this.ldCol[i * 3] = this.ldCol[i * 3 + 1] = this.ldCol[i * 3 + 2] = 0;
        continue;
      }
      // a drop on the plate also loses heat into the plate: faster cooling. seed time constant
      L.T[i] = 20 + (L.T[i] - 20) * Math.exp(-dt / (0.25 + L.D[i] * 600));
      const c = sparkColour(L.T[i], this.cTmp2 || (this.cTmp2 = [0, 0, 0]));
      const s = 0.8;
      this.ldCol[i * 3] = c[0] * s; this.ldCol[i * 3 + 1] = c[1] * s; this.ldCol[i * 3 + 2] = c[2] * s;
      any = true;
    }
    this.landed.geometry.setDrawRange(0, L.n);
    if (any || L.n) {
      this.ldPosAttr.needsUpdate = true;
      this.ldColAttr.needsUpdate = true;
    }
  }

  updateSmoke(dt, st, on, mode, fcaw, flick) {
    const u = this.smokeU;
    u.vis.value = st.smokeVis ?? 1;
    // fume scatters arc light: seen through the same filter as arc-lit surfaces (smokeVis)
    u.arcLight.value = on ? 0.18 * Math.max(flick, 0.15) * (st.smokeVis ?? 1) : 0;
    if (st.pool) u.arcPos.value.copy(st.pool);
    u.color.value.setRGB(fcaw ? 0.66 : 0.62, fcaw ? 0.6 : 0.62, fcaw ? 0.5 : 0.6);
    if (on && st.pool) {
      const arc = st.arc;
      // flux-cored > solid-wire MAG (TWI); TIG: a low fume rate, no metal transfer through the arc (seed rates)
      let rate = st.process === '114' ? 22 : st.process === '136' || st.process === '111' ? 16 : st.process === '141' ? 1.5 : mode === 'spray' ? 10 : mode === 'globular' ? 9 : 6; // per s, seed
      if (arc) rate *= 1 + 0.06 * Math.max(0, arc.dU) + Math.max(0, (arc.I - 200) / 400);
      this.smokeAcc += rate * dt;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const i = this.smNext;
        this.smNext = (this.smNext + 1) % MAX_SMOKE;
        this.smOff[i * 3] = st.pool.x + (Math.random() - 0.5) * 0.006;
        this.smOff[i * 3 + 1] = st.pool.y + 0.006;
        this.smOff[i * 3 + 2] = st.pool.z + (Math.random() - 0.5) * 0.006;
        this.smVel[i * 3] = (Math.random() - 0.5) * 0.03;
        this.smVel[i * 3 + 1] = 0.1 + Math.random() * 0.12; // buoyant plume, seed
        this.smVel[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
        this.smMax[i] = 3 + Math.random() * 2;
        this.smLife[i] = this.smMax[i];
      }
    }
    const ext = this.extractor;
    const wind = this.wind;
    for (let i = 0; i < MAX_SMOKE; i++) {
      if (this.smLife[i] <= 0) { this.smAlpha[i] = 0; continue; }
      this.smLife[i] -= dt;
      if (ext) {
        const dx = ext.x - this.smOff[i * 3], dy = ext.y - this.smOff[i * 3 + 1], dz = ext.z - this.smOff[i * 3 + 2];
        const d = Math.hypot(dx, dy, dz) + 0.05;
        const pull = 0.12 / (d * d);
        this.smVel[i * 3] += (dx / d) * pull * dt;
        this.smVel[i * 3 + 1] += (dy / d) * pull * dt;
        this.smVel[i * 3 + 2] += (dz / d) * pull * dt;
      }
      if (wind) {
        this.smVel[i * 3] += (wind.x - this.smVel[i * 3]) * Math.min(1, dt * 1.5);
        this.smVel[i * 3 + 2] += (wind.z - this.smVel[i * 3 + 2]) * Math.min(1, dt * 1.5);
      }
      // plume slows and spreads as it rises
      this.smVel[i * 3 + 1] *= 1 - 0.25 * dt;
      this.smOff[i * 3] += this.smVel[i * 3] * dt;
      this.smOff[i * 3 + 1] += this.smVel[i * 3 + 1] * dt;
      this.smOff[i * 3 + 2] += this.smVel[i * 3 + 2] * dt;
      const age = this.smMax[i] - this.smLife[i];
      this.smSize[i] = 0.015 + age * 0.055;
      this.smAlpha[i] = Math.max(0, Math.min(0.3, this.smLife[i] / 4)) * Math.min(1, age * 2.5);
    }
    const g = this.smoke.geometry;
    g.attributes.offset.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}
