// Scene props for the safety drills: tag markers placed by the trainee in the hazard hunt, outline
// boxes for the debrief, and a smouldering spot that can grow into a fire (fire watch drill).

import * as THREE from 'three';
import { softDot } from './textures.js';

// A small flag on a pin, numbered, placed where the trainee tagged something (world space).
export class TagMarker {
  constructor(n, color = '#f2b51c') {
    this.group = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.beginPath();
    x.arc(64, 64, 60, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#16110a';
    x.font = 'bold 72px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(n), 64, 70);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
    this.sprite.scale.set(0.09, 0.09, 1);
    this.sprite.position.y = 0.12;
    this.sprite.renderOrder = 9590;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), new THREE.MeshBasicMaterial({ color }));
    pin.position.y = 0.06;
    this.group.add(this.sprite, pin);
  }
}

// Outline of a world box (debrief: found = green, missed = red).
export function outlineBox(box, color) {
  const h = new THREE.Box3Helper(box.clone(), color);
  h.material.depthTest = false;
  h.material.transparent = true;
  h.renderOrder = 9595;
  return h;
}

// Smouldering material: a thin smoke wisp and a glowing ember; grow() turns it into open flames.
export class Smoulder {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'smoulder';
    this.smokeTex = softDot('rgba(150,150,150,0.55)', 'rgba(150,150,150,0)', 64, 0.1);
    this.fireTex = softDot('rgba(255,200,120,1)', 'rgba(255,90,20,0)', 64, 0.15);
    this.puffs = [];
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.userData.t = k / 14;
      this.group.add(s);
      this.puffs.push(s);
    }
    this.flames = [];
    for (let k = 0; k < 10; k++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
      f.userData.t = k / 10;
      f.visible = false;
      this.group.add(f);
      this.flames.push(f);
    }
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false }));
    this.ember.position.y = 0.01;
    this.group.add(this.ember);
    // glow on the floor around the fire (a sprite: an extra light would recompile every material)
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ map: softDot('rgba(255,140,60,0.8)', 'rgba(255,90,20,0)', 64, 0.05), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.01;
    this.glow.visible = false;
    this.group.add(this.glow);
    this.level = 0; // 0 hidden, 1 smouldering, 2 fire
    this.group.visible = false;
  }

  set(level) {
    this.level = level;
    this.group.visible = level > 0;
    for (const f of this.flames) f.visible = level >= 2;
    this.glow.visible = level >= 2;
  }

  update(dt, time) {
    if (!this.level) return;
    const big = this.level >= 2;
    const H = big ? 1.4 : 0.55; // smoke column height (m)
    for (const s of this.puffs) {
      s.userData.t = (s.userData.t + dt / (big ? 2.2 : 4.5)) % 1;
      const u = s.userData.t;
      s.position.set(Math.sin(u * 9 + s.id) * 0.03 * (1 + u * 3), u * H, Math.cos(u * 7 + s.id) * 0.03 * (1 + u * 3));
      const sz = (big ? 0.25 : 0.06) + u * (big ? 0.7 : 0.22);
      s.scale.set(sz, sz, 1);
      s.material.opacity = (big ? 0.55 : 0.3) * Math.sin(Math.PI * u);
      s.material.color.setScalar(big ? 0.35 : 0.7);
    }
    if (big) {
      for (const f of this.flames) {
        f.userData.t = (f.userData.t + dt / 0.7) % 1;
        const u = f.userData.t;
        f.position.set(Math.sin(u * 13 + f.id) * 0.06, 0.05 + u * 0.45, Math.cos(u * 11 + f.id) * 0.06);
        const sz = 0.28 * (1 - u) + 0.08;
        f.scale.set(sz, sz * 1.3, 1);
        f.material.opacity = 0.9 * (1 - u);
      }
    }
    const flick = 0.6 + 0.4 * Math.abs(Math.sin(time * 7.3) * Math.sin(time * 3.1));
    this.ember.material.color.setRGB(1, 0.35 + 0.2 * flick, 0.1);
    if (big) this.glow.material.opacity = 0.5 + 0.5 * flick;
  }
}

// A low pile of wood shavings and dust (a fuel the sparks can reach).
export function sweepingsPile() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 1, metalness: 0 });
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
  pile.scale.set(1.4, 0.25, 1);
  g.add(pile);
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.012), m);
    c.position.set(Math.cos(k * 2.1) * (0.2 + (k % 3) * 0.04), 0.004, Math.sin(k * 2.1) * (0.15 + (k % 2) * 0.05));
    c.rotation.y = k;
    g.add(c);
  }
  return g;
}

// Open-top waste bin with rags.
export function ragBin() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.42, 16, 1, true), m);
  body.position.y = 0.21;
  g.add(body);
  const rag = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1 });
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), rag);
    r.scale.set(1.2, 0.6, 1);
    r.position.set(-0.04 + k * 0.04, 0.4 + (k % 2) * 0.02, (k - 1) * 0.03);
    g.add(r);
  }
  return g;
}
