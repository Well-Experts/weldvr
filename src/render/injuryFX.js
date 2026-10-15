// Head-locked effects for safety incidents (no gore): a red pain vignette, a white glare veil and a
// fading after-image after an arc flash. Drawn on top of everything, inside the helmet shell order.

import * as THREE from 'three';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const PAIN_FS = `
varying vec2 vUv; uniform float amt;
void main(){
  vec2 d = vUv - 0.5; float r = length(d * vec2(1.0, 1.3));
  float a = smoothstep(0.18, 0.62, r) * amt;
  gl_FragColor = vec4(0.75, 0.04, 0.02, a);
}`;
const AFTER_FS = `
varying vec2 vUv; uniform float amt; uniform vec2 c;
void main(){
  float r = length((vUv - c) * vec2(1.0, 1.25));
  float core = 1.0 - smoothstep(0.0, 0.07, r);
  float halo = 1.0 - smoothstep(0.05, 0.2, r);
  // negative after-image: a dark purple-green blot with a faint bright rim
  vec3 col = mix(vec3(0.25, 0.35, 0.18), vec3(0.04, 0.02, 0.08), core);
  gl_FragColor = vec4(col, (0.75 * core + 0.35 * halo) * amt);
}`;

export class InjuryFX {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'injuryFX';
    const mk = (fs, extra = {}) => new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { amt: { value: 0 }, ...extra },
    });
    this.painMat = mk(PAIN_FS);
    this.pain = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), this.painMat);
    this.pain.position.set(0, 0, -0.085);
    this.pain.renderOrder = 10040;
    this.pain.frustumCulled = false;
    this.afterMat = mk(AFTER_FS, { c: { value: new THREE.Vector2(0.5, 0.5) } });
    this.after = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), this.afterMat);
    this.after.position.set(0, 0, -0.086);
    this.after.renderOrder = 10041;
    this.after.frustumCulled = false;
    this.veilMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), this.veilMat);
    this.veil.position.set(0, 0, -0.087);
    this.veil.renderOrder = 10042;
    this.veil.frustumCulled = false;
    this.group.add(this.pain, this.after, this.veil);
    this.painA = 0;
    this.afterA = 0;
    this.veilA = 0;
    this.sync();
  }

  // a burn or shock: short red pulse
  hurt(level = 1) {
    this.painA = Math.min(1, Math.max(this.painA, 0.55 + 0.45 * level));
  }

  // an arc flash: white-out, then an after-image where the arc was (view uv 0..1)
  flashBlind(uv = null) {
    this.veilA = 1;
    this.afterA = 1;
    if (uv) this.afterMat.uniforms.c.value.set(uv.x, uv.y);
  }

  // continuous glare (dazzle) level from the safety monitor, 0..1
  setGlare(g) {
    this.glare = g;
  }

  update(dt) {
    this.painA = Math.max(0, this.painA - dt / 0.9);
    this.veilA = Math.max(0, this.veilA - dt / 1.6);
    this.afterA = Math.max(0, this.afterA - dt / 9);
    this.sync();
  }

  sync() {
    const veil = Math.max(this.veilA, (this.glare || 0) * 0.55);
    this.painMat.uniforms.amt.value = this.painA;
    this.afterMat.uniforms.amt.value = this.afterA;
    this.veilMat.opacity = veil;
    this.pain.visible = this.painA > 0.01;
    this.after.visible = this.afterA > 0.01;
    this.veil.visible = veil > 0.01;
  }
}
