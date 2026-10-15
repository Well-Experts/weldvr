// GPU side of the coupon heat-flow model: a half-float texture with the current and peak plate
// temperatures, a physically based incandescence table, and GLSL helpers shared by the plate,
// bead and pool materials.
//
// Incandescence: Planck spectral radiance of a grey body (emissivity 0.7, EN 1993-1-2 value for
// carbon steel) integrated against the CIE 1931 colour-matching functions (multi-lobe Gaussian
// fit of Wyman, Sloan and Shirley, JCGT 2013) and converted to linear sRGB (IEC 61966-2-1).
// Luminance is expressed in scene units, with one unit = the luminance of a white diffuse
// surface in the booth (assumed about 148 cd/m2, i.e. about 400 lx: SEED). Red heat at 800 C is
// about 9 cd/m2 and molten steel at 1500 C about 6.7e4 cd/m2, so through a dark lens only the
// pool and the metal just behind it stay visible, as on a real helmet.

import * as THREE from 'three';
import { EMISSIVITY } from '../sim/material.js';

export const SCENE_UNIT_CD = 148; // cd/m2 per scene unit (seed: booth at ~400 lx)
const LUT_T0 = 400, LUT_T1 = 2200, LUT_N = 256;

function planck(lamNm, Tc) {
  const h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
  const lam = lamNm * 1e-9;
  const T = Tc + 273.15;
  return (2 * h * c * c) / lam ** 5 / (Math.exp((h * c) / (lam * k * T)) - 1); // W/sr/m2/m
}

function g(l, mu, s1, s2) {
  const s = l < mu ? s1 : s2;
  return Math.exp(-0.5 * ((l - mu) / s) ** 2);
}

function cie(l) {
  return [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
  ];
}

// Linear-sRGB emission (scene units) of hot steel at Tc (C).
export function incandescence(Tc, eps = EMISSIVITY) {
  if (Tc < LUT_T0 - 50) return [0, 0, 0];
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 4) {
    const b = planck(l, Tc) * 4e-9;
    const [x, y, z] = cie(l);
    X += x * b;
    Y += y * b;
    Z += z * b;
  }
  const s = (683 * eps) / SCENE_UNIT_CD;
  X *= s; Y *= s; Z *= s;
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b2 = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [Math.max(0, r), Math.max(0, gg), Math.max(0, b2)];
}

let LUT = null;
export function incandescenceLUT() {
  if (LUT) return LUT;
  const data = new Uint16Array(LUT_N * 4);
  for (let k = 0; k < LUT_N; k++) {
    const T = LUT_T0 + ((LUT_T1 - LUT_T0) * k) / (LUT_N - 1);
    const c = incandescence(T);
    for (let q = 0; q < 3; q++) data[k * 4 + q] = THREE.DataUtils.toHalfFloat(Math.min(c[q], 60000));
    data[k * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  LUT = new THREE.DataTexture(data, LUT_N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  LUT.magFilter = THREE.LinearFilter;
  LUT.minFilter = THREE.LinearFilter;
  LUT.wrapS = LUT.wrapT = THREE.ClampToEdgeWrapping;
  LUT.needsUpdate = true;
  return LUT;
}

// CPU colour for particles (sparks): cached table at 10 C steps.
const CPU_LUT = [];
export function incandescenceCPU(Tc) {
  if (Tc < 450) return [0, 0, 0];
  const k = Math.min(220, Math.round((Tc - 400) / 10));
  if (!CPU_LUT[k]) CPU_LUT[k] = incandescence(400 + k * 10);
  return CPU_LUT[k];
}

// GLSL: incandescence(T) and the thermal-camera palette.
export const GLSL_GLOW = /* glsl */ `
uniform sampler2D glowLUT;
uniform float glowExpo;
// Physical radiance of hot steel (scene units), then a hue-preserving highlight compression in
// exposed space: very hot metal keeps its orange-yellow colour on the display instead of
// clipping to white (a display compromise; the radiance ordering is kept).
vec3 incandescenceRaw(float T) {
  if (T < ${LUT_T0 - 30}.0) return vec3(0.0);
  float u = clamp((T - ${LUT_T0}.0) / ${LUT_T1 - LUT_T0}.0, 0.0, 1.0) * ${(LUT_N - 1) / LUT_N} + ${0.5 / LUT_N};
  return texture2D(glowLUT, vec2(u, 0.5)).rgb * smoothstep(${LUT_T0 - 30}.0, ${LUT_T0 + 30}.0, T);
}
vec3 incandescence(float T) {
  vec3 e = incandescenceRaw(T);
  float L = max(max(e.r, e.g), e.b) * max(glowExpo, 1e-4);
  if (L < 1e-5) return e;
  float K = 2.4;
  return e * (K * (1.0 - exp(-L / K)) / L);
}
vec3 thermalPalette(float T) {
  float k = clamp((T - 20.0) / 580.0, 0.0, 1.0);
  vec3 c = mix(vec3(0.02, 0.0, 0.08), vec3(0.35, 0.0, 0.55), smoothstep(0.0, 0.15, k));
  c = mix(c, vec3(0.85, 0.05, 0.25), smoothstep(0.12, 0.35, k));
  c = mix(c, vec3(1.0, 0.45, 0.0), smoothstep(0.32, 0.6, k));
  c = mix(c, vec3(1.0, 0.9, 0.2), smoothstep(0.58, 0.85, k));
  c = mix(c, vec3(1.0, 1.0, 0.95), smoothstep(0.85, 1.0, k));
  return c;
}`;

// GLSL: plate temperature lookup from joint-local millimetres (physical x). On a pipe the coupon frame is
// the pipe-local frame: jointCoord() unwraps a point to joint-local (x round the outside, u, v), as
// sim/pipe.js pipeLocal; on plates it returns the point unchanged.
export const GLSL_THERM = /* glsl */ `
uniform sampler2D thermTex;
uniform vec4 thermGeo;    // nx, rows, cell mm, joint length mm
uniform vec4 thermPlate0; // s0, ns, row0, thickness
uniform vec4 thermPlate1;
uniform float thermType;  // 1 = fillet (two plates)
uniform float thermMirror;
uniform vec4 thermPipe;   // pipe: outside radius R, radius of x (Rx), 1 = pipe, x per column (mm)
vec3 jointCoord(vec3 p) {
  if (thermPipe.z < 0.5) return p;
  float a = atan(p.x, -p.z);
  if (a < 0.0) a += 6.2831853;
  return vec3(a * thermPipe.y, p.y, length(p.xz) - thermPipe.x);
}
vec2 thermSample(vec3 p) {
  float xs = thermMirror > 0.5 ? thermGeo.w - p.x : p.x;
  vec4 pl = thermPlate0;
  float s = p.y;
  if (thermType > 0.5) {
    float a = (p.y + p.z) * 0.70710678;
    float b = (p.z - p.y) * 0.70710678;
    s = a;
    if (b > a && a >= -thermPlate0.w) { s = b; pl = thermPlate1; }
  }
  // pipe: the texture repeats round the pipe (x wraps)
  float fx = thermPipe.z > 0.5 ? xs / thermPipe.w : clamp(xs / thermGeo.z, 0.5, thermGeo.x - 0.5);
  float fs = clamp((s - pl.x) / thermGeo.z, 0.5, pl.y - 0.5);
  return texture2D(thermTex, vec2(fx / thermGeo.x, (pl.z + fs) / thermGeo.y)).rg;
}`;

// Exposure seen by the glow materials (the app writes renderer.toneMappingExposure here).
export const GLOW_EXPO = { value: 1.05 };

// Temperature texture for one coupon.
export class ThermalView {
  constructor(thermal, opts = {}) {
    this.thermal = thermal;
    this.mirror = !!opts.mirror;
    const lay = thermal.lay;
    this.nx = lay.nx;
    this.rows = lay.rows;
    this.f32 = new Float32Array(this.nx * this.rows * 2).fill(thermal.Tamb);
    this.data = new Uint16Array(this.nx * this.rows * 2);
    this.tex = new THREE.DataTexture(this.data, this.nx, this.rows, THREE.RGFormat, THREE.HalfFloatType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    if (lay.periodic) this.tex.wrapS = THREE.RepeatWrapping; // pipe: the last column joins the first
    this.version = -1;
    this.t = 0;
    const p0 = lay.plates[0], p1 = lay.plates[1] || lay.plates[0];
    const jt = thermal.joint.t;
    this.uniforms = {
      thermTex: { value: this.tex },
      thermGeo: { value: new THREE.Vector4(this.nx, this.rows, lay.h, thermal.joint.L) },
      thermPlate0: { value: new THREE.Vector4(p0.s0, p0.ns, p0.row0, jt) },
      thermPlate1: { value: new THREE.Vector4(p1.s0, p1.ns, p1.row0, jt) },
      thermType: { value: thermal.joint.type === 'fillet' ? 1 : 0 },
      thermMirror: { value: this.mirror ? 1 : 0 },
      thermPipe: { value: thermal.joint.pipe ? new THREE.Vector4(thermal.joint.pipe.R, thermal.joint.pipe.Rx, 1, lay.hx) : new THREE.Vector4(0, 0, 0, 1) },
      glowLUT: { value: incandescenceLUT() },
      glowExpo: GLOW_EXPO, // renderer exposure, shared by every glowing material
      thermView: { value: 0 }, // 1 = thermal-camera colours (training aid)
    };
    this.upload(true);
  }

  // Push the current field to the GPU (rate limited by the caller).
  upload(force = false) {
    const th = this.thermal;
    if (!force && th.version === this.version) return false;
    this.version = th.version;
    th.fillTexture(this.f32, this.mirror);
    const d = this.data, f = this.f32;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let k = 0; k < f.length; k++) d[k] = toHalf(f[k] > 60000 ? 60000 : f[k]);
    this.tex.needsUpdate = true;
    return true;
  }

  dispose() {
    this.tex.dispose();
  }
}
