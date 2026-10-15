// GMAW / FCAW gun model in controller target-ray space (-Z forward, +Y up).
// The handle sits on the controller grip; the barrel runs forward and a gooseneck bends the
// nozzle down by `neckAngle`. Returns the contact-tip position and wire axis for the simulation.

import * as THREE from 'three';
import { mergeStatic } from './merge.js';

export function gunKinematics(neckAngleDeg = 45) {
  const th = (neckAngleDeg * Math.PI) / 180;
  const R = 0.05;
  const S = new THREE.Vector3(0, 0.019, -0.095); // gooseneck start (front of the barrel)
  const C = S.clone().add(new THREE.Vector3(0, -R, 0));
  const E = C.clone().add(new THREE.Vector3(0, R * Math.cos(th), -R * Math.sin(th)));
  const D = new THREE.Vector3(0, -Math.sin(th), -Math.cos(th));
  const nozzleLen = 0.062;
  const N = E.clone().addScaledVector(D, nozzleLen);
  const T = N.clone().addScaledVector(D, -0.003); // contact tip recessed 3 mm
  return { S, C, E, D, N, T, R, th, nozzleLen };
}

export function buildGun(opts = {}) {
  const k = gunKinematics(opts.neckAngle ?? 45);
  const g = new THREE.Group();
  g.name = 'gun';
  const black = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.75, metalness: 0.05 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.92, metalness: 0.0 });
  const brand = new THREE.MeshStandardMaterial({ color: 0xc8501e, roughness: 0.6, metalness: 0.1 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc9844f, roughness: 0.32, metalness: 1.0 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.24, metalness: 1.0, vertexColors: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb59a5a, roughness: 0.35, metalness: 0.95 });

  // ergonomic handle (lathe profile) along the grip axis, tilted about 45 deg
  const hp = [];
  for (let q = 0; q <= 14; q++) {
    const y = -0.07 + (0.14 * q) / 14;
    const r = 0.0165 + 0.0035 * Math.sin((q / 14) * Math.PI) - 0.0015 * Math.cos((q / 14) * Math.PI * 3);
    hp.push(new THREE.Vector2(r, y));
  }
  const handle = new THREE.Mesh(new THREE.LatheGeometry(hp, 22), rubber);
  handle.position.set(0, -0.03, 0.055);
  handle.rotation.x = -Math.PI / 4;
  g.add(handle);
  // grip rings
  for (let q = 0; q < 5; q++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.0012, 6, 22), black);
    const y = -0.045 + q * 0.018;
    ring.position.set(0, -0.03 + y * Math.cos(Math.PI / 4), 0.055 + y * Math.sin(Math.PI / 4));
    ring.rotation.x = Math.PI / 4;
    g.add(ring);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.025, 20), brand);
  collar.position.set(0, 0.012, 0.012);
  collar.rotation.x = -Math.PI / 4;
  g.add(collar);
  // trigger and guard
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.012), black);
  trig.position.set(0, -0.012, -0.002);
  trig.rotation.x = -0.4;
  g.add(trig);
  g.userData.trigger = trig;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0022, 6, 16, Math.PI), black);
  guard.position.set(0, -0.02, 0.004);
  guard.rotation.set(0, Math.PI / 2, -0.6);
  g.add(guard);
  // barrel + gooseneck as one tube, with an insulating sleeve near the nozzle
  const pts = [];
  pts.push(new THREE.Vector3(0, 0.02, 0.01));
  pts.push(k.S.clone());
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const a = (k.th * i) / steps;
    pts.push(k.C.clone().add(new THREE.Vector3(0, k.R * Math.cos(a), -k.R * Math.sin(a))));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0085, 14, false), black);
  g.add(neck);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.016, 16), brass);
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.D);
  sleeve.quaternion.copy(align);
  sleeve.position.copy(k.E).addScaledVector(k.D, -0.004);
  g.add(sleeve);
  // nozzle (lathe) with a darkened, spatter-crusted mouth; insulator and contact tip inside
  const prof = [
    new THREE.Vector2(0.0098, 0), new THREE.Vector2(0.0108, 0.004), new THREE.Vector2(0.0106, 0.04),
    new THREE.Vector2(0.0094, k.nozzleLen), new THREE.Vector2(0.0079, k.nozzleLen), new THREE.Vector2(0.008, 0.01),
    new THREE.Vector2(0.0086, 0),
  ];
  const nozGeo = new THREE.LatheGeometry(prof, 28);
  const nc = [];
  const npos = nozGeo.attributes.position;
  for (let i = 0; i < npos.count; i++) {
    const y = npos.getY(i);
    const soot = Math.max(0, (y - k.nozzleLen * 0.72) / (k.nozzleLen * 0.28));
    const c = 1 - 0.75 * soot;
    nc.push(c, c * 0.97, c * 0.92);
  }
  nozGeo.setAttribute('color', new THREE.Float32BufferAttribute(nc, 3));
  const nozzle = new THREE.Mesh(nozGeo, chrome);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0034, 0.024, 12), copper);
  nozzle.quaternion.copy(align);
  nozzle.position.copy(k.E);
  tip.quaternion.copy(align);
  tip.position.copy(k.T).addScaledVector(k.D, -0.012);
  g.add(nozzle, tip);
  // wire (stick-out), scaled along its length each frame, and the frozen ball left on its end
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.35, metalness: 1.0, emissive: 0x000000 });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 1, 6), wireMat);
  wire.quaternion.copy(align);
  g.add(wire);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.00085, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.7 }));
  g.add(ball);
  // cable boot below the handle; the gun cable (render/kit.js) continues from `cableEnd`
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.016, 0.05, 14), rubber);
  boot.position.set(0, -0.092, 0.118);
  boot.rotation.x = -Math.PI / 4;
  g.add(boot);
  const cableEnd = new THREE.Object3D();
  cableEnd.position.set(0, -0.11, 0.137);
  g.add(cableEnd);
  // one draw call per material for the fixed parts (trigger, wire and ball move)
  mergeStatic(g, [trig, wire, ball]);

  const api = {
    group: g,
    kin: k,
    wire,
    cableEnd,
    // contact-tip and wire axis in gun-local space
    tipLocal: k.T.clone(),
    axisLocal: k.D.clone(),
    setStickOut(mm, hot) {
      const L = Math.max(0.5, mm) / 1000;
      wire.scale.set(1, L, 1);
      wire.position.copy(k.T).addScaledVector(k.D, L / 2);
      wireMat.emissive.setRGB(hot ? 1.0 : 0, hot ? 0.35 : 0, hot ? 0.05 : 0);
      wireMat.emissiveIntensity = hot ? 1.5 : 0;
      ball.position.copy(k.T).addScaledVector(k.D, L);
      ball.visible = !hot;
    },
    setTrigger(v) {
      trig.rotation.x = -0.4 + 0.35 * v;
    },
  };
  api.setStickOut(15, false);
  return api;
}

// Inverse: target-ray pose that puts the contact tip at `tipW` with wire along `dirW`,
// rolling the gun so its up axis stays as close as possible to `upW`.
export function rayPoseForTip(kin, tipW, dirW, upW = new THREE.Vector3(0, 1, 0)) {
  const d = dirW.clone().normalize();
  // build target basis: local axis D maps to d; local +Y (projected) maps toward upW
  const Dl = kin.D.clone();
  const Yl = new THREE.Vector3(0, 1, 0).addScaledVector(Dl, -Dl.y).normalize();
  const Xl = new THREE.Vector3().crossVectors(Yl, Dl).normalize();
  const Yw = upW.clone().addScaledVector(d, -upW.dot(d));
  if (Yw.lengthSq() < 1e-6) Yw.set(0, 0, 1).addScaledVector(d, -d.z);
  Yw.normalize();
  const Xw = new THREE.Vector3().crossVectors(Yw, d).normalize();
  const Ml = new THREE.Matrix4().makeBasis(Xl, Yl, Dl);
  const Mw = new THREE.Matrix4().makeBasis(Xw, Yw, d);
  const R = Mw.multiply(Ml.clone().transpose());
  const q = new THREE.Quaternion().setFromRotationMatrix(R);
  const pos = tipW.clone().sub(kin.T.clone().applyQuaternion(q));
  return { position: pos, quaternion: q };
}
