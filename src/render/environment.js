// Welding booth, bench, machine, gas cylinder, fume extractor, fan and coupon fixtures.
// Booth parts are hidden in passthrough mode; the bench can be hidden when aligned to a real table.

import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { steelTable, paintedSteel } from './textures.js';

export function buildEnvironment(renderer, scene) {
  const env = { booth: new THREE.Group(), bench: new THREE.Group(), fixtures: new THREE.Group() };
  env.booth.name = 'booth';
  env.bench.name = 'bench';
  // image-based light for metal reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.6;

  // sky/ground fill light; the key light belongs to the workshop (render/workshop.js)
  const hemi = new THREE.HemisphereLight(0xe4ebf4, 0x3a342e, 0.95);
  env.lights = [hemi];
  scene.add(hemi);

  // welding table (bench frame: origin at the table-top centre): 25 mm steel top with a slotted
  // fixture pattern, square-tube legs with cross rails and a lower shelf
  const topMat = new THREE.MeshStandardMaterial({ map: steelTable(), roughness: 0.5, metalness: 0.55, color: 0xb8bcc2 });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.025, 0.65), topMat);
  tableTop.position.set(0, -0.0125, -0.02);
  env.bench.add(tableTop);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.6, metalness: 0.6 });
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.26]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), legMat);
    leg.position.set(sx, -0.47, sz);
    env.bench.add(leg);
  }
  env.tableParts = [tableTop];
  // slots in the top (dark inlays) and the apron rail under the top
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.9, metalness: 0.2 });
  const slots = new THREE.Group();
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.5), slotMat);
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(k * 0.12, 0.0004, -0.02);
    slots.add(sl);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.61), legMat);
  apron.position.set(0, -0.055, -0.02);
  slots.add(apron);
  mergeStatic(slots);
  env.bench.add(slots);
  env.tableParts.push(slots);

  // power source with wire feeder on top (right side of the bench)
  const machine = new THREE.Group();
  machine.name = 'machine';
  const caseMat = new THREE.MeshStandardMaterial({ map: paintedSteel('#1f5fa8', 91, 0.4), roughness: 0.45, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.42), caseMat);
  body.position.set(0, 0.15, 0);
  machine.add(body);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.01), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.2 }));
  front.position.set(0, 0.15, 0.212);
  machine.add(front);
  // louvres on the sides, rubber feet, rear fan grille, output sockets
  const dark = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.7, metalness: 0.2 });
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.18), dark);
    l.position.set(sx * 0.121, 0.08 + k * 0.025, -0.05);
    machine.add(l);
  }
  for (const sx of [-0.09, 0.09]) for (const sz of [-0.17, 0.17]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 10), dark);
    f.position.set(sx, -0.004, sz);
    machine.add(f);
  }
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), dark);
  grille.position.set(0, 0.15, -0.2105);
  grille.rotation.y = Math.PI;
  machine.add(grille);
  for (const sx of [-0.06, 0.06]) {
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 14), new THREE.MeshStandardMaterial({ color: sx < 0 ? 0x111111 : 0xa01818, roughness: 0.5 }));
    sock.rotation.x = Math.PI / 2;
    sock.position.set(sx, 0.035, 0.216);
    machine.add(sock);
  }
  for (const sx of [-0.13, 0.13]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 20, Math.PI), legMat);
    h.position.set(0, 0.32, sx > 0 ? 0.12 : -0.12);
    h.rotation.y = Math.PI / 2;
    machine.add(h);
  }
  machine.position.set(0.44, 0, -0.18);
  machine.rotation.y = -0.35;
  env.bench.add(machine);
  env.machine = machine;
  env.machineFrontAnchor = new THREE.Object3D();
  env.machineFrontAnchor.position.set(0, 0.15, 0.22);
  machine.add(env.machineFrontAnchor);
  mergeStatic(machine);

  // shielding-gas cylinder with regulator/flowmeter (beside the bench, right); its stand and chain
  // are added by the safety system (render/workshop.js buildCylinderStand)
  const cyl = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 28), new THREE.MeshStandardMaterial({ color: 0x3b6e46, roughness: 0.5, metalness: 0.3 }));
  bottle.position.y = 0.625;
  cyl.add(bottle);
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), bottle.material);
  shoulder.position.y = 1.25;
  cyl.add(shoulder);
  const reg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.9 }));
  reg.position.set(0, 1.4, 0.0);
  cyl.add(reg);
  const flow = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6 }));
  flow.position.set(0.0, 1.47, 0.05);
  cyl.add(flow);
  cyl.position.set(0.85, -0.9, -0.25);
  env.bench.add(cyl);
  env.cylinder = cyl;
  env.flowAnchor = new THREE.Object3D();
  env.flowAnchor.position.set(0, 1.47, 0.12);
  cyl.add(env.flowAnchor);
  mergeStatic(cyl);

  // the fume extraction arm is part of the workshop; this point is replaced every frame
  env.extractor = null;

  // fan (draught scenario)
  const fan = new THREE.Group();
  const fanStand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 10), legMat);
  fanStand.position.y = 0.55;
  fan.add(fanStand);
  const fanHead = new THREE.Group();
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 8, 32), legMat);
  fanHead.add(guard);
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.004), new THREE.MeshStandardMaterial({ color: 0x8b9aa8, roughness: 0.4, metalness: 0.4 }));
    b.position.y = 0.09;
    const p = new THREE.Group();
    p.add(b);
    p.rotation.z = (i * Math.PI * 2) / 3;
    blades.add(p);
  }
  fanHead.add(blades);
  fanHead.position.y = 1.12;
  fanHead.rotation.y = Math.PI / 2;
  fan.add(fanHead);
  fan.position.set(-0.95, -0.9, -0.05);
  fan.visible = false;
  env.bench.add(fan);
  env.fan = fan;
  env.fanBlades = blades;

  // wind screens (shown after the trainee erects them)
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x8a2b18, roughness: 0.8, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), screenMat);
  screen.position.set(-0.5, 0.3, -0.05);
  screen.rotation.y = Math.PI / 2;
  screen.visible = false;
  env.bench.add(screen);
  env.screen = screen;

  env.bench.add(env.fixtures);
  return env;
}

// Fixture for the active coupon: post and clamp arm from the bench to the coupon.
export function buildFixture(joint, place) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.55, metalness: 0.65 });
  const o = place.origin;
  if (joint.pipe) return pipeStand(joint, place, g, mat);
  if (joint.position === 'PA' && joint.type === 'fillet') {
    for (const sx of [-0.09, 0.09]) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.14), mat);
      blk.position.set(sx, 0.03, o.z);
      g.add(blk);
    }
  } else if (joint.type === 'butt' && joint.position === 'PA') {
    for (const sx of [-0.1, 0.1]) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.22), mat);
      blk.position.set(sx, 0.025, o.z);
      g.add(blk);
    }
  } else if (o.y > 0.05) {
    const top = Math.max(o.y, joint.vertical ? o.y + (joint.position === 'PG' ? 0 : 0.24) : o.y);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, top + 0.06, 0.04), mat);
    post.position.set(-0.32, (top + 0.06) / 2, -0.12);
    g.add(post);
    const armLen = 0.24;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.03, 0.03), mat);
    arm.position.set(-0.32 + armLen / 2, joint.vertical ? 0.22 : o.y + 0.02, -0.12);
    g.add(arm);
  }
  return g;
}

// Pipe stand: a post on the bench and an arm out to a chuck that holds the end of the first pipe, so the
// joint stands clear in front of the bench with room underneath for the 6 o'clock part (bench metres).
function pipeStand(joint, place, g, mat) {
  const m = place.jointToBench;
  const len = joint.pipe.length;
  const E = new THREE.Vector3(0, -len - 15, 0).applyMatrix4(m); // just beyond the end of the first pipe
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(m);
  const R = joint.pipe.R / 1000;
  // chuck: a short drum round the pipe end, on the pipe axis
  const chuck = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.014, R + 0.014, 0.04, 28), mat);
  chuck.position.copy(E);
  chuck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  g.add(chuck);
  const jaws = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, 0.006, 8, 28), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.8 }));
  jaws.position.copy(E).addScaledVector(axis, 0.024);
  jaws.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  g.add(jaws);
  // post on the bench top behind the front edge, arm out to the chuck
  const postAt = new THREE.Vector3(E.x - 0.06, 0, Math.min(0.2, E.z - 0.12));
  const top = Math.max(0.08, E.y);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, top + 0.03, 0.05), mat);
  post.position.set(postAt.x, (top + 0.03) / 2, postAt.z);
  g.add(post);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.16), mat);
  foot.position.set(postAt.x, 0.006, postAt.z);
  g.add(foot);
  const a0 = new THREE.Vector3(postAt.x, top, postAt.z);
  const a1 = E.clone();
  const armLen = a0.distanceTo(a1);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, armLen), mat);
  arm.position.copy(a0).add(a1).multiplyScalar(0.5);
  arm.lookAt(a1);
  g.add(arm);
  return g;
}
