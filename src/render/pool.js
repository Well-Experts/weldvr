// Weld pool mesh (joint-local millimetres, child of the coupon). Its outline is the melt isotherm
// of the moving-source model (sim/pool.js): wide, short pools on cold plate and slow travel; long
// pools on hot plate. Each vertex carries its temperature from the same solution, so the pool
// glows hottest under the arc and fades to the liquidus at its edge. The trailing half follows the
// arc's recent path, so a weaving pool trails along the weave. The surface shows the arc
// depression, ripples running back from the arc, floating silicate islands (solid wire) or molten
// slag over the rear of the pool (flux-cored wire, covered electrode).

import * as THREE from 'three';
import { GLSL_GLOW } from './thermalTex.js';
import { poolTemperature } from '../sim/pool.js';
import { surfaceHeight } from '../sim/session.js';
import { pipePoint } from '../sim/pipe.js';

const NA = 16; // segments along the pool
const NC = 10; // segments across

export class PoolMesh {
  constructor(joint, opts = {}) {
    this.joint = joint;
    this.mirror = !!opts.mirror;
    const nv = (NA + 1) * (NC + 1);
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    this.temp = new Float32Array(nv);
    this.coord = new Float32Array(nv * 2); // (xi normalised -1 rear .. +1 front, lateral -1..1)
    const idx = [];
    for (let a = 0; a < NA; a++) {
      for (let c = 0; c < NC; c++) {
        const p = a * (NC + 1) + c, q = p + NC + 1;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.aTemp = new THREE.BufferAttribute(this.temp, 1).setUsage(THREE.DynamicDrawUsage);
    this.aCoord = new THREE.BufferAttribute(this.coord, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNor);
    g.setAttribute('temp', this.aTemp);
    g.setAttribute('pcoord', this.aCoord);
    g.boundingSphere = joint.pipe ? new THREE.Sphere(new THREE.Vector3(0, 0, 0), joint.pipe.R + 60) : new THREE.Sphere(new THREE.Vector3(joint.L / 2, 0, 0), joint.L);
    this.pp = [0, 0, 0];
    this.geometry = g;
    this.uniforms = { time: { value: 0 }, slagCover: { value: 0 }, islands: { value: 1 }, arcAmp: { value: 1 } };
    this.material = poolMaterial(this.uniforms, opts.uniforms);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'pool';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.heat = 0; // 1 while the arc burns, decays as the pool freezes
    this.dims = { w: 0, Lb: 0, Lf: 0 };
    this.path = []; // recent arc positions {x, u}
    this.last = null;
  }

  x(s) {
    return this.mirror && !this.joint.pipe ? this.joint.L - s : s;
  }

  // Record the arc path (sim coordinates) while welding.
  track(x, u) {
    const P = this.path;
    if (P.length && Math.abs(P[P.length - 1].x - x) < 0.05 && Math.abs(P[P.length - 1].u - u) < 0.05) return;
    P.push({ x, u });
    if (P.length > 160) P.shift();
  }

  // Lateral centre of the pool at x along the path behind the arc.
  centreAt(x, uNow) {
    const P = this.path;
    let best = uNow, bd = 1e9;
    for (let k = P.length - 1; k >= 0 && k >= P.length - 160; k--) {
      const d = Math.abs(P[k].x - x);
      if (d < bd) {
        bd = d;
        best = P[k].u;
      }
    }
    return bd < 3 ? best : uNow;
  }

  // st: session state ({arcOn, hit, pool, arc}); process: '135' | '136' | '114' | '111'.
  update(dt, st, rec, process) {
    this.uniforms.time.value += dt;
    const on = !!(st && st.arcOn && st.pool && st.hit && st.inJoint);
    if (on) {
      this.heat = 1;
      this.last = { hit: { ...st.hit }, shape: st.pool.shape, dir: st.pool.dir, mode: st.arc ? st.arc.mode : 'short' };
      this.dims.w = st.pool.w;
      this.dims.Lb = st.pool.Lb;
      this.dims.Lf = st.pool.Lf;
      this.track(st.hit.x, st.hit.u);
    } else {
      this.heat = Math.max(0, this.heat - dt / 0.45); // pool freezes in about half a second. seed
      if (!this.last || this.heat <= 0.02) {
        this.mesh.visible = false;
        if (this.heat <= 0) this.path.length = 0;
        return;
      }
    }
    const L = this.last;
    const shape = L.shape;
    if (!shape || !(shape.w > 0)) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const k = on ? 1 : this.heat;
    const sw = (this.dims.w / shape.w) * (0.35 + 0.65 * k); // freezing pool shrinks from the edges
    const Lb = this.dims.Lb * (0.25 + 0.75 * k), Lf = this.dims.Lf * k;
    const dir = L.dir;
    const hit = L.hit;
    const j = this.joint;
    const mode = L.mode;
    const dip = (mode === 'spray' ? 0.9 : mode === 'globular' ? 0.6 : 0.4) * (on ? 1 : 0); // arc depression (mm). seed
    const span = Lb + Lf;
    // pipe: lay the rows across in the order that keeps the surface facing out of the joint whichever way
    // the arc travels (see bead.js: the pipe-local frame has t x u = -v)
    const latSign = j.pipe && dir > 0 ? -1 : 1;
    const prof = shape.profile;
    const N = shape.N;
    let o = 0;
    for (let a = 0; a <= NA; a++) {
      const f = a / NA; // 0 rear .. 1 front
      const xi = -Lb + span * f;
      // half-width from the solution profile (scaled to the smoothed and freezing size)
      const kk = Math.min(N - 1, Math.max(0, Math.floor(f * N)));
      const fr = f * N - kk;
      const y = Math.max(0.15, (prof[kk] * (1 - fr) + prof[Math.min(N, kk + 1)] * fr) * sw);
      const xs = hit.x + dir * xi;
      const uc = xi < 0 ? this.centreAt(xs, hit.u) : hit.u;
      for (let c = 0; c <= NC; c++) {
        const lat = ((2 * c) / NC - 1) * latSign;
        const u = uc + y * lat;
        let v = surfaceHeight(rec, Math.floor(xs), u);
        // liquid surface: slight crown, depressed under the arc
        const r2 = (xi * xi + (u - hit.u) ** 2) / 4;
        v += 0.25 * (1 - lat * lat) * (0.3 + 0.7 * k) - dip * Math.exp(-r2) + 0.06;
        if (j.pipe) {
          const pp = pipePoint(j, xs, u, v, this.pp);
          this.pos[o * 3] = pp[0];
          this.pos[o * 3 + 1] = pp[1];
          this.pos[o * 3 + 2] = pp[2];
        } else {
          this.pos[o * 3] = this.x(xs);
          this.pos[o * 3 + 1] = u;
          this.pos[o * 3 + 2] = v;
        }
        const T = on ? poolTemperature(shape, xi / Math.max(sw, 0.3), (u - uc) / Math.max(sw, 0.3)) : shape.Tm + (2000 - shape.Tm) * 0.2 * k * (1 - lat * lat);
        this.temp[o] = Math.min(2500, Math.max(shape.Tm - 60, T)) * (on ? 1 : 0.85 + 0.15 * k);
        this.coord[o * 2] = (2 * f - 1);
        this.coord[o * 2 + 1] = lat;
        o++;
      }
    }
    this.computeNormals();
    for (const a of [this.aPos, this.aNor, this.aTemp, this.aCoord]) a.needsUpdate = true;
    // molten slag floats over the rear of the pool with flux-cored wires and covered electrodes
    const slag = process === '136' || process === '114' || process === '111';
    this.uniforms.slagCover.value = slag ? 1 : 0;
    this.uniforms.islands.value = slag ? 0 : 1;
    this.uniforms.arcAmp.value = on ? 1 : 0;
    void j;
  }

  computeNormals() {
    const P = this.pos, Nn = this.nor;
    for (let a = 0; a <= NA; a++) {
      for (let c = 0; c <= NC; c++) {
        const i = a * (NC + 1) + c;
        const ia = Math.max(0, a - 1) * (NC + 1) + c, ib = Math.min(NA, a + 1) * (NC + 1) + c;
        const ic = a * (NC + 1) + Math.max(0, c - 1), id = a * (NC + 1) + Math.min(NC, c + 1);
        const tx = P[ib * 3] - P[ia * 3], ty = P[ib * 3 + 1] - P[ia * 3 + 1], tz = P[ib * 3 + 2] - P[ia * 3 + 2];
        const bx = P[id * 3] - P[ic * 3], by = P[id * 3 + 1] - P[ic * 3 + 1], bz = P[id * 3 + 2] - P[ic * 3 + 2];
        let nx = ty * bz - tz * by, ny = tz * bx - tx * bz, nz = tx * by - ty * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        // face out of the joint: +v on plates; on a pipe the radial direction at the vertex
        const out = this.joint.pipe ? nx * P[i * 3] + nz * P[i * 3 + 2] : nz;
        if (out < 0) { nx = -nx; ny = -ny; nz = -nz; }
        // pool surfaces face out of the joint (+v)
        Nn[i * 3] = nx;
        Nn[i * 3 + 1] = ny;
        Nn[i * 3 + 2] = nz;
      }
    }
  }
}

function poolMaterial(u, thermUniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a524a, metalness: 0.55, roughness: 0.14, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    if (thermUniforms) {
      shader.uniforms.glowLUT = thermUniforms.glowLUT;
      shader.uniforms.glowExpo = thermUniforms.glowExpo;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float temp; attribute vec2 pcoord; varying float vTemp; varying vec2 vPC;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTemp = temp; vPC = pcoord;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float time; uniform float slagCover; uniform float islands; uniform float arcAmp;
varying float vTemp; varying vec2 vPC;
${GLSL_GLOW}
float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
// ripples running back from the arc and a stirred surface
float rr = length(vec2(vPC.x - 0.55, vPC.y * 0.8));
float wave = sin(rr * 26.0 - time * 38.0) * exp(-rr * 1.6) * 0.18 * arcAmp;
float stir = (pNoise(vPC * vec2(6.0, 4.0) + vec2(time * 1.7, -time * 1.1)) - 0.5) * 0.25;
normal = normalize(normal + vec3(wave + stir, stir * 0.6, 0.0) * 0.6);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// silicate islands drift back toward the tail (solid wire); molten slag over the rear (flux-cored)
vec2 adv = vec2(vPC.x * 3.0 + time * 0.9, vPC.y * 2.2);
float isl = smoothstep(0.72, 0.8, pNoise(adv)) * islands * smoothstep(0.6, -0.6, vPC.x);
float slag = slagCover * smoothstep(0.15, -0.25, vPC.x);
float edgeCool = smoothstep(0.75, 1.0, abs(vPC.y));
float Tm = vTemp - 120.0 * edgeCool;
vec3 glow = incandescence(Tm);
glow *= 1.0 - 0.65 * isl;
glow = mix(glow, incandescence(Tm - 260.0) * vec3(1.0, 0.85, 0.7), slag * 0.85);
totalEmissiveRadiance += glow;`);
  };
  return mat;
}
