// Welding helmet: head-locked shell with a lens window and an auto-darkening filter.
//
// Render order (see effects.js): the lens is drawn after the opaque scene and multiplies it by the
// filter transmission (and, in passthrough, darkens the camera image through the alpha channel);
// arc effects and practice cues are drawn after the lens so they stay readable; the shell is drawn
// last and hides everything outside the window.
//
// Shade numbers follow the usual definition S = 1 + (7/3) log10(1/tau). A display cannot show the
// arc's real luminance, so the displayed transmission is a compressed mapping chosen for legibility:
// it keeps the ordering of shades (darker shade = darker scene, dimmer arc) but not their ratios.

import * as THREE from 'three';
import { RO_LENS, RO_SHELL } from './effects.js';

export const HUD_RO = 9700; // cues drawn between lens and shell

// Window geometry: about 98 x 55 mm viewing area at ~80 mm from the eyes, placed at 0.1 m here
// so that it subtends the same angles (about 63 x 38 degrees).
const Z = -0.1;
const WIN_W = 0.1226;
const WIN_H = 0.0689;
const WIN_Y = -0.006;

export function displayedTransmission(shade) {
  // Light state (~shade 3-4) stays clearly see-through; dark shades go close to black.
  const s = Math.max(2, Math.min(14, shade));
  if (s <= 5) return 0.62 * Math.pow(10, (-0.35 * (s - 3)));
  return 0.28 * Math.pow(10, (-3 * (s - 5)) / 14);
}

// Gas cutting goggles: the light shades used for oxy-fuel work are drawn lighter than the welding-helmet
// mapping so the line and the plate stay visible under the shop lights (display compromise; shade order kept).
export function gogglesTransmission(shade) {
  const s = Math.max(2, Math.min(8, shade));
  return 0.55 * Math.pow(10, -0.18 * (s - 3));
}

// Factor applied to arc/pool brightness seen through the lens (1 at shade 11).
export function arcVisibility(shade) {
  return Math.pow(10, -0.12 * (shade - 11));
}

export class Helmet {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'helmet';
    this.shell = new THREE.Group();
    this.group.add(this.shell);
    this.down = false;
    this.anim = 0; // 0 = up (out of view), 1 = down
    this.darkHold = 0;
    this.shade = 11;
    this.lightShade = 3.5;
    this.delay = 0.3; // s, dark-to-light delay
    this.dark = false;
    this.transmission = 1;
    // what is worn (set by the safety system from the PPE): 'adf' auto-darkening, 'passive' fixed-shade
    // glass, or 'none'. adfFail: the auto-darkening filter does not switch (arc sensors covered), so it
    // stays in its light state; its UV/IR protection does not depend on the state (AWS Fact Sheet 31).
    this.kind = 'adf';
    this.fixedShade = null;
    this.adfFail = false;

    // lens: custom blending so dst.rgb *= T and passthrough is darkened via alpha
    this.lensMat = new THREE.ShaderMaterial({
      uniforms: { T: { value: new THREE.Color(1, 1, 1) }, Ta: { value: 1 } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 T; uniform float Ta; void main(){ gl_FragColor = vec4(T, 1.0 - Ta); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.004, WIN_H + 0.004), this.lensMat);
    this.lens.position.set(0, WIN_Y, Z);
    this.lens.renderOrder = RO_LENS;
    this.lens.frustumCulled = false;
    this.shell.add(this.lens);

    // shell: black frame with a bevelled window edge (one mesh, ring with a hole)
    const outer = 0.32;
    const shape = new THREE.Shape();
    shape.moveTo(-outer, -outer);
    shape.lineTo(outer, -outer);
    shape.lineTo(outer, outer);
    shape.lineTo(-outer, outer);
    shape.lineTo(-outer, -outer);
    const hole = new THREE.Path();
    const r = 0.006;
    const hw = WIN_W / 2, hh = WIN_H / 2;
    hole.moveTo(-hw + r, -hh);
    hole.lineTo(hw - r, -hh);
    hole.quadraticCurveTo(hw, -hh, hw, -hh + r);
    hole.lineTo(hw, hh - r);
    hole.quadraticCurveTo(hw, hh, hw - r, hh);
    hole.lineTo(-hw + r, hh);
    hole.quadraticCurveTo(-hw, hh, -hw, hh - r);
    hole.lineTo(-hw, -hh + r);
    hole.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    shape.holes.push(hole);
    const shellGeo = new THREE.ShapeGeometry(shape, 6);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x050505, depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
    this.shellMesh = new THREE.Mesh(shellGeo, shellMat);
    this.shellMesh.position.set(0, WIN_Y, Z);
    this.shellMesh.renderOrder = RO_SHELL;
    this.shellMesh.frustumCulled = false;
    this.shell.add(this.shellMesh);

    // lens frame (cartridge edge), a thin grey border just inside the shell
    const frameShape = new THREE.Shape();
    const fw = hw + 0.006, fh = hh + 0.006;
    frameShape.moveTo(-fw, -fh); frameShape.lineTo(fw, -fh); frameShape.lineTo(fw, fh); frameShape.lineTo(-fw, fh); frameShape.lineTo(-fw, -fh);
    frameShape.holes.push(hole);
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(frameShape, 6), new THREE.MeshBasicMaterial({ color: 0x1b1d20, depthTest: false, depthWrite: false, transparent: true }));
    frame.position.set(0, WIN_Y, Z + 0.0005);
    frame.renderOrder = RO_SHELL + 1;
    frame.frustumCulled = false;
    this.shell.add(frame);

    // small status LED text (shade) at the lower right of the cartridge
    this.statusCanvas = document.createElement('canvas');
    this.statusCanvas.width = 256;
    this.statusCanvas.height = 64;
    this.statusTex = new THREE.CanvasTexture(this.statusCanvas);
    this.statusTex.colorSpace = THREE.SRGBColorSpace;
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.006), new THREE.MeshBasicMaterial({ map: this.statusTex, transparent: true, depthTest: false, depthWrite: false }));
    st.position.set(hw - 0.012, WIN_Y - hh - 0.0045, Z + 0.001);
    st.renderOrder = RO_SHELL + 2;
    st.frustumCulled = false;
    this.shell.add(st);
    this.lastStatus = '';

    // gas cutting goggles (worn instead of a helmet for oxy-fuel cutting): a wide, low frame with a nose
    // bridge, always in front of the eyes, a fixed filter shade (PPE item) and no flip
    this.goggles = new THREE.Group();
    this.goggles.visible = false;
    const gw = 0.088, gh = 0.042, gy = -0.004;
    const gShape = new THREE.Shape();
    gShape.moveTo(-outer, -outer);
    gShape.lineTo(outer, -outer);
    gShape.lineTo(outer, outer);
    gShape.lineTo(-outer, outer);
    gShape.lineTo(-outer, -outer);
    const gHole = new THREE.Path();
    // two rounded lenses joined over a nose bridge
    gHole.moveTo(-gw + 0.02, -gh);
    gHole.lineTo(-0.012, -gh);
    gHole.quadraticCurveTo(0, -gh + 0.022, 0.012, -gh);
    gHole.lineTo(gw - 0.02, -gh);
    gHole.quadraticCurveTo(gw, -gh, gw, -gh + 0.02);
    gHole.lineTo(gw, gh - 0.02);
    gHole.quadraticCurveTo(gw, gh, gw - 0.02, gh);
    gHole.lineTo(-gw + 0.02, gh);
    gHole.quadraticCurveTo(-gw, gh, -gw, gh - 0.02);
    gHole.lineTo(-gw, -gh + 0.02);
    gHole.quadraticCurveTo(-gw, -gh, -gw + 0.02, -gh);
    gShape.holes.push(gHole);
    const gMesh = new THREE.Mesh(new THREE.ShapeGeometry(gShape, 8), shellMat);
    gMesh.position.set(0, gy, Z);
    gMesh.renderOrder = RO_SHELL;
    gMesh.frustumCulled = false;
    this.goggles.add(gMesh);
    this.gLens = new THREE.Mesh(new THREE.PlaneGeometry(2 * gw + 0.004, 2 * gh + 0.004), this.lensMat);
    this.gLens.position.set(0, gy, Z);
    this.gLens.renderOrder = RO_LENS;
    this.gLens.frustumCulled = false;
    this.goggles.add(this.gLens);
    this.group.add(this.goggles);

    this.shell.visible = false;
    this.setTransmission(1);
  }

  // The filter's attenuation of virtual content is applied as tone-mapping exposure by the app
  // (linear radiance x T, so arc-lit surfaces stay visible while ambient light goes dark). The lens
  // overlay adds the green tint and, in passthrough, darkens the camera image through alpha.
  setTransmission(T) {
    this.transmission = T;
    this.lensMat.uniforms.T.value.setRGB(0.82, 1.0, 0.7);
    this.lensMat.uniforms.Ta.value = T;
  }

  toggle() {
    if (this.kind === 'goggles') return;
    this.setDown(!this.down);
  }

  setDown(v) {
    this.down = v && this.kind !== 'none' && this.kind !== 'goggles';
  }

  // shade of the filter when it is dark (fixed glass: always)
  get darkShade() {
    return (this.kind === 'passive' || this.kind === 'goggles') && this.fixedShade ? this.fixedShade : this.shade;
  }

  // arcOn: arc burning this frame. dt in seconds.
  update(dt, arcOn) {
    if (this.kind === 'goggles') {
      // goggles: always in front of the eyes with their fixed filter (drawn in the headset only: the desktop
      // view is an observer's)
      this.shell.visible = false;
      this.goggles.visible = !!this.xr;
      this.anim = 1;
      this.dark = true;
      this.setTransmission(this.xr ? gogglesTransmission(this.fixedShade || 5) : 1);
      return;
    }
    this.goggles.visible = false;
    const target = this.down ? 1 : 0;
    const k = Math.min(1, dt / 0.18);
    this.anim += (target - this.anim) * (target > this.anim ? Math.max(k, 0.25) : k);
    if (Math.abs(this.anim - target) < 0.002) this.anim = target;
    this.shell.visible = this.anim > 0.01;
    // shell slides in from above (pivot behind the head)
    const a = (1 - this.anim) * 1.25;
    this.shell.rotation.x = a;
    this.shell.position.set(0, (1 - this.anim) * 0.05, (1 - this.anim) * 0.02);

    if (this.kind === 'none' && this.down) this.down = false;
    if (arcOn && !this.adfFail) this.darkHold = this.delay;
    else this.darkHold = Math.max(0, this.darkHold - dt);
    let status;
    if (this.kind === 'passive') {
      // fixed-shade glass: always dark, no electronics
      this.dark = true;
      this.setTransmission(displayedTransmission(this.darkShade));
      status = '';
    } else {
      this.dark = (arcOn && !this.adfFail) || this.darkHold > 0;
      this.setTransmission(displayedTransmission(this.dark ? this.shade : this.lightShade));
      status = this.dark ? `DIN ${this.shade}` : `DIN ${this.lightShade}`;
    }
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      const c = this.statusCanvas.getContext('2d');
      c.clearRect(0, 0, 256, 64);
      c.fillStyle = this.dark ? '#7dff9a' : '#6f8a76';
      c.font = 'bold 44px sans-serif';
      c.textAlign = 'right';
      c.fillText(status, 250, 48);
      this.statusTex.needsUpdate = true;
    }
  }

  // Fully down (lens in front of the eyes)? Goggles always are.
  get isDown() {
    return this.kind === 'goggles' || this.anim > 0.95;
  }
}

// Detects a quick downward nod of the head (pitch rate) used to drop the helmet.
export class NodDetector {
  constructor() {
    this.prevPitch = null;
    this.rate = 0;
    this.cool = 0;
  }

  // q: head quaternion (world). Returns true on a nod.
  update(dt, q) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    let nod = false;
    if (this.prevPitch !== null && dt > 0) {
      const r = (pitch - this.prevPitch) / dt;
      this.rate += (r - this.rate) * Math.min(1, dt / 0.03);
      this.cool = Math.max(0, this.cool - dt);
      // fast downward pitch (> ~170 deg/s) while looking roughly forward/down
      if (this.cool === 0 && this.rate < -3.0 && pitch < 0.35) {
        nod = true;
        this.cool = 0.8;
      }
    }
    this.prevPitch = pitch;
    return nod;
  }
}
