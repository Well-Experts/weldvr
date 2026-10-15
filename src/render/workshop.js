// Training workshop around the welding bench: hall, welding booth with low-reflectance walls and a
// transparent welding curtain, articulated fume-extraction arm, PPE rack, extinguisher, first-aid kit,
// safety signs, tool board, grinding station, gas cylinder storage, a neighbouring booth, and the
// props that turn into hazards in the hazard hunt.
//
// Room frame: origin on the floor below the centre of the bench, x to the welder's right, z toward the
// welder (the welder stands at z ~ 0.6 facing -z), y up, metres. The bench frame (env.bench) has its
// origin at the bench-top centre, so bench y = room y - bench height.
//
// Requirements reflected in the layout (see safety/refs.js):
//  - booth walls painted with a low-reflectivity finish and raised off the floor so air circulates at
//    floor level (OSHA 1910.252(b)(2)(iii); screens about 2 ft above the floor, (c)(1)(ii));
//  - curtain/screen between the welding and the walkway (OSHA 1910.252(b)(2)(iii), Z49.1 4.1.3);
//  - signs designating the welding area and the PPE to wear (Z49.1 4.1.2);
//  - extinguisher ready in its place (OSHA 1910.252(a)(2)(ii), 1910.157);
//  - cylinders chained upright (Z49.1 10.8.4.12), oxygen separated from fuel gas by a 1.5 m
//    noncombustible barrier (OSHA 1910.253(b)(4)(iii));
//  - movable extraction hood placed within one hood diameter of the weld (HSE WL3).

import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { signMesh } from './signs.js';
import { ppeModel } from './ppeModels.js';
import { workshopFloor, floorNormal, paintedSteel, paintNormal, blockWall, cardboard, wood, pegboard, curtainStrip, softDot, leather } from './textures.js';

const MATS = {};
function m(key, make) {
  if (!MATS[key]) MATS[key] = make();
  return MATS[key];
}
const mats = {
  floor: () => m('floor', () => {
    const map = workshopFloor();
    map.repeat.set(5, 5);
    const n = floorNormal();
    n.repeat.set(20, 20);
    return new THREE.MeshStandardMaterial({ map, normalMap: n, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.82, metalness: 0.02 });
  }),
  wall: () => m('wall', () => {
    const t = blockWall();
    t.repeat.set(6, 3);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0 });
  }),
  wallUpper: () => m('wallUpper', () => new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.95, metalness: 0 })),
  ceiling: () => m('ceiling', () => new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 1, metalness: 0 })),
  truss: () => m('truss', () => new THREE.MeshStandardMaterial({ color: 0x5c636c, roughness: 0.7, metalness: 0.4 })),
  lamp: () => m('lamp', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 2.2, roughness: 0.4 })),
  window: () => m('window', () => new THREE.MeshStandardMaterial({ color: 0x9fb8d2, emissive: 0x9cb6d6, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 })),
  booth: () => m('booth', () => new THREE.MeshStandardMaterial({ map: paintedSteel('#3a4048', 34, 0.6), normalMap: paintNormal(35), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.88, metalness: 0.25 })),
  post: () => m('post', () => new THREE.MeshStandardMaterial({ map: paintedSteel('#2a2e33', 36, 0.8), roughness: 0.7, metalness: 0.45 })),
  yellow: () => m('yellow', () => new THREE.MeshStandardMaterial({ map: paintedSteel('#d8a91a', 37, 0.6), roughness: 0.6, metalness: 0.2 })),
  greyArm: () => m('greyArm', () => new THREE.MeshStandardMaterial({ map: paintedSteel('#8d949c', 38, 0.4), roughness: 0.55, metalness: 0.35 })),
  red: () => m('red', () => new THREE.MeshStandardMaterial({ color: 0xc0201c, roughness: 0.4, metalness: 0.2 })),
  black: () => m('black', () => new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.6, metalness: 0.2 })),
  chrome: () => m('chrome', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.95 })),
  brass: () => m('brass', () => new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 })),
  copper: () => m('copper', () => new THREE.MeshStandardMaterial({ color: 0xc27a45, roughness: 0.35, metalness: 0.95 })),
  green: () => m('green', () => new THREE.MeshStandardMaterial({ color: 0x1f8a4c, roughness: 0.5, metalness: 0.1 })),
  white: () => m('white', () => new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.55, metalness: 0.05 })),
  cardboard: () => m('cardboard', () => new THREE.MeshStandardMaterial({ map: cardboard(), roughness: 0.95, metalness: 0 })),
  wood: () => m('wood', () => new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.9, metalness: 0 })),
  rag: () => m('rag', () => new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1, metalness: 0 })),
  pegboard: () => m('pegboard', () => new THREE.MeshStandardMaterial({ map: pegboard(), roughness: 0.9, metalness: 0 })),
  curtain: () => m('curtain', () => new THREE.MeshStandardMaterial({ map: curtainStrip(), transparent: true, opacity: 1, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, depthWrite: false })),
  mesh: () => m('mesh', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = '#8c939b';
    x.lineWidth = 3;
    for (let k = 0; k <= 64; k += 16) {
      x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 64); x.stroke();
      x.beginPath(); x.moveTo(0, k); x.lineTo(64, k); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 8);
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
  }),
  blob: () => m('blob', () => new THREE.MeshBasicMaterial({ map: softDot('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 64, 0.3), transparent: true, depthWrite: false })),
  water: () => m('water', () => new THREE.MeshStandardMaterial({ color: 0x0e1418, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.6 })),
  cylBody: (c) => m(`cyl${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.35 })),
  rubber: () => m('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.85, metalness: 0 })),
  gauge: () => m('gauge', () => new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.3, metalness: 0.1 })),
  leather: () => m('leather', () => new THREE.MeshStandardMaterial({ map: leather('#7d5a3a', 59), roughness: 0.8 })),
};

function box(g, w, h, d, mat, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}
function cyl(g, r, h, mat, x, y, z, seg = 16, rx = 0, rz = 0, r2 = r) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, 0, rz);
  g.add(o);
  return o;
}
function blob(g, w, d, x, z, y = 0.003) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.blob());
  o.rotation.x = -Math.PI / 2;
  o.position.set(x, y, z);
  o.renderOrder = 1;
  g.add(o);
  return o;
}

// Label plate (canvas text) for cylinders, signs and equipment.
function label(text, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = Math.round(512 * (w / Math.max(w, h)));
  c.height = Math.round(512 * (h / Math.max(w, h)));
  const x = c.getContext('2d');
  x.fillStyle = opts.bg || '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = opts.fg || '#111111';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const fs = Math.floor((c.height / lines.length) * 0.62);
  x.font = `bold ${fs}px "Segoe UI", Roboto, Arial, "Noto Naskh Arabic", sans-serif`;
  lines.forEach((l, k) => x.fillText(l, c.width / 2, (k + 0.5) * (c.height / lines.length), c.width - 10));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
}

// ---- gas cylinder model (room or bench frame), base at y = 0 ---------------------------------------
export function cylinderModel({ body = 0x3b6e46, shoulder = null, height = 1.45, r = 0.115, gas = 'ARGON', cap = true, regulator = false } = {}) {
  const g = new THREE.Group();
  const bm = mats.cylBody(body);
  const sm = shoulder != null ? mats.cylBody(shoulder) : bm;
  cyl(g, r, height - r, bm, 0, (height - r) / 2, 0, 24);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), sm);
  sh.position.y = height - r;
  g.add(sh);
  cyl(g, 0.028, 0.06, mats.brass(), 0, height + 0.02, 0, 12); // valve
  const capMesh = cap ? cyl(g, 0.06, 0.13, mats.post(), 0, height + 0.05, 0, 16, 0, 0, 0.05) : null;
  if (capMesh) capMesh.name = 'cap';
  if (regulator) {
    cyl(g, 0.035, 0.07, mats.chrome(), 0.05, height + 0.05, 0, 14, 0, Math.PI / 2);
    for (const dz of [-0.04, 0.04]) {
      const gg = cyl(g, 0.032, 0.02, mats.gauge(), 0.09, height + 0.08, dz, 16, Math.PI / 2);
      gg.name = 'gauge';
    }
  }
  const lab = label(gas, 0.16, 0.05);
  lab.position.set(0, height * 0.62, r + 0.001);
  g.add(lab);
  mergeStatic(g, capMesh ? [capMesh] : []);
  return { group: g, cap: capMesh };
}

// ---- articulated fume extraction arm ------------------------------------------------------------------
class ExtractionArm {
  constructor(room, mount) {
    this.group = new THREE.Group();
    this.group.name = 'lev';
    room.add(this.group);
    this.mount = mount.clone();
    this.L1 = 1.0;
    this.L2 = 0.9;
    this.hoodLen = 0.2;
    this.d = 0.2; // hood mouth diameter (m), design value of this extraction arm
    this.on = true;
    // hood mouth, room frame: parked (raised toward the wall) until it is placed at the work
    this.target = new THREE.Vector3(this.mount.x + 0.45, 1.72, this.mount.z + 0.3);
    const arm = mats.greyArm();
    this.seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1, 16), arm);
    this.seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 16), arm);
    this.j1 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), mats.black());
    this.j2 = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mats.black());
    this.hood = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.055, this.d / 2, this.hoodLen, 24, 1, true), mats.yellow());
    cone.material.side = THREE.DoubleSide;
    cone.position.y = -this.hoodLen / 2;
    this.hood.add(cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(this.d / 2, 0.008, 8, 32), mats.black());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -this.hoodLen;
    this.hood.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 16, Math.PI), mats.black());
    handle.position.set(0, -this.hoodLen * 0.55, this.d / 2 - 0.01);
    handle.rotation.y = Math.PI / 2;
    this.hood.add(handle);
    this.handle = handle;
    // inside of the hood: dark
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mats.black());
    inner.rotation.x = Math.PI / 2;
    inner.position.y = -0.02;
    this.hood.add(inner);
    for (const o of [this.seg1, this.seg2, this.j1, this.j2, this.hood]) this.group.add(o);
    // wall bracket of the arm
    const box1 = new THREE.Group();
    box(box1, 0.06, 0.3, 0.3, mats.post(), 0, 0, 0);
    box(box1, 0.06, 0.16, 0.16, mats.post(), 0, -0.2, 0);
    this.group.add(box1);
    box1.position.copy(this.mount);
    // on/off switch and airflow indicator lamp on the hood (HSE WL3: an easy way of checking that
    // the LEV is working, e.g. an airflow indicator)
    const sw = new THREE.Group();
    box(sw, 0.07, 0.05, 0.04, mats.white(), 0, 0, 0);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2bd15f, emissive: 0x2bd15f, emissiveIntensity: 1.5 }));
    this.lamp.position.set(-0.018, 0.0, 0.021);
    sw.add(this.lamp);
    this.switch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.026, 0.012), mats.red());
    this.switch.position.set(0.016, 0.0, 0.024);
    sw.add(this.switch);
    const lab = label('AIR  ON/OFF', 0.06, 0.012);
    lab.position.set(0, -0.019, 0.0205);
    sw.add(lab);
    sw.position.set(0, -this.hoodLen * 0.3, -this.d / 2 - 0.01);
    sw.rotation.y = Math.PI;
    this.hood.add(sw);
    this.switchBox = sw;
    // out-of-order tag (scenario)
    this.tag = label('OUT OF ORDER\nDO NOT USE', 0.12, 0.07, { bg: '#d8261c', fg: '#ffffff' });
    this.tag.position.set(0, -this.hoodLen * 0.45, this.d / 2 + 0.012);
    this.tag.visible = false;
    this.hood.add(this.tag);
    this.mouth = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.solve();
  }

  setOn(on) {
    if (this.broken) on = false;
    this.on = on;
    this.lamp.material.emissiveIntensity = on ? 1.5 : 0;
    this.lamp.material.color.set(on ? 0x2bd15f : 0x2a3a2e);
    this.switch.rotation.z = on ? 0 : 0.5;
  }

  // Out of order (scenario): the fan does not run and a tag hangs on the hood.
  setBroken(b) {
    this.broken = b;
    this.tag.visible = b;
    this.setOn(!b && this.on);
  }

  // Parked: hood raised and swung back toward the wall.
  park() {
    this.setTarget(new THREE.Vector3(this.mount.x + 0.45, 1.72, this.mount.z + 0.3));
  }

  // Place the hood mouth (room frame) and solve the two joints (elbow up).
  setTarget(p) {
    this.target.copy(p);
    this.solve();
  }

  solve() {
    const M = this.mount;
    const T = this.target;
    const W = this.v.copy(T).add(new THREE.Vector3(0, this.hoodLen, 0)); // wrist above the mouth
    const dx = W.x - M.x, dz = W.z - M.z, dy = W.y - M.y;
    let r = Math.hypot(dx, dz);
    const yaw = Math.atan2(dz, dx);
    let D = Math.hypot(r, dy);
    const maxD = this.L1 + this.L2 - 1e-3;
    if (D > maxD) {
      // out of reach: stop at full stretch toward the target
      const k = maxD / D;
      r *= k;
      D = maxD;
      W.set(M.x + Math.cos(yaw) * r, M.y + dy * k, M.z + Math.sin(yaw) * r);
      T.copy(W).sub(new THREE.Vector3(0, this.hoodLen, 0));
    }
    const a1 = Math.atan2(W.y - M.y, r) + Math.acos(Math.max(-1, Math.min(1, (this.L1 * this.L1 + D * D - this.L2 * this.L2) / (2 * this.L1 * D))));
    const E = new THREE.Vector3(M.x + Math.cos(yaw) * Math.cos(a1) * this.L1, M.y + Math.sin(a1) * this.L1, M.z + Math.sin(yaw) * Math.cos(a1) * this.L1);
    placeSegment(this.seg1, M, E);
    placeSegment(this.seg2, E, W);
    this.j1.position.copy(M);
    this.j2.position.copy(E);
    this.hood.position.copy(W);
    this.mouth.copy(T);
  }

  // hood mouth in world space
  mouthWorld(out) {
    this.group.updateWorldMatrix(true, false);
    return out.copy(this.target).applyMatrix4(this.group.matrixWorld);
  }

  handleWorld(out) {
    this.handle.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.handle.matrixWorld);
  }
}

function placeSegment(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, L, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// ---- welding curtain (front of the booth) ------------------------------------------------------------
class Curtain {
  constructor(room, x0, x1, z, bottom, top) {
    this.group = new THREE.Group();
    this.group.name = 'curtain';
    room.add(this.group);
    this.x0 = x0;
    this.x1 = x1;
    this.z = z;
    this.closed = true;
    this.anim = 1;
    this.halves = [];
    const h = top - bottom;
    for (const side of [0, 1]) {
      const w = (x1 - x0) / 2;
      const geo = new THREE.PlaneGeometry(w, h, 24, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 9) * 0.018);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats.curtain());
      mesh.renderOrder = 2;
      mesh.position.set(side ? x0 + w * 1.5 : x0 + w / 2, bottom + h / 2, z);
      mesh.userData.w = w;
      this.group.add(mesh);
      this.halves.push(mesh);
    }
    // rail and hooks
    const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.1, 0.03, 0.04), mats.post());
    rail.position.set((x0 + x1) / 2, top + 0.03, z);
    this.group.add(rail);
  }

  set(closed) {
    this.closed = closed;
  }

  update(dt) {
    const target = this.closed ? 1 : 0;
    this.anim += (target - this.anim) * Math.min(1, dt * 4);
    const w = this.halves[0].userData.w;
    // open: each half bunched to 25% width at its side
    const s = 0.25 + 0.75 * this.anim;
    this.halves[0].scale.x = s;
    this.halves[0].position.x = this.x0 + (w * s) / 2;
    this.halves[1].scale.x = s;
    this.halves[1].position.x = this.x1 - (w * s) / 2;
  }
}

// ---- the workshop -------------------------------------------------------------------------------------
export function buildWorkshop() {
  const room = new THREE.Group();
  room.name = 'workshop';
  const ws = { room, targets: {}, hz: {} };

  // hall: floor, walls, ceiling, lights
  const hall = new THREE.Group();
  hall.name = 'hall';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), mats.floor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 2.5);
  hall.add(floor);
  const wallH = 6;
  const wall = (w, x, z, ry) => {
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), mats.wall());
    lower.position.set(x, 1.2, z);
    lower.rotation.y = ry;
    hall.add(lower);
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH - 2.4), mats.wallUpper());
    upper.position.set(x, 2.4 + (wallH - 2.4) / 2, z);
    upper.rotation.y = ry;
    hall.add(upper);
  };
  wall(15, 0, -3.2, 0);
  wall(15, -7.5, 2.5, Math.PI / 2);
  wall(15, 7.5, 2.5, -Math.PI / 2);
  wall(15, 0, 10, Math.PI);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), mats.ceiling());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, wallH, 2.5);
  hall.add(ceil);
  for (let k = 0; k < 5; k++) box(hall, 15, 0.3, 0.15, mats.truss(), 0, wallH - 0.3, -2.5 + k * 3.2);
  for (const [x, z] of [[-3, -1.2], [0, -1.2], [3, -1.2], [-3, 2.4], [0, 2.4], [3, 2.4], [-3, 6], [0, 6], [3, 6]]) {
    cyl(hall, 0.25, 0.08, mats.post(), x, wallH - 0.75, z, 20);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), mats.lamp());
    l.rotation.x = Math.PI / 2;
    l.position.set(x, wallH - 0.795, z);
    hall.add(l);
  }
  // high windows on the side walls and a roller door
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const wnd = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), mats.window());
    wnd.position.set(sx * 7.48, 4.4, -1.5 + k * 3.4);
    wnd.rotation.y = -sx * Math.PI / 2;
    hall.add(wnd);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.2), mats.booth());
  door.position.set(7.47, 2.1, 6.5);
  door.rotation.y = -Math.PI / 2;
  hall.add(door);
  // painted walkway lines in front of the booths
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.7 });
  for (const z of [1.7, 3.5]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.08), lineMat);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(0, 0.002, z);
    hall.add(ln);
  }
  mergeStatic(hall);
  room.add(hall);

  // welding booth: back and side walls raised 0.3 m off the floor, posts, roof frame
  const booth = new THREE.Group();
  booth.name = 'boothShell';
  const B = { x0: -1.2, x1: 1.2, z0: -0.95, z1: 1.45, bottom: 0.3, top: 2.1 };
  ws.boothBox = B;
  const ph = B.top - B.bottom;
  box(booth, B.x1 - B.x0, ph, 0.03, mats.booth(), 0, B.bottom + ph / 2, B.z0);
  box(booth, 0.03, ph, B.z1 - B.z0, mats.booth(), B.x0, B.bottom + ph / 2, (B.z0 + B.z1) / 2);
  box(booth, 0.03, ph, B.z1 - B.z0, mats.booth(), B.x1, B.bottom + ph / 2, (B.z0 + B.z1) / 2);
  for (const [x, z] of [[B.x0, B.z0], [B.x1, B.z0], [B.x0, B.z1], [B.x1, B.z1]]) box(booth, 0.05, B.top + 0.05, 0.05, mats.post(), x, (B.top + 0.05) / 2, z);
  box(booth, B.x1 - B.x0, 0.05, 0.05, mats.post(), 0, B.top, B.z0);
  box(booth, 0.05, 0.05, B.z1 - B.z0, mats.post(), B.x0, B.top, (B.z0 + B.z1) / 2);
  box(booth, 0.05, 0.05, B.z1 - B.z0, mats.post(), B.x1, B.top, (B.z0 + B.z1) / 2);
  // booth sign above the entrance
  const title = label('WELDING AREA — منطقة لحام', 1.2, 0.16, { bg: '#f2b51c', fg: '#16110a' });
  title.position.set(0, B.top + 0.14, B.z1 + 0.03);
  booth.add(title);
  blob(booth, 1.6, 1.0, 0, -0.02, 0.002); // bench shadow
  mergeStatic(booth, [title]);
  room.add(booth);

  // curtain at the entrance
  ws.curtain = new Curtain(room, B.x0, B.x1, B.z1, 0.3, B.top - 0.02);

  // safety signs on the booth front posts (outside) and inside
  ws.signs = new THREE.Group();
  ws.signs.name = 'signs';
  const postSigns = [['M019', B.x0 - 0.16, 1.55], ['M009', B.x0 - 0.16, 1.2], ['M010', B.x0 - 0.38, 1.55], ['M008', B.x0 - 0.38, 1.2], ['W027', B.x1 + 0.16, 1.55], ['W012', B.x1 + 0.38, 1.55]];
  for (const [code, x, y] of postSigns) {
    const s = signMesh(code, 0.19);
    s.position.set(x, y, B.z1 + 0.04);
    ws.signs.add(s);
  }
  const inSign = signMesh('M004', 0.18);
  inSign.position.set(0.75, 1.6, B.z0 + 0.02);
  ws.signs.add(inSign);
  const hotSign = signMesh('W017', 0.16);
  hotSign.position.set(-0.75, 1.6, B.z0 + 0.02);
  ws.signs.add(hotSign);
  room.add(ws.signs);
  ws.targets.signsMissing = postSigns.length ? ws.signs : null;

  // fume extraction arm on the left wall near the back corner
  ws.lev = new ExtractionArm(room, new THREE.Vector3(B.x0 + 0.06, 2.0, B.z0 + 0.3));
  ws.targets.hoodFar = ws.lev.hood;

  // extinguisher on the right wall near the entrance (inside)
  const ext = new THREE.Group();
  ext.name = 'extinguisher';
  const bracket = new THREE.Group();
  box(bracket, 0.02, 0.12, 0.12, mats.post(), 0, 1.0, 0);
  box(bracket, 0.06, 0.02, 0.14, mats.post(), 0.03, 0.62, 0);
  ext.add(bracket);
  const bottle = new THREE.Group();
  cyl(bottle, 0.075, 0.5, mats.red(), 0, 0.25, 0, 20);
  cyl(bottle, 0.075, 0.02, mats.black(), 0, 0.5, 0, 20);
  cyl(bottle, 0.018, 0.06, mats.black(), 0, 0.54, 0, 10);
  box(bottle, 0.1, 0.012, 0.03, mats.black(), 0.03, 0.575, 0);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI * 1.2), mats.black());
  hose.position.set(0.0, 0.43, 0.08);
  hose.rotation.y = Math.PI / 2;
  bottle.add(hose);
  const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), mats.gauge());
  gaugeFace.position.set(-0.045, 0.555, 0.03);
  gaugeFace.rotation.y = -Math.PI / 2 + 0.6;
  bottle.add(gaugeFace);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.016, 0.002), mats.black());
  needle.position.set(-0.046, 0.555, 0.031);
  needle.rotation.y = -Math.PI / 2 + 0.6;
  bottle.add(needle);
  ws.extNeedle = needle;
  const extLab = label('ABC\nDRY POWDER', 0.09, 0.08);
  extLab.position.set(-0.076, 0.27, 0);
  extLab.rotation.y = -Math.PI / 2;
  bottle.add(extLab);
  const tag = label('INSPECTED\nMONTHLY', 0.05, 0.035, { bg: '#ffef9a' });
  tag.position.set(-0.08, 0.5, 0.05);
  tag.rotation.y = -Math.PI / 2;
  bottle.add(tag);
  bottle.position.set(0.05, 0.62, 0);
  mergeStatic(bracket);
  mergeStatic(bottle, [needle, gaugeFace, extLab, tag]); // the needle moves (extinguisherEmpty)
  ext.add(bottle);
  ws.extBottle = bottle;
  const fSign = signMesh('F001', 0.17);
  fSign.position.set(-0.012, 1.55, 0);
  fSign.rotation.y = -Math.PI / 2;
  ext.add(fSign);
  ext.position.set(B.x1 - 0.03, 0, B.z1 - 0.25);
  room.add(ext);
  ws.extinguisher = ext;
  ws.targets.extinguisher = ext;
  // boxes that can block it
  const blockers = new THREE.Group();
  for (const [x, y, z, s] of [[0, 0.2, 0, 0.4], [0.02, 0.55, 0.02, 0.3]]) box(blockers, s, s * 0.9, s * 0.8, mats.cardboard(), x, y, z);
  blockers.position.set(B.x1 - 0.3, 0, B.z1 - 0.25);
  blockers.visible = false;
  room.add(blockers);
  ws.extBlockers = blockers;

  // first-aid kit
  const fa = new THREE.Group();
  box(fa, 0.08, 0.26, 0.34, mats.green(), 0, 0, 0);
  const cross = signMesh('E003', 0.14);
  cross.position.set(-0.041, 0.33, 0);
  cross.rotation.y = -Math.PI / 2;
  fa.add(cross);
  fa.position.set(B.x1 - 0.06, 1.3, 0.25);
  room.add(fa);

  // tool board on the right wall: chipping hammer, brushes, pliers, tongs, clamps, soapstone, gauges
  const tb = new THREE.Group();
  tb.name = 'toolBoard';
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), mats.pegboard());
  board.rotation.y = -Math.PI / 2;
  tb.add(board);
  const tools = new THREE.Group();
  // chipping hammer
  box(tools, 0.02, 0.28, 0.02, mats.wood(), -0.015, 0.05, -0.32);
  box(tools, 0.025, 0.025, 0.16, mats.post(), -0.015, 0.19, -0.32);
  // wire brushes
  for (const z of [-0.18, -0.1]) {
    box(tools, 0.015, 0.26, 0.025, mats.wood(), -0.012, 0.02, z);
    box(tools, 0.03, 0.08, 0.02, mats.chrome(), -0.02, -0.08, z);
  }
  // MIG pliers and tongs
  for (const [z, l] of [[0.0, 0.2], [0.1, 0.42]]) {
    for (const s of [-1, 1]) {
      const b = box(tools, 0.012, l, 0.012, mats.post(), -0.012, 0.02, z + s * 0.012);
      b.rotation.x = s * 0.06;
    }
  }
  // C-clamps
  for (const z of [0.22, 0.3]) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI * 1.4), mats.post());
    c.rotation.y = Math.PI / 2;
    c.position.set(-0.015, 0.15, z);
    tools.add(c);
  }
  // soapstone holder and fillet gauges
  box(tools, 0.014, 0.12, 0.014, mats.chrome(), -0.012, -0.15, 0.3);
  box(tools, 0.004, 0.09, 0.07, mats.chrome(), -0.008, -0.2, 0.18);
  mergeStatic(tools);
  tb.add(tools);
  tb.position.set(B.x1 - 0.02, 1.45, -0.45);
  room.add(tb);

  // PPE station on the left wall inside the booth: upper shelf (helmets, eye, ear, head and
  // respiratory protection), coat hooks (jackets, apron, cape), lower shelf (gloves, trousers) and
  // boots on the floor. Rack frame: x into the booth, z along the wall.
  const rack = new THREE.Group();
  rack.name = 'ppeRack';
  const RW = 1.3;
  box(rack, 0.32, 0.025, RW, mats.post(), 0.16, 1.787, 0);
  box(rack, 0.32, 0.025, RW, mats.post(), 0.16, 0.5875, 0);
  box(rack, 0.02, 0.03, RW, mats.post(), 0.03, 1.62, 0);
  for (const z of [-RW / 2, RW / 2]) {
    box(rack, 0.32, 1.9, 0.025, mats.post(), 0.16, 0.95, z);
  }
  box(rack, 0.01, 1.3, RW, mats.pegboard(), 0.006, 1.15, 0);
  for (const z of RACK_HOOK_Z) {
    const hk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), mats.chrome());
    hk.rotation.z = Math.PI / 2;
    hk.position.set(0.075, 1.62, z);
    rack.add(hk);
  }
  const rackLabel = label('PPE — معدات الوقاية', 0.5, 0.07, { bg: '#1f5aa8', fg: '#ffffff' });
  rackLabel.position.set(0.012, 1.95, 0);
  rackLabel.rotation.y = Math.PI / 2;
  rack.add(rackLabel);
  mergeStatic(rack, [rackLabel]);
  rack.position.set(B.x0 + 0.02, 0, 0.39);
  room.add(rack);
  ws.rack = rack;
  ws.rackSlots = []; // filled by setRackItems

  // shielding-gas cylinder stand with chain is built on the bench cylinder (buildCylinderStand)

  // spare cylinder in the back-right corner of the booth (cap on or off)
  const spare = cylinderModel({ body: 0x3b6e46, gas: 'ARGON', cap: true });
  spare.group.position.set(B.x1 - 0.2, 0, B.z0 + 0.22);
  room.add(spare.group);
  blob(room, 0.4, 0.4, B.x1 - 0.2, B.z0 + 0.22);
  const spareChain = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.006, 6, 24), mats.chrome());
  spareChain.rotation.x = Math.PI / 2;
  spareChain.position.set(B.x1 - 0.2, 1.0, B.z0 + 0.22);
  room.add(spareChain);
  ws.spare = spare;
  ws.targets.cylinderNoCap = spare.group;

  // grinding station outside the booth (left)
  const gs = new THREE.Group();
  gs.name = 'grinding';
  box(gs, 0.8, 0.04, 0.5, mats.booth(), 0, 0.88, 0);
  for (const [x, z] of [[-0.36, -0.21], [0.36, -0.21], [-0.36, 0.21], [0.36, 0.21]]) box(gs, 0.04, 0.86, 0.04, mats.post(), x, 0.43, z);
  mergeStatic(gs);
  const grinder = new THREE.Group();
  cyl(grinder, 0.03, 0.2, mats.greyArm(), 0, 0, 0, 16, 0, Math.PI / 2);
  box(grinder, 0.06, 0.05, 0.06, mats.black(), 0.12, 0, 0);
  cyl(grinder, 0.058, 0.004, new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.8 }), 0.13, -0.045, 0, 24);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }));
  guard.position.set(0.13, -0.035, 0);
  grinder.add(guard);
  cyl(grinder, 0.012, 0.1, mats.black(), 0.12, 0.0, 0.06, 10, Math.PI / 2);
  grinder.position.set(0.0, 0.95, 0.0);
  gs.add(grinder);
  ws.grinderGuard = guard;
  const g1 = signMesh('M003', 0.16);
  g1.position.set(-0.2, 1.45, -0.26);
  gs.add(g1);
  const g2 = signMesh('M004', 0.16);
  g2.position.set(0.05, 1.45, -0.26);
  gs.add(g2);
  box(gs, 0.6, 0.6, 0.02, mats.booth(), -0.05, 1.45, -0.27);
  gs.position.set(-2.1, 0, 0.2);
  room.add(gs);
  blob(room, 1.0, 0.7, -2.1, 0.2);
  ws.targets.grinderGuard = grinder;

  // gas cylinder storage (right of the booth): cage with a noncombustible barrier between oxygen and fuel gas
  const store = new THREE.Group();
  store.name = 'gasStore';
  const SW = 1.8, SD = 0.7, SH = 1.9;
  for (const [x, z, w, d] of [[0, -SD / 2, SW, 0.02], [-SW / 2, 0, 0.02, SD], [SW / 2, 0, 0.02, SD]]) box(store, w, SH, d, mats.mesh(), x, SH / 2, z);
  const barrier = box(store, 0.12, 1.5, SD, mats.wall(), 0, 0.75, 0); // 1.5 m blockwork barrier
  barrier.name = 'barrier';
  for (const z of [-SD / 2 + 0.05]) box(store, SW, 0.02, 0.02, mats.chrome(), 0, 1.0, z);
  const ns = signMesh('P002', 0.18);
  ns.position.set(-0.4, 1.6, -SD / 2 + 0.03);
  store.add(ns);
  const ws29 = signMesh('W029', 0.18);
  ws29.position.set(0.4, 1.6, -SD / 2 + 0.03);
  store.add(ws29);
  const oxLab = label('OXYGEN — أكسجين', 0.5, 0.07);
  oxLab.position.set(-0.45, 1.95, -SD / 2 + 0.02);
  store.add(oxLab);
  const acLab = label('FUEL GAS — غاز وقود', 0.5, 0.07);
  acLab.position.set(0.45, 1.95, -SD / 2 + 0.02);
  store.add(acLab);
  // cylinders: oxygen left of the barrier, acetylene right (body colours are only cosmetic: read the label)
  ws.oxy = [];
  ws.acet = [];
  for (let k = 0; k < 3; k++) {
    const c = cylinderModel({ body: 0x2a2c30, shoulder: 0xeeeeee, gas: 'OXYGEN', height: 1.5 });
    c.group.position.set(-0.75 + k * 0.25, 0, -0.12);
    store.add(c.group);
    ws.oxy.push(c);
  }
  for (let k = 0; k < 2; k++) {
    const c = cylinderModel({ body: 0x7a1f22, gas: 'ACETYLENE', height: 1.1, r: 0.15 });
    c.group.position.set(0.35 + k * 0.33, 0, -0.1);
    store.add(c.group);
    ws.acet.push(c);
  }
  box(store, 0.85, 0.02, 0.02, mats.chrome(), -0.5, 1.15, 0.05);
  box(store, 0.8, 0.02, 0.02, mats.chrome(), 0.5, 0.85, 0.08);
  mergeStatic(store); // cage panels and chain rails (the cylinders are groups: moved by the hazards)
  store.position.set(2.65, 0, -0.45);
  room.add(store);
  blob(room, 2.2, 1.0, 2.65, -0.45);
  ws.store = store;
  ws.targets.oxyFuelTogether = store;
  ws.targets.acetyleneLying = store;

  // oxy-fuel cutting cart outside the booth
  const cart = new THREE.Group();
  cart.name = 'oxyCart';
  box(cart, 0.5, 0.04, 0.3, mats.post(), 0, 0.12, 0);
  box(cart, 0.04, 1.2, 0.04, mats.post(), -0.22, 0.6, -0.12);
  box(cart, 0.04, 1.2, 0.04, mats.post(), 0.22, 0.6, -0.12);
  box(cart, 0.48, 0.03, 0.03, mats.post(), 0, 1.15, -0.12);
  for (const sx of [-1, 1]) cyl(cart, 0.08, 0.04, mats.rubber(), sx * 0.24, 0.08, 0.1, 16, 0, Math.PI / 2);
  const cox = cylinderModel({ body: 0x2a2c30, shoulder: 0xeeeeee, gas: 'OXYGEN', height: 1.25, r: 0.1, cap: false, regulator: true });
  cox.group.position.set(-0.12, 0.14, 0);
  cart.add(cox.group);
  const cac = cylinderModel({ body: 0x7a1f22, gas: 'ACETYLENE', height: 1.0, r: 0.12, cap: false, regulator: true });
  cac.group.position.set(0.13, 0.14, 0);
  cart.add(cac.group);
  const rag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), mats.rag());
  rag.scale.set(1.4, 0.5, 1.0);
  rag.position.set(-0.02, 1.47, 0.0);
  rag.visible = false;
  cart.add(rag);
  ws.oilyRag = rag;
  mergeStatic(cart, [rag]);
  cart.position.set(1.75, 0, 1.75);
  cart.rotation.y = -0.3;
  room.add(cart);
  blob(room, 0.8, 0.6, 1.75, 1.75);
  ws.targets.oilyRegulator = cart;

  // combustibles (hazard): cardboard boxes, a pallet and oily rags near the booth entrance
  const comb = new THREE.Group();
  comb.name = 'combustibles';
  box(comb, 1.0, 0.14, 0.8, mats.wood(), 0, 0.07, 0);
  box(comb, 0.5, 0.4, 0.4, mats.cardboard(), -0.2, 0.34, -0.1, 0.2);
  box(comb, 0.4, 0.35, 0.4, mats.cardboard(), 0.25, 0.32, 0.12, -0.3);
  box(comb, 0.35, 0.3, 0.35, mats.cardboard(), 0.0, 0.69, 0.0, 0.5);
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), mats.rag());
    r.scale.set(1.3, 0.4, 1);
    r.position.set(0.55 + k * 0.08, 0.03, 0.3 - k * 0.1);
    comb.add(r);
  }
  mergeStatic(comb);
  comb.position.set(-0.9, 0, 2.2);
  comb.visible = false;
  room.add(comb);
  ws.combustibles = comb;
  ws.targets.combustibles = comb;
  // fire-resistant blanket (cover) used when combustibles cannot be moved
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.95), new THREE.MeshStandardMaterial({ color: 0x8b8f93, roughness: 0.95 }));
  blanket.position.set(-0.9, 0.47, 2.2);
  blanket.visible = false;
  room.add(blanket);
  ws.blanket = blanket;

  // water on the floor (hazard)
  const puddleShape = new THREE.Shape();
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = 0.55 + 0.12 * Math.sin(a * 3) + 0.06 * Math.cos(a * 5);
    if (k === 0) puddleShape.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r);
    else puddleShape.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r);
  }
  const puddle = new THREE.Mesh(new THREE.ShapeGeometry(puddleShape, 2), mats.water());
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0.45, 0.004, 0.55);
  puddle.renderOrder = 3;
  puddle.visible = false;
  room.add(puddle);
  ws.puddle = puddle;
  ws.targets.wetFloor = puddle;

  // neighbouring booth (left) with its curtain closed and an arc glow behind it
  const nb = new THREE.Group();
  nb.name = 'nextBooth';
  box(nb, 2.4, ph, 0.03, mats.booth(), 0, B.bottom + ph / 2, B.z0);
  box(nb, 0.03, ph, 2.0, mats.booth(), -1.2, B.bottom + ph / 2, 0.05);
  for (const [x, z] of [[-1.2, B.z0], [-1.2, B.z1]]) box(nb, 0.05, B.top + 0.05, 0.05, mats.post(), x, (B.top + 0.05) / 2, z);
  box(nb, 0.05, 0.05, 2.0, mats.post(), -1.2, B.top, 0.05);
  mergeStatic(nb);
  const nbCurt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, ph - 0.02), mats.curtain());
  nbCurt.position.set(0, B.bottom + ph / 2, B.z1);
  nbCurt.renderOrder = 2;
  nb.add(nbCurt);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: softDot('rgba(255,230,200,1)', 'rgba(255,140,60,0)', 64, 0.05), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.position.set(0.1, 1.0, 0.2);
  nb.add(glow);
  ws.nextGlow = glow;
  nb.position.set(-3.65, 0, 0);
  room.add(nb);

  // standpoints for moving around the workshop (room frame: x, z of the feet; yaw of the view,
  // forward = (-sin yaw, 0, -cos yaw))
  // panel: where the main panel goes at this standpoint [right, down, distance] (m)
  ws.viewpoints = {
    bench: { x: 0, z: 0.52, yaw: 0, label: 'Welding bench' },
    rack: { x: -0.3, z: 0.42, yaw: Math.PI / 2, label: 'PPE station', panel: [0.42, 0.24, 0.4] },
    walkway: { x: 0.5, z: 2.75, yaw: 0.12, label: 'Walkway at the booth entrance' },
    gasStore: { x: 2.55, z: 0.95, yaw: 0, label: 'Gas cylinder store' },
    grinding: { x: -2.1, z: 1.0, yaw: 0, label: 'Grinding station' },
  };

  // key light and target in the room frame
  ws.key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  ws.key.position.set(0.8, 4.5, 2.4);
  ws.key.target.position.set(0, 0.8, -0.3);
  room.add(ws.key, ws.key.target);

  // ---- hazard switches --------------------------------------------------------------------------------
  ws.state = {};
  ws.setHazard = (id, on) => {
    ws.state[id] = on;
    switch (id) {
      case 'cylinderNoCap': if (spare.cap) spare.cap.visible = !on; break;
      case 'combustibles': comb.visible = on; if (on) blanket.visible = false; break;
      case 'extinguisherMissing': bottle.visible = !on; break;
      case 'extinguisherEmpty': needle.rotation.z = on ? -1.9 : 0; needle.material = on ? mats.red() : mats.black(); break;
      case 'extinguisherBlocked': blockers.visible = on; break;
      case 'curtainOpen': ws.curtain.set(!on); break;
      case 'hoodFar': if (on) ws.lev.park(); break; // when off, the app places the hood at the work
      case 'wetFloor': puddle.visible = on; break;
      case 'oxyFuelTogether': {
        // one oxygen cylinder moved to the acetylene side of the barrier
        const c = ws.oxy[2];
        c.group.position.set(on ? 0.85 : -0.25, 0, on ? 0.12 : -0.12);
        break;
      }
      case 'acetyleneLying': {
        const c = ws.acet[1];
        if (on) {
          c.group.rotation.set(0, 0, Math.PI / 2);
          c.group.position.set(0.55, 0.15, 0.45);
        } else {
          c.group.rotation.set(0, 0, 0);
          c.group.position.set(0.68, 0, -0.1);
        }
        break;
      }
      case 'oilyRegulator': rag.visible = on; break;
      case 'grinderGuard': guard.visible = !on; break;
      case 'signsMissing': ws.signs.visible = !on; break;
      default: break; // handled by the app (bench-frame items)
    }
  };

  ws.update = (dt, t) => {
    ws.curtain.update(dt);
    // neighbouring booth: a colleague welding (flicker of the arc through the curtain)
    const on = Math.sin(t * 0.23) > -0.2;
    const flick = on ? 0.55 + 0.45 * Math.abs(Math.sin(t * 37) * Math.sin(t * 13.7)) : 0;
    ws.nextGlow.material.opacity = flick;
    ws.nextGlow.visible = flick > 0.01;
  };
  return ws;
}

// Cylinder stand with a chain for the bench-side shielding-gas cylinder (in the cylinder's frame).
export function buildCylinderStand(cylinderGroup) {
  const g = new THREE.Group();
  g.name = 'cylStand';
  box(g, 0.3, 0.02, 0.3, mats.post(), 0, 0.01, -0.02);
  box(g, 0.04, 1.1, 0.04, mats.post(), 0, 0.55, -0.15);
  box(g, 0.24, 0.03, 0.03, mats.post(), 0, 0.95, -0.15);
  mergeStatic(g);
  const hooked = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.006, 6, 28), mats.chrome());
  hooked.rotation.x = Math.PI / 2;
  hooked.position.set(0, 0.95, 0);
  hooked.name = 'chainHooked';
  g.add(hooked);
  const loose = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 4, 10), mats.chrome());
    l.position.set(0.12, 0.93 - k * 0.025, -0.15);
    l.rotation.y = (k % 2) * Math.PI / 2;
    loose.add(l);
  }
  loose.visible = false;
  loose.name = 'chainLoose';
  g.add(loose);
  cylinderGroup.add(g);
  return {
    group: g,
    set(secured) {
      hooked.visible = secured;
      loose.visible = !secured;
    },
  };
}

// Rack slot positions (rack frame: x into the booth, y up, z along the wall) for the PPE items:
// 8 on the upper shelf, 6 coat hooks (alternately staggered so coats overlap like on real hooks),
// 6 on the lower shelf and 3 boot places on the floor.
const RACK_HOOK_Z = [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55];
export const RACK_SLOTS = [
  ...[-0.56, -0.4, -0.24, -0.08, 0.08, 0.24, 0.4, 0.56].map((z) => ({ at: [0.17, 1.8, z], ry: Math.PI / 2, zone: 'top' })),
  // hanging items: model origin 0.2 m below the hook (hanger loop height of the models)
  ...RACK_HOOK_Z.map((z, k) => ({ at: [0.1 + (k % 2) * 0.05, 1.42, z], ry: Math.PI / 2, hang: true, zone: 'hook' })),
  ...[-0.52, -0.31, -0.1, 0.11, 0.32, 0.53].map((z) => ({ at: [0.17, 0.6, z], ry: Math.PI / 2, zone: 'low' })),
  ...[-0.4, -0.05, 0.3].map((z) => ({ at: [0.24, 0.0, z], ry: Math.PI / 2, zone: 'floor' })),
];

// Place PPE item models on the rack. items: [{ id, defect }] in slot order preference.
export function setRackItems(ws, items) {
  for (const s of ws.rackSlots) s.obj.parent?.remove(s.obj);
  ws.rackSlots = [];
  const zoneOf = (slot) => (['helmet', 'eyes', 'cap', 'ears', 'resp'].includes(slot) ? 'top' : ['torso', 'apron', 'cape'].includes(slot) ? 'hook' : ['hands', 'legs'].includes(slot) ? 'low' : slot === 'feet' ? 'floor' : null);
  const used = new Set();
  // shuffle order within a zone is fixed by the caller's item order
  const pick = (zone) => {
    for (let k = 0; k < RACK_SLOTS.length; k++) if (RACK_SLOTS[k].zone === zone && !used.has(k)) {
      used.add(k);
      return k;
    }
    return null;
  };
  for (const it of items) {
    const zone = zoneOf(it.slot);
    const k = zone ? pick(zone) : null;
    if (k == null) continue;
    const S = RACK_SLOTS[k];
    const obj = ppeModel(it.id, it.defect);
    // hanging items hang from the hook (1.62 m) by their hanger, strap or loop
    obj.position.set(S.at[0], S.hang ? 1.62 - (obj.userData.hangTop ?? 0.2) : S.at[1] + 0.013, S.at[2]);
    obj.rotation.y = S.ry;
    if (it.slot === 'hands' || it.slot === 'legs') obj.rotation.y = S.ry + Math.PI / 2;
    obj.userData.ppe = it;
    ws.rack.add(obj);
    ws.rackSlots.push({ ...it, k, obj, home: obj.position.clone(), homeRot: obj.rotation.clone() });
  }
}
