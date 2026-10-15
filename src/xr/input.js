// XR controller input by handedness, with button edges, thumbstick axes and haptics.
// Quest Touch Plus uses the xr-standard gamepad mapping:
//   buttons 0 trigger, 1 squeeze, 3 thumbstick press, 4 A/X, 5 B/Y, 6 thumbrest; axes 2/3 thumbstick.

import * as THREE from 'three';

const BTN = { trigger: 0, squeeze: 1, stick: 3, a: 4, b: 5, rest: 6 };

function makeHand(side) {
  return {
    side,
    connected: false,
    source: null,
    ray: null,
    grip: null,
    tracked: false,
    emulated: false,
    trigger: 0,
    squeeze: 0,
    stick: new THREE.Vector2(),
    pressed: {},
    down: {},
    up: {},
    consumed: false, // trigger press used by the UI until release
    stickLatch: 0,
  };
}

export class XRInput {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.hands = { left: makeHand('left'), right: makeHand('right') };
    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      ray.userData.index = i;
      ray.addEventListener('connected', (e) => {
        const src = e.data;
        if (!src || src.hand || !src.gamepad) return; // hand-tracking sources are not used for welding
        const h = this.hands[src.handedness];
        if (!h) return;
        h.connected = true;
        h.source = src;
        h.ray = ray;
        h.grip = grip;
        ray.userData.hand = h;
      });
      ray.addEventListener('disconnected', () => {
        const h = ray.userData.hand;
        if (h) {
          h.connected = false;
          h.source = null;
          h.tracked = false;
        }
        ray.userData.hand = null;
      });
      scene.add(ray);
      scene.add(grip);
      this.controllers.push({ ray, grip });
    }
    this.hapticsOn = true;
    this.handsOnly = false;
  }

  // Call once per frame after the XR frame has updated controller poses.
  update(frame, refSpace) {
    let anyGamepad = false;
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      for (const k in BTN) {
        h.down[k] = false;
        h.up[k] = false;
      }
      if (!h.connected || !h.source || !h.source.gamepad) {
        h.tracked = false;
        for (const k in BTN) h.pressed[k] = false;
        h.trigger = 0;
        h.squeeze = 0;
        h.stick.set(0, 0);
        continue;
      }
      anyGamepad = true;
      const gp = h.source.gamepad;
      for (const k in BTN) {
        const b = gp.buttons[BTN[k]];
        const p = !!(b && b.pressed);
        if (p && !h.pressed[k]) h.down[k] = true;
        if (!p && h.pressed[k]) h.up[k] = true;
        h.pressed[k] = p;
      }
      h.trigger = gp.buttons[0] ? gp.buttons[0].value : 0;
      h.squeeze = gp.buttons[1] ? gp.buttons[1].value : 0;
      h.stick.set(gp.axes[2] || 0, gp.axes[3] || 0);
      if (h.up.trigger) h.consumed = false;
      // pose validity and emulated position (tracking loss) for the Tracking lab
      h.tracked = !!(h.ray && h.ray.visible);
      h.emulated = false;
      if (frame && refSpace && h.source.targetRaySpace) {
        const pose = frame.getPose(h.source.targetRaySpace, refSpace);
        h.tracked = !!pose;
        h.emulated = pose ? pose.emulatedPosition : true;
      }
    }
    this.handsOnly = !anyGamepad && !!(frame && frame.session && [...frame.session.inputSources].some((s) => s.hand));
  }

  // Thumbstick as discrete steps (returns -1, 0, +1 once per flick).
  stickStep(side, axis = 'y') {
    const h = this.hands[side];
    const v = axis === 'y' ? -h.stick.y : h.stick.x;
    if (Math.abs(v) < 0.35) {
      h.stickLatch = 0;
      return 0;
    }
    if (h.stickLatch) return 0;
    if (Math.abs(v) > 0.7) {
      h.stickLatch = 1;
      return Math.sign(v);
    }
    return 0;
  }

  pulse(side, intensity, ms) {
    if (!this.hapticsOn) return;
    const h = this.hands[side];
    const act = h && h.source && h.source.gamepad && h.source.gamepad.hapticActuators && h.source.gamepad.hapticActuators[0];
    if (act && act.pulse) {
      try {
        act.pulse(Math.max(0, Math.min(1, intensity)), ms);
      } catch {
        /* haptics are optional */
      }
    }
  }
}
