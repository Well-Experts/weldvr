// Trainee's hands and forearms as the PPE makes them look: bare skin, gauntlet or TIG gloves, and the
// sleeve of whatever is worn on the torso. Stylised (closed hand around the controller grip). Burn
// marks are shown as a reddened patch only.
//
// Grip space (WebXR): origin at the centre of the closed hand; the forearm runs back along +z.

import * as THREE from 'three';
import { PPE_MATS } from './ppeModels.js';

const SKIN = new THREE.MeshStandardMaterial({ color: 0xc69676, roughness: 0.65, metalness: 0 });
const BURN = new THREE.MeshBasicMaterial({ color: 0xd2453a, transparent: true, opacity: 0.55, depthWrite: false });
const SCORCH = new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.8, depthWrite: false });

function handMaterial(gloves) {
  if (!gloves) return SKIN;
  if (gloves.id === 'gloves_tig') return PPE_MATS.goat();
  if (gloves.id === 'gloves_nitrile') return PPE_MATS.nitrile();
  return gloves.defect === 'wet' ? PPE_MATS.leatherWet() : PPE_MATS.leatherTan();
}

function sleeveMaterial(torso) {
  if (!torso) return SKIN;
  switch (torso.id) {
    case 'jacket_leather': return PPE_MATS.leatherBrown();
    case 'fleece': return PPE_MATS.fleece();
    case 'tshirt': return SKIN; // short sleeves: bare forearm
    default: return torso.defect === 'oily' ? PPE_MATS.frOily() : PPE_MATS.frCloth();
  }
}

export class HandModel {
  constructor(side) {
    this.side = side;
    this.group = new THREE.Group();
    this.group.name = `hand-${side}`;
    const sx = side === 'left' ? -1 : 1;
    // closed hand: fist body, knuckle ridge and thumb wrapped over the grip
    this.fist = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), SKIN);
    this.fist.scale.set(0.042, 0.05, 0.06);
    this.fist.position.set(sx * 0.012, -0.005, 0.01);
    this.knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.06, 4, 10), SKIN);
    this.knuckles.rotation.x = Math.PI / 2;
    this.knuckles.position.set(sx * -0.02, 0.015, -0.002);
    this.thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.035, 4, 8), SKIN);
    this.thumb.rotation.set(0.3, 0, sx * 1.1);
    this.thumb.position.set(sx * -0.012, 0.035, -0.035);
    // cuff of a gauntlet glove, sleeve, forearm
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.13, 14, 1, true), PPE_MATS.leatherTan());
    this.cuff.material.side = THREE.DoubleSide;
    this.cuff.rotation.x = Math.PI / 2;
    this.cuff.position.set(sx * 0.01, -0.01, 0.12);
    this.forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.3, 14), SKIN);
    this.forearm.rotation.x = Math.PI / 2;
    this.forearm.position.set(sx * 0.01, -0.012, 0.22);
    this.sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.26, 14, 1, true), PPE_MATS.frCloth());
    this.sleeve.material = PPE_MATS.frCloth();
    this.sleeve.rotation.x = Math.PI / 2;
    this.sleeve.position.set(sx * 0.01, -0.012, 0.26);
    // burn marks (hidden until a burn): back of the hand and forearm
    this.burnHand = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), BURN);
    this.burnHand.position.set(sx * 0.043, 0.0, 0.0);
    this.burnHand.rotation.y = sx * Math.PI / 2;
    this.burnArm = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), BURN);
    this.burnArm.position.set(sx * 0.02, 0.026, 0.2);
    this.burnArm.rotation.x = -Math.PI / 2;
    this.scorch = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), SCORCH);
    this.scorch.position.set(sx * 0.0425, 0.004, -0.01);
    this.scorch.rotation.y = sx * Math.PI / 2;
    for (const o of [this.burnHand, this.burnArm, this.scorch]) {
      o.visible = false;
      o.renderOrder = 5;
    }
    for (const o of [this.fist, this.knuckles, this.thumb, this.cuff, this.forearm, this.sleeve, this.burnHand, this.burnArm, this.scorch]) this.group.add(o);
    this.apply(null, null);
  }

  // gloves: worn item {id, defect} or null; torso: worn torso item or null
  apply(gloves, torso) {
    const hm = handMaterial(gloves);
    for (const o of [this.fist, this.knuckles, this.thumb]) o.material = hm;
    this.fist.scale.set(gloves ? 0.047 : 0.042, gloves ? 0.055 : 0.05, gloves ? 0.064 : 0.06);
    this.cuff.visible = !!gloves && gloves.id === 'gloves_gauntlet';
    if (this.cuff.visible) this.cuff.material = hm;
    const sm = sleeveMaterial(torso);
    const longSleeve = torso && torso.id !== 'tshirt';
    this.sleeve.visible = !!longSleeve;
    if (longSleeve) this.sleeve.material = sm;
    // the forearm shows bare skin unless a sleeve or the gauntlet covers it
    this.forearm.visible = !longSleeve;
    this.gloves = gloves;
    this.torso = torso;
  }

  markBurn(where) {
    if (where === 'arm') this.burnArm.visible = true;
    else this.burnHand.visible = true;
  }

  markScorch() {
    this.scorch.visible = true;
  }

  clearMarks() {
    this.burnHand.visible = this.burnArm.visible = this.scorch.visible = false;
  }
}
