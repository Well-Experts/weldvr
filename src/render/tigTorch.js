// GTAW (TIG) torch in controller target-ray space (-Z forward, +Y up): an air-cooled torch with a
// ribbed handle on the grip, a fingertip amperage control on the handle (Miller: "A foot pedal or
// torch-mounted amperage control will be used for starting, modulating and stopping the flow of
// current"), a rigid head angled to the handle, a long back cap, collet body, a #8 alumina cup (12.7 mm
// inside diameter: at least 3 x the 2.4 mm tungsten, Miller) and the tungsten with its ground point.
// Same interface as the MIG gun (render/torch.js): kin (T = tungsten tip, D = tungsten axis), tipLocal,
// axisLocal, cableEnd, setStickOut(mm, hot), setTrigger(v); plus setTungsten(state).

import * as THREE from 'three';
import { mergeStatic } from './merge.js';

export function tigKinematics(stickOut = 5, headAngle = 65) {
  const th = (headAngle * Math.PI) / 180;
  const H = new THREE.Vector3(0, 0.024, -0.072); // head centre
  const D = new THREE.Vector3(0, -Math.sin(th), -Math.cos(th));
  const cupLen = 0.034; // head centre to cup mouth along D
  const M = H.clone().addScaledVector(D, cupLen); // cup mouth centre
  const T = M.clone().addScaledVector(D, stickOut / 1000);
  return { H, D, M, T, th, cupLen };
}

export function buildTigTorch(opts = {}) {
  const k = tigKinematics(opts.stickOut ?? 5, opts.headAngle ?? 65);
  const g = new THREE.Group();
  g.name = 'tigTorch';
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.9, metalness: 0.0 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55, metalness: 0.15 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xd9a596, roughness: 0.75, metalness: 0.0 }); // alumina cup
  const brass = new THREE.MeshStandardMaterial({ color: 0xb59a5a, roughness: 0.35, metalness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5, metalness: 0.1 });
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.D);

  // ribbed handle along the grip (tilted about 45 deg like the controller grip)
  const hp = [];
  for (let q = 0; q <= 24; q++) {
    const y = -0.075 + (0.15 * q) / 24;
    const r = 0.0135 + 0.0012 * Math.cos(q * Math.PI * 0.9) + 0.0015 * Math.sin((q / 24) * Math.PI);
    hp.push(new THREE.Vector2(r, y));
  }
  const handle = new THREE.Mesh(new THREE.LatheGeometry(hp, 20), rubber);
  handle.position.set(0, -0.03, 0.05);
  handle.rotation.x = -Math.PI / 4;
  g.add(handle);
  // neck from the handle to the head
  const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.018, 0.0), new THREE.Vector3(0, 0.026, -0.035), k.H.clone()]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.0085, 12, false), black);
  g.add(neck);
  // head body, back cap, collet body (brass) and the cup, all on the tungsten axis
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 18), black);
  head.quaternion.copy(align);
  head.position.copy(k.H);
  g.add(head);
  const capPts = [];
  for (let q = 0; q <= 10; q++) {
    const yy = (0.065 * q) / 10;
    capPts.push(new THREE.Vector2(0.0095 - 0.0015 * (q / 10) + (q === 10 ? -0.004 : 0), yy));
  }
  const backCap = new THREE.Mesh(new THREE.LatheGeometry(capPts, 16), black);
  backCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.D.clone().negate());
  backCap.position.copy(k.H).addScaledVector(k.D, -0.014);
  g.add(backCap);
  const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0065, 0.016, 14), brass);
  collet.quaternion.copy(align);
  collet.position.copy(k.H).addScaledVector(k.D, 0.02);
  g.add(collet);
  // #8 cup: inside diameter 12.7 mm at the mouth, tapered outside
  const cupProf = [
    new THREE.Vector2(0.0098, 0), new THREE.Vector2(0.0102, 0.004), new THREE.Vector2(0.0092, 0.022),
    new THREE.Vector2(0.0078, 0.0225), new THREE.Vector2(0.0064, 0.0225), new THREE.Vector2(0.0066, 0.004), new THREE.Vector2(0.0072, 0),
  ];
  const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProf, 24), ceramic);
  cup.quaternion.copy(align);
  cup.position.copy(k.H).addScaledVector(k.D, k.cupLen - 0.0225);
  g.add(cup);
  // fingertip amperage control on top of the handle (slider)
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.05), black);
  track.position.set(0, 0.0, 0.03);
  track.rotation.x = -Math.PI / 4;
  g.add(track);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.012), red);
  g.add(knob);
  // cable boot
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.04, 14), rubber);
  boot.position.set(0, -0.09, 0.115);
  boot.rotation.x = -Math.PI / 4;
  g.add(boot);
  const cableEnd = new THREE.Object3D();
  cableEnd.position.set(0, -0.105, 0.13);
  g.add(cableEnd);
  mergeStatic(g, [knob]);

  // tungsten: rod from inside the collet to the ground point (2.4 mm), its point a cone
  const tungMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 1.0, emissive: 0x000000 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), tungMat);
  rod.quaternion.copy(align);
  g.add(rod);
  const point = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 10), tungMat);
  point.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), k.D);
  g.add(point);

  const api = {
    group: g,
    kin: k,
    cableEnd,
    tipLocal: k.T.clone(),
    axisLocal: k.D.clone(),
    stickOut: opts.stickOut ?? 5,
    dia: opts.tdia ?? 2.4,
    // tungsten beyond the cup (mm); hot: glowing after the arc
    setStickOut(mm, hot = 0) {
      this.stickOut = mm;
      const r = this.dia / 2000;
      const pl = Math.min(0.006, (2.5 * this.dia) / 1000); // ground point length about 2.5 x diameter (Miller)
      const start = k.H.clone().addScaledVector(k.D, 0.012);
      k.T.copy(k.M).addScaledVector(k.D, mm / 1000);
      const len = start.distanceTo(k.T) - pl;
      rod.scale.set(r, len, r);
      rod.position.copy(start).addScaledVector(k.D, len / 2);
      point.scale.set(r, pl, r);
      point.position.copy(k.T).addScaledVector(k.D, -pl / 2);
      this.tipLocal.copy(k.T);
      const h = typeof hot === 'number' ? hot : hot ? 1 : 0;
      tungMat.emissive.setRGB(h, h * 0.45, h * 0.15);
      tungMat.emissiveIntensity = h ? 1.4 : 0;
    },
    setTrigger(v) {
      knob.position.set(0, 0.006 - 0.012 * v * 0.7, 0.045 - 0.025 * v);
      knob.rotation.x = -Math.PI / 4;
    },
    // tungsten state: 'clean' | 'contaminated' (dark, balled with steel) | 'oxidized' (blue-black)
    setTungsten(state) {
      if (state === this.state) return;
      this.state = state;
      tungMat.color.setHex(state === 'contaminated' ? 0x4a4038 : state === 'oxidized' ? 0x37435a : 0xb8bcc2);
      tungMat.roughness = state === 'clean' ? 0.3 : 0.7;
    },
  };
  api.setStickOut(api.stickOut, 0);
  api.setTrigger(0);
  api.setTungsten('clean');
  return api;
}
