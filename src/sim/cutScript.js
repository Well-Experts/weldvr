// Scripted operator of the oxy-fuel outfit and the cut, for the unit tests and the demo: the set-up, lighting
// and shut-down of the outfit in the order of the Victor instructions (ofc.js STEPS), and a cut along the
// marked line with a chosen speed, cone distance and torch angles.

import { clamp, DEG } from './util.js';
import { REG, FULL_OPEN, CYL_FULL_OPEN, LEAK_TEST, mid, tipData } from './ofc.js';
import { KINDLING_C, CONE_MM, nominalSpeed } from './cut.js';

// run the outfit alone for t seconds (no torch near the work)
export function idle(o, t, dt = 0.1) {
  const ev = [];
  let s = 0;
  while (s < t - 1e-9) {
    const d = Math.min(dt, t - s);
    ev.push(...o.step(d, {}));
    s += d;
  }
  return ev;
}

// turn a cylinder valve to `target` turns at `rate` turns/s
export function turnCylinder(o, gas, target, rate = 1, ctx = {}) {
  const dt = 0.1;
  let v = o.cyl[gas].open;
  while (Math.abs(v - target) > 1e-6) {
    v = v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);
    o.setCylinder(gas, v, { ...ctx, dt });
    o.step(dt, {});
  }
}

// open or close a torch valve gradually to `target` turns
export function ramp(o, name, target, rate = 1) {
  const dt = 0.05;
  let v = o.valve[name];
  while (Math.abs(v - target) > 1e-6) {
    v = v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);
    o.setValve(name, v);
    o.step(dt, {});
  }
}

// Set-up (Victor 0056-3260 Section 5, Victor 0056-0138 4.01 steps 1-13; OSHA 1910.253(b)(5)(iii)).
export function setupOutfit(o, row, opts = {}) {
  o.removeCap('oxygen');
  o.removeCap('fuel');
  o.crack('oxygen', opts.ctx || {});
  o.crack('fuel', opts.ctx || {});
  o.attachRegulator('oxygen');
  o.attachRegulator('fuel');
  if (!opts.screwsIn) {
    o.setRegulator('oxygen', 0);
    o.setRegulator('fuel', 0);
  }
  turnCylinder(o, 'oxygen', CYL_FULL_OPEN.oxygen, opts.fast ? 6 : 1, opts.ctx || {});
  turnCylinder(o, 'fuel', opts.fuelTurns ?? 0.75, 0.5, opts.ctx || {});
  // leak test (Victor 0056-3260 5.05): 20 psig oxygen, 10 psig fuel, torch valves closed, cylinder valves closed,
  // the gauges watched for five minutes
  let leak = null;
  if (!opts.skipLeak) {
    o.setRegulator('oxygen', LEAK_TEST.oxygen / REG.oxygen.psiPerTurn);
    o.setRegulator('fuel', LEAK_TEST.fuel / REG.fuel.psiPerTurn);
    idle(o, 1);
    turnCylinder(o, 'oxygen', 0, 2);
    turnCylinder(o, 'fuel', 0, 2);
    leak = o.watchGauges();
    turnCylinder(o, 'oxygen', CYL_FULL_OPEN.oxygen, 1);
    turnCylinder(o, 'fuel', opts.fuelTurns ?? 0.75, 0.5);
  }
  // working pressures from the tip chart
  o.setRegulator('oxygen', (opts.oxyPsig ?? mid(row.cutP)) / REG.oxygen.psiPerTurn);
  o.setRegulator('fuel', (opts.fuelPsig ?? mid(row.fuelP)) / REG.fuel.psiPerTurn);
  idle(o, 0.5);
  // purge each hose on its own (Victor 0056-0138 4.01 steps 8-13)
  o.setValve('oxygen', FULL_OPEN);
  if (!opts.skipPurge) {
    o.setValve('preheat', 0.5);
    idle(o, o.purgeNeed() + 0.5);
    o.setValve('preheat', 0);
    o.setValve('fuel', 0.5);
    idle(o, o.purgeNeed() + 0.5);
    o.setValve('fuel', 0);
    o.setLever(1);
    idle(o, 0.5);
    o.setLever(0);
  }
  idle(o, 0.5);
  return { leak };
}

// Lighting and the neutral flame (Victor 0056-0138 4.01 steps 14-17). opts.ratio: the preheat oxygen to fuel
// ratio aimed for with the lever pressed (neutral band, ofc.js); opts.fuel: fuel flow (scfh), default the
// middle of the chart row.
export function lightTorch(o, row, opts = {}) {
  const d = tipData(o.tip);
  o.setValve('fuel', opts.lightTurns ?? 0.125);
  if (opts.preheatOpen) o.setValve('preheat', opts.preheatOpen);
  idle(o, 0.2);
  const lit = o.spark();
  if (!lit) return false;
  idle(o, 0.3);
  // open the fuel until the flame stops smoking, on to the chart flow
  const target = opts.fuel ?? mid(row.fuelQ);
  const Pf = Math.max(0.1, o.delivery('fuel'));
  const turnsF = clamp((target / (1.25 * d.fuelHi * Math.sqrt(Pf / d.fuelPref))) * FULL_OPEN, 0, 3);
  ramp(o, 'fuel', turnsF, 0.5);
  idle(o, 0.3);
  if (opts.noOxygen) return true;
  // preheat oxygen until the feather disappears into the inner cones; then the lever pressed and the
  // preheat oxygen readjusted to neutral with it pressed
  const aim = opts.ratio ?? 1.03;
  const tune = () => {
    let k = 0;
    while (k++ < 600 && o.lit) {
      const r = o.flow.fuel > 0 ? o.flow.preO2 / o.flow.fuel : 0;
      if (Math.abs(r - aim) < 0.01) break;
      o.setValve('preheat', clamp(o.valve.preheat + (r < aim ? 0.004 : -0.004), 0, 3));
      o.step(0.02, {});
    }
  };
  tune();
  if (opts.noLever) return true;
  o.setLever(1);
  idle(o, 0.3);
  tune();
  idle(o, 1.2, 0.05);
  o.setLever(0);
  idle(o, 0.2);
  return true;
}

// Shut-down (Victor 0056-0138 4.02): preheat oxygen, then fuel; cylinder valves closed; oxygen bled through
// the lever, its adjusting screw released; fuel bled, its screw released.
export function shutDown(o, opts = {}) {
  o.setLever(0);
  if (opts.fuelFirst) {
    o.setValve('fuel', 0);
    idle(o, 0.1);
    o.setValve('preheat', 0);
  } else {
    o.setValve('preheat', 0);
    idle(o, 0.1);
    o.setValve('fuel', 0);
  }
  idle(o, 0.3);
  turnCylinder(o, 'oxygen', 0, 2);
  turnCylinder(o, 'fuel', 0, 2);
  o.setValve('oxygen', FULL_OPEN);
  o.setLever(1);
  idle(o, 3);
  o.setLever(0);
  o.setValve('oxygen', 0);
  o.setRegulator('oxygen', 0);
  o.setValve('fuel', 0.5);
  idle(o, 3);
  o.setValve('fuel', 0);
  o.setRegulator('fuel', 0);
  idle(o, 2);
}

// Torch tip and direction (plate frame, mm) for the jet to hit (x, u) on the top surface with the inner cones
// `cone` mm above it, tilted `bevel` deg across the cut (the jet toward the strip as it goes down: a bevel on
// the kept part) and `travel` deg along it (lead +).
export function torchPose(ses, x, u, cone, bevel = 0, travel = 0) {
  const o = ses.outfit;
  const size = Math.max(0.3, o.flame && o.flame.size ? o.flame.size : 1);
  const s = cone + CONE_MM * Math.sqrt(size);
  const d = [Math.tan(travel * DEG), -Math.tan(bevel * DEG), -1];
  const n = Math.hypot(d[0], d[1], d[2]);
  const dir = [d[0] / n, d[1] / n, d[2] / n];
  return { tip: [x - s * dir[0], u - s * dir[1], -s * dir[2]], dir };
}

// A cut along the line from the start edge to the far edge. plan: { speed (x nominal), cone (mm), bevel, travel,
// uOff (mm), x0, x1, dt, preheatMax (s), leverRamp (s), lever (0..1), recover (restart after a lost cut),
// pauseAt (x where the torch stops for pauseTime s), wobble (mm across, sinusoid), speedNoise (share) }.
export function cutRun(ses, plan = {}) {
  const c = ses.c;
  const dt = plan.dt ?? 1 / 60;
  const cone = plan.cone ?? 3;
  const bevel = plan.bevel ?? c.bevel ?? 0;
  const travel = plan.travel ?? 0;
  const v = (plan.speed ?? 1) * nominalSpeed(c);
  const x1 = plan.x1 ?? c.L + 3;
  const events = [];
  const at = (x, u = plan.uOff ?? 0, cn = cone) => torchPose(ses, x, u, cn, bevel, travel);
  const step = (x, u, cn, lever) => {
    ses.outfit.setLever(lever);
    const p = at(x, u, cn);
    const st = ses.update(dt, p.tip, p.dir);
    for (const e of st.events) events.push({ t: ses.time, x, e });
    return st;
  };
  let x = plan.x0 ?? 1;
  // preheat the start until the spot is at the kindling temperature (the "bright cherry red" cue)
  let tPre = 0;
  const preMax = plan.preheatMax ?? 90;
  const preTarget = plan.preheatTemp ?? KINDLING_C + 20;
  while (tPre < preMax && ses.surfaceT(x, 0) < preTarget && !(plan.preheatTime != null && tPre >= plan.preheatTime)) {
    step(x, plan.uOff ?? 0, cone, 0);
    tPre += dt;
  }
  if (plan.preheatTime != null) while (tPre < plan.preheatTime) {
    step(x, plan.uOff ?? 0, cone, 0);
    tPre += dt;
  }
  // the lever pressed slowly and fully (Victor 0056-0138 4.01 step 19)
  const lr = plan.leverRamp ?? 0.4;
  for (let t = 0; t < lr; t += dt) step(x, plan.uOff ?? 0, cone, (plan.lever ?? 1) * Math.min(1, (t + dt) / lr));
  // travel
  let t = 0;
  let restarts = 0;
  let paused = 0;
  while (x < x1 && t < 600) {
    let vx = v;
    if (plan.speedNoise) vx *= 1 + plan.speedNoise * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
    if (plan.pauseAt != null && x >= plan.pauseAt && paused < (plan.pauseTime ?? 2)) {
      paused += dt;
      vx = 0;
    }
    if (plan.speedAt) vx = plan.speedAt(x) * nominalSpeed(c);
    const uw = (plan.uOff ?? 0) + (plan.wobble ? plan.wobble * Math.sin(x / 15) : 0);
    const cn = plan.coneAt ? plan.coneAt(x) : cone;
    const st = step(x, uw, cn, plan.lever ?? 1);
    t += dt;
    if (!ses.cutting && st.events.includes('lost') && plan.recover && restarts < 4) {
      // back to the end of the kerf, preheat the edge of the cut again and restart
      restarts++;
      x = Math.max(0, x - 4);
      let tp = 0;
      while (tp < 30 && ses.surfaceT(x + 3, 0) < preTarget) {
        step(x + 3, uw, cone, 0);
        tp += dt;
      }
      for (let tt = 0; tt < lr; tt += dt) step(x + 3, uw, cone, Math.min(1, (tt + dt) / lr));
      x += 3;
      continue;
    }
    if (!ses.cutting && !plan.recover && st.events.includes('lost')) {
      // keep moving: the jet no longer cuts
    }
    x += vx * dt;
  }
  // release the lever, lift away
  for (let k = 0; k < 10; k++) step(x, plan.uOff ?? 0, cone + 10 * k, 0);
  return { preheatTime: tPre, events, restarts };
}
