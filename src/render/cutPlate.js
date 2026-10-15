// The plate being cut, in its own millimetre frame (x along the marked line, y = u across, 0 on the line and
// the strip that drops off on u < 0, z = v up with the top surface at 0), placed on the bench by `place`.
// Top and bottom faces open along the kerf as the cut goes (a per-millimetre table of the kerf from the cut
// record: centre, width, bevel, depth, drag); the kerf faces are drawn with their drag lines, a rounded top
// edge, pressure marks and gouges, and the slag stuck on the bottom edge; the hot steel glows from the plate
// heat model plus the top-surface excess under the flame (sim/cut.js); the soapstone line is on the top.
// When the cut is through the whole length the strip falls into the tray under the overhang.
// Also: the cutting rack (slats under the kept part, the strip over the open side) and the sand tray.

import * as THREE from 'three';
import { millScale } from './textures.js';
import { GLSL_GLOW, GLOW_EXPO, incandescenceLUT } from './thermalTex.js';
import { mergeStatic } from './merge.js';
import { DEG } from '../sim/util.js';
import { KERF_EDGE_C, KERF_EDGE_TAU } from '../sim/cut.js';

let MILL = null;
const SKIN_DEPTH = 4; // mm: depth over which the surface excess under the flame fades (display, seed)

// plate frame (mm) -> bench (m): X = x0 + s x / 1000, Y = yTop + z / 1000, Z = zLine + y / 1000
export function plateMatrix(place) {
  const m = new THREE.Matrix4();
  m.set(
    place.s / 1000, 0, 0, place.x0,
    0, 0, 1 / 1000, place.yTop,
    0, 1 / 1000, 0, place.zLine,
    0, 0, 0, 1,
  );
  return m;
}

const PLATE_GLSL = /* glsl */ `
uniform sampler2D tempTex;   // surface temperature (r) and peak (g) on the thermal grid
uniform vec4 tempGeo;        // nx, ns, cell mm, s0 + drop offset (u of the first row)
uniform sampler2D kerfTex;   // per mm of x: uTop, kerf width, depth, bottom offset
uniform sampler2D kerfTex2;  // per mm of x: drag, top rounding, gouges, pressure marks
uniform sampler2D kerfTex3;  // per mm of x: time the kerf was cut there (s, < 0 not cut)
uniform float uNow;          // session time (s)
uniform vec2 edgeK;          // kerf edge: temperature when cut (C), cooling time constant (s)
uniform vec4 frontK;         // burning front: x, u, 1 while cutting, half kerf (mm)
uniform float kerfOpen;      // 1 once the strip has dropped (the kerf faces open to the light)
uniform vec4 plateGeo;       // L, drop, keep, t
uniform float part;          // 0 whole plate, 1 the kept part, -1 the strip
uniform float thermView;
${GLSL_GLOW}
vec4 kerfAt(float x) { return texture2D(kerfTex, vec2((clamp(floor(x), 0.0, plateGeo.x - 1.0) + 0.5) / plateGeo.x, 0.5)); }
vec4 kerf2At(float x) { return texture2D(kerfTex2, vec2((clamp(floor(x), 0.0, plateGeo.x - 1.0) + 0.5) / plateGeo.x, 0.5)); }
// the kerf walls just cut are at the burning temperature and cool with the age of the cut
float edgeT(float x) {
  float tc = texture2D(kerfTex3, vec2((clamp(floor(x), 0.0, plateGeo.x - 1.0) + 0.5) / plateGeo.x, 0.5)).r;
  if (tc < 0.0) return 0.0;
  return edgeK.x * exp(-max(uNow - tc, 0.0) / edgeK.y);
}
// surface temperature (x), peak (y) and the through-thickness average (z) of the plate grid
vec3 tempAt(float x, float u) {
  float fx = clamp(x / tempGeo.z, 0.5, tempGeo.x - 0.5);
  float fs = clamp((u - tempGeo.w) / tempGeo.z, 0.5, tempGeo.y - 0.5);
  return texture2D(tempTex, vec2(fx / tempGeo.x, fs / tempGeo.y)).rgb;
}
// below the top surface the excess under the flame fades into the plate average (depth d mm; display, seed)
float tempDepth(vec3 th, float d) { return th.z + (th.x - th.z) * exp(-max(d, 0.0) / ${SKIN_DEPTH.toFixed(1)}); }
float pHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

// Patch a standard material for the plate faces (top, bottom, edges).
function plateMaterial(uniforms, opts = {}) {
  if (!MILL) MILL = millScale(5);
  const mat = new THREE.MeshStandardMaterial({ map: MILL, color: 0xffffff, metalness: 0.35, roughness: 0.68, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { part: { value: opts.part ?? 0 }, faceKind: { value: opts.face ?? 0 } });
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vP;\nuniform float faceKind;\n${PLATE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
// faceKind: 0 top, 1 bottom, 2 edge
vec4 k1 = kerfAt(vP.x);
vec4 k2 = kerf2At(vP.x);
float uc = k1.x;
if (faceKind > 0.5 && faceKind < 1.5) {
  // the bottom of the kerf lags the top by the drag and sits off by the bevel
  vec4 kb = kerfAt(vP.x + k2.x);
  if (kb.z > 0.999 && abs(vP.y - (kb.x + kb.w)) < kb.y * 0.5) discard;
  uc = kb.x + kb.w;
} else if (faceKind < 0.5) {
  if (k1.z > 0.999 && abs(vP.y - k1.x) < k1.y * 0.5) discard;
}
if (part > 0.5 && vP.y < uc) discard;
if (part < -0.5 && vP.y > uc) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 th = tempAt(vP.x, vP.y);
// the top face takes the surface value; the bottom and the edges fade with the depth below the top
float dep = faceKind < 0.5 ? 0.0 : (faceKind < 1.5 ? plateGeo.w : -vP.z);
float tNow = tempDepth(th, dep), tPeak = th.z + (th.y - th.z) * exp(-dep / ${SKIN_DEPTH.toFixed(1)});
// the faces next to the kerf: hot from the cut, a narrow band (about a millimetre)
if (k1.z > 0.05 && faceKind < 1.5) {
  float dE = max(abs(vP.y - uc) - k1.y * 0.5, 0.0);
  tNow = max(tNow, edgeT(vP.x) * exp(-dE / 1.2));
}
// the burning front itself: the end of the kerf under the jet, at the burning temperature
if (frontK.z > 0.5 && faceKind < 0.5 && vP.x > frontK.x) {
  float dF = max(length(vec2(vP.x - frontK.x, vP.y - frontK.y)) - frontK.w, 0.0);
  tNow = max(tNow, edgeK.x * exp(-dF / 1.2));
}
// soapstone line on the top (until the kerf takes it)
if (faceKind < 0.5) {
  float line = 1.0 - smoothstep(0.45, 0.8, abs(vP.y + 0.15 * sin(vP.x * 0.21)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.77, 0.72), line * 0.85 * (0.85 + 0.15 * pHash(floor(vP.xy * 3.0))));
  // the cut edge: a rounded (melted) top edge, scale and slag spatter beside the kerf
  float d = abs(vP.y - k1.x) - k1.y * 0.5;
  if (k1.z > 0.05) {
    float rim = 1.0 - smoothstep(0.0, 0.6 + 1.6 * k2.y, d);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.11, 0.11), rim * 0.85);
    // slag spatter (dark oxide beads), more where the cut was unstable (gouges, pressure marks)
    float spl = step(0.975 - 0.1 * clamp(k2.z + k2.w, 0.0, 1.0), pHash(floor(vP.xy * 3.0))) * (1.0 - smoothstep(0.5, 3.5, d));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.024, 0.026), spl * 0.8);
    // a gouge or partial cut (pierce, lost cut) shows as a dark groove
    if (k1.z < 0.999) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.05, 0.05), (1.0 - smoothstep(0.0, 1.2, abs(vP.y - k1.x))) * 0.9);
  }
}
// heat: oxide scale where the steel has been red hot, temper colours fade into grey
float scaleAmt = smoothstep(550.0, 900.0, tPeak);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.13, 0.14), scaleAmt * 0.75);
if (thermView > 0.5) diffuseColor.rgb = thermalPalette(tNow) * 0.35;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += incandescence(tNow);
if (thermView > 0.5) totalEmissiveRadiance += thermalPalette(tNow) * 0.6;`);
  };
  mat.customProgramCacheKey = () => `cutplate-${opts.face ?? 0}`;
  return mat;
}

// Material of the kerf faces (oxidised cut steel with drag lines).
function wallMaterial(uniforms, part) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b5c5f, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { part: { value: part } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vP;\n${PLATE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec4 k1 = kerfAt(vP.x);
vec4 k2 = kerf2At(vP.x);
float t = plateGeo.w;
float dv = clamp(-vP.z / t, 0.0, 1.0);
// drag lines: from the top at x0 curving back by the drag to the bottom
float x0 = vP.x + k2.x * pow(dv, 1.5);
float sp = 0.9 + 0.5 * pHash(vec2(floor(x0 / 1.1), 3.0));
float ln = abs(fract(x0 / sp) - 0.5) * 2.0;
float lines = smoothstep(0.55, 1.0, ln);
float rough = 0.35 + 0.65 * k2.z + 0.5 * k2.w;
// a fresh flame-cut face: dark grey-blue oxide over the drag lines
vec3 base = vec3(0.075, 0.078, 0.085) * (0.85 + 0.3 * pHash(floor(vP.xz * 4.0)));
base *= 1.0 - lines * (0.18 + 0.4 * rough);
// gouges and pressure marks: deeper, irregular pits low on the face
float pit = step(1.0 - 0.25 * (k2.z + k2.w), pHash(floor(vec2(vP.x * 1.3, vP.z * 1.7)))) * smoothstep(0.2, 0.7, dv);
base *= 1.0 - pit * 0.55;
// rounded or beaded top edge
float top = 1.0 - smoothstep(0.0, 0.4 + k2.y, -vP.z);
base = mix(base, vec3(0.04, 0.036, 0.036), top * smoothstep(0.15, 0.6, k2.y));
diffuseColor.rgb = base;
vec3 th = tempAt(vP.x, vP.y);
float tNow = max(tempDepth(th, -vP.z), edgeT(vP.x));
if (thermView > 0.5) diffuseColor.rgb = thermalPalette(tNow) * 0.35;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += incandescence(tNow);
if (thermView > 0.5) totalEmissiveRadiance += thermalPalette(tNow) * 0.6;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
// inside the narrow kerf the face sees the room only through the slot above (and below): the view factor of
// the opening from a point at depth d in a slot of width w, 1 - d / sqrt(d^2 + w^2) (2-D slot)
{
  float w = max(kerfAt(vP.x).y, 0.8);
  float dTop = max(-vP.z, 0.0), dBot = max(plateGeo.w + vP.z, 0.0);
  float occ = max(1.0 - dTop / sqrt(dTop * dTop + w * w), 0.5 * (1.0 - dBot / sqrt(dBot * dBot + w * w)));
  occ = mix(occ, 1.0, kerfOpen);
  reflectedLight.directDiffuse *= occ;
  reflectedLight.directSpecular *= occ;
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ;
}`);
  };
  mat.customProgramCacheKey = () => 'cutwall';
  return mat;
}

function quad(pos, a, b, c, d) {
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
}

export class CutPlateView {
  constructor(ses, place) {
    this.ses = ses;
    this.c = ses.c;
    this.place = place;
    const c = this.c;
    this.group = new THREE.Group();
    this.group.name = 'cutPlate';
    this.group.matrixAutoUpdate = false;
    this.group.matrix.copy(plateMatrix(place));
    this.group.matrixWorldNeedsUpdate = true;
    const n = c.n;
    // per-mm kerf tables
    this.k1 = new Float32Array(n * 4);
    this.k2 = new Float32Array(n * 4);
    this.k3 = new Float32Array(n * 4).fill(-1);
    this.kerfTex3 = new THREE.DataTexture(this.k3, n, 1, THREE.RGBAFormat, THREE.FloatType);
    this.kerfTex3.magFilter = this.kerfTex3.minFilter = THREE.NearestFilter;
    this.kerfTex3.needsUpdate = true;
    this.kerfTex = new THREE.DataTexture(this.k1, n, 1, THREE.RGBAFormat, THREE.FloatType);
    this.kerfTex2 = new THREE.DataTexture(this.k2, n, 1, THREE.RGBAFormat, THREE.FloatType);
    for (const tx of [this.kerfTex, this.kerfTex2]) {
      tx.magFilter = tx.minFilter = THREE.NearestFilter;
      tx.needsUpdate = true;
    }
    // surface temperature on the thermal grid (+ peak)
    const th = ses.thermal;
    this.nx = ses.nxs;
    this.ns = ses.pl.ns;
    // half floats: linear filtering of half-float textures is core in WebGL 2 (float32 needs an extension)
    this.tf = new Uint16Array(this.nx * this.ns * 4).fill(THREE.DataUtils.toHalfFloat(20));
    this.peak = new Float32Array(this.nx * this.ns).fill(20);
    this.tempTex = new THREE.DataTexture(this.tf, this.nx, this.ns, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tempTex.magFilter = this.tempTex.minFilter = THREE.LinearFilter;
    this.tempTex.needsUpdate = true;
    this.uniforms = {
      tempTex: { value: this.tempTex },
      tempGeo: { value: new THREE.Vector4(this.nx, this.ns, ses.hs, ses.pl.s0 - ses.sLine) },
      kerfTex: { value: this.kerfTex },
      kerfTex2: { value: this.kerfTex2 },
      kerfTex3: { value: this.kerfTex3 },
      uNow: { value: 0 },
      edgeK: { value: new THREE.Vector2(KERF_EDGE_C, KERF_EDGE_TAU) },
      frontK: { value: new THREE.Vector4(0, 0, 0, 0.5) },
      kerfOpen: { value: 0 },
      plateGeo: { value: new THREE.Vector4(n, c.drop, c.keep, c.t) },
      glowLUT: { value: incandescenceLUT() },
      glowExpo: GLOW_EXPO,
      thermView: { value: 0 },
    };
    void th;
    // faces: top, bottom, the four edges (the two end faces split at the line so each part takes its own)
    this.keep = new THREE.Group();
    this.strip = new THREE.Group();
    this.group.add(this.keep, this.strip);
    this.build();
    // kerf faces (rebuilt as the cut goes) and slag on the bottom edge
    this.walls = { keep: null, strip: null };
    this.wallMat = { keep: wallMaterial(this.uniforms, 1), strip: wallMaterial(this.uniforms, -1) };
    for (const side of ['keep', 'strip']) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMat[side]);
      m.frustumCulled = false;
      (side === 'keep' ? this.keep : this.strip).add(m);
      this.walls[side] = m;
    }
    const drossGeo = new THREE.SphereGeometry(1, 8, 6);
    this.drossMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.25, emissive: 0x000000 });
    this.dross = {};
    for (const side of ['keep', 'strip']) {
      const im = new THREE.InstancedMesh(drossGeo, this.drossMat, n * 2);
      im.count = 0;
      im.frustumCulled = false;
      (side === 'keep' ? this.keep : this.strip).add(im);
      this.dross[side] = im;
    }
    this.lastFront = -1;
    this.wallT = 0;
    this.tempT = 0;
    this.drop = null; // falling strip state
    this.dirty = true;
  }

  build() {
    const c = this.c;
    const L = c.L, t = c.t, D = c.drop, K = c.keep;
    const mk = (geo, face, part) => {
      const m = new THREE.Mesh(geo, plateMaterial(this.uniforms, { face, part }));
      m.frustumCulled = false;
      return m;
    };
    const plane = (z, flip) => {
      const g = new THREE.PlaneGeometry(L, D + K, Math.ceil(L / 25), Math.ceil((D + K) / 25));
      g.translate(L / 2, (K - D) / 2, 0);
      if (flip) g.rotateX(Math.PI);
      g.translate(0, 0, z);
      // map uv in 100 mm units (mill scale)
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 100, p.getY(i) / 100);
      return g;
    };
    // the plate is drawn twice (kept part / strip): before the drop each draws its own side of the kerf line
    this.faces = [];
    for (const [grp, part] of [[this.keep, 1], [this.strip, -1]]) {
      const top = mk(plane(0, false), 0, part);
      const bot = mk(plane(-t, true), 1, part);
      grp.add(top, bot);
      this.faces.push(top, bot);
    }
    // edges: long sides, and the end faces split at u = 0 (adjusted to the kerf once it reaches them)
    const edge = (a, b, part) => {
      const pos = [];
      quad(pos, [a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -t], [a[0], a[1], -t]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const uv = [];
      for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] + pos[i + 1]) / 100, pos[i + 2] / 100);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return mk(g, 2, part);
    };
    this.keep.add(edge([0, K], [L, K], 0));
    this.strip.add(edge([L, -D], [0, -D], 0));
    this.ends = {
      keep0: edge([0, 0], [0, K], 0), keepL: edge([L, K], [L, 0], 0),
      strip0: edge([0, -D], [0, 0], 0), stripL: edge([L, 0], [L, -D], 0),
    };
    this.keep.add(this.ends.keep0, this.ends.keepL);
    this.strip.add(this.ends.strip0, this.ends.stripL);
  }

  setThermalView(on) {
    this.uniforms.thermView.value = on ? 1 : 0;
  }

  // kerf tables from the record (cheap: n samples)
  updateKerf() {
    const rec = this.ses.record, c = this.c;
    const k1 = this.k1, k2 = this.k2;
    for (let i = 0; i < rec.n; i++) {
      const cut = rec.t[i] >= 0;
      k1[i * 4] = rec.uTop[i];
      k1[i * 4 + 1] = cut ? Math.max(0.8, rec.kerf[i]) : 0;
      k1[i * 4 + 2] = cut ? rec.depth[i] : 0;
      k1[i * 4 + 3] = cut ? -c.t * Math.tan(rec.face[i] * DEG) : 0;
      k2[i * 4] = cut ? rec.drag[i] : 0;
      k2[i * 4 + 1] = cut ? rec.top[i] : 0;
      k2[i * 4 + 2] = cut ? rec.gr[i] : 0;
      k2[i * 4 + 3] = cut ? rec.pm[i] : 0;
      this.k3[i * 4] = cut && rec.depth[i] > 0.05 ? rec.t[i] : -1;
    }
    this.kerfTex3.needsUpdate = true;
    this.kerfTex.needsUpdate = true;
    this.kerfTex2.needsUpdate = true;
  }

  // kerf faces and slag up to the cut front (with the slanted front: the bottom lags by the drag)
  buildWalls() {
    const rec = this.ses.record, c = this.c, t = c.t;
    const front = this.ses.cutting && this.ses.front != null ? this.ses.front : null;
    for (const side of ['keep', 'strip']) {
      const sg = side === 'keep' ? 1 : -1;
      const pos = [];
      const im = this.dross[side];
      let ni = 0;
      const M = new THREE.Matrix4();
      let prev = null;
      for (let i = 0; i < rec.n; i++) {
        if (!(rec.depth[i] > 0.05 && rec.t[i] >= 0)) {
          prev = null;
          continue;
        }
        const x0 = i, x1 = i + 1;
        const u = rec.uTop[i] + sg * Math.max(0.8, rec.kerf[i]) * 0.5;
        const off = -t * Math.tan(rec.face[i] * DEG);
        let bot = -t * Math.min(1, rec.depth[i]);
        if (front != null && i + 1 > front - rec.drag[i]) bot = -t * Math.max(0, Math.min(1, (front - x1) / Math.max(rec.drag[i], 0.3))) * Math.min(1, rec.depth[i]);
        const ub = u + off * (-bot / t);
        const a = [x0, prev ? prev.u : u, 0], b = [x1, u, 0];
        const cc = [x1, ub, bot], d = [x0, prev ? prev.ub : ub, prev ? prev.bot : bot];
        if (sg > 0) quad(pos, a, b, cc, d);
        else quad(pos, b, a, d, cc);
        prev = { u, ub, bot };
        // slag stuck on the bottom edge
        if (rec.dross[i] > 0.05 && bot < -0.9 * t && ni < im.instanceMatrix.count - 1) {
          for (let q = 0; q < 2; q++) {
            const r = 0.25 + 0.35 * rec.dross[i] * (0.6 + 0.4 * Math.sin(i * 7.1 + q * 2.3));
            M.makeScale(r, r * 1.3, r * 0.8).setPosition(x0 + 0.25 + 0.5 * q, ub - sg * r * 0.4, -t - r * 0.5);
            im.setMatrixAt(ni++, M);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const w = this.walls[side];
      w.geometry.dispose();
      w.geometry = g;
      im.count = ni;
      im.instanceMatrix.needsUpdate = true;
    }
    // end faces: split at the kerf where it reached the edge
    const L = c.L, D = c.drop, K = c.keep;
    const setEnd = (mesh, a, b) => {
      const p = mesh.geometry.attributes.position;
      const pts = [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -t], [a[0], a[1], 0], [b[0], b[1], -t], [a[0], a[1], -t]];
      for (let q = 0; q < 6; q++) p.setXYZ(q, ...pts[q]);
      p.needsUpdate = true;
    };
    const k0 = rec.t[0] >= 0 && rec.depth[0] >= 0.999 ? Math.max(0.8, rec.kerf[0]) / 2 : 0;
    const kL = rec.t[rec.n - 1] >= 0 && rec.depth[rec.n - 1] >= 0.999 ? Math.max(0.8, rec.kerf[rec.n - 1]) / 2 : 0;
    const u0 = rec.t[0] >= 0 ? rec.uTop[0] : 0, uL = rec.t[rec.n - 1] >= 0 ? rec.uTop[rec.n - 1] : 0;
    setEnd(this.ends.keep0, [0, u0 + k0], [0, K]);
    setEnd(this.ends.keepL, [L, K], [L, uL + kL]);
    setEnd(this.ends.strip0, [0, -D], [0, u0 - k0]);
    setEnd(this.ends.stripL, [L, uL - kL], [L, -D]);
  }

  // surface temperatures to the GPU
  updateTemps() {
    const ses = this.ses;
    const th = ses.thermal;
    th.sync?.();
    const nx = this.nx, ns = this.ns;
    const T = th.T, E = ses.E;
    const c0 = ses.pl.c0 ?? 0;
    const f = this.tf, pk = this.peak;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < ns; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const v = T[c0 + k] + E[k];
        if (v > pk[k]) pk[k] = v;
        f[k * 4] = toHalf(Math.min(v, 60000));
        f[k * 4 + 1] = toHalf(Math.min(pk[k], 60000));
        f[k * 4 + 2] = toHalf(Math.min(T[c0 + k], 60000));
      }
    }
    this.tempTex.needsUpdate = true;
  }

  // dt: s. Rate-limited uploads; the falling strip.
  update(dt) {
    this.uniforms.uNow.value = this.ses.time;
    const ses = this.ses;
    const fk = this.uniforms.frontK.value;
    if (ses.cutting && ses.front != null && ses.state && ses.state.J) {
      const i = Math.max(0, Math.min(this.c.n - 1, Math.floor(ses.front)));
      fk.set(ses.front, ses.state.J.u, 1, Math.max(0.8, ses.record.kerf[i] || 1) / 2);
    } else fk.z = 0;
    this.uniforms.kerfOpen.value = this.drop ? 1 : 0;
    this.tempT += dt;
    if (this.tempT > 1 / 15) {
      this.tempT = 0;
      this.updateTemps();
    }
    const front = this.ses.cutting ? this.ses.front : null;
    this.wallT += dt;
    if (this.dirty || (front != null && this.wallT > 1 / 12) || (front == null && this.lastFront !== -1)) {
      this.wallT = 0;
      this.dirty = false;
      this.updateKerf();
      this.buildWalls();
      this.lastFront = front == null ? -1 : front;
    }
    if (this.drop) {
      const d = this.drop;
      d.t += dt;
      if (!d.rest) {
        d.v += 9810 * dt; // mm/s2
        d.z -= d.v * dt;
        d.rx = Math.min(d.rxMax, d.rx + dt * 1.2);
        // the strip turns about the line (its edge on the kerf) as it goes: it lands on its lowest corner
        const c = this.c;
        const zRest = -(c.t + d.depth) + c.t * Math.cos(d.rx) + c.drop * Math.sin(d.rx);
        if (d.z <= zRest) {
          d.z = zRest;
          d.rest = true;
        }
      }
      this.strip.position.set(0, 0, d.z);
      this.strip.rotation.x = d.rx;
    }
  }

  // the strip falls into the tray (depth: mm from the underside of the plate down to the sand)
  dropStrip(depth) {
    if (this.drop) return;
    this.drop = { t: 0, v: 0, z: 0, rx: 0, rxMax: 0.12, depth, rest: false };
    this.dirty = true;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.tempTex.dispose();
    this.kerfTex.dispose();
    this.kerfTex2.dispose();
    this.kerfTex3.dispose();
  }
}

// Cutting rack on the bench: slats under the kept part, the strip over the open side above a sand tray
// (bench frame, metres). Returns { group, trayTop } with the tray's sand surface height (m, bench y).
export function buildCutRack(place, c) {
  const g = new THREE.Group();
  g.name = 'cutRack';
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.7 });
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.8, metalness: 0.5 });
  const h = place.yTop - c.t / 1000; // plate underside
  const xa = Math.min(place.x0, place.x0 + (place.s * c.L) / 1000) - 0.05;
  const xb = Math.max(place.x0, place.x0 + (place.s * c.L) / 1000) + 0.05;
  const z0 = place.zLine + 0.012; // supports start just on the kept side of the line
  const z1 = place.zLine + (c.keep + 20) / 1000;
  // frame rails
  for (const z of [z0, z1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, 0.012, 0.03), steel);
    r.position.set((xa + xb) / 2, h - 0.03, z);
    g.add(r);
  }
  // slats on edge across the rails (the plate rests on their tops)
  for (let x = xa + 0.02; x <= xb - 0.015; x += 0.045) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, z1 - z0 + 0.03), slatMat);
    s.position.set(x, h - 0.015, (z0 + z1) / 2);
    g.add(s);
  }
  // legs down to the bench top
  for (const x of [xa + 0.01, xb - 0.01]) for (const z of [z0, z1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, h - 0.03, 0.02), steel);
    leg.position.set(x, (h - 0.03) / 2, z);
    g.add(leg);
  }
  // sand tray under the overhang (the strip side), on the bench top
  const tz0 = place.zLine - (c.drop + 70) / 1000, tz1 = place.zLine + 0.03;
  const trayH = 0.05;
  const tray = new THREE.Group();
  const walls = [
    [xb - xa + 0.06, trayH, 0.004, (xa + xb) / 2, trayH / 2, tz0],
    [xb - xa + 0.06, trayH, 0.004, (xa + xb) / 2, trayH / 2, tz1],
    [0.004, trayH, tz1 - tz0, xa - 0.03, trayH / 2, (tz0 + tz1) / 2],
    [0.004, trayH, tz1 - tz0, xb + 0.03, trayH / 2, (tz0 + tz1) / 2],
  ];
  for (const [w, hh, d, x, y, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), steel);
    m.position.set(x, y, z);
    tray.add(m);
  }
  const sand = new THREE.Mesh(new THREE.BoxGeometry(xb - xa + 0.055, 0.03, tz1 - tz0 - 0.004), new THREE.MeshStandardMaterial({ color: 0x8c7b5e, roughness: 0.95, metalness: 0 }));
  sand.position.set((xa + xb) / 2, 0.015, (tz0 + tz1) / 2);
  tray.add(sand);
  g.add(tray);
  mergeStatic(g);
  return { group: g, trayTop: 0.03, bounds: { xa, xb, tz0, tz1 } };
}
