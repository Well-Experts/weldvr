// Weld session: turns a torch pose stream (joint-local millimetres) into technique metrics,
// arc state, deposition, heat flow and events. Used identically by the VR app, the desktop demo
// welds, the Inspector-lab coupon generator and the automated tests.

import { clamp, DEG } from './util.js';
import { arcState, PROCESSES, nominalCTWD, depositionRate, penetration } from './process.js';
import { WeldRecord, plateHeight, thermalWidthFactor, OPEN_ROOT_K } from './record.js';
import { plateSurface, grooveWidthAt } from './joint.js';
import { ThermalModel } from './thermal.js';
import { poolShape, solidAngle } from './pool.js';
import { T_AMBIENT } from './material.js';
import { freshLength, MIN_FREE, arcOutLength, electrodeData, arcWindow } from './smaw.js';
import { HF_GAP, ARC_OUT as TIG_OUT, PREFLOW, CUP_ID, ROD_LENGTH, rodMeltCapacity, postflowFor } from './gtaw.js';
import { wrapX, diffX, wrapIndex, gravityAt, uphillSign, metricAt } from './pipe.js';

const ROD_MIN = 60; // mm of filler rod too short to hold (seed)

const arcWindowFor = (s) => arcWindow(s.electrode, s.dia).map((v) => Math.round(v * 10) / 10);

const S2 = Math.SQRT1_2;

// Height v of the current weld surface at sample i and lateral position u.
export function surfaceHeight(rec, i, u) {
  const j = rec.joint;
  const plate = plateSurface(j, u);
  if (j.pipe) i = wrapIndex(j, i); // the pipe joint is closed: x wraps at L
  if (j.type === 'plate') {
    if (i < 0 || i >= j.n || plate < -100) return plate;
    return plateHeight(rec, i, u);
  }
  if (i < 0 || i >= j.n) return plate;
  const k = rec.topPassAt(i);
  if (k < 0) return plate;
  const s = rec.sample(k, i);
  if (!s) return plate;
  if (j.type === 'fillet') {
    const t1u = s.z1 * S2, t1v = s.z1 * S2;
    const t2u = -s.z2 * S2, t2v = s.z2 * S2;
    if (u < t2u || u > t1u) return plate;
    const tau = (u - t2u) / (t1u - t2u);
    const hu = t1u - t2u, hv = t1v - t2v;
    const hl = Math.hypot(hu, hv);
    let nv = hu / hl; // outward normal (-hv, hu)/hl, v component
    if (nv < 0) nv = -nv;
    return Math.max(plate, t2v + tau * (t1v - t2v) + 4 * s.c * tau * (1 - tau) * nv);
  }
  if (s.h > 0 && s.wcap) {
    const x = (2 * u) / s.wcap;
    if (Math.abs(x) <= 1) return Math.max(plate, s.h * (1 - x * x));
    return plate;
  }
  const W = Math.min(s.wb, grooveWidthAt(j, s.level));
  const centre = clamp(s.aim, -(grooveWidthAt(j, s.level) - W) / 2, (grooveWidthAt(j, s.level) - W) / 2);
  const x = (2 * (u - centre)) / W;
  if (Math.abs(x) <= 1) return Math.max(plate, s.level + s.c * (1 - x * x));
  return plate;
}

// Intersect the wire axis with the work. tip and dir in joint-local mm (dir points to the work).
export function wireHit(rec, tip, dir) {
  const f = (lam) => {
    const x = tip[0] + dir[0] * lam;
    const u = tip[1] + dir[1] * lam;
    const v = tip[2] + dir[2] * lam;
    return { x, u, v, d: v - surfaceHeight(rec, Math.floor(x), u) };
  };
  let prev = f(0);
  if (prev.d < 0) {
    if (rec.joint.pipe) prev.x = wrapX(rec.joint, prev.x);
    return { lam: 0, ...prev, inside: true };
  }
  for (let lam = 0.5; lam <= 80; lam += 0.5) {
    const cur = f(lam);
    if (cur.d <= 0) {
      let a = lam - 0.5, b = lam;
      for (let it = 0; it < 7; it++) {
        const m = (a + b) / 2;
        if (f(m).d > 0) a = m;
        else b = m;
      }
      const hit = f(b);
      if (rec.joint.pipe) hit.x = wrapX(rec.joint, hit.x);
      return { lam: b, ...hit, inside: false };
    }
    prev = cur;
  }
  return null;
}

// Distance from point p to segment ab (arrays).
function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const L = abx * abx + aby * aby + abz * abz;
  const f = L > 0 ? clamp((apx * abx + apy * aby + apz * abz) / L, 0, 1) : 0;
  return Math.hypot(apx - f * abx, apy - f * aby, apz - f * abz);
}

// Nearest scribed lane on a bead-on-plate coupon (or the hit position itself).
function laneFor(j, u) {
  let best = null;
  for (const c of j.lanes || []) if (Math.abs(u - c) <= 10 && (best == null || Math.abs(u - c) < Math.abs(u - best))) best = c;
  return best ?? u;
}

export class WeldSession {
  constructor({ joint, settings, env = {}, seed = 1, record = null, thermal = true, ambient = T_AMBIENT, thermalDt = 1 / 24 }) {
    this.joint = joint;
    this.settings = { ...settings };
    this.env = { gasAvailable: true, wind: 0, contamAt: null, ...env };
    this.record = record || new WeldRecord(joint, { seed });
    this.thermal = thermal === false ? null : thermal instanceof ThermalModel ? thermal : new ThermalModel(joint, { ambient, dtMax: thermalDt });
    this.Omega = solidAngle(joint);
    this.poolBuf = { profile: new Float32Array(17) };
    this.reset();
    if (this.settings.process === '111') this.newElectrode();
    if (this.settings.process === '141') this.newTig();
  }

  // GTAW: state of the tungsten, the filler rod and the gas after the arc (see gtaw.js for sources).
  newTig() {
    this.tig = {
      contaminated: false, oxidized: false, regrinds: 0,
      preflowT: 0, touched: false, dipping: false, rodTouching: false, lastTip: null, tipSpeed: 0,
      rodLen: ROD_LENGTH, rodHotT: 99, rodOxide: 0, oxideMelt: 0, rodWasOut: false,
      postflow: null, hist: [], events: [], pedal: 0, fillerRate: 0,
    };
    return this.tig;
  }

  // GTAW: a freshly ground tungsten (contaminated or oxidised tip removed and repointed).
  regrindTungsten() {
    const T = this.tig || this.newTig();
    T.contaminated = false;
    T.oxidized = false;
    T.regrinds++;
  }

  // GTAW: a new filler rod in the off hand.
  newRod() {
    const T = this.tig || this.newTig();
    T.rodLen = ROD_LENGTH;
    T.rodOxide = 0;
    T.rodHotT = 99;
  }

  // GTAW arc starting and stopping for one frame (the torch switch / amperage control is `pedal`,
  // 0..1). HF: after the pre-flow, the HF sparks bridge a gap up to HF_GAP and the arc starts without
  // contact; the tungsten touching the work with the switch on contaminates it. Lift-arc: touch with the
  // switch on, then lift: the arc forms as the tungsten leaves the work; dragging it along the work
  // (scratch start) contaminates it (Miller OM-215994: "Do NOT Strike Like A Match!"; TWI JK 6).
  // Burning: switch released or arc longer than TIG_OUT puts the arc out; the tungsten dipped into the
  // pool is contaminated and leaves a tungsten inclusion.
  gtawIgnition(dt, tip, hit, ctwd, pedal) {
    const T = this.tig || this.newTig();
    const ev = T.events;
    if (T.lastTip && dt > 0) {
      const v = Math.hypot(tip[0] - T.lastTip[0], tip[1] - T.lastTip[1], tip[2] - T.lastTip[2]) / dt;
      T.tipSpeed += (v - T.tipSpeed) * Math.min(1, dt / 0.05);
    }
    T.lastTip = [tip[0], tip[1], tip[2]];
    const l = hit ? ctwd : Infinity;
    const on = pedal > 0.04;
    const touching = l <= 0.2;
    if (!this.arcOn) {
      if (!on) {
        T.preflowT = 0;
        T.touched = false;
        return false;
      }
      T.preflowT += dt;
      if (this.settings.startMode === 'lift') {
        if (touching) {
          if (T.tipSpeed > 60 && !T.scratching) {
            T.scratching = true;
            T.contaminated = true;
            ev.push('scratch');
            if (hit) this.tungstenAt(hit);
          }
          T.touched = true;
          return false;
        }
        T.scratching = false;
        if (T.touched && l > 0.3 && l < 4) {
          T.touched = false;
          return T.preflowT >= PREFLOW;
        }
        if (l >= 4) T.touched = false;
        return false;
      }
      // HF start
      if (touching) {
        if (!T.touchedHF) {
          T.touchedHF = true;
          T.contaminated = true;
          ev.push('touch');
        }
        return false;
      }
      T.touchedHF = false;
      return T.preflowT >= PREFLOW && l <= HF_GAP;
    }
    if (!on) {
      ev.push('switchOff');
      return false;
    }
    if (l > TIG_OUT) {
      ev.push('outLong');
      return false;
    }
    if (touching) {
      if (!T.dipping) {
        T.dipping = true;
        T.contaminated = true;
        ev.push('dip');
        if (hit) this.tungstenAt(hit);
      }
    } else T.dipping = false;
    return true;
  }

  // A tungsten inclusion left in the weld at a hit point (current pass).
  tungstenAt(hit) {
    const rec = this.record;
    rec.tungsten = rec.tungsten || [];
    rec.tungsten.push({ s: clamp(hit.x, 0, this.joint.L), u: hit.u, pass: rec.passes.length - 1, t: rec.time });
  }

  // GTAW filler rod for one frame: melting while its tip is in the pool, touching the tungsten, and a hot
  // tip pulled out of the gas envelope (oxidised). rod: tip of the rod (joint-local mm) or null.
  gtawFiller(dt, rod, tip, dir, hit, I) {
    const T = this.tig;
    const ev = T.events;
    T.rodHotT += dt;
    let rate = 0;
    if (!rod || T.rodLen <= ROD_MIN) {
      T.rodTouching = false;
      return 0;
    }
    // rod against the tungsten (CK Form 116: "Accidental contact of electrode to filler rod")
    const dT = Math.hypot(rod[0] - tip[0], rod[1] - tip[1], rod[2] - tip[2]);
    if (this.arcOn && dT < 1.2) {
      if (!T.rodTouching) {
        T.rodTouching = true;
        T.contaminated = true;
        ev.push('rodTouch');
      }
    } else T.rodTouching = false;
    if (this.arcOn && hit) {
      // in the pool: within the pool outline (plus the leading edge) and at the surface
      const dx = (rod[0] - hit.x) * (this.pool.dir || 1);
      const du = rod[1] - hit.u;
      const surf = surfaceHeight(this.record, Math.floor(rod[0]), rod[1]);
      const inPool = Math.abs(du) <= this.pool.w + 1.5 && dx >= -(this.pool.Lb + 1) && dx <= this.pool.Lf + 3 && rod[2] <= surf + 1.2 && rod[2] >= surf - 4;
      if (inPool) {
        rate = rodMeltCapacity(I);
        T.rodHotT = 0;
        const area = (Math.PI * this.settings.rodDia * this.settings.rodDia) / 4;
        T.rodLen -= (rate * dt) / area;
        if (T.rodOxide > 0) {
          T.oxideMelt += rate * dt;
          if (T.oxideMelt > 2 * area) T.rodOxide = 0; // the oxidised end has melted in
        }
        if (T.rodLen <= ROD_MIN) ev.push('rodShort');
      }
    }
    // a hot rod end outside the gas envelope oxidises (Miller: keep the tip of the rod inside the small
    // envelope of shielding gas; ESAB: always inside the gas envelope). Envelope: within the cup radius
    // + 2 mm of the line from the cup to the arc (seed geometry); the end stays hot 2 s (seed).
    if (T.rodHotT < 2) {
      const a = [tip[0] - dir[0] * 6, tip[1] - dir[1] * 6, tip[2] - dir[2] * 6];
      const b = hit ? [hit.x, hit.u, hit.v] : [tip[0] + dir[0] * 3, tip[1] + dir[1] * 3, tip[2] + dir[2] * 3];
      const inside = segDist(rod, a, b) <= CUP_ID / 2 + 2;
      if (!inside && !T.rodWasOut) {
        T.rodWasOut = true;
        T.rodOxide = 1;
        T.oxideMelt = 0;
        ev.push('rodOxidised');
      }
      if (inside) T.rodWasOut = false;
    } else T.rodWasOut = false;
    return rate;
  }

  // SMAW: a new electrode in the holder (also after changing the electrode type or size).
  newElectrode() {
    const s = this.settings;
    this.electrode = {
      type: s.electrode, dia: s.dia, L: freshLength(s.electrode, s.dia), // mm beyond the holder jaws
      touched: false, touchT: 0, shortT: 0, stuck: false, used: false, lastTip: null, tipSpeed: 0, events: [],
    };
    return this.electrode;
  }

  // SMAW ignition, sticking and burn-off for one frame. Returns whether the arc burns this frame.
  //  - scratch or tap start: the core touches the work (arc length <= 0.25 mm) and is lifted within
  //    0.45 s to an arc length below the arc-out length (Hobart/Miller 155095F: "immediately lift
  //    electrode slightly after touching work"); held down longer it sticks ("If electrode sticks to
  //    workpiece, use a quick twist to free it"); a quick movement (tip faster than 250 mm/s) frees it.
  //  - burning: lifted beyond the arc-out length the arc goes out ("If arc goes out, electrode was lifted
  //    too high"); pushed into the pool for 0.3 s it sticks. All times and speeds are seeds.
  smawIgnition(dt, tip, hit, ctwd) {
    const E = this.electrode || this.newElectrode();
    const ev = E.events;
    ev.length = 0;
    if (E.lastTip && dt > 0) {
      const v = Math.hypot(tip[0] - E.lastTip[0], tip[1] - E.lastTip[1], tip[2] - E.lastTip[2]) / dt;
      E.tipSpeed += (v - E.tipSpeed) * Math.min(1, dt / 0.05);
    }
    E.lastTip = [tip[0], tip[1], tip[2]];
    if (E.used) return false;
    const l = hit ? ctwd : Infinity;
    const out = arcOutLength(E.type, E.dia);
    const touching = l <= 0.25;
    if (E.stuck) {
      if (E.tipSpeed > 250) {
        E.stuck = false;
        E.touched = false;
        ev.push('freed');
      }
      return false;
    }
    if (!this.arcOn) {
      if (touching) {
        E.touched = true;
        E.touchT += dt;
        if (E.touchT > 0.45) {
          E.stuck = true;
          ev.push('stuck');
          if (hit) this.stickMark = { x: hit.x, u: hit.u };
        }
        return false;
      }
      E.touchT = 0;
      if (E.touched && l > 0.3 && l < out) {
        E.touched = false;
        return true;
      }
      if (l >= out) E.touched = false;
      return false;
    }
    // arc burning
    if (l > out) {
      ev.push('outLong');
      return false;
    }
    if (touching) {
      E.shortT += dt;
      if (E.shortT > 0.3) {
        E.stuck = true;
        E.shortT = 0;
        ev.push('stuck');
        return false;
      }
    } else E.shortT = 0;
    return true;
  }

  reset() {
    this.arcOn = false;
    this.armT = 0; // time trigger held before arc establishes
    this.speed = 0;
    this.speedFast = 0;
    this.lastS = null;
    this.aimMean = 0;
    this.aimVar = 0;
    this.toeDwell = 0;
    this.coldT = 0;
    this.coldStartFactor = 1;
    this.slowT = 0; // continuous time below 1 mm/s (crater-fill dwell)
    this.lastArc = null;
    this.state = null;
    this.contact = false;
    this.deposited = false; // metal deposited in the joint since the arc started
    this.hist = []; // recent (t, x) while the arc burns, for the crater back-up
    this.far = null; // furthest point of the run along its travel direction (end of the bead)
    this.startRef = null;
    this.startT = 0;
    this.startMin = 0;
    this.pool = { w: 0, Lb: 0, Lf: 0, T0: T_AMBIENT };
    this.poolT = 1; // time since the last pool-shape solve
    this.latSpeed = 0;
    this.lastU = null;
    this.lastLane = null;
    this.weavePeak = 0;
    // travel direction of the current run along x: +1 or -1 (plate joints always +1; on a pipe both
    // directions occur, e.g. the two halves of an uphill weld). sigmaLocked once it is known.
    this.sigma = 1;
    this.sigmaLocked = !this.joint.pipe;
    this.runOrigin = 0;
    this.vRaw = 0;
  }

  // Provisional travel direction for a run starting at x on a pipe: up (or down) the joint for a fixed
  // pipe with a progression, otherwise the direction of the last run. 0 when it cannot be told yet.
  sigmaAt(x) {
    const j = this.joint;
    if (!j.pipe) return 1;
    const prog = j.pipe.progression;
    if (prog) {
      const g = gravityAt(j, x, 1);
      if (Math.abs(g.t) >= 0.25) {
        const up = uphillSign(j, x);
        return prog === 'up' ? up : -up;
      }
    }
    return 0;
  }

  // Run coordinate of x: mm from the start of the current run along its travel direction, and back.
  xiOf(x) {
    return this.sigma * diffX(this.joint, x, this.runOrigin);
  }

  xAt(xi) {
    const j = this.joint;
    return j.pipe ? wrapX(j, this.runOrigin + this.sigma * xi) : this.runOrigin + xi;
  }

  // Lane centre of the current pass (bead on plate), or 0 for joints.
  lane() {
    if (this.joint.type !== 'plate') return 0;
    return this.record.pass.lane;
  }

  // Plate temperature on the weld line at x (C).
  lineTemp(x, lane = this.lane() ?? 0) {
    return this.thermal ? this.thermal.lineT(this.joint.pipe ? wrapX(this.joint, x) : clamp(x, 0, this.joint.L), lane) : T_AMBIENT;
  }

  // Time passes with no torch input (cooling only).
  idle(dt) {
    this.record.tick(dt);
    if (this.thermal) this.thermal.advance(dt);
  }

  // Let the coupon cool for a longer time (interpass wait, time skip). Arc must be off.
  cool(seconds) {
    if (this.arcOn || !(seconds > 0)) return;
    this.record.tick(seconds);
    if (this.thermal) this.thermal.cool(seconds);
  }

  // extra (GTAW): { rod: filler-rod tip, joint-local mm }
  update(dt, tip, dir, trigger, extra = null) {
    const j = this.joint;
    const rec = this.record;
    const plateJ = j.type === 'plate';
    rec.tick(dt);
    const hit = wireHit(rec, tip, dir);
    const ctwd = hit ? hit.lam : Infinity;
    // Travel angle (drag positive): wire pointing back toward the finished weld is drag.
    // drag/push relative to the run's travel direction (before a start on a pipe: the direction the run
    // would take there)
    const sg = this.arcOn || !j.pipe ? this.sigma : (hit && this.sigmaAt(hit.x)) || this.lastSigma || 1;
    const travelAngle = -Math.asin(clamp(sg * dir[0], -1, 1)) / DEG;
    // Work angle from the torch-side vector projected on the cross-section.
    let wu = -dir[1], wv = -dir[2];
    const wl = Math.hypot(wu, wv) || 1;
    wu /= wl; wv /= wl;
    let workAngle;
    if (j.type === 'fillet') workAngle = Math.acos(clamp(wu * S2 + wv * S2, -1, 1)) / DEG; // from base plate
    else workAngle = Math.atan2(wv, wu) / DEG; // from plate surface toward +u; 90 = perpendicular

    const onCoupon = hit && (j.pipe ? Math.abs(hit.u) <= j.pipe.length : hit.x >= -2 && hit.x <= j.L + 2);
    const uHit = hit ? hit.u : 0;
    let lane = plateJ ? rec.pass.lane : 0;
    const aim = hit ? (plateJ ? (lane != null ? uHit - lane : 0) : uHit) : 0;
    const reach = hit && ctwd <= 38; // wire can reach the work (stick-out + arc). seed
    this.contact = !!(hit && ctwd < 3.2);

    // Arc ignition: GMAW/FCAW, trigger held and wire reaches the work; SMAW, touch-and-lift start
    // with the electrode always live (smawIgnition); GTAW, HF or lift-arc start with the torch switch
    // (gtawIgnition, `trigger` is the amperage control 0..1).
    let started = false, stopped = false;
    const smaw = this.settings.process === '111';
    const tig = this.settings.process === '141';
    let wantArc;
    if (tig) {
      const T = this.tig || this.newTig();
      T.events.length = 0;
      T.pedal = typeof trigger === 'number' ? trigger : trigger ? 1 : 0;
      wantArc = this.gtawIgnition(dt, tip, hit, ctwd, T.pedal);
      this.contact = !!(hit && ctwd <= 0.2);
    } else if (smaw) {
      wantArc = this.smawIgnition(dt, tip, hit, ctwd);
      this.contact = !!(hit && ctwd <= 0.25);
      // an electrode that sticks outside the joint leaves an arc strike (601)
      if (hit && !this.arcOn && this.electrode.events.includes('stuck')) {
        const aimNow = plateJ ? 0 : aim;
        const onJoint = onCoupon && Math.abs(aimNow) < (j.type === 'fillet' ? 6 : plateJ ? 8 : grooveWidthAt(j, 0) / 2 + 3);
        if (!onJoint && onCoupon) rec.arcStrikes.push({ s: clamp(hit.x, 0, j.L), u: plateJ ? uHit : aim, t: rec.time, pass: rec.passes.length - 1 });
      }
    } else {
      if (trigger && reach) this.armT += dt;
      else this.armT = 0;
      wantArc = !!(trigger && reach && (this.arcOn || this.armT > 0.06));
    }
    if (wantArc) {
      if (!this.arcOn) {
        this.arcOn = true;
        started = true;
        if (plateJ && lane == null && onCoupon) {
          lane = laneFor(j, uHit);
          rec.pass.lane = lane;
        }
        const aimNow = plateJ ? uHit - (lane ?? uHit) : aim;
        const onJoint = onCoupon && Math.abs(aimNow) < (j.type === 'fillet' ? 6 : plateJ ? 8 : grooveWidthAt(j, 0) / 2 + 3);
        const sStart = j.pipe ? hit.x : clamp(hit.x, 0, j.L);
        // interpass temperature: weld and adjacent parent metal just before this run (and at the start point)
        if (rec.pass.interpass == null && this.thermal) {
          rec.pass.interpass = {
            atStart: this.lineTemp(sStart, lane ?? 0),
            max: this.thermal.maxNear(j.tab, j.L - j.tab, 10, lane ?? 0),
            t: rec.time,
          };
        }
        // run direction: a restart continues the run it restarts (fixed at once). A new run on a pipe is
        // taken to go up (or down) a fixed pipe until the motion tells: it is fixed when the start phase is
        // over, or once the run is 15 mm from where it was struck (a run may start just past the bottom or
        // the top and go back through it, as the second half of a weld does on its first half's start)
        const sg0 = this.sigmaAt(sStart);
        this.startRef = rec.arcStart(sStart, plateJ ? uHit : aimNow, onJoint, rec.time, sg0);
        this.sigma = j.pipe ? this.startRef.sigma || this.lastSigma || 1 : 1;
        this.sigmaLocked = !j.pipe || this.startRef.restart;
        this.runOrigin = sStart;
        this.vRaw = 0;
        this.startT = 0;
        this.startMin = 0; // run coordinate: mm from the start along the travel direction
        this.dispMin = 0;
        this.dispMax = 0;
        this.tDispMin = rec.time; // when the start phase reached its furthest point back or forward
        this.tDispMax = rec.time;
        const i = j.pipe ? wrapIndex(j, Math.round(sStart)) : Math.round(sStart);
        const k = rec.topPassAt(i);
        const hotBead = k >= 0 && rec.passes[k].tLast[i] >= 0 && rec.time - rec.passes[k].tLast[i] < 2.0;
        // Cold start: fusion at the start of a run is reduced on cold metal (The Fabricator: starts
        // lead to overlap / cold lap). Hotter metal at the start point shortens it. seed rule
        const Tst = this.lineTemp(sStart, lane ?? 0);
        const t = Math.min(1, Math.max(0, (Tst - 300) / 600));
        this.coldMin = hotBead ? 1 : 0.65 + 0.35 * t * t * (3 - 2 * t);
        this.coldT = 0;
        this.lastS = hit.x;
        this.speed = 0;
        this.speedFast = 0;
        this.slowT = 0;
        this.deposited = false;
        this.hist.length = 0;
        this.far = null;
        this.pool.w = 1.2;
        this.pool.Lb = 1.5;
        this.pool.Lf = 1.0;
        this.poolT = 1;
        this.latSpeed = 0;
        this.lastU = hit.u;
      }
    } else {
      if (this.arcOn) {
        this.arcOn = false;
        stopped = true;
        const sStop = j.pipe ? wrapX(j, this.lastS ?? 0) : clamp(this.lastS ?? 0, 0, j.L);
        if (this.startRef && !this.startRef.done) {
          this.startMin = this.sigma > 0 ? this.dispMin ?? 0 : -(this.dispMax ?? 0);
          rec.finishStart(this.startRef, this.xAt(this.startMin));
        }
        // back-up over the end of the bead in the last 2 s before the stop (crater fill): the furthest
        // point reached along the run in that time
        const xiStop = this.xiOf(sStop);
        let ximax = xiStop;
        // (SMAW travels slower: a back-up of 1.5 x the weld size takes longer; window 5 s. seed). On a run
        // struck ahead and moved back (a restart into the crater), the positions before it got back are
        // not the end of the bead: only the time after the furthest point back of its start counts.
        const win = smaw ? 5.0 : 2.0;
        const tFloor = this.sigma > 0 ? this.tDispMin ?? -Infinity : this.tDispMax ?? -Infinity;
        for (const h of this.hist) if (rec.time - h.t < win && h.t >= tFloor) ximax = Math.max(ximax, this.xiOf(h.x));
        // end of the bead: the furthest point the run reached (after its start), however long a crater
        // back-up took; the back-up itself (crater fill) is the one inside the window above
        const xiEnd = Math.max(ximax, this.far && this.far.sigma === this.sigma ? this.far.xi : -Infinity);
        // GTAW crater fill: the current reduced while filler is still added at the end (Miller: "Gradually
        // reduce current while still adding filler"; TWI: reduce the current progressively, add filler).
        // The arc stopped after a ramp-down of the amperage control to half or less over the last 1.5 s
        // with filler added in that time counts as a filled crater. seed thresholds
        let dwell = this.slowT;
        if (tig && this.tig) {
          const hst = this.tig.hist.filter((h) => rec.time - h.t <= 1.5);
          const pMax = Math.max(0, ...this.tig.hist.filter((h) => rec.time - h.t <= 4).map((h) => h.p));
          const pEnd = hst.length ? Math.min(...hst.map((h) => h.p)) : 1;
          const fed = hst.some((h) => h.f > 0);
          dwell = pMax > 0 && pEnd <= 0.5 * pMax && fed ? 1 : 0;
          // post-flow protects the hot tungsten and crater after the arc (Miller: one second per 10 A)
          const lastI = this.lastArc ? this.lastArc.I : this.settings.current;
          this.tig.postflow = { t: 0, D: this.settings.postflow ?? 0, need: postflowFor(lastI), tip0: tip.slice() };
          if ((this.settings.postflow ?? 0) < postflowFor(lastI)) {
            this.tig.oxidized = true;
            this.tig.events.push('postflowShort');
          }
        }
        // a crater forms only where the arc was depositing in the joint
        if (this.deposited) rec.arcStop(sStop, rec.time, dwell, this.lastArc, ximax - xiStop, plateJ ? (lane ?? 0) : 0, this.xAt(xiEnd), this.sigma);
        if (j.pipe) this.lastSigma = this.sigma;
      }
    }

    let arc = null;
    let state;
    // GTAW: filler rod, post-flow protection after the arc, and the context of the arc state
    let tigEnv = null;
    if (tig) {
      const T = this.tig;
      const I0 = this.settings.current * T.pedal;
      T.fillerRate = this.gtawFiller(dt, extra && extra.rod ? extra.rod : null, tip, dir, hit, I0);
      if (T.postflow && !this.arcOn) {
        T.postflow.t += dt;
        const d0 = T.postflow.tip0;
        // the torch taken away from the hot tungsten's gas cover before the post-flow ended
        if (T.postflow.t < Math.min(T.postflow.D, T.postflow.need) && Math.hypot(tip[0] - d0[0], tip[1] - d0[1], tip[2] - d0[2]) > 25) {
          T.oxidized = true;
          T.events.push('postflowLeft');
          T.postflow = null;
        } else if (T.postflow.t >= T.postflow.D) T.postflow = null;
      }
      if (this.arcOn) T.postflow = null;
      tigEnv = { ...this.env, gtaw: { pedal: T.pedal, contaminated: T.contaminated || T.oxidized, fillerRate: T.fillerRate, rodOxide: T.rodOxide && T.fillerRate > 0 ? 1 : 0 } };
      T.hist.push({ t: rec.time, p: T.pedal, f: T.fillerRate });
      while (T.hist.length && rec.time - T.hist[0].t > 4.2) T.hist.shift();
    }
    if (this.arcOn && hit) {
      arc = arcState(this.settings, ctwd, travelAngle, tigEnv || this.env);
      // GTAW: an overheated tungsten melts at the tip and drops into the pool (Miller OM-215994:
      // "Tungsten melting into weld puddle" -> "Use less current or larger tungsten"; DGP: DCEP takes
      // about 10% of the DCEN current). A drop for every 1.5 s of overheating (seed).
      if (tig) {
        const T = this.tig;
        T.overheatT = arc.overheat ? (T.overheatT || 0) + dt : 0;
        if (T.overheatT > 1.5) {
          T.overheatT = 0;
          T.melted = true;
          T.contaminated = true;
          T.events.push('tungstenMelt');
          this.tungstenAt(hit);
        }
      }
      if (smaw) {
        const E = this.electrode;
        E.L = Math.max(MIN_FREE, E.L - arc.burnOff * dt);
        if (E.L <= MIN_FREE + 1e-6) {
          E.used = true; // burnt down to the stub: the arc goes out at the next frame
          E.events.push('used');
        }
        arc.pen = electrodeData(this.settings.electrode, this.settings.dia).e.penetration;
      }
      if (this.contact && !smaw) arc.stability *= 0.3;
      this.lastArc = arc;
      // Travel speed along +x (EMA, tau 0.25 s)
      if (this.lastS !== null) {
        const dxr = diffX(j, hit.x, this.lastS);
        // direction not known yet (a pipe run started where the joint is level): follow the motion; it is
        // fixed when the start phase ends (a start struck ahead first moves back, against the travel) or the
        // run has gone 15 mm from where it was struck
        if (!this.sigmaLocked) {
          this.vRaw += (dxr / Math.max(dt, 1e-4) - this.vRaw) * (1 - Math.exp(-dt / 0.15));
          if (Math.abs(this.vRaw) > 0.5) this.sigma = this.vRaw > 0 ? 1 : -1;
          const net = diffX(j, hit.x, this.runOrigin);
          const startOver = !this.startRef || this.startRef.done || this.startT + dt > 2.5;
          if ((startOver && Math.abs(this.vRaw) > 0.3) || Math.abs(net) > 15) {
            this.sigma = Math.abs(net) > 15 ? (net > 0 ? 1 : -1) : this.vRaw > 0 ? 1 : -1;
            this.sigmaLocked = true;
            if (this.startRef) this.startRef.sigma = this.sigma;
          }
        }
        // pipe: x is measured at the outside surface; the arc travels at its own radius
        const v = (this.sigma * dxr * (j.pipe ? metricAt(j, hit.v) : 1)) / Math.max(dt, 1e-4);
        this.speed += (v - this.speed) * (1 - Math.exp(-dt / 0.25));
        this.speedFast += (v - this.speedFast) * (1 - Math.exp(-dt / 0.06));
      }
      this.lastS = hit.x;
      this.hist.push({ t: rec.time, x: hit.x });
      while (this.hist.length && rec.time - this.hist[0].t > (smaw ? 5.2 : 2.2)) this.hist.shift();
      {
        // furthest point of the run since the start phase's furthest point back (positions before it, a
        // start struck ahead of a crater, are not the end of the bead); restarted when the direction is fixed
        const tFloor = this.sigma > 0 ? this.tDispMin ?? -Infinity : this.tDispMax ?? -Infinity;
        const xi = this.xiOf(hit.x);
        const f = this.far;
        if (!f || f.sigma !== this.sigma || f.floor !== tFloor) this.far = { xi, sigma: this.sigma, floor: tFloor };
        else if (xi > f.xi) f.xi = xi;
      }
      // start phase of a run: lowest position reached (back-up into the crater on a restart)
      if (this.startRef && !this.startRef.done) {
        this.startT += dt;
        // furthest back and forward from the strike point (+x sense), so the back-up is known whichever
        // way the run turns out to go
        const dsp = diffX(j, hit.x, this.runOrigin);
        if (dsp <= this.dispMin) { this.dispMin = dsp; this.tDispMin = rec.time; }
        if (dsp >= this.dispMax) { this.dispMax = dsp; this.tDispMax = rec.time; }
        this.startMin = this.sigma > 0 ? this.dispMin : -this.dispMax;
        if (this.startT > 2.5 && this.sigmaLocked) rec.finishStart(this.startRef, this.xAt(this.startMin));
      }
      // Crater-fill dwell: continuous time with the torch held (near) still before the stop.
      this.slowT = Math.abs(this.speedFast) < 1.0 ? this.slowT + dt : 0;
      // Weave tracking
      const am = 1 - Math.exp(-dt / 0.8);
      this.aimMean += (aim - this.aimMean) * am;
      const dev = aim - this.aimMean;
      const av = 1 - Math.exp(-dt / 0.6);
      this.aimVar += (dev * dev - this.aimVar) * av;
      const weaveAmp = Math.sqrt(2 * this.aimVar);
      // toe dwell: share of time held near the edges of the weave, against a decaying peak of
      // the excursion (a plain sine spends about 35% of its time beyond 0.85 of its amplitude; a
      // weave with a pause at each side about 70%). While the electrode is not weaving (a crater
      // pause, the back-up into the crater at a restart) there is nothing to measure and the last
      // value is kept, so the weave picks up where it left off.
      this.weavePeak = Math.max(Math.abs(dev), (this.weavePeak || 0) * Math.exp(-dt / 1.2));
      if (weaveAmp > 1) {
        const atToe = Math.abs(dev) > 0.85 * this.weavePeak ? 1 : 0;
        this.toeDwell += (atToe - this.toeDwell) * (1 - Math.exp(-dt / 0.8));
      }
      // Cold start: reduced fusion for the first 0.6 s on cold metal. seed rule
      this.coldT += dt;
      const cm = this.coldMin ?? 0.65;
      this.coldStartFactor = clamp(cm + ((1 - cm) * this.coldT) / 0.6, cm, 1);

      // heat and pool: local plate temperature ahead of the arc sizes the pool (pool.js). The
      // arc's speed over the plate includes the weave, which spreads the heat (smaller pool).
      if (this.lastU !== null) {
        const vl = Math.abs(hit.u - this.lastU) / Math.max(dt, 1e-4);
        this.latSpeed += (vl - this.latSpeed) * (1 - Math.exp(-dt / 0.25));
      }
      this.lastU = hit.u;
      const P = onCoupon ? arc.k * arc.U * arc.I : 0;
      const T0 = this.lineTemp(hit.x + 12 * this.sigma, plateJ ? uHit : 0);
      this.poolT += dt;
      if (this.poolT >= 1 / 24) {
        this.poolT = 0;
        const vArc = Math.hypot(this.speed, this.latSpeed);
        poolShape(P, Math.max(vArc, 0.3), T0, { Omega: this.Omega, thickness: j.t, out: this.poolBuf });
      }
      // open root, root run: how far the penetration reaches through the land right now, the measure the
      // record uses for the root (OPEN_ROOT_K); about 1 = the keyhole just opens
      if (j.openRoot && rec.passes.length === 1) {
        const Qn = (arc.k * arc.U * arc.I) / (Math.max(this.speed, 0.3) * 1000);
        const Pn = penetration(arc.I, Qn, arc.mode, travelAngle, arc.dU, arc.pen ?? 1) * thermalWidthFactor(T0);
        this.keyhole = (OPEN_ROOT_K * Pn * this.coldStartFactor * Math.sqrt(j.rootGap / 3.2)) / j.rootFace;
      } else this.keyhole = null;
      const target = this.poolBuf;
      const kf = 1 - Math.exp(-dt / 0.3); // pool growth lag. seed
      this.pool.w += ((target.w || 0) - this.pool.w) * kf;
      this.pool.Lb += ((target.Lb || 0) - this.pool.Lb) * kf;
      this.pool.Lf += ((target.Lf || 0) - this.pool.Lf) * kf;
      this.pool.T0 = T0;
      this.pool.P = P;
      this.pool.shape = target;
      this.pool.dir = this.sigma * (this.speed < -0.5 ? -1 : 1);

      const tech = {
        ctwd, travelAngle, workAngle, aim, speed: this.speed, weaveAmp, toeDwell: this.toeDwell,
        // aim of the weave centre while weaving (the instantaneous aim swings across the joint)
        aimC: weaveAmp > 1 ? this.aimMean : aim,
        coldStart: this.coldStartFactor, T0, poolW: 2 * this.pool.w, poolL: this.pool.Lb + this.pool.Lf, u: uHit, v: hit.v,
        // arc held still after travelling (a crater-fill dwell; record.deposit)
        still: Math.abs(this.speedFast) < 1.0 && this.startRef != null && Math.abs(diffX(j, hit.x, this.startRef.s)) > 5,
        // pipe: gravity in the joint frame at the arc (relative to the travel direction)
        g: j.pipe ? gravityAt(j, hit.x, this.sigma) : null,
      };
      const inJoint = onCoupon && (plateJ ? Math.abs(uHit) < j.width / 2 - 3 : Math.abs(aim) < (j.type === 'fillet' ? 10 : grooveWidthAt(j, 0) / 2 + 4));
      if (inJoint) {
        rec.deposit(dt, j.pipe ? hit.x : clamp(hit.x, 0, j.L - 0.01), this.settings, arc, tech, this.env);
        this.deposited = true;
      }
      if (this.thermal && P > 0) this.thermal.addArc(dt, j.pipe ? hit.x : clamp(hit.x, 0, j.L), hit.u, hit.v, P);
      state = { arcOn: true, hit, arc, tech, started, stopped, poolS: hit.x, inJoint, pool: this.pool, keyhole: this.keyhole, sigma: this.sigma };
    } else {
      const tech = { ctwd, travelAngle, workAngle, aim, speed: 0, weaveAmp: 0, toeDwell: 0, coldStart: 1, T0: hit ? this.lineTemp(hit.x) : T_AMBIENT };
      state = { arcOn: false, hit, arc: null, tech, started, stopped, poolS: hit ? hit.x : null, inJoint: false, pool: null };
    }
    if (this.thermal) this.thermal.advance(dt);
    this.state = state;
    return state;
  }
}

// Target travel speed (mm/s) that deposits the planned area of the pass at nominal CTWD.
export function speedTarget(joint, settings, passIndex = 0, ctwd = null) {
  const ct = ctwd ?? nominalCTWD(settings.process, settings);
  const arc = arcState(settings, ct, settings.process === '111' ? 20 : 5, { gasAvailable: true });
  const plan = joint.passPlan[Math.min(passIndex, joint.passPlan.length - 1)];
  const vdot = arc.vdot ?? depositionRate(settings, arc.mode);
  return vdot / plan.target;
}

// Technique windows shown as cues and used for the technique score.
// Work angle centres: 45 deg for T-joints and 90 deg for butt joints (Miller Electric, "MIG
// Welding: The Basics for Mild Steel"); the +/- tolerances are SME placeholders. Travel angle and
// stick-out windows come from the process table (ESAB, Weld Australia; seed windows).
export function techniqueWindows(joint, settings, passIndex = 0) {
  const p = PROCESSES[settings.process];
  const fillet = joint.type === 'fillet';
  return {
    workAngle: fillet ? [35, 55] : [80, 100], // SME placeholder tolerances around 45 / 90 deg
    travelAngle: p.travelAngle,
    // SMAW: the arc-length window of the electrode (smaw.js) in place of the wire stick-out
    stickOut: settings.process === '111' ? arcWindowFor(settings) : p.stickOut,
    aim: fillet ? [-1.5, 1.5] : joint.type === 'plate' ? [-1.5, 1.5] : [-2.5, 2.5],
    passIndex,
  };
}
