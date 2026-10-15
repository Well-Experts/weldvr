// Safety at run time: what the trainee wears (PPE rack and dressing), the extraction arm, curtain and
// extinguisher, the hazard props, the per-frame consequence monitor and its effects (pain flash,
// glare and after-image, burn marks on the hands, haptics), and the incident card.

import * as THREE from 'three';
import { Panel, COLORS } from '../ui/ui.js';
import { t } from '../ui/i18n.js';
import { PPE_ITEMS, DEFECTS, checkPPE, protection, standardKit } from './ppe.js';
import { shadeGuide } from './shade.js';
import { SafetyMonitor, INCIDENTS, electrodeChangeShock } from './incidents.js';
import { cites } from './refs.js';
import { HandModel } from '../render/hands.js';
import { InjuryFX } from '../render/injuryFX.js';
import { setRackItems, buildCylinderStand } from '../render/workshop.js';
import { arcState, nominalCTWD } from '../sim/process.js';
import { plateSurface } from '../sim/joint.js';

export const STREET = { torso: { id: 'tshirt' }, legs: { id: 'jeans_cuffed' }, feet: { id: 'trainers' } };
const HEAD_ZONE = ['helmet', 'eyes', 'cap', 'ears', 'resp'];
const BODY_ZONE = ['torso', 'apron', 'cape', 'hands'];
const LOW_ZONE = ['legs', 'feet'];
export const ALL_HAZARDS = ['cylinderLoose', 'cylinderNoCap', 'combustibles', 'extinguisherMissing', 'extinguisherEmpty', 'extinguisherBlocked', 'cableDamaged', 'cableSplice', 'curtainOpen', 'hoodFar', 'wetFloor', 'clampFar', 'holderOnCylinder', 'oxyFuelTogether', 'acetyleneLying', 'oilyRegulator', 'grinderGuard', 'signsMissing', 'hotUnmarked'];
const GRAB_NEAR = 0.14; // m, hand to item for a direct grab (design value)
const GRAB_RAY = 4.0; // m, longest pointing grab (design value)

// Everything on the rack in a normal shift (no defects): the trainee picks what the job needs.
export function fullRack(extra = []) {
  const ids = ['helmet_adf', 'helmet_passive', 'glasses', 'earplugs_fr', 'cap_fr', 'respirator', 'jacket_fr', 'jacket_leather', 'apron', 'cape', 'gloves_gauntlet', 'gloves_tig', 'trousers', 'boots'];
  return ids.map((id) => ({ id, slot: PPE_ITEMS[id].slot, defect: null })).concat(extra);
}

export class SafetySystem {
  constructor(app) {
    this.app = app;
    this.ws = app.workshop;
    this.monitor = new SafetyMonitor();
    this.fx = new InjuryFX();
    app.camera.add(this.fx.group);
    this.hands = { left: new HandModel('left'), right: new HandModel('right') };
    this.worn = { ...STREET };
    this.held = { left: null, right: null };
    this.rejected = [];
    this.actions = []; // dressing log for the drills
    this.levGrab = null;
    this.interact = true; // grabbing PPE, the hood and the curtain (off during the hazard hunt)
    this.taskOverride = null; // the job the PPE is checked against (Safety drills)
    this.levBroken = false;
    this.cardQueue = [];
    this.cardT = 0;
    this.card = new Panel({ name: 'incident', width: 1024, height: 640, widthM: 0.092, draw: (ui) => this.drawCard(ui) });
    this.card.mesh.position.set(0, -0.004, -0.1);
    this.card.mesh.renderOrder = 10030;
    this.card.material.depthTest = false;
    this.card.mesh.visible = false;
    app.camera.add(this.card.mesh);
    this.cardInc = null;
    this.hazards = new Set();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.q1 = new THREE.Quaternion();
    this.ray = new THREE.Ray();
    this.sphere = new THREE.Sphere();
    this.sim = [0, 0, 0];
    // highlight of the item a hand points at
    this.highlight = new THREE.Box3Helper(new THREE.Box3(), 0xf2b51c);
    this.highlight.material.depthTest = false;
    this.highlight.material.transparent = true;
    this.highlight.renderOrder = 9600;
    this.highlight.visible = false;
    app.scene.add(this.highlight);
    // cylinder stand with chain on the bench-side shielding-gas cylinder
    this.cylStand = buildCylinderStand(app.env.cylinder);
    // bench-frame hazard props: damaged lead, splice, hot coupon, gun on the cylinder
    this.props = this.buildProps();
    // reject bin beside the PPE rack
    this.bin = this.buildBin();
    this.setRack(fullRack());
    this.applyWorn();
  }

  // ---- PPE ------------------------------------------------------------------------------------------
  item(slot) {
    return this.worn[slot] ? { ...PPE_ITEMS[this.worn[slot].id], ...this.worn[slot] } : null;
  }

  setRack(items) {
    for (const side of ['left', 'right']) if (this.held[side]) this.held[side] = null;
    setRackItems(this.ws, items);
    this.rejected = [];
    this.actions = [];
    if (this.app.handBusy) this.app.handBusy.left = this.app.handBusy.right = false;
  }

  wear(slot, it) {
    const prev = this.worn[slot];
    this.worn[slot] = { id: it.id, defect: it.defect || null };
    // the previous rack item goes back on the rack
    if (prev) {
      const back = this.ws.rackSlots.find((s) => s.id === prev.id && (s.defect || null) === (prev.defect || null) && !s.obj.visible && !s.rejected && !s.held);
      if (back) this.returnHome(back);
    }
    this.actions.push({ t: this.app.time, act: 'wear', id: it.id, defect: it.defect || null });
    this.applyWorn();
  }

  takeOff(slot) {
    const prev = this.worn[slot];
    if (!prev) return;
    delete this.worn[slot];
    if (STREET[slot]) this.worn[slot] = { ...STREET[slot] };
    const back = this.ws.rackSlots.find((s) => s.id === prev.id && (s.defect || null) === (prev.defect || null) && !s.obj.visible && !s.rejected && !s.held);
    if (back) this.returnHome(back);
    this.actions.push({ t: this.app.time, act: 'off', id: prev.id });
    this.applyWorn();
  }

  // Is the worn item in this slot a street item (not from the rack)?
  isStreet(slot) {
    return !!(this.worn[slot] && STREET[slot] && this.worn[slot].id === STREET[slot].id);
  }

  dressStreet() {
    this.worn = { ...STREET };
    for (const s of this.ws.rackSlots) if (!s.rejected) this.returnHome(s);
    this.applyWorn();
  }

  quickDress(task) {
    this.dressStreet();
    const kit = standardKit(task || this.task());
    for (const slot in kit) {
      this.worn[slot] = { id: kit[slot].id, defect: null };
      const s = this.ws.rackSlots.find((r) => r.id === kit[slot].id && !r.defect && r.obj.visible);
      if (s) s.obj.visible = false;
    }
    this.applyWorn();
  }

  dressed() {
    return !!this.worn.helmet && !!this.worn.hands;
  }

  applyWorn() {
    const app = this.app;
    const gloves = this.worn.hands || null;
    const torso = this.worn.torso || null;
    for (const s of ['left', 'right']) this.hands[s].apply(gloves, torso);
    const h = this.item('helmet');
    const eyes = this.item('eyes');
    // gas cutting goggles with a filter lens are worn instead of a helmet for oxy-fuel cutting
    const gog = !h && eyes && eyes.filterShade ? eyes : null;
    app.helmet.kind = h ? (h.adf ? 'adf' : 'passive') : gog ? 'goggles' : 'none';
    app.helmet.fixedShade = h && !h.adf ? h.fixedShade : gog ? gog.filterShade : null;
    app.helmet.adfFail = !!(h && h.defect === 'sensor');
    if (!h && app.helmet.down) app.helmet.setDown(false);
    app.ui.invalidateAll();
  }

  shadeInUse() {
    const h = this.item('helmet');
    if (!h) {
      const e = this.item('eyes');
      return e && e.filterShade ? e.filterShade : null;
    }
    return h.adf ? this.app.settings.shade : h.fixedShade;
  }

  // Worn items with a defect: [{ id, defect }]
  wornDefects() {
    const out = [];
    for (const slot in this.worn) {
      const w = this.worn[slot];
      if (w && w.defect) out.push({ id: w.id, defect: w.defect });
    }
    return out;
  }

  // The job the PPE is checked against: a drill's task, else the loaded coupon and its WPS settings.
  task() {
    if (this.taskOverride) return { ...this.taskOverride, levOk: this.taskOverride.levOk !== false && !this.levBroken, shade: this.shadeInUse() };
    const st = this.app.station;
    const s = st.session ? st.session.settings : null;
    let current = 180;
    if (s) {
      const a = arcState(s, nominalCTWD(s.process, s), 5, { gasAvailable: true });
      current = a ? a.I : current;
    }
    return {
      process: s ? s.process : '135',
      current: Math.round(current),
      position: st.joint ? st.joint.position : 'PA',
      levOk: !this.levBroken,
      shade: this.shadeInUse(),
    };
  }

  check(task = null) {
    const tk = task || this.task();
    return checkPPE(this.worn, { ...tk, shade: this.shadeInUse() });
  }

  // ---- booth set-up -------------------------------------------------------------------------------------
  setLevBroken(b) {
    this.levBroken = b;
    this.ws.lev.setBroken(b);
  }

  // Before a weld in the welding modes. o.ppe: the standard kit for the job is put on; o.booth: the
  // extraction is switched on with its hood placed at the work and the curtain is closed (Settings:
  // set-up by the app); o.hood: only the hood is placed.
  prepareWeld(o = { ppe: true, booth: true }) {
    this.resetAttempt();
    if (o.ppe) this.quickDress();
    if (o.booth || o.hood) {
      if (!this.levBroken) this.ws.lev.setOn(true);
      this.placeHoodAtWork();
    }
    if (o.booth) this.ws.curtain.set(true);
  }

  // Hazard-hunt decoys: a freshly welded coupon on the bench corner (marked HOT unless the hazard is set).
  showHuntProps(on) {
    this.props.hot.visible = on || this.hazards.has('hotUnmarked');
    this.props.mark.visible = !this.hazards.has('hotUnmarked');
  }

  // Hood mouth within one hood diameter (HSE WL3) of the whole weld line: over the middle of the
  // joint, 0.10 m above and 0.05 m behind it (beside it for overhead joints, where the plate is above).
  // SMAW: the long electrode needs room above the joint, so the hood sits 0.12 m behind and 0.08 m
  // above (still within 0.2 m of both ends of the weld line).
  placeHoodAtWork() {
    const app = this.app;
    const st = app.station;
    const room = this.ws.room;
    if (!st.joint) return;
    const j = st.joint;
    st.worldFromSim(j.L / 2, 0, 0, this.v1);
    const back = this.v2.set(0, 0, -1).transformDirection(app.workstation.matrixWorld);
    const overhead = j.position === 'PE' || j.position === 'PD';
    const smaw = !!(st.session && st.session.settings.process === '111');
    if (overhead) this.v1.addScaledVector(back, 0.12).y -= 0.02;
    else if (smaw) this.v1.addScaledVector(back, 0.12).y += 0.08;
    else this.v1.addScaledVector(back, 0.05).y += 0.1;
    room.updateWorldMatrix(true, false);
    room.worldToLocal(this.v1);
    this.ws.lev.setTarget(this.v1);
  }

  // ---- props -------------------------------------------------------------------------------------------
  buildProps() {
    const app = this.app;
    const kit = app.kit;
    const g = new THREE.Group();
    g.name = 'hazardProps';
    kit.group.add(g);
    // cut insulation on the work lead: exposed copper strands and split sheath
    const cut = new THREE.Group();
    const cu = new THREE.MeshStandardMaterial({ color: 0xc27a45, roughness: 0.35, metalness: 0.95 });
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 4), cu);
      s.position.set((k - 3) * 0.0016, 0, 0);
      s.rotation.z = (k - 3) * 0.06;
      cut.add(s);
    }
    const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.8, side: THREE.DoubleSide }));
    flap.position.set(0.012, 0, 0);
    cut.add(flap);
    cut.visible = false;
    g.add(cut);
    // tape splice on the gun cable
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.1 }));
    tape.visible = false;
    g.add(tape);
    // hot coupon on the bench corner, with or without the HOT mark
    const hot = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.1), new THREE.MeshStandardMaterial({ color: 0x4b525b, roughness: 0.6, metalness: 0.6 }));
    hot.add(plate);
    const bead = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.12, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.4, metalness: 0.7 }));
    bead.rotation.z = Math.PI / 2;
    bead.position.y = 0.006;
    hot.add(bead);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f2f0';
    x.font = 'bold 96px sans-serif';
    x.fillText('HOT', 30, 100);
    const tx = new THREE.CanvasTexture(c);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(0.0, 0.0052, 0.03);
    hot.add(mark);
    hot.position.set(-0.45, 0.005, 0.12);
    hot.visible = false;
    g.add(hot);
    // gun hanging on the cylinder valve (clone of the gun model)
    const gunHang = new THREE.Group();
    g.add(gunHang);
    return { group: g, cut, tape, hot, mark, gunHang };
  }

  buildBin() {
    const ws = this.ws;
    const B = ws.boothBox;
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.45, 20, 1, true), red);
    body.position.y = 0.225;
    g.add(body);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), red);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.01;
    g.add(base);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 512, 160);
    x.fillStyle = '#b3261e';
    x.font = 'bold 44px sans-serif';
    x.textAlign = 'center';
    x.fillText('DEFECTIVE PPE', 256, 62);
    x.font = 'bold 40px "Noto Naskh Arabic", Tahoma, sans-serif';
    x.fillText('معدات وقاية تالفة', 256, 128);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.08), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 }));
    lab.position.set(0.172, 0.3, 0);
    lab.rotation.y = Math.PI / 2;
    g.add(lab);
    g.position.set(B.x0 + 0.3, 0, B.z1 - 0.12);
    ws.room.add(g);
    return g;
  }

  // ---- hazards (hazard hunt and scenarios) --------------------------------------------------------------
  setHazards(ids) {
    this.hazards = new Set(ids);
    for (const id of ALL_HAZARDS) this.applyHazard(id, this.hazards.has(id));
  }

  applyHazard(id, on) {
    const app = this.app;
    const P = this.props;
    switch (id) {
      case 'cylinderLoose': this.cylStand.set(!on); break;
      case 'cableDamaged': P.cut.visible = on; break;
      case 'cableSplice': P.tape.visible = on; break;
      case 'hotUnmarked': P.hot.visible = on; P.mark.visible = !on; break;
      case 'clampFar': {
        const sx = app.settings.hand === 'left' ? -1 : 1;
        const cg = app.kit.clamp.group;
        if (on) {
          cg.position.set(0.55 * sx, -0.62, 0.26);
          cg.rotation.set(0, 0, Math.PI / 2);
        } else app.kit.layout(sx);
        app.kit.staticDirty = true;
        break;
      }
      case 'holderOnCylinder': {
        P.gunHang.clear();
        if (on) {
          const gun = app.gun.group.clone(true);
          gun.visible = true;
          const cyl = app.env.cylinder;
          P.gunHang.add(gun);
          gun.position.set(cyl.position.x - 0.02, cyl.position.y + 1.32, cyl.position.z + 0.12);
          gun.rotation.set(Math.PI * 0.55, 0, 0.2);
        }
        break;
      }
      case 'hoodFar':
        if (on) this.ws.setHazard(id, true);
        else if (this.ws.state.hoodFar) {
          this.ws.state.hoodFar = false;
          this.placeHoodAtWork();
        }
        break;
      default: this.ws.setHazard(id, on);
    }
  }

  // Box of a hazard location in the room frame (for pointing in the hazard hunt).
  hazardBox(id, out = new THREE.Box3()) {
    const app = this.app;
    const ws = this.ws;
    const B = ws.boothBox;
    const room = ws.room;
    const roomBox = (cx, cy, cz, sx, sy, sz) => out.setFromCenterAndSize(this.v1.set(cx, cy, cz), this.v2.set(sx, sy, sz));
    const benchPt = (p, s) => {
      const c = this.v1.copy(p);
      app.env.bench.localToWorld(c);
      room.worldToLocal(c);
      return out.setFromCenterAndSize(c, this.v2.set(s, s, s));
    };
    room.updateWorldMatrix(true, false);
    app.env.bench.updateWorldMatrix(true, false);
    const cyl = app.env.cylinder.position;
    switch (id) {
      case 'cylinderLoose': return benchPt(this.v3.set(cyl.x, cyl.y + 0.75, cyl.z), 0.5);
      case 'holderOnCylinder': return benchPt(this.v3.set(cyl.x, cyl.y + 1.35, cyl.z + 0.05), 0.45);
      case 'cylinderNoCap': return roomBox(B.x1 - 0.2, 0.8, B.z0 + 0.22, 0.35, 1.7, 0.35);
      case 'combustibles': return roomBox(-0.9, 0.5, 2.2, 1.4, 1.1, 1.1);
      case 'extinguisherMissing':
      case 'extinguisherEmpty':
      case 'extinguisherBlocked': return roomBox(B.x1 - 0.15, 0.95, B.z1 - 0.25, 0.5, 1.2, 0.45);
      case 'cableDamaged': return benchPt(this.ropePoint(app.kit.workLead, 0.5, this.v3), 0.3);
      case 'cableSplice': return benchPt(this.ropePoint(app.kit.gunCable, 0.45, this.v3), 0.3);
      case 'curtainOpen': return roomBox((B.x0 + B.x1) / 2, 1.2, B.z1, B.x1 - B.x0, 1.9, 0.25);
      case 'signsMissing': return roomBox((B.x0 + B.x1) / 2, 1.4, B.z1 + 0.06, B.x1 - B.x0 + 1.0, 0.9, 0.25);
      case 'hoodFar': return out.setFromCenterAndSize(this.v1.copy(ws.lev.target), this.v2.set(0.45, 0.45, 0.45));
      case 'wetFloor': return roomBox(0.45, 0.05, 0.55, 1.6, 0.3, 1.3);
      case 'clampFar': return benchPt(this.v3.copy(app.kit.clamp.group.position), 0.3);
      case 'oxyFuelTogether':
      case 'acetyleneLying': return roomBox(2.65, 0.9, -0.3, 2.0, 1.9, 1.3);
      case 'oilyRegulator': return roomBox(1.75, 0.9, 1.75, 0.8, 1.7, 0.6);
      case 'grinderGuard': return roomBox(-2.1, 1.0, 0.2, 0.7, 0.5, 0.6);
      case 'hotUnmarked': return benchPt(this.v3.set(-0.45, 0.02, 0.12), 0.3);
      default: return null;
    }
  }

  ropePoint(rope, f, out) {
    const i = Math.round(f * (rope.n - 1));
    return out.set(rope.p[i * 3], rope.p[i * 3 + 1], rope.p[i * 3 + 2]);
  }

  // ---- per frame ---------------------------------------------------------------------------------------
  update(dt, fxs) {
    const app = this.app;
    const presenting = app.renderer.xr.isPresenting;
    this.ws.update(dt, app.time);
    // hands follow the grips (XR only)
    for (const side of ['left', 'right']) {
      const h = app.input.hands[side];
      const hm = this.hands[side];
      if (presenting && h.connected && h.grip) {
        if (hm.group.parent !== h.grip) h.grip.add(hm.group);
        hm.group.visible = true;
      } else hm.group.visible = false;
    }
    this.highlight.visible = false;
    if (presenting && this.interact) {
      this.grabUpdate(dt);
      this.touchUpdate();
    }
    // prop markers that follow the ropes
    if (this.props.cut.visible) this.ropePoint(app.kit.workLead, 0.5, this.props.cut.position);
    if (this.props.tape.visible) {
      const r = app.kit.gunCable;
      this.ropePoint(r, 0.45, this.props.tape.position);
      const a = this.ropePoint(r, 0.42, this.v1);
      const b = this.ropePoint(r, 0.48, this.v2);
      this.props.tape.quaternion.setFromUnitVectors(this.v3.set(0, 1, 0), b.sub(a).normalize());
    }
    // fume: the extraction hood pulls the plume (bench-frame point), only when it runs
    const lev = this.ws.lev;
    if (lev.on) {
      const mw = lev.mouthWorld(this.v1);
      app.env.bench.worldToLocal(mw);
      if (!app.fx.extractor) app.fx.extractor = new THREE.Vector3();
      app.fx.extractor.copy(mw);
    } else app.fx.extractor = null;
    // consequences: only for the trainee in the headset (the desktop view is an observer)
    if (presenting) {
      const ctx = this.context(dt, fxs);
      const events = this.monitor.update(ctx);
      for (const e of events) this.onIncident(e);
      this.fx.setGlare(this.monitor.glare);
    } else this.fx.setGlare(0);
    this.fx.update(dt);
    this.cardUpdate(dt, !!(app.station.lastState && app.station.lastState.arcOn));
  }

  context(dt, fxs) {
    const app = this.app;
    const st = app.station;
    const ls = st.lastState;
    const arc = ls && ls.arc;
    const arcOn = !!(ls && ls.arcOn && fxs && fxs.pool);
    let arcW = null;
    // arc position in world space, from the pool (workstation frame) of this frame
    if (arcOn) arcW = app.workstation.localToWorld((this.arcW || (this.arcW = new THREE.Vector3())).copy(fxs.pool));
    const fwd = (this.fwd || (this.fwd = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(app.headQuat);
    const helmet = this.item('helmet');
    const shade = this.shadeInUse();
    const s = st.session ? st.session.settings : null;
    const guide = s && arc ? shadeGuide(s.process, arc.I) : null;
    const hands = {};
    for (const side of ['left', 'right']) {
      const h = app.input.hands[side];
      if (h.connected && h.grip) {
        const o = this.handState || (this.handState = {});
        const hs = o[side] || (o[side] = { connected: true, pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
        h.grip.getWorldPosition(hs.pos);
        h.grip.getWorldQuaternion(hs.quat);
        hs.connected = true;
        hands[side] = hs;
      } else hands[side] = { connected: false };
    }
    const lev = this.ws.lev;
    // the oxy-fuel cutting bench: its sparks and its plate
    const cut = app.cut && app.cut.root.visible && app.cut.session ? app.cut : null;
    return {
      dt,
      arcOn,
      observer: !!app.weldObserver,
      process: s ? s.process : null,
      current: arc ? arc.I : 0,
      arcW,
      head: { pos: app.headPos, fwd },
      helmetWorn: !!helmet,
      helmetDown: app.helmet.isDown,
      adfFail: app.helmet.adfFail,
      shade,
      shadeMin: guide ? guide.min : null,
      shadeBelowMin: !!(guide && shade != null && shade < guide.min && app.helmet.isDown),
      prot: protection(this.worn),
      defects: this.wornDefects(),
      curtainOpen: this.ws.room.visible && !this.ws.curtain.closed,
      hands,
      hood: { mouth: lev.mouthWorld(this.hoodW || (this.hoodW = new THREE.Vector3())), d: lev.d, on: lev.on },
      indoor: true,
      sparks: cut ? cut.fx.sp : app.fx.sp,
      benchToWorld: app.workstation.matrixWorld,
      contactAt: cut ? (pos) => cut.contactAt(pos) : (pos, side) => this.contactAt(pos, side),
    };
  }

  // Temperature of the coupon where a hand touches it (null when not touching): nearest point on the
  // plate surface within 45 mm of the grip centre (half the thickness of a closed hand; design value).
  // A hand holding the coupon (grab) is always in contact.
  contactAt(pos, side) {
    const app = this.app;
    const st = app.station;
    if (!st.coupon || !st.thermal) return null;
    const j = st.joint;
    st.simFromWorld(pos, null, this.sim, null);
    const [x, u, v] = this.sim;
    const W = j.width || 150;
    const xc = Math.max(0, Math.min(j.L, x));
    const uc = Math.max(-W / 2, Math.min(W / 2, u));
    let surf = plateSurface(j, uc);
    if (surf < -100) return null;
    if (Math.abs(uc) < 16 && st.record) surf = Math.max(surf, st.surfaceAt(xc, uc));
    const d = Math.hypot(x - xc, u - uc, v - surf);
    const holding = side === app.offSide && !!app.grab;
    if (d > 45 && !holding) return null;
    return { T: st.temperatureAt(xc, uc, surf), what: 'coupon', x: xc, u: uc };
  }

  // ---- grabbing: PPE items, the extraction hood, the curtain -----------------------------------------
  handRay(h) {
    h.ray.updateWorldMatrix(true, false);
    this.ray.origin.setFromMatrixPosition(h.ray.matrixWorld);
    this.ray.direction.set(0, 0, -1).transformDirection(h.ray.matrixWorld);
    return this.ray;
  }

  // Rack item a hand points at (nearest along the ray), within GRAB_RAY.
  pointedItem(h) {
    if (!h.ray) return null;
    const r = this.handRay(h);
    let best = null, bd = GRAB_RAY;
    for (const s of this.ws.rackSlots) {
      if (!s.obj.visible || s.rejected || s.held) continue;
      this.itemSphere(s, this.sphere);
      const p = r.intersectSphere(this.sphere, this.v3);
      if (!p) continue;
      const d = p.distanceTo(r.origin);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  itemSphere(s, out) {
    const box = (this.tmpBox || (this.tmpBox = new THREE.Box3())).setFromObject(s.obj);
    box.getBoundingSphere(out);
    out.radius = Math.max(0.07, Math.min(out.radius, 0.2));
    return out;
  }

  grabUpdate() {
    const app = this.app;
    for (const side of ['left', 'right']) {
      const h = app.input.hands[side];
      if (!h.connected || !h.grip) continue;
      if (side === app.offSide && app.grab) continue; // holding the coupon
      const g = h.grip.getWorldPosition(this.v1).clone();
      const free = !this.held[side] && !(this.levGrab && this.levGrab.side === side);
      // pointing highlight (hands free, not over a panel)
      const overUI = app.uiHover && app.uiHover[side === app.domSide ? 'dom' : 'off'];
      const pointed = free && !overUI && !(side === app.domSide && app.tool === 'gun') ? this.pointedItem(h) : null;
      if (pointed && !this.highlight.visible) {
        this.highlight.box.setFromObject(pointed.obj);
        this.highlight.visible = true;
      }
      if (h.down.squeeze && free) {
        // nearest rack item within reach, else the one pointed at
        let best = null, bd = GRAB_NEAR;
        for (const s of this.ws.rackSlots) {
          if (!s.obj.visible || s.rejected || s.held) continue;
          const d = s.obj.getWorldPosition(this.v2).distanceTo(g);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        const far = !best && pointed;
        if (!best) best = pointed;
        if (best) {
          best.held = side;
          h.grip.attach(best.obj);
          if (far) {
            // pulled to the hand from a distance
            best.obj.position.set(0, -0.02, -0.06);
            best.obj.quaternion.identity();
          }
          this.held[side] = best;
          app.handBusy[side] = true;
          app.input.pulse(side, 0.4, 30);
          const def = PPE_ITEMS[best.id];
          app.say(`${t(def.name)} — ${t(def.sub)}`, 2.5);
          continue;
        }
        // extraction hood (handle within reach or the hood pointed at)
        const lev = this.ws.lev;
        const hw = lev.handleWorld(this.v2);
        let hoodHit = hw.distanceTo(g) < 0.16;
        if (!hoodHit && !overUI && h.ray) {
          const r = this.handRay(h);
          this.sphere.center.copy(lev.mouthWorld(this.v3)).y += 0.1;
          this.sphere.radius = 0.16;
          const p = r.intersectSphere(this.sphere, this.v3);
          hoodHit = !!p && p.distanceTo(r.origin) < 3;
        }
        if (hoodHit) {
          const room = this.ws.room;
          room.updateWorldMatrix(true, false);
          const gl = room.worldToLocal(g.clone());
          this.levGrab = { side, offset: lev.target.clone().sub(gl) };
          app.handBusy[side] = true;
          app.input.pulse(side, 0.4, 30);
          app.say(t('Extraction hood: move it within one hood diameter (about 20 cm) of the weld. Trigger: fan on/off.'), 3);
          continue;
        }
        // curtain: grab near the middle edge
        const B = this.ws.boothBox;
        const c = this.ws.room.localToWorld(this.v2.set((B.x0 + B.x1) / 2, 1.2, B.z1));
        if (Math.abs(g.y - c.y) < 0.8 && Math.hypot(g.x - c.x, g.z - c.z) < 0.6) {
          this.ws.curtain.set(!this.ws.curtain.closed);
          app.input.pulse(side, 0.3, 40);
          app.say(this.ws.curtain.closed ? t('Curtain closed.') : t('Curtain open.'), 1.5);
        }
      }
      if (this.levGrab && this.levGrab.side === side) {
        if (!h.pressed.squeeze) {
          this.levGrab = null;
          app.handBusy[side] = false;
        } else {
          const room = this.ws.room;
          const gl = room.worldToLocal(g.clone());
          this.ws.lev.setTarget(gl.add(this.levGrab.offset));
          if (h.down.trigger && !overUI) {
            this.toggleLev(side);
            h.consumed = true;
          }
        }
      }
      const held = this.held[side];
      if (held && !h.pressed.squeeze) this.release(side, held);
    }
  }

  toggleLev(side) {
    const app = this.app;
    const lev = this.ws.lev;
    if (lev.broken) {
      app.say(t('The extraction is out of order (tagged). Report it; do not weld indoors without fume control.'), 3);
      return;
    }
    lev.setOn(!lev.on);
    if (side) app.input.pulse(side, 0.4, 30);
    app.say(lev.on ? t('Extraction on.') : t('Extraction off.'), 1.5);
  }

  release(side, s) {
    const app = this.app;
    this.held[side] = null;
    s.held = null;
    app.handBusy[side] = false;
    const it = PPE_ITEMS[s.id];
    const p = s.obj.getWorldPosition(this.v1);
    const head = app.headPos;
    const chest = this.v2.copy(head).add(this.v3.set(0, -0.42, 0));
    // reject bin
    const bin = this.bin.getWorldPosition(this.v3);
    if (Math.hypot(p.x - bin.x, p.z - bin.z) < 0.3 && p.y < bin.y + 1.0) {
      this.toBin(s);
      app.input.pulse(side, 0.5, 40);
      return;
    }
    let ok = false;
    if (HEAD_ZONE.includes(it.slot)) ok = p.distanceTo(head) < 0.3;
    else if (BODY_ZONE.includes(it.slot)) ok = p.distanceTo(chest) < 0.38 || (it.slot === 'hands' && p.distanceTo(head) < 0.45);
    else if (LOW_ZONE.includes(it.slot)) ok = p.y < head.y - 0.7;
    if (ok) {
      this.putOn(s);
      app.input.pulse(side, 0.6, 50);
    } else this.returnHome(s);
  }

  // Put a rack item on (from the hand or the panel).
  putOn(s) {
    const it = PPE_ITEMS[s.id];
    this.ws.rack.attach(s.obj);
    s.obj.visible = false;
    s.obj.position.copy(s.home);
    s.obj.rotation.copy(s.homeRot);
    this.wear(it.slot, { id: s.id, defect: s.defect });
    this.app.say(`${t('Wearing')}: ${t(it.name)}`, 2);
  }

  // Put a rack item in the defective-PPE bin.
  toBin(s) {
    const app = this.app;
    s.rejected = true;
    this.ws.rack.attach(s.obj);
    s.obj.visible = false;
    this.rejected.push({ id: s.id, defect: s.defect || null });
    this.actions.push({ t: app.time, act: 'reject', id: s.id, defect: s.defect || null });
    app.say(t('Put in the defective PPE bin.'), 2);
  }

  returnHome(s) {
    this.ws.rack.attach(s.obj);
    s.obj.position.copy(s.home);
    s.obj.rotation.copy(s.homeRot);
    s.obj.visible = true;
  }

  // touch controls: extraction switch on the hood (trigger with the hand at the switch)
  touchUpdate() {
    const app = this.app;
    const sw = this.ws.lev.switchBox.getWorldPosition(this.v1);
    for (const side of ['left', 'right']) {
      const h = app.input.hands[side];
      if (!h.connected || !h.grip || !h.down.trigger || h.consumed) continue;
      if (this.levGrab && this.levGrab.side === side) continue;
      const g = h.grip.getWorldPosition(this.v2);
      if (g.distanceTo(sw) < 0.12) {
        this.toggleLev(side);
        h.consumed = true;
      }
    }
  }

  // SMAW electrode change with the machine on: the electrode is at the no-load voltage (CCOHS: "When
  // changing the welding electrode, there is a danger of shock equal to the no-load voltage output of
  // the welding machine"; "Do not replace the welding electrode with a bare hand, or with a wet welding
  // glove"). Gloves must be dry and in good repair (Z49.1 4.3.2; AWS Fact Sheet No. 5: "dry, hole-free,
  // insulating gloves"). The off hand fits the electrode. Returns true on a shock.
  onElectrodeChange() {
    const app = this.app;
    if (!app.renderer.xr.isPresenting || app.weldObserver) return false;
    const cause = electrodeChangeShock(protection(this.worn));
    if (!cause) return false;
    this.onIncident(this.monitor.add('electricShock', { cause, side: app.offSide }));
    return true;
  }

  // Chipping or brushing slag with the helmet up and no safety glasses: slag can reach the eyes
  // (Z49.1 4.2.1.1: safety glasses under the helmet; AWS Fact Sheet No. 31).
  onSlagWork() {
    const app = this.app;
    if (!app.renderer.xr.isPresenting) return;
    const m = this.monitor;
    if (m.done.has('noGlasses') || protection(this.worn).glasses || app.helmet.isDown) return;
    m.done.add('noGlasses');
    this.onIncident(m.add('noGlasses', { when: 'slag' }));
  }

  // ---- incidents --------------------------------------------------------------------------------------
  // oxy-fuel cutting events reported by the cutting mode
  cutIncident(type, data = {}) {
    const inc = this.monitor.add(type, { ...data, cut: true });
    this.onIncident(inc);
    return inc;
  }

  onIncident(inc) {
    const app = this.app;
    const def = INCIDENTS[inc.type];
    if (!def) return;
    const side = inc.side || app.domSide;
    if (inc.type === 'arcEye') {
      this.fx.flashBlind(new THREE.Vector2(0.5, 0.45));
      app.input.pulse(app.domSide, 1, 200);
      app.input.pulse(app.offSide, 1, 200);
    } else if (inc.type === 'glare' || inc.type === 'shadeLow') {
      this.fx.flashBlind(null);
    } else if (inc.type === 'spatterBurn' || inc.type === 'meltBurn' || inc.type === 'contactBurn' || inc.type === 'uvSkin') {
      if (inc.type !== 'uvSkin') this.fx.hurt(inc.type === 'contactBurn' || inc.type === 'meltBurn' ? 1 : 0.6);
      app.input.pulse(side, 1, inc.type === 'contactBurn' ? 260 : 140);
      const arm = (inc.where || '').includes('forearm');
      const hm = this.hands[side];
      if (hm) hm.markBurn(arm ? 'arm' : 'hand');
    } else if (inc.type === 'electricShock') {
      this.fx.hurt(1);
      app.input.pulse(app.domSide, 1, 320);
      app.input.pulse(app.offSide, 1, 320);
    } else if (inc.type === 'hotHandling') {
      app.input.pulse(side, 0.6, 120);
      if (this.hands[side]) this.hands[side].markScorch();
    }
    app.say(`${t(def.title)}${inc.where ? ` (${t(inc.where)})` : ''}`, 3);
    this.cardQueue.push(inc);
    app.main.invalidate();
  }

  cardUpdate(dt, arcOn) {
    if (this.cardInc) {
      this.cardT -= dt;
      const h = this.app.input.hands[this.app.offSide];
      if (this.cardT <= 0 || (h && h.down && h.down.a)) {
        this.cardInc = null;
        this.card.mesh.visible = false;
      }
      return;
    }
    // show queued cards only while the arc is off (never cover the weld pool mid-pass)
    if (this.cardQueue.length && !arcOn && this.app.renderer.xr.isPresenting) {
      this.cardInc = this.cardQueue.shift();
      this.cardT = 9;
      this.card.invalidate();
      this.card.mesh.visible = true;
    } else if (!this.app.renderer.xr.isPresenting) this.cardQueue = [];
  }

  drawCard(ui) {
    const inc = this.cardInc;
    if (!inc) return;
    const def = INCIDENTS[inc.type];
    const W = ui.W;
    const sev = def.severity;
    const col = sev === 'injury' ? COLORS.bad : sev === 'violation' ? COLORS.warn : COLORS.info;
    ui.rect(4, 4, W - 8, ui.H - 8, 'rgba(12,16,22,0.94)', 26, col, 4);
    ui.text(t(sevLabel(sev)), 28, 46, { size: 24, weight: 700, color: col });
    ui.text(t('A: close'), W - 28, 46, { size: 20, color: COLORS.faint, align: 'end' });
    ui.text(t(def.title), 28, 92, { size: 38, weight: 700, maxW: W - 56 });
    let y = 136;
    const detail = incidentDetail(inc);
    if (detail) y = ui.wrap(detail, 28, y, W - 56, { size: 24, color: COLORS.text, maxLines: 2 }) + 4;
    y = ui.wrap(t(def.effects), 28, y + 4, W - 56, { size: 22, color: COLORS.dim, maxLines: 3 }) + 4;
    if (def.firstAid) y = ui.wrap(`${t('First aid')}: ${t(def.firstAid.text)}`, 28, y + 4, W - 56, { size: 22, color: '#ffd9a8', maxLines: 4 }) + 4;
    ui.wrap(`${t('Rule')}: ${t(def.rule.text)}`, 28, y + 4, W - 56, { size: 21, color: COLORS.accent, maxLines: 2 });
    ui.text(cites(def.rule.refs.concat(def.effectRefs || [])), 28, ui.H - 22, { size: 17, color: COLORS.faint, maxW: W - 56 });
  }

  // results snapshot for the Safety tab
  snapshot(task = null) {
    const chk = this.check(task);
    return { ppe: chk, worn: { ...this.worn }, exposure: this.monitor.summary(), incidents: this.monitor.log.slice(), shade: this.shadeInUse(), task: task || this.task() };
  }

  resetAttempt() {
    this.monitor.reset();
    for (const s of ['left', 'right']) this.hands[s].clearMarks();
    this.cardQueue = [];
    this.cardInc = null;
    this.card.mesh.visible = false;
  }
}

export function sevLabel(sev) {
  return sev === 'injury' ? 'INJURY' : sev === 'violation' ? 'SAFETY RULE BROKEN' : sev === 'exposure' ? 'EXPOSURE' : 'WARNING';
}

// one-line measured detail of an incident
export function incidentDetail(inc) {
  switch (inc.type) {
    case 'arcEye': return t('UV dose to the eyes: {p}% of the daily limit (helmet not down, {d} m from the arc).', { p: Math.round(inc.dose * 100), d: inc.dist.toFixed(2) });
    case 'uvSkin': return t('UV dose to the {w}: {p}% of the daily limit.', { w: t(inc.where), p: Math.round(inc.dose * 100) });
    case 'contactBurn': return inc.what === 'plate'
      ? t('{w} touched the cut plate at {T} °C for {s} s without a glove.', { w: t(inc.where), T: Math.round(inc.T), s: inc.seconds.toFixed(1) })
      : t('{w} touched the coupon at {T} °C for {s} s without a glove.', { w: t(inc.where), T: Math.round(inc.T), s: inc.seconds.toFixed(1) });
    case 'hotHandling': return inc.what === 'plate' ? t('Cut plate at {T} °C handled with gloves.', { T: Math.round(inc.T) }) : t('Coupon at {T} °C handled with gloves.', { T: Math.round(inc.T) });
    case 'cutEyes': return inc.shade != null ? t('Filter shade {s} in use while cutting; minimum {m}.', { s: inc.shade, m: inc.min }) : t('No filter lens in front of the eyes while the torch was cutting or preheating.');
    case 'spatterBurn': return inc.hole ? t('A spatter drop went through the hole in the glove ({w}).', { w: t(inc.where) }) : t('A spatter drop at about {T} °C hit the {w}.', { T: Math.round(inc.T / 50) * 50, w: t(inc.where) });
    case 'meltBurn': return t('Spatter hit the synthetic fabric on the {w}.', { w: t(inc.where) });
    case 'fume': return inc.on ? t('Hood {d} m from the arc (needs to be within {h} m).', { d: inc.hoodDist != null ? inc.hoodDist.toFixed(2) : '–', h: inc.hoodD.toFixed(2) }) : t('Extraction switched off.');
    case 'shadeLow': return t('Shade {s} in use; minimum {m}.', { s: inc.shade, m: inc.min });
    case 'glare': return t('The auto-darkening filter did not darken: its arc sensors are covered.');
    case 'electricShock': return `${t(inc.cause === 'bare' ? 'Electrode fitted with a bare hand.' : inc.cause === 'wet' ? 'Electrode fitted with wet gloves.' : 'Electrode fitted with a holed glove.')} ${t('With the machine on, the electrode is at the no-load voltage.')}`;
    case 'defectivePPE': return (inc.items || []).map((d) => `${t(PPE_ITEMS[d.id].name)}: ${t(DEFECTS[d.defect] ? DEFECTS[d.defect].label : d.defect)}`).join(' · ');
    default: return '';
  }
}
