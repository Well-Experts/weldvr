// Scripted torch paths: drive a WeldSession without a headset. Used for desktop demo welds,
// Inspector-lab coupon generation and automated tests. Angles follow the same definitions as the
// live technique metrics (work angle, travel angle with drag positive, CTWD, aim).

import { DEG, clamp } from './util.js';
import { WeldSession, surfaceHeight, speedTarget, wireHit } from './session.js';
import { arcOutLength, MIN_FREE, freshLength } from './smaw.js';
import { nominalCTWD, GTAW_FEED_DUTY } from './process.js';
import { wrapX, diffX, wrapIndex, metricAt, pipeTravelWindow, xAtClock, gravityAt } from './pipe.js';
import { OPEN_ROOT_NOM, OPEN_ROOT_BURN, FEATHER_ROOT_KEEP } from './record.js';

// SMAW (111): the electrode is live, there is no trigger. A scripted welder strikes by touching the
// work and lifting (0.1 s touch), breaks the arc by lifting beyond the arc-out length, and changes the
// electrode when it is nearly used up (crater fill, change, restart ahead and back into the crater:
// Lincoln C2.410 for low-hydrogen electrodes, The Fabricator).
export const SMAW_TOUCH = 0.1; // s
export const SMAW_CHANGE = 2.5; // s to change the electrode (seed)
export const SMAW_RESERVE = 8; // mm of electrode left when the welder stops to change it (seed)
export const SMAW_PRESS = 1.5; // mm the scripted welder presses the electrode onto the work to strike (seed)
export const SMAW_BACKUP = 6; // restart back-up speed, x travel speed (seed)
export const SMAW_CHANGE_DWELL = 0.45; // s crater-fill pause before an electrode change (seed; the fill rule needs 0.35 s held still)

// A welder starts a new run with a fresh electrode when less than a quarter of one is left (seed).
export function needsNewElectrode(session) {
  const E = session.electrode;
  if (!E) return true;
  if (E.used) return true;
  const full = freshLength(E.type, E.dia) - MIN_FREE;
  return E.L - MIN_FREE < 0.25 * full;
}

// SMAW strike: from a pose, the electrode is lowered along its axis until it touches the work and
// pressed SMAW_PRESS mm on (the work surface under a tilted electrode is not always where the pose
// assumed, e.g. at the tapered start of an earlier bead).
export function touchPose(rec, pose) {
  const h = wireHit(rec, pose.tip, pose.dir);
  if (!h) return pose;
  const k = h.inside ? 0 : h.lam + SMAW_PRESS;
  return { tip: [pose.tip[0] + pose.dir[0] * k, pose.tip[1] + pose.dir[1] * k, pose.tip[2] + pose.dir[2] * k], dir: pose.dir };
}

// Torch pose (tip position and wire direction, joint-local mm) for a desired hit point and angles.
// workAngle: fillet = angle from the base plate (45 = bisector); butt / plate = angle from the
// plate surface toward +u (90 = perpendicular). travelAngle: drag positive.
export function torchPoseFor(joint, rec, s, aim, workAngle, travelAngle, ctwd) {
  const wa = joint.type === 'fillet' ? (45 + workAngle) * DEG : workAngle * DEG;
  const wu = Math.cos(wa), wv = Math.sin(wa);
  const d = travelAngle * DEG;
  const w = [Math.sin(d), Math.cos(d) * wu, Math.cos(d) * wv];
  const hv = surfaceHeight(rec, Math.floor(s), aim);
  const hit = [s, aim, hv];
  const tip = [hit[0] + w[0] * ctwd, hit[1] + w[1] * ctwd, hit[2] + w[2] * ctwd];
  return { tip, dir: [-w[0], -w[1], -w[2]] };
}

// ---- GTAW (141) ---------------------------------------------------------------------------------------
// A scripted TIG welder: HF start at the arc length, push angle, filler dabbed at the leading edge of the
// pool at a steady rhythm (in the pool GTAW_FEED_DUTY of each period), a crater filled by reducing the
// current while still adding filler, then the torch held over the crater for the post-flow.
export const TIG_DAB_PERIOD = 0.8; // s (seed)
export const TIG_RAMP = 1.2; // s current ramp-down at the end (seed)
// Restart after a stop in the run (weldingtipsandtricks.com, "TIG restarts": the torch held still while the
// post-flow shields the crater, the arc started "near the center of the weld crater", the puddle let grow
// until it "exactly matches the crater", then the arc moved ahead and filler added). seeds:
export const TIG_RESTART_BACK = 2; // mm behind the end of the bead: about the crater centre
export const TIG_RESTART_HOLD = 0.8; // s held on the crater before moving on (longer than the model's 0.6 s cold start)
export const TIG_FILLER_RESUME = 2; // mm past the end of the crater where filler goes in again, with the first dab there (gives a flush restart in the model)

// Filler-rod tip for the scripted welder: in the pool at its leading edge, or lifted just above it
// inside the gas envelope (out: pulled well back out of the gas between dabs, a technique fault).
export function tigRodPose(joint, rec, s, aim, pool, inPool, out = false) {
  const ahead = (pool ? pool.Lf : 2) + (inPool ? 0.5 : out ? 30 : 4);
  const x = s + ahead;
  const v = surfaceHeight(rec, Math.floor(x), aim);
  return [x, aim, inPool ? v - 0.5 : out ? v + 25 : v + 3.5];
}

// plan: { speedFactor, workAngle, travelAngle, ctwd, aim, weaveAmp, weaveHz, dabDuty, dabPeriod, s0, s1,
//         craterFill, postflowHold, noFiller, rodOut, stopsAt:[s...] (stop, crater fill, post-flow, restart) }
export function scriptedPassTig(session, plan, opts = {}) {
  const j = session.joint;
  const dt = opts.dt ?? 1 / 72;
  const rec = session.record;
  const settings = session.settings;
  const passIndex = rec.passes.length - 1;
  const fillet = j.type === 'fillet';
  const vT = speedTarget(j, settings, passIndex, plan.ctwd);
  const speed = vT * (plan.speedFactor ?? 1);
  const s0 = plan.s0 ?? 6;
  const s1 = plan.s1 ?? j.L - 6;
  const wa = plan.workAngle ?? (fillet ? 45 : 90);
  const ta = plan.travelAngle ?? -15;
  const ctwd = plan.ctwd ?? nominalCTWD('141', settings);
  const aim0 = plan.aim ?? 0;
  const duty = plan.dabDuty ?? GTAW_FEED_DUTY;
  const period = plan.dabPeriod ?? TIG_DAB_PERIOD;
  const crater = plan.craterFill !== false;
  const hold = plan.postflowHold !== false;
  const stopsAt = (plan.stopsAt || []).slice().sort((x, y) => x - y);
  const postflow = settings.postflow ?? 10;
  if (session.tig && session.tig.rodLen < 200) session.newRod();
  let s = s0, t = 0, phase = 'weld', pt = 0, pedal = 1;
  let stopIdx = 0, stopS = 0, mid = false, holdT = 0, tDab = 0; // tDab: when the dab rhythm (re)started
  const maxT = ((s1 - s0) / Math.max(speed, 0.3)) * 3 + 30 + stopsAt.length * (postflow + 10);
  while (t < maxT) {
    const pose = torchPoseFor(j, rec, s, aim0 + (plan.weaveAmp ?? 0) * Math.sin(2 * Math.PI * (plan.weaveHz ?? 1) * t), wa, ta, ctwd);
    const feeding = phase === 'weld' || phase === 'ramp';
    const dabbing = feeding && session.arcOn && ((t - tDab) % period) / period < duty && plan.noFiller !== true;
    const rod = tigRodPose(j, rec, s, aim0, session.pool, dabbing, !!plan.rodOut && phase !== 'post');
    const st = session.update(dt, pose.tip, pose.dir, phase === 'post' ? 0 : pedal, { rod });
    t += dt;
    pt += dt;
    if (phase === 'weld') {
      if (st.arcOn) {
        if (stopIdx < stopsAt.length && s >= stopsAt[stopIdx]) {
          // planned stop: crater filled as at the end of the run
          stopIdx++;
          stopS = s;
          mid = true;
          phase = crater ? 'ramp' : 'post';
          pt = 0;
        } else if (s >= s1) {
          phase = crater ? 'ramp' : 'post';
          pt = 0;
        } else s += speed * dt;
      }
    } else if (phase === 'ramp') {
      pedal = Math.max(0.35, 1 - (0.65 * pt) / TIG_RAMP);
      if (pt >= TIG_RAMP) {
        phase = 'post';
        pt = 0;
      }
    } else if (phase === 'post') {
      // switch off and hold the torch over the crater until the post-flow ends
      if (!hold || pt >= postflow + 0.1) {
        if (!mid) break;
        // restart near the centre of the crater
        phase = 'restart';
        s = stopS - TIG_RESTART_BACK;
        pedal = 1;
        holdT = 0;
        pt = 0;
      }
    } else if (phase === 'restart') {
      // the arc held on the crater until the pool matches it
      if (st.arcOn) holdT += dt;
      if (holdT >= TIG_RESTART_HOLD) phase = 'tieIn';
    } else if (phase === 'tieIn') {
      // on to the end of the crater without filler, then on with filler
      if (st.arcOn) s += speed * dt;
      if (s >= stopS + (plan.fillerResume ?? TIG_FILLER_RESUME)) {
        phase = 'weld';
        mid = false;
        tDab = t; // first dab as the arc moves on
      }
    }
  }
  return null;
}

// plan: { speedFactor, workAngle, travelAngle, ctwd, aim, weaveAmp, weaveHz, toeDwell,
//         s0, s1, craterDwell, endBackup, stopsAt:[s...], restartGap,
//         craterAtStops: 'none' | 'pause' | 'backup', restartTech: 'same' | 'aheadBackup',
//         pauseAtStops (s, arc off between runs), envAt(s), settingsAt(s) }
export function scriptedPass(session, plan, opts = {}) {
  if (session.settings.process === '141') return scriptedPassTig(session, plan, opts);
  const j = session.joint;
  const dt = opts.dt ?? 1 / 72;
  const rec = session.record;
  const passIndex = rec.passes.length - 1;
  const fillet = j.type === 'fillet';
  const settings = session.settings;
  const vT = speedTarget(j, settings, passIndex, plan.ctwd);
  const speed = vT * (plan.speedFactor ?? 1);
  const s0 = plan.s0 ?? 6; // start on the run-on tab
  const s1 = plan.s1 ?? j.L - 6; // finish on the run-off tab
  const wa = plan.workAngle ?? (fillet ? 45 : 90);
  const ta = plan.travelAngle ?? 5;
  const ctwd = plan.ctwd ?? (settings.process === '111' ? nominalCTWD('111', settings) : 17);
  const aim0 = plan.aim ?? 0;
  const wAmp = plan.weaveAmp ?? 0;
  const wHz = plan.weaveHz ?? 1.5;
  const size = j.weldSize || 6;
  const backLen = 1.5 * size; // The Fabricator: back up about 1.5 x the weld size
  const stopsAt = (plan.stopsAt || []).slice().sort((a, b) => a - b);
  const craterAtStops = plan.craterAtStops ?? 'none';
  const smaw = settings.process === '111';
  let restartTech = plan.restartTech ?? 'same';
  let strikeT = 0;
  let change = false; // electrode change pending at this stop
  let s = s0;
  let t = 0;
  let trigger = true;
  let stopIdx = 0;
  let phase = 'weld';
  let pt = 0; // time in phase
  let stopS = 0;
  let pausedFor = 0;
  const speedNoise = plan.speedNoise ?? 0;
  const frames = [];
  const maxT = ((s1 - s0) / Math.max(speed, 0.3)) * 3 + 20 + stopsAt.length * 10;
  const baseEnv = { ...session.env };
  const baseSettings = { ...session.settings };
  // SMAW: start the run with a fresh electrode when less than a quarter of one is left (seed)
  if (smaw && needsNewElectrode(session)) session.newElectrode();
  while (t < maxT) {
    // position-dependent faults (gas flow dropping, oil patch, draught gusts, settings drift)
    if (plan.envAt) session.env = { ...baseEnv, ...plan.envAt(s) };
    if (plan.settingsAt) session.settings = { ...baseSettings, ...plan.settingsAt(s) };
    // weave (sinusoid with optional dwell at the extremes)
    let ph = Math.sin(2 * Math.PI * wHz * t);
    if (plan.toeDwell) ph = clamp(ph * (1 + plan.toeDwell * 2), -1, 1);
    const aim = aim0 + (phase === 'weld' ? wAmp * ph : 0);
    let lift = phase === 'off' ? 30 : 0;
    let touch = false;
    if (smaw) {
      // touch-and-lift strike while the arc is wanted but not burning; lift out to break it
      if (trigger && !session.arcOn && !session.electrode.used) {
        strikeT += dt;
        touch = strikeT <= SMAW_TOUCH;
      } else strikeT = 0;
      if (!trigger && session.arcOn) lift = Math.max(lift, arcOutLength(settings.electrode, settings.dia) + 4);
    }
    let pose = torchPoseFor(j, rec, s, aim, wa, ta, ctwd + lift);
    if (touch) pose = touchPose(rec, pose);
    const st = session.update(dt, pose.tip, pose.dir, trigger);
    if (opts.record) frames.push({ t, tip: pose.tip, dir: pose.dir, trigger, arcOn: st.arcOn });
    t += dt;
    pt += dt;
    // SMAW: an electrode burnt to the stub away from a planned change: change it, then restart
    if (smaw && phase === 'weld' && trigger && !st.arcOn && session.electrode.used) {
      stopS = s;
      change = true;
      trigger = false;
      phase = 'off';
      pt = 0;
      continue;
    }
    if (phase === 'off') {
      // arc off between runs: wait (change the electrode), then position for the restart
      if (pt >= (change ? SMAW_CHANGE : plan.pauseAtStops ?? 0.8)) {
        if (change) {
          session.newElectrode();
          change = false;
          restartTech = 'aheadBackup';
        }
        s = restartTech === 'aheadBackup' ? stopS + backLen : stopS + (plan.restartGap ?? 0);
        trigger = true;
        phase = restartTech === 'aheadBackup' ? 'backupStart' : 'weld';
        pt = 0;
      }
      continue;
    }
    if (!st.arcOn) continue;
    if (phase === 'backupStart') {
      // strike ahead, then back up quickly into the crater before travelling on (SMAW: a quicker
      // sweep, so the junction stays level; seed)
      s -= (smaw ? SMAW_BACKUP : 3) * speed * dt;
      if (s <= stopS) {
        s = stopS;
        phase = 'weld';
        pt = 0;
      }
      continue;
    }
    if (phase === 'craterBackup') {
      s -= 1.5 * speed * dt;
      if (s <= stopS - backLen) {
        trigger = false;
        phase = stopIdx >= 0 ? 'off' : 'done';
        pt = 0;
      }
      continue;
    }
    if (phase === 'craterPause') {
      if (pt >= (change ? SMAW_CHANGE_DWELL : plan.craterDwell ?? 0.6)) {
        trigger = false;
        phase = 'off';
        pt = 0;
      }
      continue;
    }
    // SMAW: electrode nearly used up: a short pause fills the crater, then the electrode is changed
    // (unless the run is nearly done); the restart strikes ahead and moves back into the crater
    // (Lincoln C2.410)
    if (smaw && phase === 'weld' && session.electrode.L <= MIN_FREE + SMAW_RESERVE && s < s1 - 3) {
      stopS = s;
      change = true;
      pt = 0;
      phase = 'craterPause';
      continue;
    }
    // Crater fill or scheduled stop
    if (stopIdx < stopsAt.length && s >= stopsAt[stopIdx]) {
      stopS = s;
      stopIdx++;
      pt = 0;
      if (craterAtStops === 'backup') {
        stopS = s;
        phase = 'craterBackup';
        // the restart reference is the end of the bead, i.e. where the back-up began
        continue;
      }
      if (craterAtStops === 'pause') {
        phase = 'craterPause';
        continue;
      }
      trigger = false;
      phase = 'off';
      continue;
    }
    if (s >= s1) {
      if (plan.endBackup) {
        // back up over the end of the bead, then break the arc
        const sEnd = s;
        while (s > sEnd - backLen) {
          const p2 = torchPoseFor(j, rec, s, aim0, wa, ta, ctwd);
          session.update(dt, p2.tip, p2.dir, true);
          s -= 1.5 * speed * dt;
        }
        const p3 = torchPoseFor(j, rec, s, aim0, wa, ta, ctwd + (smaw ? arcOutLength(settings.electrode, settings.dia) + 4 : 0));
        session.update(dt, p3.tip, p3.dir, false);
        break;
      }
      if (pausedFor < (plan.craterDwell ?? 0.5)) {
        pausedFor += dt;
        continue;
      }
      // break the arc (SMAW: lift beyond the arc-out length)
      if (smaw) {
        const p4 = torchPoseFor(j, rec, s, aim0, wa, ta, ctwd + arcOutLength(settings.electrode, settings.dia) + 4);
        session.update(dt, p4.tip, p4.dir, false);
      } else session.update(dt, pose.tip, pose.dir, false);
      break;
    }
    const v = speed * (1 + speedNoise * Math.sin(t * 2.3) + speedNoise * 0.5 * Math.sin(t * 5.1));
    s += v * dt;
  }
  return frames;
}

// ---- Pipe (open-root groove all round) ---------------------------------------------------------------------
// One run of a scripted pipe welder from x0 to x1 in direction sigma (+1 toward +x). The electrode angle
// follows the position the joint is in (pipeTravelWindow, middle of the window), work angle 90 deg. On the
// root run the welder keeps the keyhole steady by adjusting travel speed (Lincoln C2.420: "If there is a
// proper fit-up and the proper current is used, a small "keyhole" will be seen following behind the
// electrode"). Electrode changes as on plate: crater pause, new electrode, strike ahead and back into the
// crater. End: 'crater' pauses to fill the crater; 'tieIn' runs a little onto the metal already there and
// breaks the arc with a quick pull-out (C2.420: "a fast pullout (flicking the electrode) can reduce the
// size of the remaining keyhole, making tie-in easier").
// plan: { x0, x1, sigma, aim, weaveAmp, weaveHz, toeDwell, ctwd, speedFactor, keyhole, end, craterDwell,
//         travelAngle (fixed, drag positive; default from the position) }
export function scriptedPipeRun(session, plan, opts = {}) {
  const j = session.joint;
  const dt = opts.dt ?? 1 / 72;
  const rec = session.record;
  const settings = session.settings;
  const passIndex = rec.passes.length - 1;
  const sg = plan.sigma ?? 1;
  const vT = speedTarget(j, settings, passIndex, plan.ctwd);
  let r1 = plan.len ?? sg * diffX(j, plan.x1, plan.x0);
  if (r1 <= 0) r1 += j.L;
  const ctwd = plan.ctwd ?? nominalCTWD('111', settings);
  const aim0 = plan.aim ?? 0;
  const wAmp = plan.weaveAmp ?? 0;
  const wHz = plan.weaveHz ?? 1.2;
  const size = j.weldSize || 6;
  const backLen = 1.5 * size;
  const out = arcOutLength(settings.electrode, settings.dia) + 4;
  // start: struck ahead and moved back to the start point (The Fabricator: "begin ahead of the start point
  // by about 1.5 x the weld size, then back up quickly to the start point")
  let r = plan.startAhead === false ? 0 : backLen;
  let t = 0, pt = 0, strikeT = 0, stopR = 0, m = 1;
  let phase = r > 0 ? 'backupStart' : 'weld', trigger = true, change = false;
  const X = (rr) => wrapX(j, plan.x0 + sg * rr);
  const maxT = (r1 / Math.max(vT * 0.5, 0.2)) * 3 + 60;
  const tRun0 = rec.time; // metal laid before this run started is "already there" at a tie-in
  if (needsNewElectrode(session)) session.newElectrode();
  while (t < maxT) {
    const x = X(r);
    let ph = Math.sin(2 * Math.PI * wHz * t);
    if (plan.toeDwell) ph = clamp(ph * (1 + plan.toeDwell * 2), -1, 1);
    const aim = aim0 + (phase === 'weld' ? wAmp * ph : 0);
    const win = pipeTravelWindow(j, x, sg);
    const ta = plan.travelAngle ?? (win[0] + win[1]) / 2;
    let lift = phase === 'off' ? 30 : 0;
    let touch = false;
    if (trigger && !session.arcOn && !session.electrode.used) {
      strikeT += dt;
      touch = strikeT <= SMAW_TOUCH;
    } else strikeT = 0;
    if (!trigger && session.arcOn) lift = Math.max(lift, out);
    let pose = torchPoseFor(j, rec, x, aim, plan.workAngle ?? 90, sg * ta, ctwd + lift);
    if (touch) pose = touchPose(rec, pose);
    const st = session.update(dt, pose.tip, pose.dir, trigger);
    t += dt;
    pt += dt;
    if (phase === 'weld' && trigger && !st.arcOn && session.electrode.used) {
      stopR = r;
      change = true;
      trigger = false;
      phase = 'off';
      pt = 0;
      continue;
    }
    if (phase === 'off') {
      if (pt >= (change ? SMAW_CHANGE : 0.8)) {
        if (change) {
          session.newElectrode();
          change = false;
        }
        r = stopR + backLen; // strike ahead, then back into the crater
        trigger = true;
        phase = 'backupStart';
        pt = 0;
      }
      continue;
    }
    if (!st.arcOn) continue;
    if (phase === 'backupStart') {
      r -= SMAW_BACKUP * vT * dt;
      if (r <= stopR) {
        r = stopR;
        phase = 'weld';
        pt = 0;
      }
      continue;
    }
    if (phase === 'craterPause') {
      if (pt >= (change ? SMAW_CHANGE_DWELL : plan.craterDwell ?? 0.6)) {
        trigger = false;
        phase = change ? 'off' : 'done';
        pt = 0;
        if (!change) break;
      }
      continue;
    }
    if (phase === 'weld' && session.electrode.L <= MIN_FREE + SMAW_RESERVE && r < r1 - 3) {
      stopR = r;
      change = true;
      pt = 0;
      phase = 'craterPause';
      continue;
    }
    if (r >= r1) {
      if (plan.end === 'tieIn') {
        // quick pull-out: lift beyond the arc-out length at once
        const p4 = torchPoseFor(j, rec, x, aim0, plan.workAngle ?? 90, sg * ta, ctwd + out);
        session.update(dt, p4.tip, p4.dir, false);
        break;
      }
      phase = 'craterPause';
      pt = 0;
      continue;
    }
    // root: keep the keyhole steady (faster when it grows, slower when it closes); seed gain
    if (plan.keyhole && st.keyhole != null) m = clamp(m * (1 + 0.9 * (st.keyhole - keyholeTarget(j, x, sg)) * dt), 0.6, 1.8);
    // tie-in: over metal of this pass already there (the feathered start or end of the other half) travel
    // faster, so the joint gets the planned section there and not twice it
    const fTie = tieInFactor(rec, x, sg, tRun0, plan.keyhole ? 'root' : rec.pass.kind);
    const v = vT * (plan.speedFactor ?? 1) * m * fTie;
    const hv = surfaceHeight(rec, Math.floor(x), aim);
    r += (v * dt) / metricAt(j, hv);
  }
  // make sure the arc is out
  if (session.arcOn) {
    const x = X(r);
    const p5 = torchPoseFor(j, rec, x, aim0, plan.workAngle ?? 90, 0, ctwd + out);
    session.update(dt, p5.tip, p5.dir, false);
  }
  return { r, t };
}

// Keyhole the scripted root welder keeps (record.js open-root index): the nominal one, a little smaller
// where the joint faces up (toward the top of a fixed pipe), where gravity pulls the inside bead into the
// bore. seed (demonstration technique, uncalibrated)
export function keyholeTarget(j, x, sg = 1) {
  const g = gravityAt(j, x, sg);
  return OPEN_ROOT_NOM - 0.15 * Math.max(0, -g.v);
}

// Keyhole window of the live cue and the drill criterion at x: open (through the land, K >= 1 with a margin)
// and short of burning through (record.js: K above OPEN_ROOT_BURN + 0.4 g.v), at most a little above the
// target. seeds
export function keyholeWindow(j, x, sg = 1) {
  const g = gravityAt(j, x, sg);
  const target = keyholeTarget(j, x, sg);
  const burn = OPEN_ROOT_BURN + 0.4 * g.v;
  return { lo: 1.05, hi: Math.min(target + 0.3, burn - 0.15), target, burn };
}

// Share of the pass's planned section already in the groove just ahead of the arc at a tie-in: metal of
// this pass laid before the run started (the other half's feathered start or end) or laid by this run more
// than TIE_IN_AGE s ago (an all-round run coming back onto its own start). Metal the run itself laid moments
// ago (struck ahead and backed up at a restart) does not count. Used by the scripted welder and the demo
// driver to travel faster over it.
export const TIE_IN_AGE = 20; // s (seed: a restart's back-up is a few seconds old, a round of pipe minutes)
export function tieInAhead(rec, x, sg, tRun0) {
  const j = rec.joint;
  const pa = rec.pass;
  const ia = wrapIndex(j, Math.floor(x + sg * 0.5));
  const t1 = pa.tFirst[ia];
  if (t1 < 0 || (t1 >= tRun0 && rec.time - t1 < TIE_IN_AGE)) return 0;
  const recent = pa.tLast[ia] >= 0 && rec.time - pa.tLast[ia] <= 1.0;
  return (pa.area[ia] - (recent ? pa.aRun[ia] : 0)) / Math.max(pa.target, 1);
}

// Travel speed factor of the scripted welder and the demo driver at a tie-in (tieInAhead). On the root the
// feathered end the run ties in to keeps part of its metal in the gap (record.feather) and the run has to
// penetrate into it: only the metal above that share counts, and the speed-up is limited (seed).
// On the fill and cap passes the welder also travels faster where the passes below left the groove fuller
// than planned (fillExcess, e.g. over the root's tie-ins). On the cap the speed-up is limited to CAP_TIE_MAX:
// travelling much faster than the pass speed undercuts the toes (record.js). seeds
export const ROOT_TIE_MAX = 1.25;
export const FILL_LEVEL_MAX = 1.5;
export const FILL_LEVEL_MIN = 1; // no slow-down: slowing down over thin spots made small heavy-wall pipe worse in the model
export const CAP_TIE_MAX = 1.5;
export function tieInFactor(rec, x, sg, tRun0, kind = 'fill') {
  const a = tieInAhead(rec, x, sg, tRun0);
  if (kind === 'root') return 1 / (1 - clamp(a - FEATHER_ROOT_KEEP, 0, 1 - 1 / ROOT_TIE_MAX));
  const e = clamp(fillExcess(rec, x, sg) / Math.max(rec.pass.target, 1), 1 - 1 / FILL_LEVEL_MIN, 1 - 1 / FILL_LEVEL_MAX);
  return 1 / (1 - clamp(a + e, 1 - 1 / FILL_LEVEL_MIN, kind === 'cap' ? 1 - 1 / CAP_TIE_MAX : 0.7));
}

// Groove fill left by the passes below the current one just ahead of x (mean over 5 mm), against their plan
// (mm^2 of section; > 0 where the groove is fuller than planned).
export function fillExcess(rec, x, sg) {
  const j = rec.joint;
  const k = rec.passes.length - 1;
  if (k < 1) return 0;
  let planned = -(j.insideA ?? 0);
  for (let q = 0; q < k; q++) planned += rec.passes[q].target;
  let sum = 0;
  for (let d = 1; d <= 5; d++) {
    const i = wrapIndex(j, Math.floor(x + sg * d));
    let actual = 0;
    for (let q = 0; q < k; q++) actual += rec.passes[q].area[i];
    if (j.openRoot && rec.passes[0].area[i] > 0.05) {
      const r0 = rec.sample(0, i);
      if (r0 && r0.rootA != null) actual -= r0.rootA - r0.voidA; // metal through the gap (inside bead)
    }
    sum += actual - planned;
  }
  return sum / 5;
}

// Runs of one pass round a fixed pipe. Uphill or downhill: the two halves, each from the bottom (6 o'clock)
// to the top (12 o'clock) or the reverse, the second half starting on the start of the first and ending
// on its end; the start points move along from pass to pass (C2.420: "Never start a bead at the same point
// as the previous bead was started"). Rotated 1G: four quarters on top of the pipe. 2G: two halves the same
// way round. offset (mm) moves the start points.
export function pipeRunsFor(j, passIndex, opts = {}) {
  const prog = j.pipe.progression;
  const off = opts.offset ?? (passIndex % 2 ? 9 : 3) + 4 * passIndex;
  const L = j.L;
  if (j.pipe.rotated) {
    // 1G: four quarters, each laid on top of the pipe (rolled before the run so that its middle is at
    // 12 o'clock), each run starting in the crater of the last and the last tying in to the first
    const q = L / 4;
    const base = (opts.start ?? 0) + off;
    const runs = [];
    for (let k = 0; k < 4; k++) {
      const a = base + k * q;
      const mid = a + q / 2;
      runs.push({ x0: wrapX(j, a), x1: wrapX(j, a + q + (k === 3 ? 3 : 0)), sigma: 1, end: k === 3 ? 'tieIn' : 'crater', roll: Math.PI - mid / j.pipe.Rx });
    }
    return runs;
  }
  if (!prog) {
    // 2G: two runs the same way round, each about half the circumference. The first ends in a crater and
    // its start and end are ground to a feathered edge; the second starts on that feathered end and ties in
    // on the feathered start (C2.420: "Fewer defects will be seen if restarts and stops (craters) are ground
    // out, with the stops ground down to a feathered edge")
    const F = PIPE_FEATHER;
    const x0 = wrapX(j, (opts.start ?? 0) + off);
    const half = Math.round(L / 2);
    const xm = wrapX(j, x0 + half);
    return [
      { x0, x1: xm, sigma: 1, end: 'crater', feather: true },
      { x0: wrapX(j, xm - 5), x1: wrapX(j, x0 + F - 1), len: L - half + 5 + F - 1, sigma: 1, end: 'tieIn' },
    ];
  }
  const xb = xAtClock(j, 6), xt = xAtClock(j, 12);
  const F = PIPE_FEATHER;
  const lowA = wrapX(j, xb + off), lowB = wrapX(j, xb + off + 5);
  const topA = wrapX(j, xt + 5), topB = wrapX(j, xt + 5 - (F - 1));
  if (prog === 'up') {
    return [
      { x0: lowA, x1: topA, sigma: 1, end: 'crater', feather: true },
      { x0: lowB, x1: topB, sigma: -1, end: 'tieIn' },
    ];
  }
  // downhill: from just past the top down each side (C2.420: "Don't start the root pass welds at exactly the
  // top of the pipe (12 o'clock position)" "or end them at exactly the bottom (6 o'clock position)")
  void L;
  return [
    { x0: wrapX(j, xt + off), x1: wrapX(j, xb - 5), sigma: -1, end: 'crater', feather: true },
    { x0: wrapX(j, xt + off - 5), x1: wrapX(j, xb - 5 + (F - 1)), sigma: 1, end: 'tieIn' },
  ];
}

// Technique plan of the scripted pipe welder for pass k (demo welds, ghost torch, tests): the root run as a
// stringer holding the keyhole (Lincoln C2.420), a slight side-to-side weave on the fill passes (C2.420: "A
// slight side-to-side weave should be used when welding a fill pass"), and a weave to just past the groove
// edges with a pause at each side on the cap (Miller: a slight pause at the side of a weave bead against
// undercut). Amplitudes (mm) and the pause are seeds.
export function pipeDemoPlan(j, k) {
  const kind = j.passPlan[Math.min(k, j.passPlan.length - 1)].kind;
  return { weaveAmp: kind === 'root' ? 0 : kind === 'cap' ? 3 : 1.5 + 0.5 * k, toeDwell: k ? 0.4 : 0 };
}

// Length (mm) over which the scripted welder grinds a start or stop to a feathered edge before the other
// half runs onto it (seed).
export const PIPE_FEATHER = 10;

// The start and end of a finished run ground to a feathered edge (record.feather).
export function featherRun(rec, run, opts = {}) {
  const F = opts.length ?? PIPE_FEATHER;
  const j = rec.joint;
  rec.feather(run.x0, wrapX(j, run.x0 + run.sigma * F), { beyond: 3 });
  rec.feather(run.x1, wrapX(j, run.x1 - run.sigma * F), { beyond: 4 });
}

// A whole pipe weld by the scripted welder: per pass the settings (electrode), runs round the pipe
// (pipeRunsFor), the first half's start and end feathered before the second half, slag removed and the
// interpass temperature waited out between passes. plan per pass: { settings, weaveAmp, toeDwell, ipMax }.
export function scriptedPipeWeld({ session, passes, dt = 1 / 72 }) {
  const j = session.joint;
  passes.forEach((plan, k) => {
    if (k > 0) {
      session.record.clean();
      session.record.newPass();
      session.reset();
      if (!plan.noWait) waitInterpass(session, plan.ipMax ?? TRAINING_INTERPASS_MAX, 0);
    }
    if (plan.settings) {
      session.settings = { ...session.settings, ...plan.settings };
      session.newElectrode();
    }
    const kind = j.passPlan[Math.min(k, j.passPlan.length - 1)].kind;
    for (const run of plan.runs || pipeRunsFor(j, k)) {
      if (run.roll != null) j.pipe.roll = run.roll; // 1G: the pipe turned so the run is on top
      scriptedPipeRun(session, { keyhole: kind === 'root', ...plan, ...run }, { dt });
      if (run.feather && plan.feather !== false) featherRun(session.record, run);
    }
  });
  if (session.record.pass.slagProcess && passes[passes.length - 1]?.cleanFinal !== false) session.record.clean();
  return session.record;
}

// Brief arc struck on the plate away from the joint (arc strike, ISO 6520-1 601).
export function strikeArc(session, s, u, dur = 0.15, dt = 1 / 72) {
  const j = session.joint;
  const fillet = j.type === 'fillet';
  const smaw = session.settings.process === '111';
  const pose = torchPoseFor(j, session.record, s, u, fillet ? 45 : 90, 5, smaw ? 3 : 14);
  let t = 0;
  if (smaw) {
    const touch = torchPoseFor(j, session.record, s, u, fillet ? 45 : 90, 5, -0.4);
    for (let k = 0; k < 6; k++) session.update(dt, touch.tip, touch.dir, true);
  }
  while (t < dur + 0.1) {
    session.update(dt, pose.tip, pose.dir, true);
    t += dt;
  }
  session.update(dt, pose.tip, pose.dir, false);
  // lift away
  for (let k = 0; k < 10; k++) session.update(dt, [pose.tip[0], pose.tip[1], pose.tip[2] + 60], pose.dir, false);
}

// Training WPS maximum interpass temperature used by the scripted welder (seed value for the
// training WPS; not a code requirement).
export const TRAINING_INTERPASS_MAX = 250;

// Let the coupon cool for `seconds` with no welding.
export function waitFor(session, seconds) {
  session.cool(seconds);
}

// Wait until the weld and adjacent metal are at or below `maxT` (interpass control). Returns s waited.
export function waitInterpass(session, maxT, lane = 0, step = 10, limit = 1800) {
  const th = session.thermal;
  if (!th) return 0;
  const j = session.joint;
  let t = 0;
  while (t < limit && th.maxNear(j.tab, j.L - j.tab, 10, lane) > maxT) {
    session.cool(step);
    t += step;
  }
  return t;
}

export function scriptedWeld({ joint, settings, env, seed, passes, session: given, thermal, thermalDt = 1 / 12 }) {
  const session = given || new WeldSession({ joint, settings, env, seed, thermal, thermalDt });
  passes.forEach((plan, k) => {
    if (k > 0) {
      if (plan.clean !== false) session.record.clean();
      session.record.newPass();
      session.reset();
      if (!plan.noWait) waitInterpass(session, plan.ipMax ?? TRAINING_INTERPASS_MAX, plan.lane ?? 0);
    }
    if (plan.waitBefore) waitFor(session, plan.waitBefore);
    if (plan.lane != null && joint.type === 'plate') session.record.pass.lane = plan.lane;
    if (plan.settings) session.settings = { ...session.settings, ...plan.settings };
    for (const st of plan.strikes || []) strikeArc(session, st.s, st.u, st.dur);
    scriptedPass(session, joint.type === 'plate' && plan.lane != null && plan.aim == null ? { ...plan, aim: plan.lane } : plan);
    session.env = { ...session.env, ...(plan.envAfter || {}) };
  });
  // final pass of a flux-cored weld is cleaned for inspection unless the plan says otherwise
  const last = passes[passes.length - 1] || {};
  if (last.cleanFinal !== false && session.record.pass.slagProcess) session.record.clean();
  return session.record;
}
