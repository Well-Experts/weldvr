// Procedural 3D models of the PPE items on the rack (metres), with visible defects: holed or wet
// gloves, oily or frayed jacket, cracked filter plate, spatter-covered ADF sensors.
//
// Garments are swept tubes with an elliptical section that changes along the body (shoulders,
// chest, hem; sleeves taper to the cuff), with collars, plackets, snaps, pocket flaps and cuffs.
// Each model merges its parts by material (render/merge.js) to keep draw calls low.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeStatic, mergeDeep } from './merge.js';
import { leather, leatherNormal, fabric, paintedSteel } from './textures.js';

const M = {};
function mat(key, make) {
  if (!M[key]) M[key] = make();
  return M[key];
}
const DS = THREE.DoubleSide;

export const PPE_MATS = {
  shell: () => mat('shell', () => new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.42, metalness: 0.08, side: DS })),
  shellBlue: () => mat('shellBlue', () => new THREE.MeshStandardMaterial({ color: 0x1d3f6e, roughness: 0.38, metalness: 0.12, side: DS })),
  lensDark: () => mat('lensDark', () => new THREE.MeshStandardMaterial({ color: 0x0b2414, roughness: 0.04, metalness: 0.7 })),
  lensClear: () => mat('lensClear', () => new THREE.MeshStandardMaterial({ color: 0xd8e8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: DS })),
  frame: () => mat('frame', () => new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.1 })),
  wire: () => mat('wire', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 })),
  solar: () => mat('solar', () => new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 0.15, metalness: 0.6 })),
  leatherTan: () => mat('leatherTan', () => new THREE.MeshStandardMaterial({ map: leather('#9b7652', 51), normalMap: leatherNormal(52), roughness: 0.82, metalness: 0, side: DS })),
  leatherBrown: () => mat('leatherBrown', () => new THREE.MeshStandardMaterial({ map: leather('#6a4a30', 53), normalMap: leatherNormal(54), roughness: 0.78, metalness: 0, side: DS })),
  leatherWet: () => mat('leatherWet', () => new THREE.MeshStandardMaterial({ map: leather('#5d4630', 55), normalMap: leatherNormal(56), roughness: 0.3, metalness: 0.05, side: DS })),
  goat: () => mat('goat', () => new THREE.MeshStandardMaterial({ map: leather('#d8c8a8', 57), normalMap: leatherNormal(58), roughness: 0.7, metalness: 0, side: DS })),
  nitrile: () => mat('nitrile', () => new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.55, metalness: 0, side: DS })),
  frCloth: () => mat('frCloth', () => new THREE.MeshStandardMaterial({ map: fabric('#2f4a68', 61), roughness: 0.9, metalness: 0, side: DS })),
  frOily: () => mat('frOily', () => {
    const t = fabric('#2f4a68', 62);
    const c = t.image.getContext('2d');
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 7; i++) {
      const x = r() * 256, y = r() * 256, rad = 8 + r() * 18;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(14,12,8,0.6)');
      g.addColorStop(0.6, 'rgba(14,12,8,0.35)');
      g.addColorStop(1, 'rgba(14,12,8,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0, side: DS });
  }),
  fleece: () => mat('fleece', () => new THREE.MeshStandardMaterial({ map: fabric('#5b6f86', 63), roughness: 1, metalness: 0, side: DS })),
  tshirt: () => mat('tshirt', () => new THREE.MeshStandardMaterial({ map: fabric('#8a2f2f', 64), roughness: 0.95, metalness: 0, side: DS })),
  denim: () => mat('denim', () => new THREE.MeshStandardMaterial({ map: fabric('#34507a', 65), roughness: 0.9, metalness: 0 })),
  navy: () => mat('navy', () => new THREE.MeshStandardMaterial({ map: fabric('#1f2b3c', 66), roughness: 0.9, metalness: 0, side: DS })),
  rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.85, metalness: 0 })),
  white: () => mat('white', () => new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.6, metalness: 0 })),
  orange: () => mat('orange', () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, metalness: 0 })),
  magenta: () => mat('magenta', () => new THREE.MeshStandardMaterial({ color: 0xb02a7a, roughness: 0.6, metalness: 0 })),
  greyPlastic: () => mat('greyPlastic', () => new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.6, metalness: 0 })),
  elastomer: () => mat('elastomer', () => new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.7, metalness: 0, side: DS })),
  hook: () => mat('hook', () => new THREE.MeshStandardMaterial({ map: paintedSteel('#3a3f46', 33, 0.3), roughness: 0.55, metalness: 0.5 })),
  dark: () => mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.9, metalness: 0, side: DS })),
  snap: () => mat('snap', () => new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.35, metalness: 0.85 })),
  stitch: () => mat('stitch', () => new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.8, metalness: 0 })),
  spatter: () => mat('spatter', () => new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.5, metalness: 0.6 })),
  stripe: () => mat('stripe', () => new THREE.MeshStandardMaterial({ color: 0x2a6fd0, roughness: 0.6, metalness: 0 })),
};

function part(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  g.add(mesh);
  return mesh;
}

// Linear interpolation in a table of rows [key, ...values] (keys ascending or descending).
function lerpRows(rows, k) {
  const r = rows[rows.length - 1][0] >= rows[0][0] ? rows : rows.slice().reverse();
  if (k <= r[0][0]) return r[0].slice(1);
  if (k >= r[r.length - 1][0]) return r[r.length - 1].slice(1);
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1];
    if (k >= a[0] && k <= b[0]) {
      const f = (k - a[0]) / (b[0] - a[0] || 1);
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * f);
    }
  }
  return r[0].slice(1);
}

// Tube swept along a path with an elliptical section sec(t) = [a, b]: a along the side axis (the
// reference direction made perpendicular to the path), b along the front axis.
function sweep(points, sec, { segs = 20, radial = 18, side = new THREE.Vector3(1, 0, 0) } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    S.copy(side).addScaledVector(T, -side.dot(T)).normalize();
    N.crossVectors(T, S).normalize();
    const [a, b] = sec(t);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      pos.push(P.x + S.x * a * c + N.x * b * s, P.y + S.y * a * c + N.y * b * s, P.z + S.z * a * c + N.z * b * s);
      uv.push(j / radial, t * 2);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points, r, m, g, seg = 24) {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 6, false);
  return part(g, geo, m, 0, 0, 0);
}

function labelTexture(lines, { w = 256, h = 128, bg = '#ffffff', fg = '#222222', size = 30 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
  }
  x.fillStyle = fg;
  x.font = `bold ${size}px sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, k) => x.fillText(l, w / 2, ((k + 0.5) * h) / lines.length));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- welding helmet -----------------------------------------------------------------------------------
// Resting on a shelf, front (lens) toward +z, ~0.27 m tall. Shell: a sphere segment shaped into a
// helmet (flattened face with the cartridge, chin extended forward and down, open at the back).
export function helmetModel(kind = 'adf', defect = null) {
  const g = new THREE.Group();
  const shellMat = kind === 'adf' ? PPE_MATS.shellBlue() : PPE_MATS.shell();
  const geo = new THREE.SphereGeometry(0.13, 40, 28, Math.PI / 2 - 2.05, 4.1, 0.1 * Math.PI, 0.8 * Math.PI);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 0.86;
    y *= 1.16;
    if (z > 0.06) z = 0.06 + (z - 0.06) * 0.45; // flattened face
    if (y < -0.04 && z > 0) {
      const f = Math.min(1, (-0.04 - y) / 0.1);
      z += 0.035 * f * (z / 0.1);
      y -= 0.015 * f;
    }
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  part(g, geo, shellMat, 0, 0.155, 0);
  // headgear inside: crown strap, sweatband, ratchet knob at the back
  part(g, new THREE.TorusGeometry(0.085, 0.006, 6, 28), PPE_MATS.frame(), 0, 0.12, -0.005, Math.PI / 2, 0, 0);
  part(g, new THREE.TorusGeometry(0.08, 0.005, 6, 24, Math.PI), PPE_MATS.frame(), 0, 0.12, -0.005, 0, Math.PI / 2, 0);
  part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.022, 16), PPE_MATS.frame(), 0, 0.09, -0.098, Math.PI / 2, 0, 0);
  // cartridge holder on the flat face (the face is at z = 0.06 + 0.07 * 0.45 = 0.0915)
  const faceZ = 0.094;
  part(g, new RoundedBoxGeometry(0.124, 0.088, 0.014, 2, 0.006), PPE_MATS.frame(), 0, 0.16, faceZ);
  const lens = part(g, new THREE.PlaneGeometry(0.098, 0.052), PPE_MATS.lensDark(), 0, 0.162, faceZ + 0.0072);
  lens.name = 'lens';
  const keep = [lens];
  if (kind === 'adf') {
    // arc sensors at the top corners, solar cell, marking; shade knob on the left side of the shell
    for (const sx of [-1, 1]) part(g, new THREE.BoxGeometry(0.009, 0.007, 0.002), PPE_MATS.lensClear(), sx * 0.046, 0.197, faceZ + 0.0075);
    part(g, new THREE.BoxGeometry(0.03, 0.007, 0.001), PPE_MATS.solar(), 0, 0.197, faceZ + 0.0074);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.008), new THREE.MeshBasicMaterial({ map: labelTexture(['9-13  Z87+'], { w: 256, h: 34, bg: null, fg: '#c8d0d8', size: 24 }), transparent: true }));
    mark.position.set(0, 0.126, faceZ + 0.0074);
    g.add(mark);
    keep.push(mark);
    part(g, new THREE.CylinderGeometry(0.016, 0.016, 0.012, 18), PPE_MATS.frame(), -0.112, 0.15, 0.03, 0, 0, Math.PI / 2);
    for (let k = 0; k < 8; k++) part(g, new THREE.BoxGeometry(0.004, 0.003, 0.03), PPE_MATS.greyPlastic(), -0.119, 0.15 + Math.sin(k * 0.785) * 0.013, 0.03 + Math.cos(k * 0.785) * 0.013, k * 0.785, 0, 0);
    if (defect === 'sensor') {
      // both arc sensors covered with spatter
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) part(g, new THREE.SphereGeometry(0.0035 + k * 0.0008, 8, 6), PPE_MATS.spatter(), sx * 0.046 + (k - 1) * 0.003, 0.197 + (k % 2) * 0.002, faceZ + 0.009);
    }
  } else {
    // glass filter plate with its etched shade number and marking
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 256, 128);
    gr.addColorStop(0, '#0f3019');
    gr.addColorStop(1, '#071a0e');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 128);
    x.fillStyle = 'rgba(220,240,220,0.75)';
    x.font = 'bold 26px sans-serif';
    x.fillText('10   Z87', 14, 116);
    if (defect === 'cracked') {
      x.strokeStyle = 'rgba(230,240,235,0.95)';
      x.lineWidth = 2.5;
      x.beginPath();
      x.moveTo(10, 8);
      x.lineTo(70, 52);
      x.lineTo(96, 44);
      x.lineTo(170, 96);
      x.lineTo(250, 84);
      x.moveTo(96, 44);
      x.lineTo(120, 10);
      x.stroke();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    lens.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.06, metalness: 0.5 });
  }
  mergeStatic(g, keep);
  return g;
}

// ---- eye protection -----------------------------------------------------------------------------------
export function glassesModel(sideShields = true) {
  const g = new THREE.Group();
  if (sideShields) {
    // safety glasses: wraparound clear lenses, brow bar, side shields, temples
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0.006, 0.016);
      s.bezierCurveTo(0.02, 0.021, 0.042, 0.021, 0.056, 0.013);
      s.bezierCurveTo(0.062, 0.0, 0.056, -0.016, 0.042, -0.021);
      s.bezierCurveTo(0.028, -0.025, 0.014, -0.02, 0.009, -0.01);
      s.bezierCurveTo(0.006, -0.004, 0.004, 0.006, 0.006, 0.016);
      const lg = new THREE.ShapeGeometry(s, 8);
      if (sx < 0) {
        lg.scale(-1, 1, 1);
        // keep the winding after the mirror
        const ix = lg.index.array;
        for (let i = 0; i < ix.length; i += 3) [ix[i], ix[i + 2]] = [ix[i + 2], ix[i]];
      }
      part(g, lg, PPE_MATS.lensClear(), sx * 0.006, 0, 0, 0, sx * -0.18, 0);
      part(g, new THREE.BoxGeometry(0.003, 0.034, 0.03), PPE_MATS.lensClear(), sx * 0.064, 0.0, -0.016); // side shield
      part(g, new THREE.BoxGeometry(0.004, 0.005, 0.13), PPE_MATS.frame(), sx * 0.064, 0.016, -0.07); // temple
    }
    tube([new THREE.Vector3(-0.064, 0.016, -0.012), new THREE.Vector3(-0.03, 0.021, 0.004), new THREE.Vector3(0, 0.019, 0.007), new THREE.Vector3(0.03, 0.021, 0.004), new THREE.Vector3(0.064, 0.016, -0.012)], 0.0028, PPE_MATS.frame(), g, 16); // brow bar
    part(g, new THREE.TorusGeometry(0.008, 0.002, 5, 10, Math.PI), PPE_MATS.frame(), 0, 0.004, 0.006); // nose bridge
  } else {
    // reading spectacles: thin metal frame, round lenses, no side shields
    for (const sx of [-1, 1]) {
      part(g, new THREE.TorusGeometry(0.021, 0.0012, 6, 28), PPE_MATS.wire(), sx * 0.026, 0, 0);
      part(g, new THREE.CircleGeometry(0.021, 24), PPE_MATS.lensClear(), sx * 0.026, 0, 0);
      part(g, new THREE.BoxGeometry(0.0018, 0.0018, 0.13), PPE_MATS.wire(), sx * 0.048, 0.006, -0.065);
    }
    part(g, new THREE.TorusGeometry(0.006, 0.0012, 4, 10, Math.PI), PPE_MATS.wire(), 0, 0.006, 0);
  }
  mergeStatic(g);
  return g;
}

// ---- jackets ----------------------------------------------------------------------------------------
// On a hanger, front toward +z, ~0.7 m tall; the hanger hook is about 0.21 m above the origin (neck).
const TORSO = [
  // y, half-width, half-depth (an empty garment on a hanger is flat)
  [0.0, 0.07, 0.048],
  [-0.03, 0.14, 0.058],
  [-0.065, 0.19, 0.066],
  [-0.12, 0.205, 0.074],
  [-0.3, 0.208, 0.078],
  [-0.48, 0.2, 0.074],
  [-0.66, 0.206, 0.07],
];

function garmentMaterial(kind, defect) {
  if (kind === 'leather') return PPE_MATS.leatherBrown();
  if (kind === 'fleece') return PPE_MATS.fleece();
  if (kind === 'tshirt') return PPE_MATS.tshirt();
  return defect === 'oily' ? PPE_MATS.frOily() : PPE_MATS.frCloth();
}

export function jacketModel(kind = 'fr', defect = null) {
  const g = new THREE.Group();
  const m = garmentMaterial(kind, defect);
  const tee = kind === 'tshirt';
  const hem = tee ? -0.6 : -0.66;
  const torso = sweep([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, hem, 0)], (t) => lerpRows(TORSO, t * hem), { segs: 26, radial: 24 });
  part(g, torso, m, 0, 0, 0);
  const front = (y) => lerpRows(TORSO, y)[1];
  // sleeves hanging at the sides (short for the T-shirt)
  for (const sx of [-1, 1]) {
    const pts = tee
      ? [new THREE.Vector3(sx * 0.17, -0.06, 0), new THREE.Vector3(sx * 0.22, -0.13, 0.004), new THREE.Vector3(sx * 0.24, -0.2, 0.008)]
      : [new THREE.Vector3(sx * 0.17, -0.06, 0), new THREE.Vector3(sx * 0.215, -0.17, 0.008), new THREE.Vector3(sx * 0.228, -0.38, 0.016), new THREE.Vector3(sx * 0.232, -0.6, 0.022)];
    const s = part(g, sweep(pts, (t) => (tee ? [0.062 + t * 0.006, 0.05] : [0.058 - t * 0.014, 0.05 - t * 0.01]), { segs: tee ? 6 : 18, radial: 14 }), m, 0, 0, 0);
    s.name = `sleeve${sx}`;
    if (tee) continue;
    const end = pts[pts.length - 1];
    const cuff = part(g, new THREE.CylinderGeometry(0.046, 0.046, 0.04, 14, 1, true), kind === 'leather' ? PPE_MATS.leatherTan() : m, end.x, end.y + 0.02, end.z);
    cuff.scale.set(1, 1, 0.85);
    if (defect === 'frayed' && sx > 0) {
      // torn, frayed cuff: loose threads, a ragged dark edge and a hole in the forearm
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        part(g, new THREE.BoxGeometry(0.0025, 0.03 + (k % 3) * 0.012, 0.0025), PPE_MATS.stitch(), end.x + Math.cos(a) * 0.045, end.y - 0.012 - (k % 3) * 0.006, end.z + Math.sin(a) * 0.04, (k % 2) * 0.4, 0, (k % 3 - 1) * 0.3);
      }
      part(g, new THREE.TorusGeometry(0.046, 0.006, 4, 12), PPE_MATS.dark(), end.x, end.y + 0.002, end.z, Math.PI / 2, 0, 0);
      part(g, new THREE.CircleGeometry(0.014, 10), PPE_MATS.dark(), end.x + 0.001, end.y + 0.09, end.z + 0.042, 0, 0.2, 0);
    }
  }
  if (kind === 'fr' || kind === 'leather') {
    // stand-up collar
    part(g, sweep([new THREE.Vector3(0, -0.005, 0), new THREE.Vector3(0, 0.035, 0)], (t) => [0.074 + t * 0.006, 0.05 + t * 0.006], { segs: 2, radial: 20 }), m, 0, 0, 0);
    // front placket following the chest, with snap fasteners
    const plk = [];
    for (let y = -0.02; y >= hem + 0.01; y -= 0.08) plk.push(new THREE.Vector3(0, y, front(y) + 0.002));
    part(g, sweep(plk, () => [0.014, 0.003], { segs: 12, radial: 6 }), kind === 'leather' ? PPE_MATS.leatherTan() : m, 0, 0, 0);
    for (let y = -0.06; y > hem + 0.04; y -= 0.11) part(g, new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 12), PPE_MATS.snap(), 0, y, front(y) + 0.006, Math.PI / 2, 0, 0);
    if (kind === 'fr') {
      // covered chest pockets (flaps with a snap)
      for (const sx of [-1, 1]) {
        const y = -0.2;
        const z = front(y) + 0.004;
        part(g, new THREE.BoxGeometry(0.11, 0.05, 0.004), m, sx * 0.1, y, z);
        part(g, new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10), PPE_MATS.snap(), sx * 0.1, y - 0.012, z + 0.003, Math.PI / 2, 0, 0);
      }
    } else {
      // leather: contrast stitching along the shoulder seams
      for (const sx of [-1, 1]) part(g, new THREE.BoxGeometry(0.003, 0.003, 0.12), PPE_MATS.stitch(), sx * 0.15, -0.045, 0, 0, 0, sx * 0.55);
    }
  } else if (kind === 'fleece') {
    // zip collar, zip line and the care label: 100% polyester
    part(g, sweep([new THREE.Vector3(0, -0.005, 0), new THREE.Vector3(0, 0.05, 0)], (t) => [0.075 + t * 0.004, 0.052 + t * 0.004], { segs: 2, radial: 20 }), m, 0, 0, 0);
    const zl = [];
    for (let y = 0.045; y >= hem + 0.01; y -= 0.08) zl.push(new THREE.Vector3(0, y, (y > 0 ? 0.058 : front(y)) + 0.002));
    part(g, sweep(zl, () => [0.004, 0.002], { segs: 12, radial: 6 }), PPE_MATS.frame(), 0, 0, 0);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: labelTexture(['100%', 'POLYESTER'], { w: 128, h: 64, size: 18 }) }));
    lab.position.set(0.07, -0.13, front(-0.13) + 0.004);
    g.add(lab);
  } else {
    // T-shirt: ribbed crew neck
    part(g, new THREE.TorusGeometry(0.068, 0.006, 6, 24), m, 0, 0.0, 0, Math.PI / 2, 0, 0);
  }
  // wire hanger: hook, neck and shoulder bar
  const hk = PPE_MATS.wire();
  tube([new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0.012, 0.19, 0), new THREE.Vector3(0.03, 0.21, 0), new THREE.Vector3(0.016, 0.228, 0), new THREE.Vector3(-0.004, 0.214, 0)], 0.0022, hk, g, 20);
  tube([new THREE.Vector3(-0.19, -0.062, 0), new THREE.Vector3(-0.08, -0.012, 0), new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0.08, -0.012, 0), new THREE.Vector3(0.19, -0.062, 0)], 0.0022, hk, g, 20);
  mergeStatic(g);
  g.userData.hangTop = 0.21; // hanger hook above the origin
  return g;
}

// Bib apron in leather: bib, waist, neck strap and ties; front toward +z, hung by the neck strap.
export function apronModel() {
  const g = new THREE.Group();
  const m = PPE_MATS.leatherTan();
  const s = new THREE.Shape();
  s.moveTo(-0.12, 0);
  s.lineTo(0.12, 0);
  s.quadraticCurveTo(0.15, -0.16, 0.26, -0.3);
  s.lineTo(0.255, -0.84);
  s.quadraticCurveTo(0, -0.86, -0.255, -0.84);
  s.lineTo(-0.26, -0.3);
  s.quadraticCurveTo(-0.15, -0.16, -0.12, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: 10 });
  // gentle curve across the body
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) * p.getX(i) * 0.6);
  geo.computeVertexNormals();
  part(g, geo, m, 0, -0.02, 0);
  part(g, new THREE.BoxGeometry(0.22, 0.003, 0.002), PPE_MATS.stitch(), 0, -0.03, 0.006);
  // neck strap and waist ties
  tube([new THREE.Vector3(-0.11, -0.02, 0.002), new THREE.Vector3(-0.07, 0.06, 0), new THREE.Vector3(0, 0.085, -0.01), new THREE.Vector3(0.07, 0.06, 0), new THREE.Vector3(0.11, -0.02, 0.002)], 0.006, m, g);
  for (const sx of [-1, 1]) tube([new THREE.Vector3(sx * 0.255, -0.31, -0.04), new THREE.Vector3(sx * 0.27, -0.4, -0.05), new THREE.Vector3(sx * 0.262, -0.52, -0.045)], 0.006, m, g, 8);
  mergeStatic(g);
  g.userData.hangTop = 0.08; // neck strap
  return g;
}

// Cape sleeves with bib (leather): shoulder yoke, two sleeves, bib; hung by a loop.
export function capeModel() {
  const g = new THREE.Group();
  const m = PPE_MATS.leatherTan();
  const yoke = new THREE.SphereGeometry(0.22, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.3);
  yoke.scale(1, 0.42, 0.42);
  part(g, yoke, m, 0, -0.07, 0);
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(sx * 0.18, -0.08, 0), new THREE.Vector3(sx * 0.225, -0.2, 0.008), new THREE.Vector3(sx * 0.235, -0.42, 0.016), new THREE.Vector3(sx * 0.238, -0.58, 0.02)];
    part(g, sweep(pts, (t) => [0.064 - t * 0.012, 0.055 - t * 0.008], { segs: 14, radial: 14 }), m, 0, 0, 0);
    part(g, new THREE.TorusGeometry(0.047, 0.006, 5, 14), PPE_MATS.frame(), sx * 0.238, -0.58, 0.02, Math.PI / 2, 0, 0); // elastic cuff
  }
  const bib = new THREE.Shape();
  bib.moveTo(-0.13, 0);
  bib.lineTo(0.13, 0);
  bib.lineTo(0.12, -0.2);
  bib.quadraticCurveTo(0, -0.24, -0.12, -0.2);
  bib.closePath();
  part(g, new THREE.ExtrudeGeometry(bib, { depth: 0.004, bevelEnabled: false }), m, 0, -0.1, 0.09);
  for (const sx of [-1, 1]) part(g, new THREE.CylinderGeometry(0.005, 0.005, 0.004, 10), PPE_MATS.snap(), sx * 0.1, -0.12, 0.096, Math.PI / 2, 0, 0);
  part(g, new THREE.TorusGeometry(0.025, 0.005, 5, 12), m, 0, 0.055, 0, 0, Math.PI / 2, 0); // hanging loop
  mergeStatic(g);
  g.userData.hangTop = 0.08;
  return g;
}

// ---- gloves -----------------------------------------------------------------------------------------
// One glove lying flat (back of the hand up, fingers toward -z); sx = +1 right hand, -1 left hand.
function gloveHand(kind, m, defect, sx) {
  const h = new THREE.Group();
  const gaunt = kind === 'gauntlet';
  const nit = kind === 'nitrile';
  const W = gaunt ? 0.094 : kind === 'tig' ? 0.084 : 0.08;
  const fr = gaunt ? 0.0108 : kind === 'tig' ? 0.0088 : 0.0082;
  const top = gaunt ? 0.0155 : 0.0125;
  part(h, new RoundedBoxGeometry(W, gaunt ? 0.03 : 0.024, 0.1, 3, gaunt ? 0.013 : 0.01), m, 0, 0, 0);
  const lens = [0.064, 0.074, 0.07, 0.056];
  for (let k = 0; k < 4; k++) {
    // index finger next to the thumb: the thumb side is -sx
    const kk = sx > 0 ? k : 3 - k;
    const x = -W / 2 + fr + 0.002 + k * ((W - 2 * fr - 0.004) / 3);
    const L = lens[kk] * (gaunt ? 1.04 : 1);
    part(h, new THREE.CapsuleGeometry(fr, L - 2 * fr, 4, 10), m, x * 1.04, -0.002, -0.05 - L / 2 + 0.004, Math.PI / 2 - 0.08, 0, (k - 1.5) * -0.05);
  }
  part(h, new THREE.CapsuleGeometry(fr * 1.08, 0.04, 4, 10), m, -sx * (W / 2 + 0.006), -0.004, -0.02, Math.PI / 2, -sx * 0.55, 0); // thumb
  if (nit) {
    const bead = part(h, new THREE.TorusGeometry(0.036, 0.003, 6, 18), m, 0, 0, 0.052);
    bead.scale.set(1.1, 0.42, 1);
  } else {
    const L = gaunt ? 0.15 : 0.06;
    part(h, sweep([new THREE.Vector3(0, 0, 0.045), new THREE.Vector3(0, 0.003, 0.045 + L)], (t) => [W / 2 + 0.004 + t * (gaunt ? 0.022 : 0.006), (gaunt ? 0.018 : 0.014) + t * (gaunt ? 0.012 : 0.004)], { segs: 4, radial: 18 }), m, 0, 0, 0);
    const lining = part(h, new THREE.CircleGeometry(1, 18), PPE_MATS.dark(), 0, 0.003, 0.045 + L - 0.004);
    lining.scale.set(W / 2 + (gaunt ? 0.024 : 0.008), gaunt ? 0.028 : 0.016, 1);
    part(h, new THREE.BoxGeometry(0.002, 0.002, 0.09 + L), PPE_MATS.stitch(), 0, top, L / 2 - 0.005); // welt seam
    if (gaunt) part(h, new RoundedBoxGeometry(0.03, 0.006, 0.04, 2, 0.003), PPE_MATS.leatherBrown(), -sx * 0.03, 0.012, -0.025); // thumb crotch patch
  }
  if (defect === 'hole') {
    const hole = part(h, new THREE.CircleGeometry(0.008, 14), PPE_MATS.dark(), -sx * 0.018, top, -0.03, -Math.PI / 2, 0, 0);
    hole.scale.set(1.2, 0.8, 1);
    hole.name = 'hole';
    part(h, new THREE.TorusGeometry(0.0085, 0.0015, 4, 14), PPE_MATS.stitch(), -sx * 0.018, top, -0.03, -Math.PI / 2, 0, 0);
  }
  return h;
}

export function glovesModel(kind = 'gauntlet', defect = null) {
  const g = new THREE.Group();
  const m = kind === 'tig' ? PPE_MATS.goat() : kind === 'nitrile' ? PPE_MATS.nitrile() : defect === 'wet' ? PPE_MATS.leatherWet() : PPE_MATS.leatherTan();
  for (const sx of [-1, 1]) {
    const h = gloveHand(kind, m, sx > 0 && defect === 'hole' ? 'hole' : null, sx);
    h.position.set(sx * 0.06, kind === 'gauntlet' ? 0.015 : 0.012, 0);
    h.rotation.y = sx * 0.1;
    mergeStatic(h);
    g.add(h);
  }
  if (defect === 'wet') for (let k = 0; k < 6; k++) part(g, new THREE.SphereGeometry(0.0035, 8, 6), PPE_MATS.lensClear(), -0.08 + k * 0.03, 0.031, -0.02 + (k % 3) * 0.02);
  mergeDeep(g); // the pair is taken and worn as one item: one mesh per material
  return g;
}

// ---- boots, trousers --------------------------------------------------------------------------------
function bootGeometry(H) {
  // side profile (z: heel +, toe -; y up), extruded across the width
  const s = new THREE.Shape();
  s.moveTo(0.13, 0.0);
  s.lineTo(-0.12, 0.0);
  s.quadraticCurveTo(-0.155, 0.004, -0.152, 0.03);
  s.quadraticCurveTo(-0.15, 0.065, -0.1, 0.075);
  s.quadraticCurveTo(-0.04, 0.085, 0.0, Math.min(0.11, H - 0.005));
  s.lineTo(0.005, H);
  s.lineTo(0.115, H);
  s.quadraticCurveTo(0.14, 0.06, 0.13, 0.0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -0.035);
  geo.rotateY(Math.PI / 2);
  return geo;
}

export function bootsModel(kind = 'boots') {
  const g = new THREE.Group();
  const boot = kind === 'boots';
  const m = boot ? PPE_MATS.leatherBrown() : PPE_MATS.white();
  const H = boot ? 0.18 : 0.075;
  for (const sx of [-1, 1]) {
    const b = new THREE.Group();
    part(b, bootGeometry(H), m, 0, 0.012, 0);
    part(b, new RoundedBoxGeometry(0.105, 0.022, 0.3, 2, 0.008), boot ? PPE_MATS.rubber() : PPE_MATS.white(), 0, 0.011, -0.01); // sole
    if (boot) {
      for (let k = 0; k < 6; k++) part(b, new THREE.BoxGeometry(0.06, 0.003, 0.004), PPE_MATS.frame(), 0, 0.09 + k * 0.016, -0.03 + k * 0.006, 0.6, 0, 0); // laces
      part(b, new THREE.BoxGeometry(0.1, 0.003, 0.003), PPE_MATS.stitch(), 0, 0.06, -0.11, 0.9, 0, 0); // toe-cap seam
    } else {
      for (const k of [0, 1]) part(b, new THREE.BoxGeometry(0.004, 0.012, 0.12), PPE_MATS.stripe(), sx * 0.046, 0.04 + k * 0.016, 0.0, 0.3, 0, 0);
    }
    b.position.set(sx * 0.07, 0, 0);
    g.add(b);
  }
  mergeDeep(g); // one mesh per material for the pair
  return g;
}

export function trousersModel(kind = 'trousers') {
  const g = new THREE.Group();
  const jeans = kind === 'jeans';
  const m = jeans ? PPE_MATS.denim() : PPE_MATS.navy();
  part(g, new RoundedBoxGeometry(0.34, 0.064, 0.27, 3, 0.02), m, 0, 0.032, 0);
  part(g, new THREE.BoxGeometry(0.3, 0.002, 0.002), PPE_MATS.dark(), 0, 0.065, -0.02); // fold line
  for (const x of [-0.12, -0.04, 0.04, 0.12]) part(g, new THREE.BoxGeometry(0.008, 0.02, 0.006), m, x, 0.04, 0.136); // belt loops
  if (jeans) part(g, new RoundedBoxGeometry(0.34, 0.018, 0.06, 2, 0.006), PPE_MATS.denim(), 0, 0.072, -0.1); // turned-up cuffs
  mergeStatic(g);
  return g;
}

// ---- head protection, hearing, respiratory --------------------------------------------------------------
export function capModel() {
  const g = new THREE.Group();
  const crown = new THREE.SphereGeometry(0.085, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(1, 0.75, 1.12);
  part(g, crown, PPE_MATS.navy(), 0, 0, 0);
  part(g, new THREE.CylinderGeometry(0.06, 0.07, 0.006, 18, 1, false, -Math.PI / 2 - 0.9, 1.8), PPE_MATS.navy(), 0, 0.004, 0.06); // short brim
  for (let k = 0; k < 4; k++) {
    const seam = part(g, new THREE.TorusGeometry(0.085, 0.0012, 4, 20, Math.PI), PPE_MATS.frame(), 0, 0, 0, 0, (k * Math.PI) / 4, 0);
    seam.scale.set(1, 0.75, 1.12);
  }
  mergeStatic(g);
  return g;
}

export function earplugsModel() {
  const g = new THREE.Group();
  part(g, new RoundedBoxGeometry(0.1, 0.13, 0.07, 2, 0.008), PPE_MATS.greyPlastic(), 0, 0.065, 0);
  part(g, new THREE.PlaneGeometry(0.07, 0.05), PPE_MATS.lensClear(), 0, 0.075, 0.0355);
  for (let k = 0; k < 8; k++) part(g, new THREE.CapsuleGeometry(0.0055, 0.01, 3, 6), PPE_MATS.orange(), -0.024 + (k % 4) * 0.016, 0.06 + Math.floor(k / 4) * 0.018, 0.02, 0, 0, Math.PI / 2 + (k % 3) * 0.3);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.022), new THREE.MeshBasicMaterial({ map: labelTexture(['EAR PLUGS'], { w: 256, h: 64, bg: '#f3d23a', fg: '#222', size: 30 }) }));
  lab.position.set(0, 0.118, 0.0356);
  g.add(lab);
  mergeStatic(g, [lab]);
  return g;
}

export function respiratorModel() {
  const g = new THREE.Group();
  const face = new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  face.scale(1, 1.05, 0.8);
  part(g, face, PPE_MATS.elastomer(), 0, 0.045, 0, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.016, 0.018, 0.012, 16), PPE_MATS.frame(), 0, 0.03, 0.052, Math.PI / 2, 0, 0); // exhalation valve
  for (const sx of [-1, 1]) {
    part(g, new THREE.CylinderGeometry(0.032, 0.032, 0.02, 20), PPE_MATS.magenta(), sx * 0.058, 0.035, 0.026, Math.PI / 2, 0, sx * 0.45); // P3 filters
    part(g, new THREE.CylinderGeometry(0.026, 0.026, 0.022, 16), PPE_MATS.white(), sx * 0.06, 0.035, 0.027, Math.PI / 2, 0, sx * 0.45);
  }
  part(g, new THREE.TorusGeometry(0.075, 0.004, 4, 20, Math.PI), PPE_MATS.frame(), 0, 0.05, -0.015); // head strap
  mergeStatic(g);
  return g;
}

// Model for a PPE item id (see safety/ppe.js)
export function ppeModel(id, defect = null) {
  switch (id) {
    case 'helmet_adf': return helmetModel('adf', defect);
    case 'helmet_passive': return helmetModel('passive', defect);
    case 'glasses': return glassesModel(true);
    case 'spectacles': return glassesModel(false);
    case 'jacket_fr': return jacketModel('fr', defect);
    case 'jacket_leather': return jacketModel('leather', defect);
    case 'fleece': return jacketModel('fleece');
    case 'tshirt': return jacketModel('tshirt');
    case 'apron': return apronModel();
    case 'cape': return capeModel();
    case 'gloves_gauntlet': return glovesModel('gauntlet', defect);
    case 'gloves_tig': return glovesModel('tig', defect);
    case 'gloves_nitrile': return glovesModel('nitrile');
    case 'boots': return bootsModel('boots');
    case 'trainers': return bootsModel('trainers');
    case 'trousers': return trousersModel('trousers');
    case 'jeans_cuffed': return trousersModel('jeans');
    case 'cap_fr': return capModel();
    case 'earplugs_fr': return earplugsModel();
    case 'respirator': return respiratorModel();
    default: return new THREE.Group();
  }
}
