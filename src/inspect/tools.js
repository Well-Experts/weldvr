// Hand tools: digital fillet gauge, digital bridge gauge (undercut / reinforcement / misalignment)
// and a wire brush. Models are built in millimetres.

import * as THREE from 'three';
import { surfaceHeight } from '../sim/session.js';
import { FONT } from '../ui/ui.js';

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.32 });

function engraved(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8cbcf';
  ctx.fillRect(0, 0, c.width, c.height);
  draw(ctx, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plateMesh(shape, depth, tex) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const mats = [new THREE.MeshStandardMaterial({ map: tex, metalness: 0.75, roughness: 0.38 }), steel()];
  // planar UVs on the faces from x/y
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  for (let k = 0; k < pos.count; k++) {
    uv.setXY(k, (pos.getX(k) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(k) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  return new THREE.Mesh(geo, mats);
}

export function buildFilletGauge() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  // L-shaped blade with a 90 deg notch at the tip (the tip sits in the fillet)
  s.moveTo(0, 0);
  s.lineTo(30, 30);
  s.lineTo(30, 62);
  s.lineTo(-30, 62);
  s.lineTo(-30, 30);
  s.lineTo(0, 0);
  const tex = engraved(60, 62, (ctx, W, H) => {
    ctx.strokeStyle = '#2b2d30';
    ctx.lineWidth = 3;
    for (let k = 0; k <= 12; k++) {
      const y = H - (k / 12) * H * 0.5 - H * 0.02;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 - 40, y);
      ctx.lineTo(W * 0.5 + 40, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2124';
    ctx.font = `700 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('FILLET', W / 2, H * 0.22);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText('digital gauge', W / 2, H * 0.32);
  });
  const blade = plateMesh(s, 1.2, tex);
  blade.position.z = -0.6;
  g.add(blade);
  const readout = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 5), new THREE.MeshStandardMaterial({ color: 0x24292f, roughness: 0.6 }));
  readout.position.set(0, 52, 2.5);
  g.add(readout);
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  return g;
}

export function buildBridgeGauge() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-32, 0);
  s.lineTo(-32, 22);
  s.lineTo(32, 22);
  s.lineTo(32, 0);
  s.lineTo(22, 0);
  s.lineTo(18, 8);
  s.lineTo(-18, 8);
  s.lineTo(-22, 0);
  s.lineTo(-32, 0);
  const tex = engraved(64, 22, (ctx, W, H) => {
    ctx.fillStyle = '#1f2124';
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BRIDGE', W / 2, H * 0.62);
  });
  const body = plateMesh(s, 1.5, tex);
  body.position.z = -0.75;
  g.add(body);
  // cam pointer
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2.2, 24), steel());
  cam.rotation.x = Math.PI / 2;
  cam.position.set(0, 15, 1.2);
  g.add(cam);
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 1.2), new THREE.MeshStandardMaterial({ color: 0x9a1d14, roughness: 0.5 }));
  ptr.position.set(0, 6, 2.6);
  g.add(ptr);
  g.userData.ptr = ptr;
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  return g;
}

export function buildBrush() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 150), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }));
  handle.position.set(0, 0, 60);
  g.add(handle);
  const block = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 60), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }));
  block.position.set(0, -2, -40);
  g.add(block);
  const bristles = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 56), new THREE.MeshStandardMaterial({ color: 0x9fa4a8, metalness: 0.9, roughness: 0.55 }));
  bristles.position.set(0, -14, -40);
  g.add(bristles);
  g.userData.head = new THREE.Vector3(0, -21, -40);
  return g;
}

// Welder's chipping hammer: forged head with a chisel end (edge across, at the bottom) and a pointed
// end, on a coil-spring handle along the grip. userData.tip: middle of the chisel edge.
export function buildChippingHammer() {
  const g = new THREE.Group();
  const forged = new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.85, roughness: 0.45 });
  const ground = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.95, roughness: 0.28 });
  const spring = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.8, roughness: 0.4 });
  // coil-spring handle around a steel core
  const turns = 18, L = 145, R = 10.5;
  const pts = [];
  for (let k = 0; k <= turns * 16; k++) {
    const a = (k / 16) * 2 * Math.PI;
    pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), -12 + (L * k) / (turns * 16)));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 2.6, 6, false), spring);
  g.add(coil);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, L + 20, 8), forged);
  core.rotation.x = Math.PI / 2;
  core.position.set(0, 0, -12 + L / 2 - 8);
  g.add(core);
  // head: square bar, chisel wedge below (edge along x), four-sided point above
  const z0 = -30;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(15, 70, 15), forged);
  bar.position.set(0, -2, z0);
  g.add(bar);
  const wedge = new THREE.BoxGeometry(15, 42, 15, 1, 1, 1);
  const wp = wedge.attributes.position;
  for (let i = 0; i < wp.count; i++) if (wp.getY(i) < 0) wp.setZ(i, wp.getZ(i) * 0.08); // edge 1.2 mm thick
  wedge.computeVertexNormals();
  const chisel = new THREE.Mesh(wedge, ground);
  chisel.position.set(0, -58, z0);
  g.add(chisel);
  const point = new THREE.Mesh(new THREE.ConeGeometry(10.6, 44, 4), ground);
  point.rotation.y = Math.PI / 4;
  point.position.set(0, 55, z0);
  g.add(point);
  g.userData.tip = new THREE.Vector3(0, -79, z0);
  return g;
}

// Digital contact thermometer: a probe with its contact tip at the origin, the body above it.
// setReading(T) writes the value on the display.
export function buildThermometer() {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.8, 110, 10), steel());
  rod.position.set(0, 55, 0);
  g.add(rod);
  const tipM = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.9, roughness: 0.4 }));
  g.add(tipM);
  const body = new THREE.Mesh(new THREE.BoxGeometry(44, 86, 22), new THREE.MeshStandardMaterial({ color: 0xd8a21a, roughness: 0.6, metalness: 0.1 }));
  body.position.set(0, 150, 0);
  g.add(body);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(34, 21), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 160, 11.2);
  g.add(screen);
  let last = '';
  const draw = (txt, sub) => {
    const key = `${txt}|${sub}`;
    if (key === last) return;
    last = key;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9fb59a';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#111';
    ctx.font = `700 76px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(txt, 236, 96);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(sub, 236, 142);
    tex.needsUpdate = true;
  };
  draw('---', 'C');
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  g.userData.setReading = (T, contact) => draw(Number.isFinite(T) ? `${Math.round(T)}` : '---', contact ? 'C  probe on metal' : 'C');
  return g;
}

// Readout label (canvas sprite) shown beside the gauge.
export class Readout {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 192;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true, toneMapped: false }));
    this.sprite.scale.set(0.09, 0.0338, 1);
    this.sprite.renderOrder = 9650;
    this.sprite.visible = false;
    this.last = '';
  }

  set(lines) {
    const key = lines.join('|');
    if (key === this.last) return;
    this.last = key;
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, 512, 192);
    c.fillStyle = 'rgba(10,14,19,0.86)';
    c.beginPath();
    c.roundRect(4, 4, 504, 184, 22);
    c.fill();
    c.strokeStyle = '#f2b51c';
    c.lineWidth = 3;
    c.stroke();
    c.textAlign = 'left';
    lines.forEach((ln, k) => {
      c.fillStyle = k === 0 ? '#f2b51c' : '#e9eef4';
      c.font = `${k === 0 ? 700 : 600} ${k === 0 ? 34 : 40}px ${FONT}`;
      c.fillText(ln, 22, 50 + k * 50);
    });
    this.tex.needsUpdate = true;
  }
}

// Measure with a gauge whose contact tip is at `tip` (sim coordinates, mm).
// Returns null when the gauge is not on the weld.
export function measure(kind, rec, tip) {
  const j = rec.joint;
  const x = tip[0];
  if (x < 0 || x > j.L) return null;
  const i = Math.max(0, Math.min(j.n - 1, Math.floor(x)));
  const surf = surfaceHeight(rec, i, tip[1]);
  const gap = tip[2] - surf;
  const q = (v) => Math.round(v * 10) / 10;
  const sEval = x - j.tab;
  if (j.type === 'plate') {
    // drill plates: the bridge gauge reads the bead under it (width, height, undercut)
    if (gap > 18 || gap < -4) return null;
    const ks = rec.passesAt(i, tip[1]);
    const k = ks.length ? ks[ks.length - 1] : -1;
    const s = k >= 0 ? rec.sample(k, i) : null;
    const base = { x, i, sEval, inEval: sEval >= 0 && sEval <= j.evalL, sample: s };
    if (!s) return { ...base, kind, values: [], empty: true };
    if (kind === 'fillet') return { ...base, kind, values: [], wrongGauge: true };
    const side = tip[1] >= s.uc ? 2 : 1;
    return {
      ...base, kind,
      values: [
        { key: 'width', label: 'Bead width', value: q(s.wb), unit: 'mm' },
        { key: 'reinf', label: 'Bead height', value: q(s.h), unit: 'mm' },
        { key: 'undercut', label: side === 1 ? 'Undercut, toe 1' : 'Undercut, toe 2', value: q(side === 1 ? s.uc1 || 0 : s.uc2 || 0), unit: 'mm' },
      ],
    };
  }
  const k = rec.topPassAt(i);
  const width = j.type === 'fillet' ? 14 : j.topWidth / 2 + 8;
  if (Math.abs(tip[1]) > width || gap > 18 || gap < -4) return null;
  const s = k >= 0 ? rec.sample(k, i) : null;
  const base = { x, i, sEval, inEval: sEval >= 0 && sEval <= j.evalL, sample: s };
  if (!s) return { ...base, kind, values: [], empty: true };
  if (kind === 'fillet') {
    if (j.type !== 'fillet') return { ...base, kind, values: [], wrongGauge: true };
    const side = tip[1] >= 0 ? 1 : 2;
    return {
      ...base, kind,
      values: [
        { key: side === 1 ? 'leg1' : 'leg2', label: side === 1 ? 'Leg z1 (base plate)' : 'Leg z2 (web)', value: q(side === 1 ? s.z1 : s.z2), unit: 'mm' },
        { key: 'throat', label: 'Throat a', value: q(s.aA), unit: 'mm' },
        { key: 'convexity', label: s.c >= 0 ? 'Convexity' : 'Concavity', value: q(Math.abs(s.c)), unit: 'mm' },
      ],
    };
  }
  // bridge gauge
  const values = [];
  if (j.type === 'fillet') {
    const side = tip[1] >= 0 ? 1 : 2;
    values.push({ key: 'undercut', label: side === 1 ? 'Undercut, base-plate toe' : 'Undercut, web toe', value: q(side === 1 ? s.uc1 || 0 : s.uc2 || 0), unit: 'mm' });
    values.push({ key: 'throat', label: 'Throat a', value: q(s.aA), unit: 'mm' });
  } else {
    const side = tip[1] >= 0 ? 2 : 1;
    values.push({ key: 'undercut', label: side === 1 ? 'Undercut, plate 1 toe' : 'Undercut, plate 2 toe', value: q(side === 1 ? s.uc1 || 0 : s.uc2 || 0), unit: 'mm' });
    values.push({ key: 'reinf', label: s.h > 0 ? 'Reinforcement h' : 'Underfill', value: q(s.h > 0 ? s.h : s.fill || 0), unit: 'mm' });
    if (j.misalignment) values.push({ key: 'misalign', label: 'Misalignment', value: q(j.misalignment), unit: 'mm' });
  }
  return { ...base, kind, values };
}
