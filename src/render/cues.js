// Practice cues: a head-locked meter strip inside the helmet window and 3D cues on the coupon
// (travel-speed pacer, aim line, ghost torch). Cues render after the helmet lens so they stay
// readable while the lens is dark.

import * as THREE from 'three';
import { HUD_RO } from './helmet.js';
import { FONT } from '../ui/ui.js';
import { pipePoint, pipeFrame, wrapX } from '../sim/pipe.js';

const CUE_RO = 9600;

export class CueStrip {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 176;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    const w = 0.104;
    const h = (w * 176) / 1024;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = HUD_RO;
    this.mesh.position.set(0, -0.006 - 0.0689 / 2 + h / 2 + 0.0015, -0.0995);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.last = 0;
    this.labels = null;
  }

  // items: [{label, value, unit, lo, hi, min, max, fmt}], message: optional text line
  draw(items, message, rtl = false) {
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,12,16,0.55)';
    c.beginPath();
    c.roundRect(4, 4, W - 8, H - 8, 22);
    c.fill();
    const n = items.length;
    const cw = (W - 24) / n;
    items.forEach((it, k) => {
      const x0 = rtl ? W - 12 - (k + 1) * cw : 12 + k * cw;
      const inWin = it.value != null && Number.isFinite(it.value) && it.value >= it.lo && it.value <= it.hi;
      const col = it.value == null || !Number.isFinite(it.value) ? '#7c8a99' : inWin ? '#46e08a' : '#ff6a5c';
      c.fillStyle = '#c6d2de';
      c.font = `600 26px ${FONT}`;
      c.direction = rtl ? 'rtl' : 'ltr';
      c.textAlign = 'center';
      c.fillText(it.label, x0 + cw / 2, 40);
      c.fillStyle = col;
      c.font = `700 40px ${FONT}`;
      const vt = it.value == null || !Number.isFinite(it.value) ? '–' : (it.fmt ? it.fmt(it.value) : it.value.toFixed(0)) + (it.unit ? ` ${it.unit}` : '');
      c.direction = 'ltr';
      c.fillText(vt, x0 + cw / 2, 88);
      // meter
      const mx = x0 + 18, mw = cw - 36, my = 112, mh = 22;
      const f = (v) => mx + ((Math.max(it.min, Math.min(it.max, v)) - it.min) / (it.max - it.min)) * mw;
      c.fillStyle = '#1b242e';
      c.fillRect(mx, my, mw, mh);
      c.fillStyle = 'rgba(70,224,138,0.45)';
      c.fillRect(f(it.lo), my, Math.max(3, f(it.hi) - f(it.lo)), mh);
      if (it.value != null && Number.isFinite(it.value)) {
        c.fillStyle = col;
        c.fillRect(f(it.value) - 5, my - 8, 10, mh + 16);
      }
    });
    if (message) {
      c.fillStyle = '#ffd36a';
      c.font = `600 24px ${FONT}`;
      c.textAlign = 'center';
      c.direction = rtl ? 'rtl' : 'ltr';
      c.fillText(message, W / 2, 164);
    }
    this.tex.needsUpdate = true;
  }
}

// 3D cues placed in the coupon frame (joint-local millimetres).
export class CoupledCues {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cues';
    // pacer chevron
    const shape = new THREE.Shape();
    shape.moveTo(-2.5, -3);
    shape.lineTo(1.5, 0);
    shape.lineTo(-2.5, 3);
    shape.lineTo(-1.2, 0);
    shape.lineTo(-2.5, -3);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5cf0ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.pacer = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    this.pacer.renderOrder = CUE_RO;
    this.pacer.visible = false;
    this.group.add(this.pacer);
    // aim line
    this.aimGeo = new THREE.BufferGeometry();
    this.aimGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    this.aim = new THREE.Line(this.aimGeo, new THREE.LineBasicMaterial({ color: 0x5cf0ff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, toneMapped: false }));
    this.aim.renderOrder = CUE_RO;
    this.aim.visible = false;
    this.group.add(this.aim);
    this.pacerS = null;
  }

  // lane: lateral position (u, mm) of the line to follow (bead-on-plate lanes; 0 for joints)
  setJoint(joint, mirror, surfaceAt, lane = 0) {
    // aim line along the joint centre (or lane) on the current surface (refreshed per pass); on a pipe a
    // closed loop round the joint (the coupon frame is the pipe-local frame there)
    const pts = [];
    if (joint.pipe) {
      const P = [0, 0, 0];
      for (let x = 0; x <= joint.L; x += 4) {
        pipePoint(joint, x, 0, surfaceAt(wrapX(joint, x), 0) + 0.4, P);
        pts.push(P[0], P[1], P[2]);
      }
    } else {
      for (let x = joint.tab; x <= joint.L - joint.tab; x += 5) {
        const v = surfaceAt(x, lane) + 0.4;
        pts.push(mirror ? joint.L - x : x, lane, v);
      }
    }
    this.aimGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.aimGeo.computeBoundingSphere();
    this.joint = joint;
    this.mirror = mirror;
    this.lane = lane;
  }

  // Place the pacer at sim position s (mm) on the surface height v, facing the travel direction (sigma: +1
  // toward +x, -1 toward -x; on a pipe both occur).
  setPacer(s, v, visible, sigma = 1) {
    this.pacer.visible = visible;
    if (!visible) return;
    const j = this.joint;
    if (j && j.pipe) {
      const P = pipePoint(j, s, 0, v + 1.2);
      const f = pipeFrame(j, s);
      const X = new THREE.Vector3(...f.t).multiplyScalar(sigma);
      const Z = new THREE.Vector3(...f.v);
      const Y = new THREE.Vector3().crossVectors(Z, X);
      this.pacer.matrixAutoUpdate = true;
      this.pacer.position.set(P[0], P[1], P[2]);
      this.pacer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      return;
    }
    const x = this.mirror ? this.joint.L - s : s;
    this.pacer.position.set(x, this.lane || 0, v + 1.2);
    this.pacer.rotation.set(0, 0, this.mirror ? Math.PI : 0);
  }
}

// Semi-transparent copy of the gun, posed at the target technique (ghost torch).
export function makeGhost(gunGroup) {
  const g = gunGroup.clone(true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  g.traverse((o) => {
    if (o.isMesh) o.material = mat;
  });
  g.renderOrder = 50;
  g.visible = false;
  return g;
}
