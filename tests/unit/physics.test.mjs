// Heat flow, weld pool and start/stop physics added in the thermal release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conductivity, specificHeat, enthalpy, temperatureOf, RHO, T_LIQ } from '../../src/sim/material.js';
import { ThermalModel } from '../../src/sim/thermal.js';
import { poolShape } from '../../src/sim/pool.js';
import { makeJoint } from '../../src/sim/joint.js';
import { defaultSettings } from '../../src/sim/process.js';
import { WeldSession } from '../../src/sim/session.js';
import { scriptedWeld, scriptedPass, TRAINING_INTERPASS_MAX } from '../../src/sim/scripted.js';
import { wpsFor } from '../../src/scenarios.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b} (tol ${tol})`);

test('EN 1993-1-2 carbon steel properties and the enthalpy table', () => {
  near(conductivity(20), 54 - 0.0333 * 20, 1e-9);
  near(conductivity(900), 27.3, 1e-9);
  near(specificHeat(735), 5000, 1e-6, 'Curie peak');
  near(specificHeat(1000), 650, 1e-9);
  for (const T of [20, 300, 734, 736, 1200, 1600]) near(temperatureOf(enthalpy(T)), T, 0.05, 'round trip');
  // between 20 and 100 C the enthalpy rise equals rho * mean c
  const dH = enthalpy(100) - enthalpy(20);
  near(dH / (RHO * 80), (specificHeat(20) + specificHeat(100)) / 2, 2);
});

test('heat flow conserves energy: heat in = heat stored + heat lost', () => {
  for (const [type, pos] of [['plate', 'PA'], ['butt', 'PA'], ['fillet', 'PB']]) {
    const j = makeJoint(type, pos);
    const tm = new ThermalModel(j);
    const E0 = tm.heatContent();
    for (let x = 10; x < j.L - 10; x += 0.1) {
      tm.addArc(1 / 60, x, 0, 0, 3000);
      tm.advance(1 / 60);
    }
    tm.cool(60);
    const E1 = tm.heatContent();
    near((E1 - E0 + tm.energyLost) / tm.energyIn, 1, 0.01, type);
  }
});

test('heat flow matches the plane-source solution across a wide plate (small temperature rise)', () => {
  // energy E' per metre along the whole length at s = 0: T - T0 = (E'/(d rho c)) / sqrt(4 pi alpha t)
  const j = makeJoint('plate', 'PA', { width: 150 });
  const tm = new ThermalModel(j);
  const Eprime = 2.0e4; // J/m -> about 10 K at the line after 20 s
  for (let x = 1.25; x < j.L; x += 2.5) tm.deposit(0, x, 0, (Eprime * 2.5) / 1000, 0.4);
  const t = 20;
  tm.advance(t, 10000);
  const T0 = 20;
  const c = specificHeat(25), k = conductivity(25);
  const alpha = k / (RHO * c);
  const d = j.t / 1000;
  const expected = T0 + (Eprime / (d * RHO * c)) / Math.sqrt(4 * Math.PI * alpha * t);
  near(tm.lineT(j.L / 2), expected, 0.06 * (expected - T0), 'centreline');
});

test('long waits on the coarse grid agree with fine stepping', () => {
  const j = makeJoint('butt', 'PA');
  const a = new ThermalModel(j), b = new ThermalModel(j);
  for (const tm of [a, b]) {
    for (let x = 10; x < j.L - 10; x += 0.2) {
      tm.addArc(1 / 30, x, 0, 0, 3500);
      tm.advance(1 / 30);
    }
  }
  a.advance(120, 1e6);
  b.cool(120);
  const ma = a.maxNear(20, 220, 10), mb = b.maxNear(20, 220, 10);
  near(mb, ma, 0.04 * (ma - 20), 'max near weld after 120 s');
});

test('accelerated cooling in short steps (time x30 in the app) agrees with fine stepping', () => {
  // the app cools by dt x (accel - 1) every frame while the fine grid idles by dt: the result must
  // not depend on how the waiting time is cut up, and must follow the fine solution
  for (const [type, pos] of [['butt', 'PA'], ['fillet', 'PB'], ['plate', 'PA']]) {
    const j = makeJoint(type, pos);
    const a = new ThermalModel(j), b = new ThermalModel(j), c = new ThermalModel(j);
    for (const tm of [a, b, c]) {
      for (let x = 20; x < j.L - 20; x += 0.25) {
        tm.addArc(1 / 24, x, 0, 0, 3500);
        tm.advance(1 / 24);
      }
    }
    a.advance(60, 1e6);
    const dt = 1 / 72;
    for (let t = 0; t < 60 - 1e-9; t += 30 * dt) {
      b.advance(dt);
      b.cool(29 * dt);
    }
    c.cool(60);
    for (const [label, f] of [['max near weld', (m) => m.maxNear(20, j.L - 20, 10)], ['weld line at the end', (m) => m.lineT(j.L - 30)]]) {
      const ra = f(a), rb = f(b), rc = f(c);
      near(rb, ra, 0.03 * (ra - 20), `${type} ${label} (x30 steps vs fine)`);
      near(rb, rc, 0.5, `${type} ${label} (x30 steps vs one wait)`);
    }
  }
});

test('Rosenthal pool: rear length A/dT, preheat grows the pool, a T-joint pool is smaller', () => {
  const P = 3100, v = 6;
  const a = poolShape(P, v, 20, { Omega: 2 * Math.PI, images: 0 });
  near(a.Lb, a.A / (T_LIQ - 20), 1e-9, 'rear length');
  const hot = poolShape(P, v, 300, { Omega: 2 * Math.PI });
  const cold = poolShape(P, v, 20, { Omega: 2 * Math.PI });
  assert.ok(hot.w > cold.w && hot.Lb > cold.Lb, 'preheat');
  const tee = poolShape(P, v, 20, { Omega: 3 * Math.PI });
  assert.ok(tee.w < cold.w && tee.Lb < cold.Lb, 'T-joint');
  const fast = poolShape(P, 12, 20, { Omega: 2 * Math.PI });
  assert.ok(fast.w < cold.w, 'faster travel, narrower pool');
});

test('scripted multi-pass welds wait for the training interpass temperature', () => {
  const j = makeJoint('butt', 'PA');
  const B = { workAngle: 90, travelAngle: 5, ctwd: 17, aim: 0, craterDwell: 0.6 };
  const rec = scriptedWeld({ joint: j, settings: defaultSettings('135'), seed: 3, passes: [B, { ...B, weaveAmp: 2, toeDwell: 0.4 }, { ...B, weaveAmp: 3, toeDwell: 0.4 }] });
  for (const p of rec.passes.slice(1)) assert.ok(p.interpass.max <= TRAINING_INTERPASS_MAX + 1, `interpass ${p.interpass.max}`);
});

test('a hotter coupon gives a wider, flatter bead and deeper fusion (thermal coupling)', () => {
  const j = makeJoint('plate', 'PA', { lanes: [0] });
  const s = defaultSettings('135');
  const plan = { workAngle: 90, travelAngle: 5, ctwd: 19.5, aim: 0, craterDwell: 0.6 };
  const cold = new WeldSession({ joint: j, settings: s, seed: 1 });
  cold.record.pass.lane = 0;
  scriptedPass(cold, plan);
  const hot = new WeldSession({ joint: j, settings: s, seed: 1, ambient: 250 });
  hot.record.pass.lane = 0;
  scriptedPass(hot, plan);
  const a = cold.record.sample(0, 120), b = hot.record.sample(0, 120);
  assert.ok(b.wb > a.wb + 0.3, `width ${a.wb} -> ${b.wb}`);
  assert.ok(b.h < a.h, `height ${a.h} -> ${b.h}`);
  assert.ok(b.F > a.F, `fusion ${a.F} -> ${b.F}`);
});

test('crater fill by backing up, restart with a back-up tie-in, and a cold restart', () => {
  const j = makeJoint('plate', 'PA', { lanes: [0] });
  const s = defaultSettings('135');
  const run = (plan) => {
    const ses = new WeldSession({ joint: j, settings: s, seed: 9, thermalDt: 1 / 12 });
    ses.record.pass.lane = 0;
    scriptedPass(ses, { workAngle: 90, travelAngle: 5, ctwd: 19.5, aim: 0, stopsAt: [100], ...plan });
    return ses.record;
  };
  const good = run({ craterAtStops: 'backup', restartTech: 'aheadBackup' });
  assert.ok(good.pass.stops[0].filled && good.pass.stops[0].method === 'back-up');
  const rs = good.pass.starts.find((x) => x.restart);
  assert.ok(rs.backed && rs.gap <= 1.5, JSON.stringify(rs));
  const cold = run({ craterAtStops: 'pause', restartTech: 'same', pauseAtStops: 8 });
  const r2 = cold.pass.starts.find((x) => x.restart);
  let lap = false;
  for (let i = Math.floor(r2.s) - 2; i <= Math.ceil(r2.s) + 3; i++) if (cold.pass.area[i] > 0.05 && cold.sample(0, i).lofSurface) lap = true;
  assert.ok(lap, 'cold restart without the back-up leaves a cold lap');
  const open = run({ craterAtStops: 'none', restartTech: 'same' });
  assert.ok(!open.pass.stops[0].filled, 'arc broken without filling the crater');
});

test('spray transfer pool is wider than short-circuit at the same travel speed (out-of-position sag driver)', () => {
  const j = makeJoint('fillet', 'PF');
  const sc = wpsFor('135', j).settings;
  const plan = { workAngle: 45, travelAngle: 5, ctwd: 19.5, aim: 0, craterDwell: 0.5 };
  const a = new WeldSession({ joint: j, settings: sc, seed: 2 });
  scriptedPass(a, plan);
  const b = new WeldSession({ joint: j, settings: { ...sc, wfs: 10.5, voltage: 30 }, seed: 2 });
  scriptedPass(b, plan);
  const pa = a.record.sample(0, 120), pb = b.record.sample(0, 120);
  assert.equal(pb.mode, 'spray');
  assert.ok(pb.pw > pa.pw, `pool ${pa.pw} -> ${pb.pw}`);
  assert.ok(pb.Fg > 1, 'gravity factor rises for the large pool');
});
