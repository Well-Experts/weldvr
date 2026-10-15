// Oxy-fuel cutting torch: a torch handle (oxygen and fuel valves at the hose end, reverse-flow check valves and
// flashback arrestors built into the handle as on an "FC" model) with a cutting attachment (preheat oxygen
// valve, cutting oxygen lever, tubes to a 75 degree head) and a one-piece cutting tip. In controller
// target-ray space (-Z forward, +Y up, metres), with the same interface as the welding guns (render/torch.js):
// `kin` (T = centre of the tip face, the jet origin; D = jet axis), tipLocal / axisLocal, cableEnd (the hose
// end), plus setLever(), setValves(), setTipHeat(), setTip().
//
// Shapes and colours: Victor 0056-3260 4.02 ("The oxygen hose is normally green and the fuel hose is red");
// Smith 6-3 (fuel hose nuts left-hand threaded "with a groove around the nut"); the 75 degree head and the
// dimensions are a typical hand cutting torch of about 0.5 m (display, not a specification).

import * as THREE from 'three';
import { mergeStatic } from './merge.js';

export const HEAD_ANGLE = 75; // deg between the torch body and the tip axis

export function cutTorchKinematics() {
  const th = (HEAD_ANGLE * Math.PI) / 180;
  const H = new THREE.Vector3(0, -0.006, -0.43); // head centre
  const D = new THREE.Vector3(0, -Math.sin(th), -Math.cos(th)).normalize();
  const TIP_LEN = 0.052;
  return { H, D, th, TIP_LEN, T: H.clone().addScaledVector(D, TIP_LEN) };
}

function knurlTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b9bcc0';
  x.fillRect(0, 0, 64, 256);
  x.strokeStyle = 'rgba(40,42,46,0.55)';
  x.lineWidth = 1.2;
  for (let k = -256; k < 320; k += 6) {
    x.beginPath();
    x.moveTo(0, k);
    x.lineTo(64, k + 64);
    x.stroke();
    x.beginPath();
    x.moveTo(0, k + 64);
    x.lineTo(64, k);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  return t;
}

function tube(r, len, mat, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2; // along Z
  return m;
}

// valve knob with a coloured cap, axis along local Y (the stem)
function knob(color, r = 0.011) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.014, 18), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 }));
  g.add(body);
  // grip ribs
  const ribMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.6 });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.013, 0.003), ribMat);
    rib.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    rib.rotation.y = -a;
    g.add(rib);
  }
  // index mark on the cap (shows the turn)
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0012, r * 0.9), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
  mark.position.set(0, 0.0072, r * 0.4);
  g.add(mark);
  return g;
}

export function buildCutTorch(opts = {}) {
  const k = cutTorchKinematics();
  const g = new THREE.Group();
  g.name = 'cutTorch';
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.22, metalness: 0.95 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24f, roughness: 0.32, metalness: 0.9 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8794a, roughness: 0.3, metalness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6, metalness: 0.3 });
  const knurl = new THREE.MeshStandardMaterial({ map: knurlTexture(), roughness: 0.38, metalness: 0.85 });

  const fixed = new THREE.Group();
  // handle: knurled tube from the hose end to the attachment coupling
  const handle = tube(0.0135, 0.2, knurl, 22);
  handle.position.set(0, 0, -0.02);
  fixed.add(handle);
  // hose-end block with the two hose connections (built-in check valves and flashback arrestors) and the
  // two handle valves
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.03), brass);
  block.position.set(0, 0, 0.095);
  fixed.add(block);
  for (const [sx, col, lh] of [[-1, 0x1e7d3c, false], [1, 0xb3221c, true]]) {
    const fit = tube(0.0055, 0.04, brass, 12);
    fit.position.set(sx * 0.0075, -0.002, 0.125);
    fixed.add(fit);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.012, 6), brass);
    nut.rotation.x = Math.PI / 2;
    nut.position.set(sx * 0.0075, -0.002, 0.143);
    fixed.add(nut);
    if (lh) {
      // left-hand thread: groove round the fuel nut (Smith 6-3)
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.0079, 0.0007, 6, 18), dark);
      groove.position.set(sx * 0.0075, -0.002, 0.143);
      fixed.add(groove);
    }
    // short hose stubs, coloured
    const hose = tube(0.0058, 0.05, new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 }), 12);
    hose.position.set(sx * 0.0075, -0.002, 0.174);
    fixed.add(hose);
  }
  // coupling nut and attachment body
  const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 6), brass);
  coupling.rotation.x = Math.PI / 2;
  coupling.position.set(0, 0, -0.131);
  fixed.add(coupling);
  const body = tube(0.0145, 0.06, chrome, 20);
  body.position.set(0, 0, -0.17);
  fixed.add(body);
  // tubes to the head: cutting oxygen (upper, larger) and preheat mixture (lower)
  const t1 = tube(0.0052, 0.23, chrome, 12);
  t1.position.set(0, 0.0045, -0.315);
  fixed.add(t1);
  const t2 = tube(0.0042, 0.23, chrome, 12);
  t2.position.set(0, -0.0065, -0.315);
  fixed.add(t2);
  // head and the tip nut
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.028, 18), brass);
  head.position.copy(k.H).addScaledVector(k.D, -0.006);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), k.D.clone().negate());
  fixed.add(head);
  const headCap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  headCap.position.copy(k.H).addScaledVector(k.D, -0.02);
  headCap.quaternion.copy(head.quaternion);
  fixed.add(headCap);
  const tipNut = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 6), brass);
  tipNut.position.copy(k.H).addScaledVector(k.D, 0.012);
  tipNut.quaternion.copy(head.quaternion);
  fixed.add(tipNut);
  // lever bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.016), chrome);
  bracket.position.set(0, 0.016, -0.19);
  fixed.add(bracket);
  mergeStatic(fixed);
  g.add(fixed);

  // tip: copper, flat face with the cutting bore and a ring of preheat holes (display)
  const tipG = new THREE.Group();
  const tipBody = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0072, 0.034, 18), copper);
  tipBody.position.y = -0.017;
  tipG.add(tipBody);
  const tipFace = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 24), new THREE.MeshStandardMaterial({ color: 0xb06a40, roughness: 0.4, metalness: 0.9 }));
  tipFace.rotation.x = Math.PI / 2;
  tipFace.position.y = -0.0342;
  tipG.add(tipFace);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 12), holeMat);
  bore.rotation.x = Math.PI / 2;
  bore.position.y = -0.0344;
  tipG.add(bore);
  for (let q = 0; q < 6; q++) {
    const a = (q / 6) * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.00045, 8), holeMat);
    h.rotation.x = Math.PI / 2;
    h.position.set(Math.cos(a) * 0.0032, -0.0344, Math.sin(a) * 0.0032);
    tipG.add(h);
  }
  // tip glow (overheated tip: dull red, display)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3c10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.0059, 0.0059, 0.012, 18), glowMat);
  glow.position.y = -0.029;
  tipG.add(glow);
  // tip axis (local -Y) along D, the face centre at T
  tipG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), k.D);
  tipG.position.copy(k.T).sub(new THREE.Vector3(0, -0.0342, 0).applyQuaternion(tipG.quaternion));
  g.add(tipG);

  // valves: handle oxygen (green) and fuel (red) knobs at the hose end, preheat oxygen knob on the
  // attachment; each turns about its stem
  const valves = {};
  const mkValve = (name, color, pos, stemDir) => {
    const kn = knob(color);
    const holder = new THREE.Group();
    holder.position.copy(pos);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stemDir);
    holder.add(kn);
    g.add(holder);
    valves[name] = { knob: kn, holder, turns: 0 };
  };
  mkValve('oxygen', 0x1e7d3c, new THREE.Vector3(-0.024, 0, 0.095), new THREE.Vector3(-1, 0, 0));
  mkValve('fuel', 0xb3221c, new THREE.Vector3(0.024, 0, 0.095), new THREE.Vector3(1, 0, 0));
  mkValve('preheat', 0x1e7d3c, new THREE.Vector3(0.026, -0.002, -0.165), new THREE.Vector3(1, 0, 0));

  // cutting oxygen lever on top of the attachment, hinged at the front (presses the valve at the back)
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.022, -0.2);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.13), chrome);
  lever.position.set(0, 0.0, 0.062);
  leverPivot.add(lever);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.03), dark);
  pad.position.set(0, 0.003, 0.11);
  leverPivot.add(pad);
  g.add(leverPivot);

  const cableEnd = new THREE.Object3D();
  cableEnd.position.set(0, -0.002, 0.2);
  g.add(cableEnd);

  const api = {
    group: g,
    kin: k,
    cableEnd,
    tipLocal: k.T.clone(),
    axisLocal: k.D.clone(),
    valves,
    tip: '0',
    lever: 0,
    // knob positions in the group frame (for VR grabbing)
    knobPoint(name) {
      return valves[name].holder.position.clone();
    },
    setLever(x) {
      this.lever = x;
      // the lever's back end is pressed down onto the valve (about 9 degrees)
      leverPivot.rotation.x = -0.16 * Math.max(0, Math.min(1, x));
    },
    setValves(v) {
      for (const n of ['oxygen', 'fuel', 'preheat']) {
        if (v[n] == null) continue;
        valves[n].turns = v[n];
        // opening turns counterclockwise seen from the knob end
        valves[n].knob.rotation.y = v[n] * Math.PI * 2;
      }
    },
    setTipHeat(h) {
      glowMat.opacity = Math.max(0, Math.min(0.85, (h - 0.6) * 0.5));
    },
    setTip(size) {
      this.tip = size;
    },
    setTrigger(x) {
      this.setLever(x);
    },
    setStickOut() {},
  };
  return api;
}

// Spark lighter (friction lighter): a cup with a flint striker, held in the off hand. Victor 0056-0138 4.01
// step 14 ("ignite the gas with a spark lighter"); Smith 9-2 ("Do not use matches or a cigarette lighter").
export function buildSparkLighter() {
  const g = new THREE.Group();
  g.name = 'sparkLighter';
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.4, metalness: 0.9 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.011, 0.026, 18, 1, true), steel);
  cup.rotation.x = Math.PI / 2;
  cup.position.set(0, 0, -0.07);
  g.add(cup);
  const wire = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0016, 6, 24, Math.PI), steel);
  wire.rotation.y = Math.PI / 2;
  wire.position.set(0, 0, -0.035);
  g.add(wire);
  const flint = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }));
  flint.position.set(0, -0.012, -0.072);
  g.add(flint);
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 0, -0.084);
  g.add(mouth);
  return { group: g, mouth };
}
