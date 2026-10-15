// Cutting station: the oxy-acetylene outfit, the plate on its cutting rack over a sand tray, the cutting session
// (sim/cut.js) and what is seen and heard of it: the plate with its kerf and glow, the flame at the tip, the
// spark stream, the outfit's gauges and hoses. In the bench (workstation) frame.
// The plate frame (mm): x along the marked line (the cut runs toward +x: to the welder's right, or left for a
// left-handed setting), u across (+ toward the welder, the strip that drops off on the far side), v up.

import * as THREE from 'three';
import { GasOutfit, chartRow, CUT_PLATES } from '../sim/ofc.js';
import { makeCutCoupon, CutSession, summarizeCut, CONE_MM, KINDLING_C, nominalSpeed } from '../sim/cut.js';
import { torchPose } from '../sim/cutScript.js';
import { CutPlateView, buildCutRack, plateMatrix } from '../render/cutPlate.js';
import { CutFX } from '../render/cutFx.js';
import { OutfitView } from '../render/oxyOutfit.js';
import { clamp, DEG } from '../sim/util.js';

const RACK_H = 0.12; // m, plate underside above the bench top (room under the kerf for the sparks)

export class CutStation {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'cutStation';
    this.root.visible = false;
    app.workstation.add(this.root);
    this.outfitView = new OutfitView();
    // cart on the welder's left, facing the bench front
    this.outfitView.group.position.set(-0.95, -0.9, -0.05);
    this.outfitView.group.rotation.y = Math.PI / 2 - 0.35;
    this.root.add(this.outfitView.group);
    this.outfitView.attachHoses(this.root);
    this.outfitView.setFloor(-0.9);
    this.fx = new CutFX();
    this.fx.floorY = -0.9;
    this.root.add(this.fx.group);
    this.plate = null;
    this.rack = null;
    this.session = null;
    this.outfit = null;
    this.state = null;
    this.events = [];
    this.inv = new THREE.Matrix4();
    this.m = new THREE.Matrix4();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.fxState = { cutting: false, through: false, blow: 0, rate: 0, front: new THREE.Vector3(), bottom: new THREE.Vector3(), jet: new THREE.Vector3(0, -1, 0), back: new THREE.Vector3(-1, 0, 0), dragAng: 0, glow: 0 };
    this.log = { starts: 0, restarts: 0, losses: 0, backfires: 0, sustained: 0, pops: 0, flashbacks: 0, severed: false, cold: 0 };
    this.frames = [];
  }

  get record() {
    return this.session ? this.session.record : null;
  }

  // cfg: { plate (CUT_PLATES id), bevel (deg), tip, L, drop, keep, outfit: GasOutfit options, seed, mirror,
  //        dirtyTip }
  load(cfg = {}) {
    this.dispose();
    this.cfg = cfg;
    const plateId = cfg.plate && CUT_PLATES[cfg.plate] ? cfg.plate : 'P12';
    const row = chartRow(plateId);
    this.coupon = makeCutCoupon({ plate: plateId, bevel: cfg.bevel || 0, L: cfg.L, drop: cfg.drop, keep: cfg.keep });
    this.outfit = new GasOutfit({ tip: cfg.tip || row.tip, row, ...(cfg.outfit || {}) });
    this.outfit.row = row;
    this.session = new CutSession({ coupon: this.coupon, outfit: this.outfit, seed: cfg.seed ?? 1, dirtyTip: !!cfg.dirtyTip });
    this.mirror = !!cfg.mirror;
    const c = this.coupon;
    this.place = { x0: this.mirror ? c.L / 2000 : -c.L / 2000, s: this.mirror ? -1 : 1, yTop: RACK_H + c.t / 1000, zLine: -0.1 };
    this.rack = buildCutRack(this.place, c);
    this.root.add(this.rack.group);
    this.fx.tray = this.rack.bounds;
    this.fx.trayY = this.rack.trayTop;
    this.fx.clear();
    this.plate = new CutPlateView(this.session, this.place);
    this.root.add(this.plate.group);
    this.plateToBench = plateMatrix(this.place);
    this.benchToPlate = this.plateToBench.clone().invert();
    this.root.visible = true;
    this.state = null;
    this.events = [];
    this.log = { starts: 0, restarts: 0, losses: 0, backfires: 0, sustained: 0, pops: 0, flashbacks: 0, severed: false, cold: 0 };
    this.frames = [];
    this.burnt = false;
    return this;
  }

  dispose() {
    if (this.plate) {
      this.root.remove(this.plate.group);
      this.plate.dispose();
      this.plate = null;
    }
    if (this.rack) {
      this.root.remove(this.rack.group);
      this.rack.group.traverse((o) => o.geometry && o.geometry.dispose());
      this.rack = null;
    }
    this.session = null;
    this.outfit = null;
    this.root.visible = false;
  }

  // ---- frames -------------------------------------------------------------------------------------
  benchFromWorld() {
    this.app.workstation.updateWorldMatrix(true, false);
    return this.inv.copy(this.app.workstation.matrixWorld).invert();
  }

  // world tip/axis -> plate mm (arrays)
  simFromWorld(posW, dirW, outTip, outDir) {
    const toBench = this.benchFromWorld();
    const p = this.v1.copy(posW).applyMatrix4(toBench).applyMatrix4(this.benchToPlate);
    outTip[0] = p.x;
    outTip[1] = p.y;
    outTip[2] = p.z;
    if (dirW && outDir) {
      const d = this.v2.copy(dirW).transformDirection(toBench);
      // bench direction -> plate frame (the plate matrix has scale 1/1000 and swaps y/z): normalise
      const m = this.benchToPlate;
      const e = m.elements;
      const x = e[0] * d.x + e[4] * d.y + e[8] * d.z, y = e[1] * d.x + e[5] * d.y + e[9] * d.z, z = e[2] * d.x + e[6] * d.y + e[10] * d.z;
      const n = Math.hypot(x, y, z) || 1;
      outDir[0] = x / n;
      outDir[1] = y / n;
      outDir[2] = z / n;
    }
  }

  // plate mm -> world
  worldFromSim(x, u, v, out) {
    this.app.workstation.updateWorldMatrix(true, false);
    return out.set(x, u, v).applyMatrix4(this.plateToBench).applyMatrix4(this.app.workstation.matrixWorld);
  }

  dirWorldFromSim(d, out) {
    const e = this.plateToBench.elements;
    const x = e[0] * d[0] + e[4] * d[1] + e[8] * d[2], y = e[1] * d[0] + e[5] * d[1] + e[9] * d[2], z = e[2] * d[0] + e[6] * d[1] + e[10] * d[2];
    out.set(x, y, z).normalize();
    return out.transformDirection(this.app.workstation.matrixWorld);
  }

  // bench point from plate mm
  benchFromSim(x, u, v, out) {
    return out.set(x, u, v).applyMatrix4(this.plateToBench);
  }

  // ---- per-frame update -----------------------------------------------------------------------------
  // tip / dir in plate mm (arrays) or null; lever 0..1. Returns the session state.
  step(dt, tip, dir, lever, opts = {}) {
    if (!this.session) return null;
    const o = this.outfit;
    o.setLever(lever);
    const st = this.session.update(dt, tip, dir);
    this.state = st;
    for (const e of st.events) {
      if (e === 'start') this.log.starts++;
      else if (e === 'restart') this.log.restarts++;
      else if (e === 'lost') this.log.losses++;
      else if (e === 'backfire') this.log.backfires++;
      else if (e === 'sustained') this.log.sustained++;
      else if (e === 'pop') this.log.pops++;
      else if (e === 'flashback') this.log.flashbacks++;
      else if (e === 'cold') this.log.cold++;
      else if (e === 'torchBurnt') this.burnt = true;
      else if (e === 'severed') {
        this.log.severed = true;
        // the strip falls into the tray
        this.plate.dropStrip((this.place.yTop - this.rack.trayTop) * 1000 - this.coupon.t);
      }
    }
    if (opts.record) this.frames.push({ dt, tip: tip ? tip.slice() : null, dir: dir ? dir.slice() : null, lever });
    return st;
  }

  // visuals of the frame (after step)
  visuals(dt) {
    if (!this.session) return;
    const st = this.state;
    const f = this.fxState;
    if (st && st.J) {
      const J = st.J;
      const c = this.coupon;
      this.benchFromSim(J.x, J.u, 0, f.front);
      const face = J.bevelAct || 0;
      this.benchFromSim(J.x, J.u - c.t * Math.tan(face * DEG), -c.t, f.bottom);
      const jd = [0, -Math.tan(face * DEG), -1];
      const e = this.plateToBench.elements;
      f.jet.set(e[0] * jd[0] + e[4] * jd[1] + e[8] * jd[2], e[1] * jd[0] + e[5] * jd[1] + e[9] * jd[2], e[2] * jd[0] + e[6] * jd[1] + e[10] * jd[2]).normalize();
      f.back.set(-this.place.s, 0, 0);
      const rec = this.session.record;
      const i = clamp(Math.floor(J.x), 0, rec.n - 1);
      f.dragAng = Math.atan2(rec.drag[i] || 0, c.t);
      f.cutting = !!st.cutting;
      f.through = !!st.through;
      f.blow = st.cutting && !st.through ? 1 : 0;
      f.rate = clamp(Math.abs(st.speed) / Math.max(st.vNom, 1e-3), 0, 1.5) * clamp(c.t / 12.7, 0.4, 2);
      f.glow = st.T != null ? clamp((st.T - 600) / 700, 0, 1) : 0;
    } else {
      f.cutting = false;
      f.blow = 0;
      f.glow = 0;
    }
    this.plate.update(dt);
    this.fx.update(dt, f);
  }

  // outfit gauges and hoses; torchEndW: world position of the torch hose end (or null)
  outfitVisuals(dt, torchEndW) {
    if (!this.outfit) return;
    this.outfitView.update(dt, this.outfit, torchEndW, this.root);
  }

  summary() {
    return this.session ? summarizeCut(this.session.record) : null;
  }

  // top-surface temperature (C) at plate (x, u)
  surfaceT(x, u) {
    return this.session ? this.session.surfaceT(x, u) : 20;
  }

  // Temperature (C) of the plate where a hand at world point posW touches it, or null: the nearest point of the
  // kept part (on the rack) or of the strip (on the rack, or where it lies in the tray after the drop) within
  // r mm (45 mm: half the thickness of a closed hand, as the welding coupon; design value). The temperature is
  // that of the nearest face (the top surface runs hotter than the bottom under the flame).
  contactAt(posW, r = 45) {
    if (!this.session) return null;
    const p = this.contactP || (this.contactP = [0, 0, 0]);
    this.simFromWorld(posW, null, p, null);
    const c = this.coupon;
    const L = c.L, t = c.t;
    const boxDist = (x, u, v, u0, u1) => Math.hypot(Math.max(0, -x, x - L), Math.max(0, u0 - u, u - u1), Math.max(0, -t - v, v));
    let best = null;
    const dKeep = boxDist(p[0], p[1], p[2], 0, c.keep);
    if (dKeep <= r) best = { d: dKeep, x: p[0], u: Math.max(0, Math.min(c.keep, p[1])), v: p[2] };
    // the strip: in its own frame (it falls by d.z and turns by rx about the line)
    let su = p[1], sv = p[2];
    const dr = this.plate && this.plate.drop;
    if (dr) {
      const v1 = p[2] - dr.z, ca = Math.cos(dr.rx), sa = Math.sin(dr.rx);
      su = p[1] * ca + v1 * sa;
      sv = -p[1] * sa + v1 * ca;
    }
    const dStrip = boxDist(p[0], su, sv, -c.drop, 0);
    if (dStrip <= r && (!best || dStrip < best.d)) best = { d: dStrip, x: p[0], u: Math.max(-c.drop, Math.min(0, su)), v: sv };
    if (!best) return null;
    const x = Math.max(0, Math.min(L, best.x));
    // the face nearest the hand: the top surface, or deeper down an edge, or the bottom
    const depth = -Math.max(-t, Math.min(0, best.v));
    return { T: this.session.tempAtDepth(x, best.u, depth), what: 'plate', x, u: best.u };
  }

  // the drop piece and the plate: hottest temperature (C) of each part (for handling)
  partTemps() {
    if (!this.session) return { keep: 20, strip: 20 };
    const ses = this.session;
    let keep = 20, strip = 20;
    const nx = ses.nxs, ns = ses.pl.ns, hs = ses.hs;
    const T = ses.thermal.T;
    for (let j = 0; j < ns; j++) {
      const u = ses.pl.s0 + (j + 0.5) * hs - ses.sLine;
      for (let i = 0; i < nx; i++) {
        const v = T[j * nx + i] + ses.E[j * nx + i];
        if (u < 0) strip = Math.max(strip, v);
        else keep = Math.max(keep, v);
      }
    }
    return { keep, strip };
  }
}

// Demo cutter in real time: lights the torch (fuel ~1/8 turn, spark, fuel until the smoke stops, preheat oxygen
// to neutral, the lever pressed and the flame readjusted), preheats the edge to the kindling temperature, presses
// the lever slowly and fully, cuts along the line at the chart speed and runs off the far edge.
// plan: { speed (x nominal), cone (mm), bevel (deg), travel (deg), light: true to light the torch first }
export class CutDriver {
  constructor(station, plan = {}) {
    this.st = station;
    this.plan = plan;
    this.phase = plan.light === false || station.outfit.lit ? 'approach' : 'light';
    this.t = 0;
    this.pt = 0;
    this.x = 1;
    this.lever = 0;
    this.lightStep = 0;
  }

  pose(x, u, cone) {
    const c = this.st.coupon;
    return torchPose(this.st.session, x, u, cone, this.plan.bevel ?? c.bevel ?? 0, this.plan.travel ?? 0);
  }

  // returns { tip, dir, lever, done } in plate mm
  next(dt) {
    const st = this.st;
    const o = st.outfit;
    const c = st.coupon;
    const cone = this.plan.cone ?? 3;
    this.t += dt;
    this.pt += dt;
    const out = (x, cn, lever) => {
      const p = this.pose(x, 0, cn);
      return { tip: p.tip, dir: p.dir, lever };
    };
    switch (this.phase) {
      case 'light': {
        // held away from the plate while lighting and adjusting (Victor 0056-0138 4.01 steps 14-17)
        const row = o.row;
        const steps = [
          () => o.setValve('fuel', 0.125),
          () => o.spark(),
          () => o.setValve('fuel', Math.min(1.5, o.valve.fuel + 0.05)),
          () => o.setValve('preheat', Math.min(3, o.valve.preheat + 0.01)),
        ];
        void steps;
        if (this.lightStep === 0 && this.pt > 0.3) {
          o.setValve('oxygen', Math.max(o.valve.oxygen, 1.5));
          o.setValve('fuel', 0.125);
          this.lightStep = 1;
          this.pt = 0;
        } else if (this.lightStep === 1 && this.pt > 0.4) {
          o.spark();
          this.lightStep = 2;
          this.pt = 0;
        } else if (this.lightStep === 2) {
          // fuel up to the chart flow
          if (o.flow.fuel < (row.fuelQ[0] + row.fuelQ[1]) / 2) o.setValve('fuel', Math.min(1.5, o.valve.fuel + dt * 0.4));
          else if (this.pt > 0.5) {
            this.lightStep = 3;
            this.pt = 0;
          }
        } else if (this.lightStep === 3) {
          // preheat oxygen to a neutral flame
          const r = o.flow.fuel > 0 ? o.flow.preO2 / o.flow.fuel : 0;
          if (r < 1.03) o.setValve('preheat', o.valve.preheat + dt * 0.25);
          else if (this.pt > 0.5) {
            this.lightStep = 4;
            this.pt = 0;
          }
        } else if (this.lightStep === 4) {
          // lever pressed: readjust to neutral, then release
          const r = o.flow.fuel > 0 ? o.flow.preO2 / o.flow.fuel : 0;
          if (r < 1.03) o.setValve('preheat', o.valve.preheat + dt * 0.25);
          if (this.pt > 1.6) {
            this.phase = 'approach';
            this.pt = 0;
            return out(this.x, 60, 0);
          }
          return out(this.x, 60, 1);
        }
        return out(this.x, 60, 0);
      }
      case 'approach': {
        const k = Math.min(1, this.pt / 1.0);
        if (k >= 1) {
          this.phase = 'preheat';
          this.pt = 0;
        }
        return out(this.x, cone + 50 * (1 - k), 0);
      }
      case 'preheat': {
        if (st.surfaceT(this.x, 0) >= KINDLING_C + 20 || this.pt > 60) {
          this.phase = 'press';
          this.pt = 0;
        }
        return out(this.x, cone, 0);
      }
      case 'press': {
        const lv = Math.min(1, this.pt / 0.4);
        if (lv >= 1) {
          this.phase = 'cut';
          this.pt = 0;
        }
        return out(this.x, cone, lv);
      }
      case 'cut': {
        const v = (this.plan.speed ?? 1) * nominalSpeed(c);
        this.x += v * dt;
        if (this.x > c.L + 3) {
          this.phase = 'lift';
          this.pt = 0;
        }
        return out(this.x, cone, 1);
      }
      case 'lift': {
        if (this.pt > 0.8) {
          this.phase = 'done';
          return { tip: null, dir: null, lever: 0, done: true };
        }
        return out(this.x, cone + 60 * this.pt, 0);
      }
      default:
        return { tip: null, dir: null, lever: 0, done: true };
    }
  }
}

export { CONE_MM };
