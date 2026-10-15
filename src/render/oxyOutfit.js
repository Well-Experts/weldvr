// The oxy-acetylene outfit beside the cutting bench (bench frame, metres): a cylinder cart with the oxygen and
// the acetylene cylinder chained upright, valve protection caps, the cylinder valves (oxygen handwheel; the
// acetylene valve's T-wrench, left on the stem while the cylinder is in use: OSHA 1910.253(b)(5)(iii)(L)),
// a single-stage regulator on each with its high-pressure (inlet) and low-pressure (delivery) gauges and the
// adjusting T-screw, and the green oxygen and red fuel hoses to the torch (Victor 0056-3260 4.02: "The oxygen
// hose is normally green and the fuel hose is red"). Oxygen gauges are marked "USE NO OIL" (OSHA
// 1910.253(e)(6)(iii): "Gages on oxygen regulators shall be marked 'USE NO OIL.'"); the acetylene delivery
// gauge carries a red band above 15 psig (the OSHA 1910.253(a)(2) limit). Cylinder shapes and colours are
// display values (colour is not the identification: read the label).

import * as THREE from 'three';
import { Rope } from './kit.js';
import { mergeStatic } from './merge.js';
import { PSI_KPA } from '../sim/ofc.js';

// dial face: scale 0..max over 270 degrees (psi outer, kPa inner)
function dialTexture({ max, major, label, unit = 'psi', red = null, noOil = false }) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f2ea';
  x.beginPath();
  x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#1b1b1b';
  x.lineWidth = 6;
  x.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + ((a1 - a0) * v) / max;
  if (red != null) {
    x.strokeStyle = '#c4161c';
    x.lineWidth = 14;
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 22, ang(red), a1);
    x.stroke();
  }
  x.strokeStyle = '#1b1b1b';
  x.fillStyle = '#1b1b1b';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let v = 0; v <= max + 1e-6; v += major / 5) {
    const a = ang(v);
    const isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r0 = S / 2 - 14, r1 = r0 - (isMaj ? 16 : 8);
    x.lineWidth = isMaj ? 3 : 1.5;
    x.beginPath();
    x.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    x.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
    x.stroke();
    if (isMaj) {
      x.font = 'bold 19px sans-serif';
      x.fillText(String(Math.round(v)), S / 2 + Math.cos(a) * (r1 - 16), S / 2 + Math.sin(a) * (r1 - 16));
    }
  }
  // inner kPa scale (every major in psi converted)
  x.fillStyle = '#7a1414';
  x.font = '13px sans-serif';
  for (let v = major; v <= max + 1e-6; v += major) {
    const a = ang(v);
    x.fillText(String(Math.round((v * PSI_KPA) / 10) * 10), S / 2 + Math.cos(a) * 62, S / 2 + Math.sin(a) * 62);
  }
  x.fillStyle = '#1b1b1b';
  x.font = 'bold 18px sans-serif';
  x.fillText(label, S / 2, S / 2 + 46);
  x.font = '13px sans-serif';
  x.fillText(`${unit} / kPa`, S / 2, S / 2 + 66);
  if (noOil) {
    x.fillStyle = '#c4161c';
    x.font = 'bold 15px sans-serif';
    x.fillText('USE NO OIL', S / 2, S / 2 - 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function labelTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = fg;
  x.font = 'bold 34px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GAUGES = {
  oxygen: { hp: { max: 4000, major: 1000, label: 'OXYGEN', noOil: true }, lp: { max: 200, major: 50, label: 'OXYGEN', noOil: true } },
  fuel: { hp: { max: 400, major: 100, label: 'ACETYLENE' }, lp: { max: 30, major: 5, label: 'ACETYLENE', red: 15 } },
};

function gauge(spec) {
  const g = new THREE.Group();
  const R = 0.032;
  const brass = new THREE.MeshStandardMaterial({ color: 0xbfa25a, roughness: 0.3, metalness: 0.9 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.016, 28), brass);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshStandardMaterial({ map: dialTexture(spec), roughness: 0.5, metalness: 0 }));
  face.position.z = 0.0082;
  g.add(face);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(R + 0.001, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0 }));
  glass.position.z = 0.0098;
  g.add(glass);
  const needle = new THREE.Group();
  const nm = new THREE.Mesh(new THREE.BoxGeometry(0.0016, R * 0.82, 0.0008), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  nm.position.y = R * 0.33;
  needle.add(nm);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  hub.rotation.x = Math.PI / 2;
  needle.add(hub);
  needle.position.z = 0.009;
  g.add(needle);
  return { group: g, needle, max: spec.max };
}

// needle angle for a value (0 at the lower left, full scale at the lower right, 270 degrees clockwise)
function setNeedle(gg, v) {
  const f = Math.max(0, Math.min(1.02, v / gg.max));
  // texture angle a = 0.75 pi + 1.5 pi f measured from +x, clockwise on screen (canvas y down)
  const a = Math.PI * 0.75 + Math.PI * 1.5 * f;
  // needle drawn along +y: rotate to point at canvas angle a (canvas y down -> scene y up: negate)
  gg.needle.rotation.z = -a + Math.PI / 2 - Math.PI;
}

function regulator(gas) {
  const g = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.22, metalness: 0.95 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xbfa25a, roughness: 0.3, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 24), brass);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.045, 24), chrome);
  bonnet.rotation.x = Math.PI / 2;
  bonnet.position.z = 0.045;
  g.add(bonnet);
  // inlet stem down to the cylinder valve outlet
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), brass);
  inlet.rotation.z = Math.PI / 2;
  inlet.position.set(-0.04, 0, 0);
  g.add(inlet);
  const hp = gauge(GAUGES[gas].hp);
  hp.group.position.set(-0.03, 0.055, 0.005);
  hp.group.rotation.x = -0.25;
  g.add(hp.group);
  const lp = gauge(GAUGES[gas].lp);
  lp.group.position.set(0.035, 0.055, 0.005);
  lp.group.rotation.x = -0.25;
  g.add(lp.group);
  for (const gx of [-0.03, 0.035]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10), brass);
    stem.position.set(gx, 0.03, 0);
    g.add(stem);
  }
  // outlet (to the hose) underneath
  const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 10), brass);
  outlet.position.set(0.012, -0.04, 0);
  g.add(outlet);
  const hoseAt = new THREE.Object3D();
  hoseAt.position.set(0.012, -0.058, 0);
  g.add(hoseAt);
  // adjusting T-screw on the bonnet (turned in to raise the delivery pressure)
  const screw = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 10), chrome);
  shank.rotation.x = Math.PI / 2;
  shank.position.z = 0.02;
  screw.add(shank);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 10), new THREE.MeshStandardMaterial({ color: gas === 'oxygen' ? 0x1e7d3c : 0xb3221c, roughness: 0.5 }));
  bar.rotation.z = Math.PI / 2;
  bar.position.z = 0.04;
  screw.add(bar);
  screw.position.z = 0.068;
  g.add(screw);
  return { group: g, hp, lp, screw, hoseAt };
}

function cylinder({ gas, height, r }) {
  const g = new THREE.Group();
  const bodyCol = gas === 'oxygen' ? 0x2a2c30 : 0x7a1f22;
  const mat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.45, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height - r, 32), mat);
  body.position.y = (height - r) / 2;
  g.add(body);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), gas === 'oxygen' ? new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.45, metalness: 0.2 }) : mat);
  sh.position.y = height - r;
  g.add(sh);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.5, metalness: 0.7 }));
  neck.position.y = height + 0.01;
  g.add(neck);
  // label band
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.07, 32, 1, true, -0.6, 1.2), new THREE.MeshStandardMaterial({ map: labelTexture(gas === 'oxygen' ? 'OXYGEN' : 'ACETYLENE', '#f1efe6', '#111'), roughness: 0.6 }));
  lab.position.y = height * 0.62;
  g.add(lab);
  mergeStatic(g);
  // valve: brass body on the neck, outlet to the side
  const valve = new THREE.Group();
  const vb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.035), new THREE.MeshStandardMaterial({ color: 0xbfa25a, roughness: 0.3, metalness: 0.9 }));
  valve.add(vb);
  const out = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), vb.material);
  out.rotation.z = Math.PI / 2;
  out.position.set(0.028, 0.005, 0);
  valve.add(out);
  valve.position.y = height + 0.055;
  g.add(valve);
  // handwheel (oxygen) or square stem with a T-wrench (acetylene); turns about the vertical stem
  const turn = new THREE.Group();
  turn.position.y = height + 0.09;
  if (gas === 'oxygen') {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 8, 24), new THREE.MeshStandardMaterial({ color: 0x1e5d3c, roughness: 0.5, metalness: 0.4 }));
    wheel.rotation.x = Math.PI / 2;
    turn.add(wheel);
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.004, 0.004), wheel.material);
      sp.rotation.y = (k * Math.PI) / 3;
      turn.add(sp);
    }
  } else {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.4, metalness: 0.9 }));
    turn.add(stem);
  }
  g.add(turn);
  let wrench = null;
  if (gas === 'fuel') {
    wrench = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.018), new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.8 }));
    wrench.add(sock);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.012), sock.material);
    arm.position.y = 0.012;
    wrench.add(arm);
    turn.add(wrench);
  }
  // valve protection cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 24, 1, false), new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.5, metalness: 0.6 }));
  cap.position.y = height + 0.07;
  g.add(cap);
  const regAt = new THREE.Object3D();
  regAt.position.set(0.075, height + 0.06, 0);
  g.add(regAt);
  return { group: g, turn, wrench, cap, regAt, height };
}

export class OutfitView {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'oxyOutfit';
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.65 });
    // cart: base plate, two uprights, top rail, wheels
    const cart = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.34), steel);
    base.position.y = 0.06;
    cart.add(base);
    for (const sx of [-0.26, 0.26]) {
      const up = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.15, 0.03), steel);
      up.position.set(sx, 0.62, -0.15);
      cart.add(up);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 20), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx + Math.sign(sx) * 0.04, 0.075, -0.12);
      cart.add(wheel);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.03), steel);
    rail.position.set(0, 1.18, -0.15);
    cart.add(rail);
    const rail2 = rail.clone();
    rail2.position.y = 0.55;
    cart.add(rail2);
    mergeStatic(cart);
    this.group.add(cart);
    this.cyl = {
      oxygen: cylinder({ gas: 'oxygen', height: 1.3, r: 0.1 }),
      fuel: cylinder({ gas: 'fuel', height: 1.02, r: 0.13 }),
    };
    this.cyl.oxygen.group.position.set(-0.13, 0.075, 0);
    this.cyl.fuel.group.position.set(0.15, 0.075, 0);
    for (const g of ['oxygen', 'fuel']) this.group.add(this.cyl[g].group);
    // chains round the cylinders to the uprights (two heights)
    this.chains = [];
    const linkMat = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.35, metalness: 0.9 });
    for (const y of [0.55, 0.95]) {
      const ch = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.004, 6, 48, Math.PI), linkMat);
      ch.rotation.x = Math.PI / 2;
      ch.scale.set(1, 0.62, 1);
      ch.position.set(0, y, -0.15);
      this.group.add(ch);
      this.chains.push(ch);
    }
    // regulators
    this.reg = { oxygen: regulator('oxygen'), fuel: regulator('fuel') };
    for (const g of ['oxygen', 'fuel']) {
      const r = this.reg[g];
      this.cyl[g].regAt.add(r.group);
      r.group.rotation.y = -Math.PI / 2; // gauges and screw facing the front (+z of the cart)
    }
    // hoses to the torch (green oxygen, red fuel)
    this.hoses = {
      oxygen: new Rope({ n: 28, length: 3.2, radius: 0.0055, color: 0x1e7d3c, sides: 8, sub: 2 }),
      fuel: new Rope({ n: 28, length: 3.2, radius: 0.0055, color: 0xb3221c, sides: 8, sub: 2 }),
    };
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
  }

  // the hoses live in the bench frame: add them to the same parent as the outfit
  attachHoses(parent) {
    for (const g of ['oxygen', 'fuel']) parent.add(this.hoses[g].mesh);
  }

  setFloor(y) {
    for (const g of ['oxygen', 'fuel']) this.hoses[g].floorY = y;
  }

  // positions (bench frame) of the controls, for VR grabbing and labels
  controlPoint(id, out = new THREE.Vector3()) {
    const [kind, gas] = id.split('.');
    this.group.updateWorldMatrix(true, true);
    let o = null;
    if (kind === 'cyl') o = this.cyl[gas].turn;
    else if (kind === 'reg') o = this.reg[gas].screw;
    else if (kind === 'gauge') o = this.reg[gas].lp.group;
    if (!o) return null;
    o.getWorldPosition(out);
    return out;
  }

  // o: GasOutfit; torchEnd: world position of the torch hose end (or null to let the hoses hang); parent: the
  // bench frame object (for world -> bench)
  update(dt, o, torchEnd, parent) {
    for (const g of ['oxygen', 'fuel']) {
      const c = o.cyl[g];
      const v = this.cyl[g];
      v.cap.visible = c.cap;
      v.turn.rotation.y = -c.open * Math.PI * 2;
      if (v.wrench) v.wrench.visible = c.wrench;
      const r = this.reg[g];
      r.group.visible = c.regOn;
      r.screw.position.z = 0.068 + 0.0015 * o.reg[g].turns;
      r.screw.rotation.z = o.reg[g].turns * Math.PI * 2;
      setNeedle(r.hp, o.inlet(g));
      setNeedle(r.lp, o.delivery(g));
    }
    for (const ch of this.chains) ch.visible = o.cyl.oxygen.secured && o.cyl.fuel.secured;
    // hoses: from the regulator outlets to the torch (bench frame)
    for (const g of ['oxygen', 'fuel']) {
      const rope = this.hoses[g];
      const a = this.reg[g].hoseAt.getWorldPosition(this.v);
      parent.worldToLocal(a);
      let b;
      if (torchEnd) {
        b = this.w.copy(torchEnd);
        parent.worldToLocal(b);
        b.x += g === 'oxygen' ? -0.006 : 0.006;
      } else b = this.w.copy(a).add(new THREE.Vector3(0.3, -0.5, 0.3));
      rope.pin(a, b);
      rope.step(dt);
      rope.mesh.visible = o.cyl[g].regOn;
    }
  }
}
