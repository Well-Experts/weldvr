// Shared welding flow of the welding modes (Practice, Exercises, Troubleshoot, Mock test, Safety):
// live welding, demo weld, finishing, results, macro section and replay.

import { COLORS } from '../ui/ui.js';
import { t } from '../ui/i18n.js';
import * as screens from '../ui/screens.js';
import { wpsFor, inRange, jointLabel, jointKind, passSettings, passCurrent } from '../scenarios.js';
import { PROCESSES } from '../sim/process.js';
import { PlanDriver, ReplayDriver, PipeDriver } from '../weld/driver.js';
import { clockAt, wrapX, diffX, metricAt } from '../sim/pipe.js';
import { keyholeWindow, PIPE_FEATHER, pipeDemoPlan } from '../sim/scripted.js';
import { rayPoseForTip } from '../render/torch.js';
import { buildStinger } from '../render/stinger.js';
import { buildTigTorch } from '../render/tigTorch.js';
import { freshLength, MIN_FREE } from '../sim/smaw.js';

// Electrode travel-angle window as a welder says it (drag positive): "push 5-10°", "drag 0-10°".
export function angleText(win) {
  if (win[1] <= 0) return `${t('push')} ${-win[1]}–${-win[0]}°`;
  if (win[0] >= 0) return `${t('drag')} ${win[0]}–${win[1]}°`;
  return `${win[0]}…${win[1]}°`;
}

export function polarityLabel(p) {
  return p === 'AC' ? 'AC' : p === 'DCEN' ? 'DCEN (−)' : 'DCEP (+)';
}
import { clamp } from '../sim/util.js';
import { coolingTimeEstimate } from '../sim/thermal.js';
import { T_AMBIENT } from '../sim/material.js';

export const PAD = 36;

export function fmtAgo(s) {
  if (!(s >= 0)) return '';
  if (s < 90) return `${Math.round(s)} s ${t('ago')}`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s ${t('ago')}`;
}

// Per pass: interpass temperature at the start of the run (model) and a cooling-time estimate
// from the pass heat input and the mean local plate temperature ahead of the arc.
export function passHeat(st, tech) {
  const rec = st.record;
  const j = st.joint;
  return rec.passes.map((p, k) => {
    let n = 0, T0 = 0;
    for (let i = j.tab; i < j.L - j.tab; i++) {
      if (!(p.area[i] > 0.05)) continue;
      const s = rec.sample(k, i);
      if (!s) continue;
      T0 += s.T0 ?? T_AMBIENT;
      n++;
    }
    T0 = n ? T0 / n : T_AMBIENT;
    const Q = tech[k] ? tech[k].heatInput : null;
    // the cooling estimate takes the plate temperature at the start of the run (preheat or
    // interpass temperature), as cooling-time methods do
    const Ts = p.interpass ? p.interpass.atStart : T_AMBIENT;
    return { interpass: p.interpass || null, T0, Ts, t85: Q ? coolingTimeEstimate(Q, j.t, Ts, j.type) : null, Q };
  });
}

// Procedure record for the Safety and procedure tab.
export function procedureLog(st) {
  const rec = st.record;
  const passes = rec.passes.filter((p) => p.tLast.some((v) => v >= 0));
  const ip = passes.slice(1).map((p) => p.interpass).filter(Boolean);
  const slag = passes.length > 1 && passes.some((p) => p.slagProcess);
  return {
    multi: passes.length > 1,
    interpassMax: ip.length ? Math.max(...ip.map((v) => v.max)) : null,
    slag,
    overSlag: slag ? passes.slice(0, -1).filter((p) => p.slagProcess && rec.cleanFraction(p.index) < 0.95).length : 0,
    readings: st.readings.length,
  };
}

export class WeldingMode {
  constructor(app) {
    this.app = app;
    this.phase = 'setup';
    this.R = null;
    this.driver = null;
    this.replay = null;
    this.cuesOn = false;
    this.pacerS = null;
    this.startT = null;
  }

  wps() {
    return this.cfgWps || null;
  }

  settingsLocked() {
    return false;
  }

  // Load a fresh coupon for welding. cfg: {joint, process, settings, equipment, seed}
  loadCoupon(cfg) {
    const app = this.app;
    this.cfgWps = wpsFor(cfg.process, cfg.joint, cfg.process === '111' ? { electrode: cfg.electrode, dia: cfg.dia, polarity: cfg.polarity } : cfg.process === '141' ? { tungsten: cfg.tungsten, filler: cfg.filler } : {});
    const settings = { ...this.cfgWps.settings, ...(cfg.settings || {}) };
    app.station.load({ joint: cfg.joint, settings, equipment: cfg.equipment, seed: cfg.seed, mirror: app.settings.hand === 'left', lane: cfg.lane });
    this.loadCfg = { ...cfg, settings };
    // PPE and booth set-up for this coupon (automatic, or left to the trainee: Settings)
    const auto = app.settings.setup !== 'trainee';
    app.safety.prepareWeld(this.weldSetup ? this.weldSetup() : { ppe: auto, booth: auto });
    app.env.fan.visible = !!app.station.equipment.fan;
    app.env.screen.visible = !!app.station.equipment.screen;
    const c = app.station.coupon;
    c.group.add(app.cues3d.group);
    this.setCues();
    this.measX = cfg.joint.tab + cfg.joint.evalL / 2;
    app.coolAccel = 1;
    app.showSection(null);
    app.markFinding(null);
    app.setTool('gun');
    this.phase = 'weld';
    this.passDone = false;
    this.R = null;
    this.startT = null;
    for (const p of [app.machine, app.gasPanel, app.sitePanel, app.main]) p.invalidate();
  }

  inWps(s) {
    const w = this.cfgWps;
    if (!w) return true;
    const st = this.app.station;
    const k = st.record ? st.record.passes.length - 1 : 0;
    // pipe WPS: the electrode and current window of the pass being welded
    const pp = w.pipe ? w.passes[Math.min(k, w.passes.length - 1)] : null;
    if (pp && (s.electrode !== pp.electrode || s.dia !== pp.dia)) return false;
    return inRange(s.wfs, w.ranges.wfs) && inRange(s.voltage, w.ranges.voltage) && (!w.ranges.gasFlow || inRange(s.gasFlow, w.ranges.gasFlow)) && inRange(s.current, passCurrent(w, k)) && s.polarity === w.ranges.polarity
      && (!w.ranges.tungsten || w.ranges.tungsten.includes(s.tungsten)) && (w.ranges.postflowMin == null || (s.postflow ?? 0) >= w.ranges.postflowMin);
  }

  // Pipe WPS: the electrode of the next pass (E6010 root, E7018 fill and cap) goes into the holder.
  applyPassSettings() {
    const app = this.app;
    const st = app.station;
    const ps = passSettings(this.cfgWps, st.record.passes.length - 1);
    if (!ps) return;
    const s = st.session.settings;
    const change = s.electrode !== ps.electrode || s.dia !== ps.dia;
    st.setSettings({ electrode: ps.electrode, dia: ps.dia, current: ps.current, polarity: ps.polarity });
    if (change) {
      st.newElectrode();
      app.syncElectrode?.(false);
      app.say(`${t('Next pass')}: ${ps.electrode} Ø ${ps.dia} mm, ${ps.current} A`, 3);
    }
    app.machine?.invalidate();
  }

  // Pipe: grind the starts and the craters of this pass to a feathered edge before tying in to them
  // (Lincoln C2.420: "Fewer defects will be seen if restarts and stops (craters) are ground out, with the
  // stops ground down to a feathered edge"). Returns the number of places ground.
  grindEnds() {
    const st = this.app.station;
    const j = st.joint;
    if (!j || !j.pipe || (st.lastState && st.lastState.arcOn)) return 0;
    const p = st.record.pass;
    let n = 0;
    for (const sp of p.starts) {
      if (sp.restart || !sp.done) continue;
      const sg = sp.sigma || 1;
      const a = sp.sMin ?? sp.s;
      if (st.feather(a, wrapX(j, a + sg * PIPE_FEATHER), { beyond: 3 }) > 0) n++;
    }
    for (const sp of p.stops) {
      const sg = sp.sigma || 1;
      const e = sp.sEnd ?? sp.s;
      if (st.feather(e, wrapX(j, e - sg * PIPE_FEATHER), { beyond: 4 }) > 0) n++;
    }
    this.app.main.invalidate();
    return n;
  }

  // 1G: turn the pipe a quarter of a turn so that the next part of the joint comes up on top (the weld is
  // laid from above: ASME IX QW-122 "rolled during welding so that the weld metal is deposited from above").
  rollPipe(dir = 1) {
    const st = this.app.station;
    const j = st.joint;
    if (!j || !j.pipe || !j.pipe.rotated) return false;
    const ok = st.setRoll((j.pipe.roll || 0) - dir * Math.PI / 2);
    if (ok) {
      this.setCues();
      this.app.main.invalidate();
    }
    return ok;
  }

  // Lane (u, mm) the current pass follows on a bead-on-plate drill; 0 on joints.
  laneNow() {
    const st = this.app.station;
    return st.joint && st.joint.type === 'plate' ? st.record.pass.lane ?? 0 : 0;
  }

  // Aim line and pacer on the current surface and lane.
  setCues() {
    const st = this.app.station;
    this.app.cues3d.setJoint(st.joint, st.mirror, (x, u) => st.surfaceAt(x, u), this.laneNow());
  }

  // Interpass cooling may run faster than real time only while the trainee welds (not during a
  // demo or replay, which must keep the recorded timing).
  allowCoolAccel() {
    return this.phase === 'weld';
  }

  update(dt) {
    const app = this.app;
    if (this.phase === 'replay') {
      const steps = this.replaySpeed || 1;
      for (let k = 0; k < steps; k++) app.weldStep(k === steps - 1 ? dt : dt, { driver: this.replay });
      if (this.replay.done) {
        this.phase = 'results';
        this.hideDemoTool();
        app.demoRod.group.visible = false;
        app.restDesktopGun();
        app.say(t('Replay finished.'));
        app.main.invalidate();
      }
      return;
    }
    if (this.phase === 'weld' || this.phase === 'demo') {
      const state = app.weldStep(dt, { driver: this.phase === 'demo' ? this.driver : null, wps: (s) => this.inWps(s), record: true, lockTrigger: this.lockTrigger });
      app.toolStep(dt);
      if (this.phase === 'demo' && this.driver.done) {
        this.phase = 'weld';
        this.driver = null;
        this.hideDemoTool();
        app.demoRod.group.visible = false;
        app.restDesktopGun();
        app.say(t('Demo weld finished. Inspect it, or start your own on a new coupon.'));
        app.main.invalidate();
      }
      if (state && state.started && this.startT == null) this.startT = app.time;
      if (state && (state.started || state.stopped)) app.main.invalidate();
      // refresh the temperature lines on the panel once a second while the arc is off
      this.panelT = (this.panelT || 0) + dt;
      if (this.panelT > 1 && !(state && state.arcOn) && (app.coolAccel > 1 || app.station.readings.length)) {
        this.panelT = 0;
        app.main.invalidate();
      }
      this.updateCues(dt, state);
      this.liveT = (this.liveT || 0) + dt;
      if (this.liveT > 0.2 && state && state.arcOn) {
        this.liveT = 0;
        app.machine.invalidate();
      }
      if (this.timeLimit && this.startT != null) {
        const left = this.timeLimit - (app.time - this.startT);
        if (Math.floor(left) !== this.lastLeft) {
          this.lastLeft = Math.floor(left);
          app.main.invalidate();
        }
        if (left <= 0 && !(state && state.arcOn)) {
          app.say(t('Time is up.'));
          this.finish();
        }
      }
    } else {
      app.weldStep(dt, {});
      app.toolStep(dt);
      app.grabStep(dt);
    }
  }

  updateCues(dt, state) {
    const app = this.app;
    const st = app.station;
    const show = this.cuesOn && this.phase === 'weld' && st.session;
    const near = state && state.hit && state.tech.ctwd < 90;
    app.cueStrip.mesh.visible = !!(show && near);
    const w = show ? st.windows() : null;
    if (show && near) {
      this.cueT = (this.cueT || 0) + dt;
      if (this.cueT > 0.066) {
        this.cueT = 0;
        const arc = state.arc;
        const smaw = st.session.settings.process === '111';
        const tig = st.session.settings.process === '141';
        const dia = st.session.settings.dia || 3.2;
        const items = [
          { label: t('Work angle'), value: state.tech.workAngle, unit: '°', lo: w.workAngle[0], hi: w.workAngle[1], min: w.workAngle[0] - 30, max: w.workAngle[1] + 30 },
          { label: t('Travel angle'), value: state.tech.travelAngle, unit: '°', lo: w.travelAngle[0], hi: w.travelAngle[1], min: -30, max: 40 },
          smaw || tig
            ? { label: t('Arc length'), value: arc ? arc.arcLen : state.tech.ctwd, unit: 'mm', lo: w.stickOut[0], hi: w.stickOut[1], min: 0, max: tig ? 8 : 3 * dia, fmt: (v) => v.toFixed(1) }
            : { label: t('Stick-out'), value: arc ? arc.stickOut : state.tech.ctwd - 2, unit: 'mm', lo: w.stickOut[0], hi: w.stickOut[1], min: 0, max: 40 },
          { label: t('Speed'), value: state.arcOn ? state.tech.speed : null, unit: 'mm/s', lo: w.speed[0], hi: w.speed[1], min: 0, max: w.speedTarget * 2.2, fmt: (v) => v.toFixed(1) },
          { label: state.tech.weaveAmp > 1 ? t('Weave centre') : t('Aim'), value: state.tech.aimC ?? state.tech.aim, unit: 'mm', lo: w.aim[0], hi: w.aim[1], min: -8, max: 8, fmt: (v) => v.toFixed(1) },
        ];
        // open-root root run: the keyhole item below takes the place of the speed item (station.speedByKeyhole)
        if (w.speedByKeyhole) items.splice(3, 1);
        // open root (pipe root run): the keyhole the root run keeps open (Lincoln C2.420: "a small "keyhole"
        // will be seen following behind the electrode"; "If the keyhole is not seen, the electrode is not
        // penetrating through to the inside of the pipe"). Window: from just through the land to short of
        // a burn-through (record.js open-root index; seeds).
        const j = st.joint;
        const rootRun = j.openRoot && st.record.passes.length === 1;
        let kh = null;
        if (rootRun && state.hit) {
          const kw = keyholeWindow(j, state.hit.x, st.session.sigma || 1);
          kh = { label: t('Keyhole'), value: state.arcOn ? state.keyhole : null, unit: '', lo: kw.lo, hi: kw.hi, min: 0.6, max: 2.2, fmt: (v) => (v < 1 ? t('closed') : v > kw.burn ? t('burning through') : v > kw.hi ? t('large') : t('open')) };
          items.push(kh);
        }
        let msg = '';
        const E = smaw ? st.electrode : null;
        const T = tig ? st.tig : null;
        // GTAW: time since the rod last melted in the pool while the arc burns and the torch travels
        if (T) this.noFillT = state.arcOn && state.tech.speed > 0.5 && !(T.fillerRate > 0) ? (this.noFillT || 0) + 0.066 : 0;
        // CWB Group: GMAW spray transfer on steel is mainly used in the flat and horizontal positions
        // (flux-cored wires have their own all-position transfer; the cue is for solid wire only)
        if (state.arcOn && arc && arc.mode === 'spray' && st.session.settings.process === '135' && (st.joint.vertical || st.joint.overhead)) msg = t('Spray transfer out of position: the pool is too fluid. Use short-circuit settings.');
        // SMAW: a long arc loses the coating's shielding (porosity: Hobart/Miller 155095F); with
        // low-hydrogen electrodes "never hold a long arc" (Lincoln C2.410)
        else if (smaw && state.arcOn && arc && arc.arcLen > w.stickOut[1]) msg = arc.coating === 'basic' ? t('Arc too long: keep a very short arc with low-hydrogen electrodes.') : t('Arc too long: hold about one electrode diameter.');
        else if (smaw && E && E.stuck) msg = t('Electrode stuck: free it with a quick twist of the holder.');
        // GTAW (Miller OM-215994; ESAB; TWI)
        else if (T && T.contaminated) msg = t('Tungsten contaminated: stop and regrind it (A / X on the torch hand).');
        else if (T && T.oxidized && !state.arcOn) msg = t('Tungsten oxidised (blue-black): regrind it, and keep the post-flow on it next time.');
        else if (T && state.arcOn && arc && arc.arcLen > w.stickOut[1]) msg = t('Arc too long: hold the tungsten 1.6–3.2 mm from the work.');
        else if (T && T.rodOxide > 0 && state.arcOn) msg = t('Rod end oxidised: keep the hot rod tip inside the argon shield.');
        else if (T && this.noFillT > 2) msg = t('Add filler: dab the rod into the front edge of the pool.');
        else if (smaw && E && E.used) msg = t('Electrode used up: fit a new one (A / X on the holder hand).');
        else if (kh && state.arcOn && kh.value != null && kh.value < 1) msg = t('No keyhole: the root is not penetrating. Travel slower and keep the arc in the gap.');
        else if (kh && state.arcOn && kh.value != null && kh.value > kh.hi) msg = t('Keyhole too big: travel faster, or whip the electrode up out of the crater for a moment.');
        else if (!w.speedByKeyhole && state.arcOn && state.tech.speed < w.speed[0] * 0.8) msg = t('Faster: keep up with the pacer');
        else if (!w.speedByKeyhole && state.arcOn && state.tech.speed > w.speed[1] * 1.2) msg = t('Slower: let the pool fill the joint');
        else if (!state.arcOn && !app.helmet.isDown) msg = t('Lower your helmet (B / Y or nod) before you strike');
        app.cueStrip.draw(items, msg, app.ui.rtl);
      }
    }
    // pacer (none on an open-root root run: the keyhole sets the pace there)
    if (show && w.speedByKeyhole) {
      this.pacerS = null;
      app.cues3d.setPacer(0, 0, false);
    } else if (show && state && state.arcOn && st.joint.pipe) {
      // round the pipe, in the run's direction; the target speed is along the surface the arc is on
      const j = st.joint;
      const sg = st.session.sigma || 1;
      if (this.pacerS == null) this.pacerS = state.hit.x;
      this.pacerS = wrapX(j, this.pacerS + (sg * w.speedTarget * dt) / metricAt(j, state.hit.v));
      if (sg * diffX(j, this.pacerS, state.hit.x) < -25) this.pacerS = state.hit.x;
      app.cues3d.setPacer(this.pacerS, st.surfaceAt(this.pacerS, 0), true, sg);
    } else if (show && state && state.arcOn) {
      if (this.pacerS == null) this.pacerS = state.hit.x;
      this.pacerS = Math.min(st.joint.L - 4, this.pacerS + w.speedTarget * dt);
      if (this.pacerS < state.hit.x - 25) this.pacerS = state.hit.x;
      app.cues3d.setPacer(this.pacerS, st.surfaceAt(this.pacerS, this.laneNow()), true);
    } else {
      if (!(state && state.arcOn)) this.pacerS = null;
      app.cues3d.setPacer(0, 0, false);
    }
    app.cues3d.aim.visible = !!show;
    // ghost torch before the first strike of a pass
    const pass = st.record ? st.record.pass : null;
    const fresh = pass && !pass.tLast.some((v) => v >= 0);
    if (show && fresh && !(state && state.arcOn) && app.renderer.xr.isPresenting) {
      if (!this.ghostDriver || this.ghostPass !== pass) {
        this.ghostDriver = st.joint.pipe ? new PipeDriver(st, this.demoPlanFor()) : new PlanDriver(st, this.demoPlanFor());
        this.ghostPass = pass;
      }
      const g = this.ghostDriver;
      // pipe: at the start point of the first run (after its strike ahead and back-up)
      const pose = st.joint.pipe ? g.pose(wrapX(st.joint, g.run.x0), g.plan.aim) : g.pose(12, g.plan.aim);
      st.worldFromSim(pose.tip[0], pose.tip[1], pose.tip[2], app.v1);
      st.dirWorldFromSim(pose.dir, app.v2);
      const rp = rayPoseForTip(app.ghostKin || app.gun.kin, app.v1, app.v2, app.v3.set(0, 1, 0));
      app.ghost.position.copy(rp.position);
      app.ghost.quaternion.copy(rp.quaternion);
      app.ghost.visible = true;
    } else app.ghost.visible = false;
  }

  // Technique plan of the demonstration pass (and the ghost torch).
  demoPlanFor() {
    const st = this.app.station;
    const j = st.joint;
    const k = st.record.passes.length - 1;
    if (j.pipe) return pipeDemoPlan(j, k);
    const plan = j.type === 'butt' ? { weaveAmp: [0.5, 2, 3, 4.5][Math.min(k, 3)], toeDwell: k ? 0.4 : 0 } : j.position === 'PF' ? { weaveAmp: 2, toeDwell: 0.4 } : {};
    if (j.position === 'PG' && st.session.settings.process === '135') plan.travelAngle = -5;
    if (j.type === 'plate') plan.aim = this.laneNow();
    return plan;
  }

  // XR: a second tool shows the demonstration or replay while the trainee keeps theirs. SMAW: a
  // second electrode holder whose electrode burns with the session (app.demoTool).
  showDemoTool() {
    const app = this.app;
    const smaw = app.gun === app.stinger;
    if (this.demoGun && this.demoGunKind !== app.gun) {
      this.demoGun.parent?.remove(this.demoGun);
      this.demoGun = null;
    }
    if (!this.demoGun) {
      this.demoGunKind = app.gun;
      if (smaw) {
        const s = app.station.session.settings;
        this.demoTool = buildStinger({ type: s.electrode, dia: s.dia });
        this.demoGun = this.demoTool.group;
      } else if (app.gun === app.tigTorch) {
        // GTAW: a second torch whose tungsten shows the session's state
        this.demoTool = buildTigTorch();
        this.demoGun = this.demoTool.group;
      } else {
        this.demoTool = null;
        this.demoGun = app.gun.group.clone(true);
      }
    }
    if (this.demoTool && this.demoTool.setElectrode) {
      const s = app.station.session.settings;
      this.demoTool.setElectrode(s.electrode, s.dia);
      const E = app.station.electrode;
      this.demoTool.setStickOut(E ? E.L : 300, false);
    }
    app.demoTool = this.demoTool;
    app.desktopGun.add(this.demoGun);
  }

  hideDemoTool() {
    if (this.demoGun) this.demoGun.parent?.remove(this.demoGun);
    this.app.demoTool = null;
  }

  startDemo() {
    const app = this.app;
    const st = app.station;
    this.driver = st.joint.pipe ? new PipeDriver(st, this.demoPlanFor()) : new PlanDriver(st, this.demoPlanFor());
    this.phase = 'demo';
    app.desktopGun.visible = true;
    if (!app.desktopGun.children.includes(app.gun.group) && !app.renderer.xr.isPresenting) app.desktopGun.add(app.gun.group);
    if (app.renderer.xr.isPresenting) this.showDemoTool();
    if (app.renderer.xr.isPresenting) app.say(t('Demo: lower your helmet to watch the pool.'));
    app.main.invalidate();
  }

  passInfo() {
    const st = this.app.station;
    const j = st.joint;
    const k = st.record.passes.length - 1;
    const plan = j.passPlan[Math.min(k, j.passPlan.length - 1)];
    return { k, n: j.passPlan.length, kind: plan.kind, slag: !!st.record.pass.slagProcess && !st.record.pass.cleaned, deposited: st.record.pass.tLast.some((v) => v >= 0) };
  }

  nextPass() {
    const app = this.app;
    const st = app.station;
    const pi = this.passInfo();
    if (pi.slag && st.record.cleanFraction() < 0.95) {
      app.say(st.session.settings.process === '111' ? t('Chip and brush the slag off this pass first.') : t('Clean the slag off this pass first (wire brush).'));
    }
    st.newPass();
    this.applyPassSettings();
    this.setCues();
    app.setTool('gun');
    app.main.invalidate();
  }

  // Evaluate the finished coupon and build the results state.
  finish() {
    const app = this.app;
    const st = app.station;
    if (st.lastState && st.lastState.arcOn) return;
    const sum = st.record.summary();
    const tech = st.techniqueSummary();
    const windows = st.stats.map((_, k) => {
      const w = { ...st.windows() };
      void k;
      return w;
    });
    const meanI = (() => {
      const rows = sum.rows.filter(Boolean);
      return rows.length ? rows.reduce((a, r) => a + r.I, 0) / rows.length : null;
    })();
    const wpsT = st.stats.reduce((a, p) => a + p.wpsT, 0);
    const wpsOut = st.stats.reduce((a, p) => a + p.wpsOut, 0);
    this.R = {
      tab: 'code', pack: 1, full: false, scroll: 0,
      sum, evalVisual: screens.evaluateAll(sum, 'visual'), evalFull: screens.evaluateAll(sum, 'full'),
      tech, windows, log: { ...st.log }, wpsInside: wpsT > 0 ? 1 - wpsOut / wpsT : null,
      shade: screens.shadeAssessment(app, meanI),
      heat: passHeat(st, tech), procedure: procedureLog(st),
      safety: app.safety.snapshot(),
    };
    this.phase = 'results';
    app.cueStrip.mesh.visible = false;
    app.cues3d.setPacer(0, 0, false);
    app.ghost.visible = false;
    this.onFinished?.();
    app.main.invalidate();
  }

  startReplay() {
    const app = this.app;
    const st = app.station;
    const frames = st.frames.slice();
    const events = st.events.slice();
    const R = this.R;
    const cfg = { ...st.cfg };
    st.load({ ...cfg, settings: { ...this.loadCfg.settings }, equipment: { ...(this.loadCfg.equipment || {}) } });
    // keep the attempt data for the results screen
    st.frames = frames;
    st.events = events;
    const c = st.coupon;
    c.group.add(app.cues3d.group);
    this.setCues();
    this.replay = new ReplayDriver(frames, events);
    this.replaySpeed = 2;
    this.R = R;
    this.phase = 'replay';
    app.desktopGun.visible = true;
    if (app.renderer.xr.isPresenting) this.showDemoTool();
    app.showSection(null);
    app.main.invalidate();
  }

  drawWeldControls(ui, y) {
    const app = this.app;
    const st = app.station;
    const pi = this.passInfo();
    const j = st.joint;
    const W = ui.W;
    const s = st.session.settings;
    const w = st.windows();
    const smaw = s.process === '111';
    const tig = s.process === '141';
    const xr = app.renderer.xr.isPresenting;
    const arcOn = !!(st.lastState && st.lastState.arcOn);
    ui.text(`${t(jointLabel(j))} · ${t(jointKind(j))} · t = ${j.t} mm`, PAD, y, { size: 26, weight: 600, maxW: W - 2 * PAD });
    if (tig) {
      // GTAW: arc length and push angle; current, polarity, start, post-flow, tungsten state and rod left
      ui.text(`${t('Pass')} ${pi.k + 1} · ${t('target speed')} ${w.speedTarget.toFixed(1)} mm/s · ${t('arc length')} ${w.stickOut[0]}–${w.stickOut[1]} mm · ${t('push angle')} 10–20°`, PAD, y + 40, { size: 21, color: COLORS.dim, maxW: W - 2 * PAD });
      const T = st.tig;
      const tState = !T ? '' : T.contaminated ? t('contaminated') : T.oxidized ? t('oxidised') : t('clean');
      ui.text(`${t('Machine')}: ${s.current} A · ${polarityLabel(s.polarity)} · ${s.startMode === 'lift' ? t('Lift-arc') : 'HF'} · ${t('post-flow')} ${s.postflow ?? 0} s · ${t('tungsten')} ${tState} · ${t('rod')} ${T ? Math.max(0, Math.round(T.rodLen)) : 0} mm`, PAD, y + 74, { size: 21, color: this.inWps(s) && !(T && (T.contaminated || T.oxidized)) ? COLORS.dim : COLORS.warn, maxW: W - 2 * PAD - 440 });
      ui.button('w-regrind', W - PAD - 420, y + 44, 200, 48, t('Regrind tungsten'), () => app.regrindTungsten(), { size: 19, disabled: arcOn });
      ui.button('w-rod', W - PAD - 200, y + 44, 200, 48, t('New rod'), () => app.newRod(), { size: 19 });
    } else if (smaw) {
      // SMAW: arc length and drag angle; set current, polarity, electrode and how much of it is left
      const ang = j.pipe ? `${t('electrode angle here')} ${angleText(w.travelAngle)}` : `${t('drag angle')} ${w.travelAngle[0]}…${w.travelAngle[1]}°`;
      ui.text(`${t('Pass')} ${pi.k + 1}${j.type === 'butt' ? ` / ${pi.n} (${t(pi.kind)})` : ''} · ${t('target speed')} ${w.speedTarget.toFixed(1)} mm/s · ${t('arc length')} ${w.stickOut[0]}–${w.stickOut[1]} mm · ${ang}`, PAD, y + 40, { size: 21, color: COLORS.dim, maxW: W - 2 * PAD });
      const E = st.electrode;
      const full = freshLength(s.electrode, s.dia) - MIN_FREE;
      const left = E ? Math.max(0, Math.round((100 * (E.L - MIN_FREE)) / full)) : 0;
      ui.text(`${t('Machine')}: ${s.current} A · ${polarityLabel(s.polarity)} · ${s.electrode} Ø ${s.dia} mm · ${t('electrode left')} ${left}%`, PAD, y + 74, { size: 21, color: this.inWps(s) ? COLORS.dim : COLORS.warn, maxW: W - 2 * PAD - 290 });
      ui.button('w-electrode', W - PAD - 270, y + 44, 270, 48, t('New electrode'), () => app.changeElectrode(), { size: 20, disabled: arcOn });
    } else {
      ui.text(`${t('Pass')} ${pi.k + 1}${j.type === 'butt' ? ` / ${pi.n} (${t(pi.kind)})` : ''} · ${t('target speed')} ${w.speedTarget.toFixed(1)} mm/s · ${t('stick-out')} ${w.stickOut[0]}–${w.stickOut[1]} mm · ${t('travel angle')} ${w.travelAngle[0]}…${w.travelAngle[1]}°`, PAD, y + 40, { size: 21, color: COLORS.dim, maxW: W - 2 * PAD });
      ui.text(`${t('Machine')}: ${s.wfs.toFixed(1)} m/min · ${s.voltage.toFixed(1)} V · ${s.polarity}${PROCESSES[s.process].gasRequired ? ` · ${s.gasFlow} L/min` : ''}`, PAD, y + 74, { size: 21, color: this.inWps(s) ? COLORS.dim : COLORS.warn, maxW: W - 2 * PAD });
    }
    const by = y + 100;
    const bw = (W - 2 * PAD - 3 * 16) / 4;
    const demoAllowed = this.allowDemo !== false;
    ui.button('w-finish', PAD, by, bw, 76, t('Finish and inspect'), () => this.finish(), { style: 'primary', size: 24, disabled: arcOn });
    if (j.type === 'butt' || (tig && j.type === 'plate')) ui.button('w-next', PAD + (bw + 16), by, bw, 76, j.type === 'plate' ? t('Next bead') : t('Start next pass'), () => this.nextPass(), { size: 24, disabled: !pi.deposited || st.record.passes.length >= (j.pipe ? j.passPlan.length : 6) });
    else ui.button('w-restart0', PAD + (bw + 16), by, bw, 76, t('New coupon'), () => this.restart(), { size: 24 });
    const bx = PAD + 2 * (bw + 16);
    if (tig) {
      // GTAW leaves no slag (no brush); on the bead-on-plate coupon the third button is a new coupon
      if (j.type === 'plate') ui.button('w-restart0', bx, by, bw, 76, t('New coupon'), () => this.restart(), { size: 24 });
    } else if (smaw) {
      // slag: chipping hammer, then wire brush (Hobart/Miller 155095F)
      const hw = (bw - 10) / 2;
      ui.button('w-hammer', bx, by, hw, 76, t('Hammer'), () => app.setTool(app.tool === 'hammer' ? 'gun' : 'hammer'), { size: 22, selected: app.tool === 'hammer', disabled: !xr });
      ui.button('w-brush', bx + hw + 10, by, hw, 76, t('Brush'), () => app.setTool(app.tool === 'brush' ? 'gun' : 'brush'), { size: 22, selected: app.tool === 'brush', disabled: !xr });
    } else ui.button('w-brush', bx, by, bw, 76, app.tool === 'brush' ? t('Back to the gun') : t('Wire brush'), () => app.setTool(app.tool === 'brush' ? 'gun' : 'brush'), { size: 24, selected: app.tool === 'brush', disabled: !xr });
    if (demoAllowed) ui.button('w-demo', PAD + 3 * (bw + 16), by, bw, 76, t('Watch a demo pass'), () => this.startDemo(), { size: 24, disabled: this.phase === 'demo' || pi.deposited });
    let yy = by;
    if (j.pipe) yy = this.drawPipeRow(ui, by + 88, arcOn) - 88;
    if (pi.slag && pi.deposited) {
      const f = st.record.cleanFraction();
      const msg = smaw
        ? `${t('Slag on this pass')}: ${(100 * st.record.chipFraction()).toFixed(0)}% ${t('chipped')} · ${(100 * f).toFixed(0)}% ${t('brushed clean')}`
        : `${t('Slag on this pass')}: ${(100 * (1 - f)).toFixed(0)}% ${t('of the length still covered')}`;
      ui.text(msg, PAD, yy + 112, { size: 22, color: COLORS.warn, maxW: W - 2 * PAD - 320 });
      if (!xr) ui.button('w-chip', W - PAD - 300, yy + 84, 300, 52, t('Chip and brush (instant)'), () => st.cleanAll(), { size: 20 });
    }
    return yy + 140;
  }

  // Pipe: where the arc is round the joint (clock position, ISO 9606-1 6.1 marks the 12 o'clock position on
  // fixed pipe), the electrode for this pass, grinding starts and craters, and rolling the 1G pipe. Returns
  // the y below the row.
  drawPipeRow(ui, y, arcOn) {
    const app = this.app;
    const st = app.station;
    const j = st.joint;
    const W = ui.W;
    const ls = st.lastState;
    const k = st.record.passes.length - 1;
    const pp = this.cfgWps && this.cfgWps.pipe ? this.cfgWps.passes[Math.min(k, this.cfgWps.passes.length - 1)] : null;
    let where = t('Point the electrode at the joint');
    if (ls && ls.hit) where = j.pipe.axis === 'vertical' ? `${t('Arc at')} ${Math.round(ls.hit.x)} mm ${t('round the joint')}` : `${t('Arc at')} ${screens.clockText(clockAt(j, ls.hit.x))} ${t("o'clock")}`;
    ui.text(where, PAD, y + 22, { size: 21, color: COLORS.info, maxW: W - 2 * PAD - 640 });
    if (pp) ui.text(`${t('WPS for this pass')}: ${pp.electrode} Ø ${pp.dia} mm, ${pp.current[0]}–${pp.current[1]} A`, PAD, y + 50, { size: 19, color: COLORS.dim, maxW: W - 2 * PAD - 640 });
    ui.button('w-grind', W - PAD - 620, y, 300, 52, t('Grind starts and craters'), () => {
      const n = this.grindEnds();
      app.say(n ? t('Starts and craters ground to a feathered edge: {n}.', { n }) : t('Nothing to grind on this pass yet.'), 2.5);
    }, { size: 19, disabled: arcOn || !st.record.pass.tLast.some((v) => v >= 0) });
    if (j.pipe.rotated) ui.button('w-roll', W - PAD - 300, y, 300, 52, t('Roll the pipe ¼ turn'), () => this.rollPipe(1), { size: 19, disabled: arcOn });
    return y + 66;
  }

  restart() {
    this.loadCoupon({ ...this.loadCfg, seed: (this.loadCfg.seed || 1) + 17 });
  }

  // Heat panel: contact thermometer, cooling speed and thermal-camera view. Returns the y below.
  drawHeatBox(ui, y, limit = null) {
    const app = this.app;
    const st = app.station;
    const W = ui.W;
    const xr = app.renderer.xr.isPresenting;
    const H = 178;
    ui.rect(PAD, y, W - 2 * PAD, H, COLORS.bg2, 16, COLORS.line);
    ui.text(t('Heat and interpass temperature'), PAD + 20, y + 36, { size: 24, weight: 700, maxW: 640 });
    if (limit != null) ui.text(`${t('Training WPS: interpass max')} ${limit} °C`, W - PAD - 20, y + 36, { size: 20, color: COLORS.warn, align: 'end', maxW: 520 });
    const r1 = y + 54;
    let tx;
    if (xr) {
      ui.button('h-thermo', PAD + 20, r1, 330, 54, app.tool === 'thermo' ? t('Back to the gun') : t('Contact thermometer'), () => app.setTool(app.tool === 'thermo' ? 'gun' : 'thermo'), { size: 22, selected: app.tool === 'thermo' });
      tx = PAD + 370;
    } else {
      const j = st.joint;
      ui.stepper('h-mx', PAD + 20, r1, 300, 54, null, `x ${Math.round((this.measX ?? j.L / 2) - j.tab)} mm`, (d) => {
        this.measX = clamp((this.measX ?? j.L / 2) + d * 10, j.tab, j.L - j.tab);
        app.main.invalidate();
      });
      ui.button('h-measure', PAD + 336, r1, 270, 54, t('Measure temperature'), () => this.deskTemperature(), { size: 21 });
      tx = PAD + 626;
    }
    const rd = st.readings[st.readings.length - 1];
    const msg = rd ? `${t('Last reading')}: ${Math.round(rd.T)} °C · x ${Math.round(rd.x - st.joint.tab)} mm · ${fmtAgo(st.record.time - rd.t)}` : t('No temperature reading yet');
    ui.text(msg, tx, r1 + 36, { size: 21, color: rd ? (limit != null && rd.T > limit ? COLORS.warn : COLORS.text) : COLORS.dim, maxW: W - PAD - 20 - tx });
    const r2 = y + 118;
    ui.text(t('Cooling'), PAD + 20, r2 + 34, { size: 21, color: COLORS.dim, maxW: 120 });
    ui.segmented('h-cool', PAD + 150, r2, 390, 50, [{ value: 1, label: t('Real time') }, { value: 10, label: '10×' }, { value: 30, label: '30×' }], app.coolAccel, (v) => {
      app.coolAccel = v;
      app.main.invalidate();
    }, { size: 20 });
    ui.text(t('Thermal camera view'), PAD + 570, r2 + 34, { size: 21, color: COLORS.dim, maxW: 330 });
    ui.segmented('h-view', W - PAD - 20 - 250, r2, 250, 50, [{ value: false, label: t('Off') }, { value: true, label: t('On') }], app.thermalView, (v) => app.setThermalView(v), { size: 20 });
    return y + H + 14;
  }

  // Desktop: contact thermometer reading at the chosen position on the weld line.
  deskTemperature() {
    const app = this.app;
    const st = app.station;
    const x = this.measX ?? st.joint.L / 2;
    const u = this.laneNow();
    const T = st.temperatureAt(x, u, st.surfaceAt(x, u));
    st.recordReading(x, T);
    app.say(`${t('Temperature recorded')}: ${Math.round(T)} °C`);
    this.onReading?.(x, T);
    app.main.invalidate();
  }

  drawResultsScreen(ui, extraButtons = [], opts = {}) {
    const app = this.app;
    screens.drawResults(ui, app, this.R, 104, opts);
    const by = ui.H - 140;
    const W = ui.W;
    const bw = (W - 2 * PAD - 3 * 16) / 4;
    const btns = [
      { id: 'r-section', label: t('Macro section'), go: () => app.showSection(app.station.joint.tab + app.station.joint.evalL / 2) },
      { id: 'r-replay', label: this.phase === 'replay' ? t('Replaying…') : t('Replay (2×)'), go: () => this.startReplay(), disabled: this.phase === 'replay' || !app.station.frames.length },
      ...extraButtons,
    ];
    void by;
    btns.slice(0, 4).forEach((b, k) => ui.button(b.id, PAD + k * (bw + 16), ui.H - 96, bw, 64, b.label, b.go, { size: 22, disabled: b.disabled, style: b.style }));
  }
}
