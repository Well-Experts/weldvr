// Weld station: one coupon on the bench, its weld session (with the coupon heat-flow model), and
// everything that turns the torch pose into a weld you can see, hear and feel (bead, pool, glow,
// heat tint, marks, arc effects, haptics). Live welding, scripted demo welds and replays all go
// through `step()`.

import * as THREE from 'three';
import { WeldSession, surfaceHeight, speedTarget, techniqueWindows } from '../sim/session.js';
import { scriptedWeld, keyholeWindow } from '../sim/scripted.js';
import { heatInput, nominalCTWD } from '../sim/process.js';
import { poolTemperature } from '../sim/pool.js';
import { T_AMBIENT } from '../sim/material.js';
import { Coupon } from '../render/coupon.js';
import { buildFixture } from '../render/environment.js';
import { clamp } from '../sim/util.js';
import { pipeLocal, pipePoint, dirToJoint, dirFromJoint, pipeFrame, pipeTravelWindow } from '../sim/pipe.js';

export function envFromEquipment(eq = {}) {
  const env = { gasAvailable: !eq.cylinderEmpty, wind: eq.fan && !eq.screen ? 3.0 : 0 };
  if (eq.oily) env.contamAt = (s) => (s >= eq.oily.s0 && s <= eq.oily.s1 ? 1 : 0);
  return env;
}

const METRICS = ['workAngle', 'travelAngle', 'stickOut', 'speed', 'aim'];
// Recorded frame: dt, tip (3), wire/electrode axis (3), trigger (GTAW: amperage control 0..1), filler-rod
// tip (3, NaN when none), spare.
export const FRAME = 12;
const NEAR_TAU = 1.5; // s: surface near-field relaxing into the through-thickness field. seed

function newStats() {
  const m = {};
  for (const k of METRICS) m[k] = { t: 0, tin: 0, sum: 0, sum2: 0 };
  // kh: open-root run, time with the keyhole in its window (scripted.js keyholeWindow)
  return { m, arcTime: 0, heat: { sum: 0, t: 0 }, wpsOut: 0, wpsT: 0, kh: { t: 0, tin: 0 } };
}

export class WeldStation {
  constructor(app) {
    this.app = app;
    this.pivot = new THREE.Group();
    this.pivot.name = 'couponPivot';
    app.workstation.add(this.pivot);
    this.fixture = null;
    this.coupon = null;
    this.session = null;
    this.equipment = { cylinderEmpty: false, fan: false, screen: false, oily: null };
    this.frozen = false;
    this.cfg = null;
    // scratch
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.m1 = new THREE.Matrix4();
    this.m2 = new THREE.Matrix4();
    this.invCoupon = new THREE.Matrix4();
    this.invWS = new THREE.Matrix4();
    this.poolWS = new THREE.Vector3();
    this.tipWS = new THREE.Vector3();
    this.axisWS = new THREE.Vector3();
    this.frameWS = { t: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3() };
    this.fxState = { arcOn: false, pool: null, tip: null, axis: null, frame: this.frameWS, poolW: 0.008, poolL: 0.009, arc: null, helmetDown: false };
    this.marksT = 0;
    this.texT = 0;
    this.beadT = 0;
    this.lastState = null;
    this.stubT = 0;
    this.stubbed = false;
  }

  get joint() {
    return this.coupon ? this.coupon.joint : null;
  }

  get record() {
    return this.session ? this.session.record : null;
  }

  get thermal() {
    return this.session ? this.session.thermal : null;
  }

  get settings() {
    return this.session.settings;
  }

  // cfg: { joint, process, settings, equipment, seed, mirror, wps, prebuilt: [passes], frozen }
  load(cfg) {
    this.dispose();
    this.cfg = cfg;
    this.equipment = { cylinderEmpty: false, fan: false, screen: false, oily: null, ...(cfg.equipment || {}) };
    const joint = cfg.joint;
    if (joint.pipe) joint.pipe.roll = 0; // a fresh coupon (or a replay) starts unrolled
    this.mirror = !!cfg.mirror && !joint.pipe; // a pipe has no left-handed mirror: both halves are welded
    const env = envFromEquipment(this.equipment);
    this.session = new WeldSession({ joint, settings: cfg.settings, env, seed: cfg.seed ?? 1 });
    // bead-on-plate drills: the lane of the first bead (later lanes arrive with newPass)
    if (cfg.lane != null && joint.type === 'plate') this.session.record.pass.lane = cfg.lane;
    this.coupon = new Coupon(joint, { mirror: this.mirror, oily: this.equipment.oily, thermal: this.session.thermal });
    this.pivot.position.set(0, 0, 0);
    this.pivot.quaternion.identity();
    this.pivot.add(this.coupon.group);
    this.fixture = buildFixture(joint, this.coupon.place);
    this.app.env.fixtures.add(this.fixture);
    this.frozen = !!cfg.frozen;
    this.near = [];
    if (cfg.prebuilt) {
      this.session.thermal.dtMax = 1 / 12;
      scriptedWeld({ joint, settings: cfg.settings, env, seed: cfg.seed, passes: cfg.prebuilt, session: this.session });
      this.session.thermal.dtMax = 1 / 24;
      this.session.reset();
      this.coolDown();
    }
    this.stats = [newStats()];
    this.frames = [];
    this.events = [];
    this.log = { arcStarts: 0, helmetUpStarts: 0, flashes: 0, stubs: 0, outOfWps: 0 };
    this.readings = []; // contact thermometer readings {t, x, T, pass}
    this.pacer = null;
    this.lastState = null;
    this.refreshMatrices();
    this.app.onCouponLoaded?.();
    return this;
  }

  dispose() {
    if (this.coupon) {
      this.pivot.remove(this.coupon.group);
      this.coupon.dispose();
      this.coupon = null;
    }
    if (this.fixture) {
      this.fixture.parent?.remove(this.fixture);
      this.fixture.traverse((o) => o.geometry && o.geometry.dispose());
      this.fixture = null;
    }
    this.session = null;
  }

  // Finished coupon for inspection: final bead and marks, the coupon cold (heat tint kept).
  coolDown() {
    const rec = this.record;
    const c = this.coupon;
    const th = this.thermal;
    if (th) th.toAmbient(); // inspection happens on a cold coupon: heat tint (peaks) stays
    c.refreshBeads(rec, rec.time + 1000);
    c.marks.rebuild(rec);
    this.near = [];
    for (const b of c.beads) b.updateHeat(() => T_AMBIENT);
    c.view.upload(true);
  }

  // log = false when applying a recorded event (replay): the event list is not extended
  setEquipment(patch, log = true) {
    Object.assign(this.equipment, patch);
    if ('oily' in patch && !patch.oily) this.coupon.clearContamination();
    if (this.session) this.session.env = envFromEquipment(this.equipment);
    if (log) this.events.push({ f: this.frameIndex(), type: 'equipment', data: { ...patch } });
  }

  setSettings(patch) {
    Object.assign(this.session.settings, patch);
    this.events.push({ f: this.frameIndex(), type: 'settings', data: { ...patch } });
  }

  passIndex() {
    return this.record.passes.length - 1;
  }

  // Technique windows. Pipe (SMAW): the electrode angle window of the position the joint is in at x (the
  // arc, or where the electrode points), relative to the run's travel direction (sim/pipe.js).
  windows(x = null) {
    const j = this.joint;
    const s = this.session.settings;
    const w = techniqueWindows(j, s, this.passIndex());
    if (j.pipe && s.process === '111') {
      const ls = this.lastState;
      const xx = x ?? (ls && ls.hit ? ls.hit.x : 0);
      w.travelAngle = pipeTravelWindow(j, xx, this.session.sigma || 1);
    }
    const vt = speedTarget(j, s, this.passIndex(), nominalCTWD(s.process, s));
    w.speed = [vt * 0.8, vt * 1.2];
    w.speedTarget = vt;
    w.speedByKeyhole = this.speedByKeyhole();
    return w;
  }

  // Root run of an open-root joint: the travel speed is the welder's control of the keyhole, not a
  // deposition rate to keep up with (Lincoln C2.420: keyhole too small - "Slower travel speed"; too large -
  // "Travel faster until the size of the keyhole decreases"). On that run the speed is judged by the
  // keyhole (keyhole share), and the deposition-based speed window, its pacer and its cues are not used.
  speedByKeyhole() {
    return !!(this.joint.openRoot && this.passIndex() === 0);
  }

  newPass(lane = null) {
    const rec = this.record;
    rec.newPass();
    if (lane != null) rec.pass.lane = lane;
    this.session.reset();
    this.stats.push(newStats());
    this.events.push({ f: this.frameIndex(), type: 'newPass', data: lane });
  }

  frameIndex() {
    return this.frames.length / FRAME;
  }

  // GTAW: regrind the tungsten (remove the contaminated or oxidised tip and repoint it).
  regrindTungsten() {
    if (!this.session || this.session.arcOn || !this.session.tig) return false;
    this.session.regrindTungsten();
    this.events.push({ f: this.frameIndex(), type: 'regrind' });
    return true;
  }

  // GTAW: a new filler rod in the off hand.
  newRod() {
    if (!this.session || !this.session.tig) return false;
    this.session.newRod();
    this.events.push({ f: this.frameIndex(), type: 'rod' });
    return true;
  }

  get tig() {
    return this.session ? this.session.tig || null : null;
  }

  // SMAW: put a new electrode in the holder (arc must be off).
  newElectrode() {
    if (!this.session || this.session.arcOn) return null;
    const e = this.session.newElectrode();
    this.events.push({ f: this.frameIndex(), type: 'electrode' });
    return e;
  }

  get electrode() {
    return this.session ? this.session.electrode || null : null;
  }

  // Pipe rotated between runs (1G): turn the coupon about its axis to `roll` (rad; the point at angle a
  // goes to a + roll). The arc must be off. The weld record is unchanged; gravity follows the new roll.
  setRoll(roll, log = true) {
    const j = this.joint;
    if (!j || !j.pipe || (this.session && this.session.arcOn)) return false;
    this.coupon.setRoll(roll);
    this.coupon.group.updateWorldMatrix(true, false);
    this.refreshMatrices();
    if (log) this.events.push({ f: this.frameIndex(), type: 'roll', data: roll });
    return true;
  }

  // Grind the start or stop of the current pass to a feathered edge (record.feather): from xZero (ground
  // flush) to xFull (untouched). The arc must be off.
  feather(xZero, xFull, opts = {}, log = true) {
    if (!this.session || this.session.arcOn) return 0;
    const n = this.record.feather(xZero, xFull, opts);
    if (n > 0) {
      this.coupon.refreshBeads(this.record, this.record.time);
      this.coupon.marks.rebuild(this.record);
      if (log) this.events.push({ f: this.frameIndex(), type: 'feather', data: [xZero, xFull, opts.beyond ?? 3, opts.pass ?? null] });
    }
    return n;
  }

  cleanAll(log = true) {
    this.record.clean();
    this.coupon.refreshBeads(this.record, this.record.time);
    if (log) this.events.push({ f: this.frameIndex(), type: 'clean' });
  }

  // Chipping hammer blow (SMAW slag comes off in two steps: chip, then brush).
  chip(i0, i1, u = null, log = true) {
    const n = this.record.chip(i0, i1, u);
    if (n > 0) {
      this.coupon.updateBead(this.record, i0, i1, this.record.time);
      if (log) this.events.push({ f: this.frameIndex(), type: 'chip', data: [i0, i1, u] });
    }
    return n;
  }

  brush(i0, i1, u = null, log = true) {
    const n = this.record.brush(i0, i1, u);
    if (n > 0) {
      this.coupon.updateBead(this.record, i0, i1, this.record.time);
      if (log) this.events.push({ f: this.frameIndex(), type: 'brush', data: [i0, i1, u] });
    }
    return n;
  }

  // Let the coupon cool (interpass wait / time skip). The arc must be off.
  coolFor(seconds) {
    if (!this.session || this.session.arcOn || !(seconds > 0)) return;
    this.session.cool(seconds);
    this.relaxNear(seconds, false);
    this.events.push({ f: this.frameIndex(), type: 'cool', data: seconds });
  }

  // Contact thermometer: temperature at a sim point (x, u, v) (surface of the plate or weld).
  temperatureAt(x, u, v) {
    const th = this.thermal;
    if (!th) return T_AMBIENT;
    return th.at(clamp(x, 0, this.joint.L), u, v);
  }

  recordReading(x, T) {
    this.readings.push({ t: this.record.time, x, T, pass: this.passIndex() });
    this.events.push({ f: this.frameIndex(), type: 'reading', data: [x, T] });
  }

  // ---- coordinate conversion (sim coords: x along the joint in travel direction, mm) -----------
  refreshMatrices() {
    if (!this.coupon) return;
    this.coupon.group.updateWorldMatrix(true, false, true);
    this.invCoupon.copy(this.coupon.group.matrixWorld).invert();
    this.invWS.copy(this.app.workstation.matrixWorld).invert();
  }

  simFromWorld(posW, dirW, outTip, outDir) {
    const p = this.v1.copy(posW).applyMatrix4(this.invCoupon);
    const L = this.joint.L;
    if (this.joint.pipe) {
      // round the pipe: unwrap the point, and give the direction in the local frame at that x
      pipeLocal(this.joint, p.x, p.y, p.z, outTip);
      if (dirW && outDir) {
        const d = this.v2.copy(dirW).transformDirection(this.invCoupon);
        dirToJoint(this.joint, outTip[0], [d.x, d.y, d.z], outDir);
      }
      return;
    }
    outTip[0] = this.mirror ? L - p.x : p.x;
    outTip[1] = p.y;
    outTip[2] = p.z;
    if (dirW && outDir) {
      const d = this.v2.copy(dirW).transformDirection(this.invCoupon);
      outDir[0] = this.mirror ? -d.x : d.x;
      outDir[1] = d.y;
      outDir[2] = d.z;
    }
  }

  worldFromSim(x, u, v, out) {
    const L = this.joint.L;
    if (this.joint.pipe) {
      const p = pipePoint(this.joint, x, u, v, this.pp || (this.pp = [0, 0, 0]));
      this.lastX = x;
      return out.set(p[0], p[1], p[2]).applyMatrix4(this.coupon.group.matrixWorld);
    }
    return out.set(this.mirror ? L - x : x, u, v).applyMatrix4(this.coupon.group.matrixWorld);
  }

  // d in the joint frame at x (pipe: the local frame changes round the pipe; x defaults to the point last
  // given to worldFromSim)
  dirWorldFromSim(d, out, x = this.lastX ?? 0) {
    if (this.joint.pipe) {
      const q = dirFromJoint(this.joint, x, d, this.pd || (this.pd = [0, 0, 0]));
      return out.set(q[0], q[1], q[2]).transformDirection(this.coupon.group.matrixWorld);
    }
    return out.set(this.mirror ? -d[0] : d[0], d[1], d[2]).transformDirection(this.coupon.group.matrixWorld);
  }

  surfaceAt(x, u = 0) {
    return surfaceHeight(this.record, Math.floor(x), u);
  }

  // ---- per-frame update ---------------------------------------------------------------------------
  // tip/dir: sim coordinates (arrays) or null when the torch is not available. trigger: boolean.
  step(dt, tip, dir, trigger, opts = {}) {
    const rec = this.record;
    if (!rec || this.frozen) return null;
    const j = this.joint;
    if (!tip) {
      // keep replay timing identical: idle frames are recorded too
      if (opts.record) this.frames.push(dt, NaN, NaN, NaN, 0, 0, 0, 0, NaN, NaN, NaN, 0);
      if (this.session.arcOn) this.session.update(dt, [0, 0, 1e6], [0, 0, 1], false); // torch lost: arc goes out
      else this.session.idle(dt);
      this.lastState = null;
      this.visualIdle(dt);
      return null;
    }
    // wire stubbing: torch pushed into the work while welding (GMAW/FCAW; SMAW sticking is in the session)
    const smaw = this.session.settings.process === '111';
    if (this.stubbed) {
      if (!trigger) this.stubbed = false;
      trigger = false;
    }
    const tig = this.session.settings.process === '141';
    const trig = tig ? (typeof trigger === 'number' ? trigger : trigger ? 1 : 0) : !!trigger;
    const rod = tig && opts.rod ? opts.rod : null;
    if (opts.record) this.frames.push(dt, tip[0], tip[1], tip[2], dir[0], dir[1], dir[2], +trig, rod ? rod[0] : NaN, rod ? rod[1] : NaN, rod ? rod[2] : NaN, 0);
    const st = this.session.update(dt, tip, dir, trig, rod ? { rod } : null);
    this.lastState = st;
    if (!smaw && !tig && st.arcOn && st.tech.ctwd < 1.5) {
      this.stubT += dt;
      if (this.stubT > 0.2) {
        this.stubbed = true;
        this.stubT = 0;
        this.log.stubs++;
        st.stub = true;
      }
    } else this.stubT = 0;
    if (st.started) {
      this.log.arcStarts++;
      if (opts.helmetDown === false) this.log.helmetUpStarts++;
    }
    if (tig && this.session.tig) {
      // GTAW events of this frame (session.gtawIgnition / gtawFiller)
      const ev = this.session.tig.events;
      st.tig = ev.length ? ev.slice() : null;
      for (const e of ev) this.log[e] = (this.log[e] || 0) + 1;
      st.fillerRate = this.session.tig.fillerRate;
    }
    if (smaw && this.session.electrode) {
      const ev = this.session.electrode.events;
      if (ev.includes('stuck')) {
        this.log.sticks = (this.log.sticks || 0) + 1;
        st.stuck = true;
      }
      if (ev.includes('freed')) st.freed = true;
      if (ev.includes('outLong')) {
        this.log.longOuts = (this.log.longOuts || 0) + 1;
        st.outLong = true;
      }
      if (ev.includes('used')) st.used = true;
    }
    const c = this.coupon;
    if (st.arcOn) {
      // stats
      const arc = st.arc;
      const pass = this.stats[this.stats.length - 1];
      const inEval = st.hit && st.hit.x >= j.tab && st.hit.x <= j.L - j.tab;
      if (inEval) {
        const w = this.windows(st.hit.x);
        // SMAW: the 'stickOut' metric is the arc length (no wire stick-out)
        const vals = { workAngle: st.tech.workAngle, travelAngle: st.tech.travelAngle, stickOut: smaw || tig ? arc.arcLen : arc.stickOut, speed: st.tech.speed, aim: st.tech.aimC ?? st.tech.aim };
        const wins = { workAngle: w.workAngle, travelAngle: w.travelAngle, stickOut: w.stickOut, speed: w.speed, aim: w.aim };
        for (const k of METRICS) {
          if (k === 'speed' && w.speedByKeyhole) continue; // judged by the keyhole share below
          const m = pass.m[k];
          const v = vals[k];
          m.t += dt;
          m.sum += v * dt;
          m.sum2 += v * v * dt;
          if (v >= wins[k][0] && v <= wins[k][1]) m.tin += dt;
        }
        pass.arcTime += dt;
        if (j.openRoot && this.passIndex() === 0 && st.keyhole != null) {
          const kw = keyholeWindow(j, st.hit.x, this.session.sigma || 1);
          pass.kh.t += dt;
          if (st.keyhole >= kw.lo && st.keyhole <= kw.hi) pass.kh.tin += dt;
        }
        const Q = heatInput(arc.k, arc.U, arc.I, Math.max(st.tech.speed, 0.5));
        if (st.tech.speed > 0.5) {
          pass.heat.sum += Q * dt;
          pass.heat.t += dt;
        }
        if (opts.wps) {
          pass.wpsT += dt;
          if (!opts.wps(this.session.settings)) pass.wpsOut += dt;
        }
      }
      // visuals: rebuild the bead around the pool, refresh the surface near-field temperature
      if (st.inJoint) {
        const s = clamp(st.hit.x, 0, j.L - 0.01);
        c.updateBead(rec, Math.floor(s) - 6, Math.ceil(s) + 6, rec.time, this.passIndex());
        this.nearField(st);
      }
      this.marksT += dt;
      if (this.marksT > 0.25) {
        this.marksT = 0;
        c.marks.rebuild(rec);
      }
    }
    if (st.stopped || st.started) c.marks.rebuild(rec);
    this.visualIdle(dt);
    return st;
  }

  // Surface temperature of the bead behind the arc: the moving-source solution on the weld line.
  nearField(st) {
    const shape = st.pool && st.pool.shape;
    if (!shape || !(shape.A > 0)) return;
    const k = this.passIndex();
    const n = this.joint.n;
    const arr = this.near[k] || (this.near[k] = new Float32Array(n).fill(T_AMBIENT));
    const x0 = st.hit.x;
    const dir = st.pool.dir || 1;
    // the point-source solution is singular at the arc: inside the pool the metal is liquid (drawn
    // by the pool mesh), so the solid bead behind it is capped just below the liquidus
    const Tcap = shape.Tm - 15;
    const pipe = !!this.joint.pipe;
    const a = pipe ? Math.floor(x0 - 90) : Math.max(0, Math.floor(x0 - 90));
    const b = pipe ? Math.ceil(x0 + 90) : Math.min(n - 1, Math.ceil(x0 + 90));
    for (let ii = a; ii <= b; ii++) {
      const i = pipe ? ((ii % n) + n) % n : ii;
      const xi = (ii + 0.5 - x0) * dir;
      if (xi > 1) continue;
      const T = Math.min(Tcap, poolTemperature(shape, Math.min(xi, -0.6), 0));
      if (T > arr[i]) arr[i] = T;
    }
  }

  // Called once per rendered frame: push changed bead samples to the GPU.
  flush() {
    if (this.coupon) this.coupon.flushBeads();
  }

  // Near-field (bead surface) temperatures relax into the plate field over `dt` seconds of
  // coupon time; `draw` also pushes the bead glow to the GPU (about 30 Hz).
  relaxNear(dt, draw) {
    const c = this.coupon;
    const rec = this.record;
    const th = this.thermal;
    const kd = Math.exp(-dt / NEAR_TAU);
    for (let k = 0; k < this.near.length; k++) {
      const arr = this.near[k];
      if (!arr) continue;
      const lane = this.joint.type === 'plate' ? rec.passes[k]?.lane ?? 0 : 0;
      let hot = false;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] <= T_AMBIENT + 1) continue;
        const Tl = th ? th.lineT(i + 0.5, lane) : T_AMBIENT;
        arr[i] = Tl + (arr[i] - Tl) * kd;
        if (arr[i] > Tl + 1) hot = true;
        else arr[i] = T_AMBIENT;
      }
      if (draw) {
        const bead = this.joint.type === 'plate' ? c.beadFor(k) : c.bead;
        bead.updateHeat((i) => Math.max(arr[i], th ? th.lineT(i + 0.5, lane) : T_AMBIENT));
        if (!hot) this.near[k] = null;
      }
    }
  }

  visualIdle(dt) {
    const c = this.coupon;
    const rec = this.record;
    // near-field temperatures relax into the plate field
    this.beadT += dt;
    const doBeads = this.beadT > 1 / 30;
    if (doBeads) this.beadT = 0;
    this.relaxNear(dt, doBeads);
    // plate field texture (about 15 Hz)
    this.texT += dt;
    if (this.texT > 1 / 15) {
      this.texT = 0;
      c.view.upload();
    }
    // weld pool
    c.pool.update(dt, this.lastState, rec, this.session.settings.process);
  }

  // Effects state for the arc/pool/sparks renderer (workstation-local coordinates).
  // tipW / axisW: torch contact tip and wire axis in world space (or null).
  fx(helmetDown, tipW, axisW) {
    const st = this.lastState;
    const f = this.fxState;
    f.helmetDown = helmetDown;
    if (!this.coupon) {
      f.arcOn = false;
      return f;
    }
    const j = this.joint;
    if (st && st.hit) {
      const h = st.hit;
      this.worldFromSim(h.x, h.u, h.v, this.v1);
      this.poolWS.copy(this.v1).applyMatrix4(this.invWS);
      f.pool = this.poolWS;
      const m = this.m1.copy(this.invWS).multiply(this.coupon.group.matrixWorld);
      if (j.pipe) {
        // local frame at the arc round the pipe (t along +x)
        const fr = pipeFrame(j, h.x, this.pf || (this.pf = { t: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 0] }));
        this.frameWS.t.set(...fr.t).transformDirection(m);
        this.frameWS.u.set(...fr.u).transformDirection(m);
        this.frameWS.v.set(...fr.v).transformDirection(m);
      } else {
        this.frameWS.t.setFromMatrixColumn(m, 0).normalize();
        if (this.mirror) this.frameWS.t.negate();
        this.frameWS.u.setFromMatrixColumn(m, 1).normalize();
        this.frameWS.v.setFromMatrixColumn(m, 2).normalize();
      }
      const pw = st.pool ? 2 * st.pool.w : 7;
      f.poolW = clamp(pw, 3, 20) / 1000;
      f.poolL = clamp(st.pool ? st.pool.Lb + st.pool.Lf : 9, 4, 40) / 1000;
    }
    f.arcOn = !!(st && st.arcOn);
    f.arc = st ? st.arc : null;
    f.process = this.session ? this.session.settings.process : '135';
    f.gas = this.session ? this.session.settings.gas : 'Ar-18CO2';
    f.wire = this.session ? this.session.settings.wire : 1.2;
    f.electrode = this.session && this.session.electrode ? this.session.electrode : null;
    f.tig = this.session && this.session.tig ? this.session.tig : null;
    if (tipW && axisW) {
      this.tipWS.copy(tipW).applyMatrix4(this.invWS);
      this.axisWS.copy(axisW).transformDirection(this.invWS);
      f.tip = this.tipWS;
      f.axis = this.axisWS;
    } else if (f.pool) {
      f.tip = f.pool;
      this.axisWS.copy(this.frameWS.v).negate();
      f.axis = this.axisWS;
    }
    // coupon frame (bench <- joint mm) for spatter collisions
    f.couponToBench = this.m2.copy(this.invWS).multiply(this.coupon.group.matrixWorld);
    f.joint = j;
    f.mirror = this.mirror;
    f.record = this.record;
    return f;
  }

  // Technique summary per pass for the results screen.
  techniqueSummary() {
    return this.stats.map((p) => {
      const out = { arcTime: p.arcTime, heatInput: p.heat.t > 0 ? p.heat.sum / p.heat.t : null, wpsInside: p.wpsT > 0 ? 1 - p.wpsOut / p.wpsT : null, keyhole: p.kh && p.kh.t > 0 ? { t: p.kh.t, tin: p.kh.tin } : null };
      for (const k of METRICS) {
        const m = p.m[k];
        out[k] = m.t > 0 ? { inWindow: m.tin / m.t, mean: m.sum / m.t, sd: Math.sqrt(Math.max(0, m.sum2 / m.t - (m.sum / m.t) ** 2)) } : null;
      }
      return out;
    });
  }
}

export { METRICS };
