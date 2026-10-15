// SMAW electrode holder ("stinger") with a covered electrode, in controller target-ray space
// (-Z forward, +Y up), with the same interface as the MIG gun (render/torch.js): `kin` (T = electrode
// tip, D = electrode axis), tipLocal / axisLocal, cableEnd, and setStickOut(), which here sets the
// electrode length beyond the jaws. The holder is a fully insulated jaw type: OSHA 1926.351(a)(2)
// (current-carrying parts in the grip and the outer surfaces of the jaws "fully insulated against the
// maximum voltage encountered to ground"); AWS Fact Sheet No. 5: "Use fully insulated electrode holders".

import * as THREE from 'three';
import { mergeStatic } from './merge.js';

// Coating outer diameter relative to the core wire (visual only).
const COAT = { cellulosic: 1.45, rutile: 1.55, basic: 1.65 };
const COLORS = { E6010: 0xc9a98a, E6013: 0x8f8a7c, E7018: 0x70757b };

export function stingerKinematics(angleDeg = 45) {
  const th = (angleDeg * Math.PI) / 180;
  // jaw point where the electrode leaves the holder, a little ahead of the handle
  const J = new THREE.Vector3(0, 0.012, -0.075);
  const D = new THREE.Vector3(0, -Math.sin(th), -Math.cos(th));
  return { J, D, th, T: J.clone().addScaledVector(D, 0.3) };
}

function coatingTexture(type) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const x = c.getContext('2d');
  const base = new THREE.Color(COLORS[type] || COLORS.E7018);
  x.fillStyle = `#${base.getHexString()}`;
  x.fillRect(0, 0, 64, 512);
  // fine mottling of the flux coating
  for (let i = 0; i < 1400; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},${0.04 + Math.random() * 0.05})`;
    x.fillRect(Math.random() * 64, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // classification printed near the holder end. Along the rod, texture v = 0 is the holder end and
  // v = 1 the tip (canvas bottom = v 0 with flipY): the print goes near the canvas bottom.
  x.save();
  x.translate(40, 395);
  x.rotate(Math.PI / 2);
  x.fillStyle = 'rgba(20,20,20,0.75)';
  x.font = 'bold 22px sans-serif';
  x.fillText(type, 0, 0);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStinger(opts = {}) {
  const k = stingerKinematics(opts.angle ?? 45);
  const g = new THREE.Group();
  g.name = 'stinger';
  const red = new THREE.MeshStandardMaterial({ color: 0x9e1b14, roughness: 0.55, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7, metalness: 0.05 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc27a45, roughness: 0.35, metalness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9399, roughness: 0.35, metalness: 0.9 });

  // insulated handle along the grip, tilted like the controller grip (about 45 degrees)
  const hp = [];
  for (let q = 0; q <= 14; q++) {
    const y = -0.08 + (0.16 * q) / 14;
    const r = 0.016 + 0.003 * Math.sin((q / 14) * Math.PI) + 0.0015 * Math.cos((q / 14) * Math.PI * 4);
    hp.push(new THREE.Vector2(r, y));
  }
  const handle = new THREE.Mesh(new THREE.LatheGeometry(hp, 22), red);
  handle.position.set(0, -0.03, 0.055);
  handle.rotation.x = -Math.PI / 4;
  g.add(handle);
  // finger guard ring between the handle and the jaw head
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.024, 0.012, 22), black);
  guard.position.set(0, 0.022, -0.002);
  guard.rotation.x = -Math.PI / 4;
  g.add(guard);
  // jaw head: insulated lower jaw and the spring lever on top, copper contact faces at the grooves
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.07), red);
  head.position.set(0, 0.022, -0.04);
  head.rotation.x = 0.18;
  g.add(head);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.01, 0.085), black);
  lever.position.set(0, 0.04, -0.02);
  lever.rotation.x = 0.32;
  g.add(lever);
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), steel);
  spring.position.set(0, 0.034, 0.012);
  spring.rotation.y = Math.PI / 2;
  g.add(spring);
  for (const sy of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.012), copper);
    jaw.position.copy(k.J).add(new THREE.Vector3(0, 0.006 * sy, 0.008));
    g.add(jaw);
  }
  // cable entry at the back of the handle
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.045, 14), black);
  boot.position.set(0, -0.098, 0.124);
  boot.rotation.x = -Math.PI / 4;
  g.add(boot);
  const cableEnd = new THREE.Object3D();
  cableEnd.position.set(0, -0.115, 0.14);
  g.add(cableEnd);
  mergeStatic(g);

  // electrode: coated rod (length set per frame), bare core stub when used up, glowing tip
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.D);
  const coatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1), coatMat);
  rod.quaternion.copy(align);
  g.add(rod);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x302a26, roughness: 0.6, metalness: 0.3, emissive: 0x000000 });
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1), tipMat);
  tip.quaternion.copy(align);
  g.add(tip);

  const tipLocal = k.T.clone();
  const api = {
    group: g,
    kin: k,
    cableEnd,
    tipLocal,
    axisLocal: k.D.clone(),
    type: null,
    dia: 3.2,
    L: 300,
    setElectrode(type, dia) {
      if (type !== this.type) {
        coatMat.map?.dispose();
        coatMat.map = coatingTexture(type);
        coatMat.needsUpdate = true;
        this.type = type;
      }
      this.dia = dia;
      this.coat = COAT[{ E6010: 'cellulosic', E6013: 'rutile', E7018: 'basic' }[type]] || 1.6;
      this.setStickOut(this.L, false);
    },
    // Electrode length beyond the jaws (mm). hot: arc burning (glowing tip); stuck: frozen to the work.
    setStickOut(mm, hot, stuck = false) {
      const L = Math.max(1, mm) / 1000;
      this.L = mm;
      const r = (this.dia * (this.coat || 1.6)) / 2000;
      rod.scale.set(r, L, r);
      rod.position.copy(k.J).addScaledVector(k.D, L / 2);
      // the coating texture stays fixed to the holder end as the tip burns back: show only the part
      // of it that is left (v 0 at the holder end)
      if (coatMat.map) {
        coatMat.map.repeat.set(1, Math.min(1, mm / 330));
        coatMat.map.offset.set(0, 0);
      }
      const tl = 0.0025;
      tip.scale.set(r * 0.98, tl, r * 0.98);
      tip.position.copy(k.J).addScaledVector(k.D, L - tl / 2 + 0.0002);
      k.T.copy(k.J).addScaledVector(k.D, L);
      tipLocal.copy(k.T);
      const glow = hot ? 1 : stuck ? 0.55 : 0;
      tipMat.emissive.setRGB(glow, glow * 0.38, glow * 0.08);
      tipMat.emissiveIntensity = glow ? 1.6 : 0;
    },
    setTrigger() {},
  };
  api.setElectrode(opts.type || 'E7018', opts.dia || 3.2);
  api.setStickOut(opts.length ?? 325, false);
  return api;
}
