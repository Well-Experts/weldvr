// Real-time torch drivers that feed a WeldStation without a headset:
//  - PlanDriver: a scripted welder (demo weld, ghost demonstration) following a technique plan,
//    including stops at marks with crater fill and restarts with a tie-in (exercise B7)
//  - ReplayDriver: plays back recorded frames of an attempt (deterministic re-simulation)

import { torchPoseFor, touchPose, SMAW_TOUCH, SMAW_CHANGE, SMAW_RESERVE, SMAW_BACKUP, SMAW_CHANGE_DWELL, needsNewElectrode, tigRodPose, TIG_DAB_PERIOD, TIG_RAMP, TIG_RESTART_BACK, TIG_RESTART_HOLD, TIG_FILLER_RESUME, pipeRunsFor, PIPE_FEATHER, tieInFactor, keyholeTarget } from '../sim/scripted.js';
import { wrapX, diffX, metricAt, pipeTravelWindow } from '../sim/pipe.js';
import { surfaceHeight } from '../sim/session.js';
import { arcOutLength, MIN_FREE } from '../sim/smaw.js';
import { speedTarget } from '../sim/session.js';
import { nominalCTWD, GTAW_FEED_DUTY } from '../sim/process.js';
import { clamp } from '../sim/util.js';
import { FRAME } from './station.js';


export class PlanDriver {
  constructor(station, plan = {}) {
    this.st = station;
    const j = station.joint;
    const fillet = j.type === 'fillet';
    const s = station.session.settings;
    this.plan = {
      workAngle: fillet ? (j.position === 'PB' ? 42 : 45) : 90,
      travelAngle: s.process === '135' ? 5 : 12,
      ctwd: nominalCTWD(s.process, s),
      aim: 0,
      weaveAmp: 0,
      weaveHz: 1.5,
      toeDwell: 0,
      speedFactor: 1,
      craterDwell: 0.6,
      endBackup: false, // fill the end crater by backing up instead of pausing
      stopsAt: [], // stop and restart at these positions (sim x)
      craterAtStops: 'backup', // 'pause' | 'backup' | 'none'
      restartTech: 'aheadBackup', // 'aheadBackup' | 'same'
      s0: 6,
      s1: j.L - 6,
      ...plan,
    };
    this.stops = (this.plan.stopsAt || []).slice().sort((a, b) => a - b);
    // SMAW: touch-and-lift strikes, lift to break the arc, electrode changes
    this.smaw = s.process === '111';
    this.strikeT = 0;
    this.change = false;
    if (this.smaw && !plan.travelAngle) this.plan.travelAngle = 20;
    // GTAW: torch pushed 15 deg, HF start with the amperage control, filler dabbed at the leading edge
    // of the pool, current ramped down with filler at the end, torch held over the crater for the
    // post-flow (sim/scripted.js scriptedPassTig)
    this.tig = s.process === '141';
    if (this.tig && plan.travelAngle == null) this.plan.travelAngle = -15;
    this.freshRod = this.tig;
    this.wt = 0;
    this.backLen = 1.5 * (j.weldSize || 6); // The Fabricator: about 1.5 x the weld size
    this.freshStart = this.smaw; // SMAW: fit a fresh electrode before the run if this one is short
    this.phase = 'approach';
    this.t = 0;
    this.s = this.plan.s0;
    this.pt = 0;
    this.done = false;
    this.tip = [0, 0, 0];
    this.dir = [0, 0, -1];
    this.stopS = 0;
    this.midStop = false; // GTAW: a planned stop is under way (crater fill, post-flow, restart)
    this.holdT = 0;
  }

  pose(s, aim, lift = 0) {
    const p = this.plan;
    const pose = torchPoseFor(this.st.joint, this.st.record, s, aim, p.workAngle, p.travelAngle, p.ctwd + lift);
    this.tip = pose.tip;
    this.dir = pose.dir;
    return pose;
  }

  speed() {
    const p = this.plan;
    const passIndex = this.st.record.passes.length - 1;
    return speedTarget(this.st.joint, this.st.session.settings, passIndex, p.ctwd) * p.speedFactor;
  }

  // GTAW filler-rod tip: in the pool at its leading edge while dabbing, else just above it inside the
  // gas envelope.
  rodPose(inPool) {
    const st = this.st;
    return tigRodPose(st.joint, st.record, this.s, this.plan.aim, st.session.pool, inPool);
  }

  nextTig(dt) {
    const p = this.plan;
    const st = this.st;
    this.t += dt;
    const live = st.lastState && st.lastState.arcOn;
    const period = p.dabPeriod ?? TIG_DAB_PERIOD;
    const duty = p.dabDuty ?? GTAW_FEED_DUTY;
    const dabNow = () => live && (this.wt % period) / period < duty;
    switch (this.phase) {
      case 'approach': {
        if (this.freshRod) {
          this.freshRod = false;
          if (st.tig && st.tig.rodLen < 200) st.newRod();
        }
        this.pt += dt;
        this.pose(this.s, p.aim, Math.max(0, 60 * (1 - this.pt / 0.8)));
        if (this.pt >= 0.8) {
          this.phase = 'weld';
          this.pt = 0;
          this.wt = 0;
        }
        return { tip: this.tip, dir: this.dir, trigger: 0, rod: null };
      }
      case 'weld': {
        let ph = Math.sin(2 * Math.PI * p.weaveHz * this.t);
        if (p.toeDwell) ph = clamp(ph * (1 + p.toeDwell * 2), -1, 1);
        this.pose(this.s, p.aim + p.weaveAmp * ph);
        if (live) {
          this.wt += dt;
          if (this.stops.length && this.s >= this.stops[0]) {
            // planned stop: the crater filled as at the end of the run, the torch held over it for the
            // post-flow, then the restart
            this.stops.shift();
            this.stopS = this.s;
            this.midStop = true;
            this.phase = 'ramp';
            this.pt = 0;
          } else if (this.s >= p.s1) {
            this.phase = 'ramp';
            this.pt = 0;
          } else this.s += this.speed() * dt;
        }
        return { tip: this.tip, dir: this.dir, trigger: 1, rod: this.rodPose(dabNow()) };
      }
      case 'restart': {
        // weldingtipsandtricks.com, "TIG restarts": "start the arc near the center of the weld crater",
        // let the puddle grow until it "exactly matches the crater", then move ahead adding filler
        this.pt += dt;
        this.s = this.stopS - TIG_RESTART_BACK;
        this.pose(this.s, p.aim);
        if (live) this.holdT += dt;
        if (this.holdT >= TIG_RESTART_HOLD) {
          this.phase = 'tieIn';
          this.pt = 0;
        }
        return { tip: this.tip, dir: this.dir, trigger: 1, rod: this.rodPose(false) };
      }
      case 'tieIn': {
        // on to the end of the crater without filler, then on with filler
        this.pose(this.s, p.aim);
        if (live) this.s += this.speed() * dt;
        if (this.s >= this.stopS + (p.fillerResume ?? TIG_FILLER_RESUME)) {
          this.phase = 'weld';
          this.midStop = false;
          this.wt = 0; // first dab as the arc moves on
          this.pt = 0;
        }
        return { tip: this.tip, dir: this.dir, trigger: 1, rod: this.rodPose(false) };
      }
      case 'ramp': {
        // crater fill: the current reduced while filler is still added
        this.pt += dt;
        this.wt += dt;
        this.pose(this.s, p.aim);
        const pedal = Math.max(0.35, 1 - (0.65 * this.pt) / TIG_RAMP);
        const rod = this.rodPose(dabNow());
        if (this.pt >= TIG_RAMP) {
          this.phase = 'post';
          this.pt = 0;
        }
        return { tip: this.tip, dir: this.dir, trigger: pedal, rod };
      }
      case 'post': {
        // switch off; the torch stays over the crater until the post-flow ends
        this.pt += dt;
        this.pose(this.s, p.aim);
        if (this.pt >= (st.session.settings.postflow ?? 10) + 0.1) {
          this.phase = this.midStop ? 'restart' : 'lift';
          this.pt = 0;
          this.holdT = 0;
        }
        return { tip: this.tip, dir: this.dir, trigger: 0, rod: this.rodPose(false) };
      }
      case 'lift': {
        this.pt += dt;
        this.pose(this.s, p.aim, 80 * this.pt);
        if (this.pt > 0.8) this.done = true;
        return { tip: this.tip, dir: this.dir, trigger: 0, rod: null };
      }
      default:
        return { tip: this.tip, dir: this.dir, trigger: 0, rod: null };
    }
  }

  // Returns {tip, dir, trigger, rod} for this frame (sim coordinates; GTAW: trigger is the amperage
  // control 0..1 and rod the filler-rod tip).
  next(dt) {
    if (this.tig) return this.nextTig(dt);
    const o = this.nextPlan(dt);
    if (!this.smaw) return o;
    // SMAW: there is no trigger. Strike while the arc is wanted but not burning (touch 0.1 s, then
    // lift to the arc length); lift beyond the arc-out length to break it.
    const st = this.st;
    const E = st.electrode;
    const live = st.lastState && st.lastState.arcOn;
    const d = this.dir;
    if (o.trigger && !live && E && !E.used) {
      this.strikeT += dt;
      if (this.strikeT <= SMAW_TOUCH) o.tip = touchPose(st.record, { tip: this.tip, dir: d }).tip;
    } else this.strikeT = 0;
    if (!o.trigger && live) {
      const k = -(arcOutLength(st.session.settings.electrode, st.session.settings.dia) + 4);
      o.tip = [this.tip[0] + d[0] * k, this.tip[1] + d[1] * k, this.tip[2] + d[2] * k];
    }
    return o;
  }

  nextPlan(dt) {
    const p = this.plan;
    this.t += dt;
    const out = (trigger) => ({ tip: this.tip, dir: this.dir, trigger });
    const live = this.st.lastState && this.st.lastState.arcOn;
    switch (this.phase) {
      case 'approach': {
        if (this.freshStart) {
          this.freshStart = false;
          if (needsNewElectrode(this.st.session)) this.st.newElectrode();
        }
        this.pt += dt;
        this.pose(this.s, p.aim, Math.max(0, 60 * (1 - this.pt / 0.8)));
        if (this.pt >= 0.8) {
          this.phase = 'weld';
          this.pt = 0;
        }
        return out(false);
      }
      case 'weld': {
        let ph = Math.sin(2 * Math.PI * p.weaveHz * this.t);
        if (p.toeDwell) ph = clamp(ph * (1 + p.toeDwell * 2), -1, 1);
        this.pose(this.s, p.aim + p.weaveAmp * ph);
        // SMAW: burnt to the stub away from a planned change: change it and restart
        if (this.smaw && !live && this.st.electrode && this.st.electrode.used) {
          this.stopS = this.s;
          this.pt = 0;
          this.change = true;
          this.phase = 'off';
          return out(false);
        }
        if (live) {
          const E = this.smaw ? this.st.electrode : null;
          // SMAW: a short crater-fill pause, then the electrode change
          if (E && E.L <= MIN_FREE + SMAW_RESERVE && this.s < p.s1 - 3) {
            this.stopS = this.s;
            this.pt = 0;
            this.change = true;
            this.phase = 'craterPause';
            return out(true);
          }
          if (this.stops.length && this.s >= this.stops[0]) {
            this.stops.shift();
            this.stopS = this.s;
            this.pt = 0;
            this.phase = p.craterAtStops === 'backup' ? 'craterBack' : p.craterAtStops === 'pause' ? 'craterPause' : 'off';
            return out(this.phase !== 'off');
          }
          if (this.s >= p.s1) {
            this.pt = 0;
            this.stopS = this.s;
            this.phase = p.endBackup ? 'endBack' : 'endPause';
            return out(true);
          }
          this.s += this.speed() * dt;
        }
        return out(true);
      }
      case 'craterPause':
      case 'endPause': {
        this.pt += dt;
        this.pose(this.s, p.aim);
        const end = this.phase === 'endPause';
        if (this.pt >= (this.change && !end ? SMAW_CHANGE_DWELL : p.craterDwell)) {
          this.phase = end ? 'lift' : 'off';
          this.pt = 0;
          return out(false);
        }
        return out(true);
      }
      case 'craterBack':
      case 'endBack': {
        this.pose(this.s, p.aim);
        if (live) this.s -= 1.5 * this.speed() * dt;
        if (this.s <= this.stopS - this.backLen) {
          this.phase = this.phase === 'endBack' ? 'lift' : 'off';
          this.pt = 0;
          return out(false);
        }
        return out(true);
      }
      case 'off': {
        // arc off between runs: lift a little (change the electrode), then strike for the restart
        this.pt += dt;
        this.pose(this.s, p.aim, (this.change ? 60 : 25) * Math.min(1, this.pt / 0.3));
        if (this.pt >= (this.change ? SMAW_CHANGE : 1.0)) {
          let tech = p.restartTech;
          if (this.change) {
            this.st.newElectrode();
            this.change = false;
            tech = 'aheadBackup';
          }
          this.s = tech === 'aheadBackup' ? this.stopS + this.backLen : this.stopS;
          this.pose(this.s, p.aim);
          this.phase = tech === 'aheadBackup' ? 'restartBack' : 'weld';
          this.pt = 0;
          return out(true);
        }
        return out(false);
      }
      case 'restartBack': {
        // strike ahead of the crater, then back up quickly into it before travelling on
        this.pose(this.s, p.aim);
        if (live) this.s -= (this.smaw ? SMAW_BACKUP : 3) * this.speed() * dt;
        if (this.s <= this.stopS) {
          this.s = this.stopS;
          this.phase = 'weld';
        }
        return out(true);
      }
      case 'lift': {
        this.pt += dt;
        this.pose(this.s, p.aim, 80 * this.pt);
        if (this.pt > 0.8) this.done = true;
        return out(false);
      }
      default:
        return out(false);
    }
  }
}

export class ReplayDriver {
  constructor(frames, events, stride = FRAME) {
    this.frames = frames;
    this.events = events || [];
    this.stride = stride;
    this.f = 0;
    this.n = frames.length / stride;
    this.ev = 0;
    this.done = this.n === 0;
  }

  // Returns {dt, tip, dir, trigger, rod, events:[...]} or null at the end. trigger is the recorded value
  // (0/1, or the GTAW amperage control 0..1); rod is the GTAW filler-rod tip or null.
  next() {
    if (this.f >= this.n) {
      this.done = true;
      return null;
    }
    const o = this.f * this.stride;
    const F = this.frames;
    const evs = [];
    while (this.ev < this.events.length && this.events[this.ev].f <= this.f) evs.push(this.events[this.ev++]);
    this.f++;
    if (Number.isNaN(F[o + 1])) return { dt: F[o], tip: null, dir: null, trigger: 0, rod: null, events: evs };
    const rod = Number.isNaN(F[o + 8]) ? null : [F[o + 8], F[o + 9], F[o + 10]];
    return { dt: F[o], tip: [F[o + 1], F[o + 2], F[o + 3]], dir: [F[o + 4], F[o + 5], F[o + 6]], trigger: F[o + 7], rod, events: evs };
  }

  get progress() {
    return this.n ? this.f / this.n : 1;
  }
}

// Scripted pipe welder in real time (demo pass on a pipe): the runs of the pass round the pipe
// (sim/scripted.js pipeRunsFor) one after another, as scriptedPipeRun does them: start struck ahead and
// moved back, electrode angle from the position the joint is in at the arc (pipeTravelWindow), keyhole held
// on the root run by the travel speed, faster over metal of the pass already there (tie-ins), electrode
// changes with a restart into the crater, the first run's start and end ground to a feathered edge before
// the next run, and the pipe rolled between runs on 1G.
export class PipeDriver extends PlanDriver {
  constructor(station, plan = {}) {
    super(station, { travelAngle: 1, ...plan });
    const j = station.joint;
    const k = station.record.passes.length - 1;
    this.runs = plan.runs || pipeRunsFor(j, k);
    this.kind = j.passPlan[Math.min(k, j.passPlan.length - 1)].kind;
    this.ri = 0;
    this.m = 1;
    this.beginRun();
  }

  beginRun() {
    const run = this.runs[this.ri];
    const j = this.st.joint;
    this.run = run;
    this.sg = run.sigma;
    let r1 = run.len ?? this.sg * diffX(j, run.x1, run.x0);
    if (r1 <= 0) r1 += j.L;
    this.r1 = r1;
    this.r = this.backLen; // strike ahead, then back to the start point
    this.stopR = 0;
    // planned stop and restart in this run (plan.stopRuns: run indices; plan.stopFrac: where along the run),
    // e.g. the stop and restart a qualification test piece needs (ISO 9606-1 6.3). Made like an electrode
    // change: crater pause, new electrode, strike ahead and back into the crater.
    this.plannedStop = (this.plan.stopRuns || []).includes(this.ri) ? r1 * (this.plan.stopFrac ?? 0.5) : null;
    this.phase = run.roll != null && Math.abs((j.pipe.roll || 0) - run.roll) > 1e-6 ? 'roll' : 'approach';
    this.pt = 0;
    this.freshStart = true;
    this.tRun0 = this.st.record.time; // metal laid before this run is "already there" at a tie-in
  }

  x() {
    return wrapX(this.st.joint, this.run.x0 + this.sg * this.r);
  }

  // torch pose at x with the electrode angle for the position there (drag positive), work angle 90 deg
  pose(x, aim, lift = 0) {
    const j = this.st.joint;
    const p = this.plan;
    const win = pipeTravelWindow(j, x, this.sg);
    const ta = p.fixedTravelAngle ?? (win[0] + win[1]) / 2;
    const pose = torchPoseFor(j, this.st.record, x, aim, p.workAngle, this.sg * ta, p.ctwd + lift);
    this.tip = pose.tip;
    this.dir = pose.dir;
    return pose;
  }

  vRun(dt) {
    const st = this.st;
    const x = this.x();
    const ls = st.lastState;
    if (this.kind === 'root' && ls && ls.keyhole != null) this.m = clamp(this.m * (1 + 0.9 * (ls.keyhole - keyholeTarget(st.joint, x, this.sg)) * dt), 0.6, 1.8);
    const fTie = tieInFactor(st.record, x, this.sg, this.tRun0, this.kind);
    return this.speed() * this.m * fTie;
  }

  nextPlan(dt) {
    const p = this.plan;
    const st = this.st;
    const j = st.joint;
    this.t += dt;
    const out = (trigger) => ({ tip: this.tip, dir: this.dir, trigger });
    const live = st.lastState && st.lastState.arcOn;
    const x = this.x();
    switch (this.phase) {
      case 'roll': {
        // 1G: turn the pipe so this run is laid on top
        this.pt += dt;
        this.pose(x, p.aim, 80);
        if (this.pt >= 0.5 && st.setRoll(this.run.roll)) {
          this.phase = 'approach';
          this.pt = 0;
        }
        return out(false);
      }
      case 'approach': {
        if (this.freshStart) {
          this.freshStart = false;
          if (needsNewElectrode(st.session)) st.newElectrode();
        }
        this.pt += dt;
        this.pose(x, p.aim, Math.max(0, 60 * (1 - this.pt / 0.8)));
        if (this.pt >= 0.8) {
          this.phase = 'backupStart';
          this.pt = 0;
        }
        return out(false);
      }
      case 'backupStart':
      case 'restartBack': {
        this.pose(x, p.aim);
        if (live) this.r -= SMAW_BACKUP * this.speed() * dt;
        if (this.r <= this.stopR) {
          this.r = this.stopR;
          this.phase = 'weld';
        }
        return out(true);
      }
      case 'weld': {
        let ph = Math.sin(2 * Math.PI * p.weaveHz * this.t);
        if (p.toeDwell) ph = clamp(ph * (1 + p.toeDwell * 2), -1, 1);
        this.pose(x, p.aim + p.weaveAmp * ph);
        if (this.smaw && !live && st.electrode && st.electrode.used) {
          this.stopR = this.r;
          this.pt = 0;
          this.change = true;
          this.phase = 'off';
          return out(false);
        }
        if (live) {
          const E = this.smaw ? st.electrode : null;
          const planned = this.plannedStop != null && this.r >= this.plannedStop;
          if ((E && E.L <= MIN_FREE + SMAW_RESERVE && this.r < this.r1 - 3) || planned) {
            if (planned) this.plannedStop = null;
            this.stopR = this.r;
            this.pt = 0;
            this.change = true;
            this.phase = 'craterPause';
            return out(true);
          }
          if (this.r >= this.r1) {
            this.pt = 0;
            if (this.run.end === 'tieIn') {
              // quick pull-out onto the metal already there
              this.phase = 'lift';
              return out(false);
            }
            this.phase = 'endPause';
            return out(true);
          }
          const hv = surfaceHeight(st.record, Math.floor(x), p.aim);
          this.r += (this.vRun(dt) * dt) / metricAt(j, hv);
        }
        return out(true);
      }
      case 'craterPause':
      case 'endPause': {
        this.pt += dt;
        this.pose(x, p.aim);
        const end = this.phase === 'endPause';
        if (this.pt >= (this.change && !end ? SMAW_CHANGE_DWELL : p.craterDwell)) {
          this.phase = end ? 'lift' : 'off';
          this.pt = 0;
          return out(false);
        }
        return out(true);
      }
      case 'off': {
        this.pt += dt;
        this.pose(x, p.aim, 60 * Math.min(1, this.pt / 0.3));
        if (this.pt >= SMAW_CHANGE) {
          st.newElectrode();
          this.change = false;
          this.r = this.stopR + this.backLen;
          this.pose(this.x(), p.aim);
          this.phase = 'restartBack';
          this.pt = 0;
          return out(true);
        }
        return out(false);
      }
      case 'lift': {
        this.pt += dt;
        this.pose(x, p.aim, 80 * this.pt);
        if (this.pt > 0.6 && !live) {
          // grind the first half's start and end to a feathered edge before the other half runs onto them
          if (this.run.feather && p.feather !== false) {
            const F = PIPE_FEATHER;
            st.feather(this.run.x0, wrapX(j, this.run.x0 + this.sg * F), { beyond: 3 });
            st.feather(this.run.x1, wrapX(j, this.run.x1 - this.sg * F), { beyond: 4 });
            this.phase = 'grind';
            this.pt = 0;
            return out(false);
          }
          this.nextRun();
        }
        return out(false);
      }
      case 'grind': {
        this.pt += dt;
        this.pose(x, p.aim, 80);
        if (this.pt > 1.5) this.nextRun();
        return out(false);
      }
      default:
        return out(false);
    }
  }

  nextRun() {
    this.ri++;
    if (this.ri >= this.runs.length) {
      this.done = true;
      this.phase = 'done';
      return;
    }
    this.beginRun();
  }
}
