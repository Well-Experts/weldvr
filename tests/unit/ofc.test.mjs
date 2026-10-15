// Oxy-fuel cutting (oxyacetylene): the Victor tip chart and the outfit model (flows, flame, procedure checks
// against the Victor set-up, lighting and shut-down instructions and OSHA 1910.253), the hazardous events
// (pop, backfire), and cuts on plate: the start at the kindling temperature, the cut-quality categories of the
// Harris cutting guide for speed, tip height, oxygen and preheat faults, loss of the cut, restarts, bevels and
// the ISO 9013 perpendicularity ranges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GasOutfit, TIP_CHART, chartRow, cuttingFlow, flameOf, mid, REG, ACETYLENE, IN_MM, STEPS } from '../../src/sim/ofc.js';
import { makeCutCoupon, CutSession, summarizeCut, nominalSpeed, iso9013Range, ISO9013_U, KINDLING_C, CUT_CATEGORIES, CATEGORY_ORDER } from '../../src/sim/cut.js';
import { setupOutfit, lightTorch, shutDown, cutRun, idle } from '../../src/sim/cutScript.js';

const ROW12 = chartRow('P12');

function readyOutfit(plate = 'P12', o = {}) {
  const row = chartRow(plate);
  const out = new GasOutfit({ tip: o.tip ?? row.tip, ready: true, row, ...o });
  out.row = row;
  return out;
}

function cut(plan = {}, opts = {}) {
  const plate = opts.plate || 'P12';
  const o = readyOutfit(plate, opts.outfit || {});
  if (opts.oxyPsig) o.setRegulator('oxygen', opts.oxyPsig / REG.oxygen.psiPerTurn);
  lightTorch(o, chartRow(plate), opts.light || {});
  const ses = new CutSession({ coupon: makeCutCoupon({ plate, ...(opts.coupon || {}) }), outfit: o, seed: opts.seed ?? 3, dirtyTip: !!opts.dirty });
  const run = cutRun(ses, plan);
  const S = summarizeCut(ses.record);
  const ev = {};
  for (const e of run.events) ev[e.e] = (ev[e.e] || 0) + 1;
  return { ses, run, S, ev, o };
}

const share = (S, ...cats) => cats.reduce((a, k) => a + (S.cats[k] || 0), 0) / S.len;

test('tip chart: Victor 0056-0138 rows as printed; the cutting bore passes the printed flows', () => {
  assert.equal(TIP_CHART.length, 12);
  const r = ROW12;
  assert.deepEqual([r.label, r.tip, r.cutP, r.cutQ, r.fuelP, r.fuelQ, r.speed, r.kerf], ['1/2"', '0', [30, 35], [60, 65], [3, 5], [9, 16], [16, 22], 0.06]);
  assert.equal(chartRow('P25').tip, '2');
  assert.equal(Math.round(chartRow('P6').tIn * IN_MM * 10) / 10, 6.4);
  for (const row of TIP_CHART) {
    const q = cuttingFlow(row.tip, mid(row.cutP));
    assert.ok(Math.abs(q - mid(row.cutQ)) / mid(row.cutQ) < 0.05, `${row.label} tip ${row.tip}: ${q.toFixed(1)} vs ${mid(row.cutQ)}`);
  }
  assert.equal(cuttingFlow('0', 0), 0);
  assert.equal(ACETYLENE.maxUsePsig, 15);
});

test('flame: acetylene alone smokes at low flow and leaves the tip at high flow; feather, neutral at 1:1, oxidizing', () => {
  assert.equal(flameOf('0', 3, 0).type, 'fuel');
  assert.ok(flameOf('0', 3, 0).smoke > 0);
  assert.equal(flameOf('0', 10, 0).smoke, 0);
  assert.ok(flameOf('0', 25, 0).separated);
  const carb = flameOf('0', 12, 8);
  assert.equal(carb.type, 'carburizing');
  assert.ok(carb.feather > 0.2);
  assert.equal(flameOf('0', 12, 12).type, 'neutral');
  assert.equal(flameOf('0', 12, 12).feather, 0);
  assert.equal(flameOf('0', 12, 16).type, 'oxidizing');
});

test('the whole procedure by the instructions: every set-up, lighting and shut-down step done and correct', () => {
  const o = new GasOutfit({ tip: '0' });
  o.row = ROW12;
  const su = setupOutfit(o, ROW12);
  assert.ok(su.leak.tight && su.leak.conditions, JSON.stringify(su.leak));
  assert.ok(lightTorch(o, ROW12));
  assert.equal(o.flame.type, 'neutral');
  shutDown(o);
  const pr = o.procedure();
  assert.equal(pr.length, STEPS.length);
  for (const s of pr) assert.ok(s.done && s.ok, `${s.id}: ${JSON.stringify(s)}`);
  assert.equal(o.faults.length, 0, JSON.stringify(o.faults));
  assert.ok(o.inlet('oxygen') < 0.5 && o.inlet('fuel') < 0.5 && o.delivery('oxygen') < 0.1 && o.delivery('fuel') < 0.1);
});

test('procedure faults: screws in, acetylene valve over 1 1/2 turns, acetylene over 15 psig, no purge, quick opening', () => {
  const run = (setup = {}, light = null) => {
    const o = new GasOutfit({ tip: '0', screwsIn: !!setup.screwsIn });
    o.row = ROW12;
    setupOutfit(o, ROW12, setup);
    if (light) lightTorch(o, ROW12, light);
    return o.procedure().reduce((m, s) => ((m[s.id] = s), m), {});
  };
  assert.ok(!run({ screwsIn: true }).screwsOut.ok);
  assert.ok(!run({ fuelTurns: 2 }).fuelOpen.ok);
  assert.ok(!run({ fuelPsig: 20 }, {}).pressures.ok);
  assert.ok(!run({ skipPurge: true }, {}).purge.ok);
  assert.ok(!run({ fast: true }).oxyOpen.ok);
  const ok = run({}, {});
  for (const id of ['secure', 'caps', 'crack', 'screwsOut', 'oxyOpen', 'fuelOpen', 'leak', 'pressures', 'purge', 'light', 'smoke', 'neutral']) assert.ok(ok[id].ok, id);
});

test('lighting with the oxygen open and closing the fuel first both "pop" and are recorded', () => {
  const o = readyOutfit();
  const ev = [];
  const orig = o.step.bind(o);
  o.step = (dt, ctx) => {
    const e = orig(dt, ctx);
    ev.push(...e);
    return e;
  };
  lightTorch(o, ROW12, { preheatOpen: 0.4 });
  assert.ok(ev.includes('pop'));
  assert.ok(o.procedure().find((s) => s.id === 'light').faults.length === 1);
  const o2 = readyOutfit();
  lightTorch(o2, ROW12);
  const ev2 = [];
  const orig2 = o2.step.bind(o2);
  o2.step = (dt, ctx) => {
    const e = orig2(dt, ctx);
    ev2.push(...e);
    return e;
  };
  shutDown(o2, { fuelFirst: true });
  assert.ok(ev2.includes('pop'));
  assert.ok(!o2.procedure().find((s) => s.id === 'shutO2').ok);
});

test('leak test: a leaking hose shows on the gauges in five minutes, the solution finds it, tightened it holds', () => {
  const o = new GasOutfit({ tip: '0', leak: { gas: 'fuel', at: 'hose', rate: 2 } });
  o.row = ROW12;
  const su = setupOutfit(o, ROW12);
  assert.ok(!su.leak.tight && su.leak.drop.fuel > 1);
  assert.ok(!o.done.leak);
  assert.equal(o.leakSolution(), 'hose');
  assert.ok(o.tighten('hose'));
  // retest
  o.setRegulator('oxygen', 20 / REG.oxygen.psiPerTurn);
  o.setRegulator('fuel', 10 / REG.fuel.psiPerTurn);
  o.setValve('oxygen', 0);
  o.setCylinder('oxygen', 0);
  o.setCylinder('fuel', 0);
  idle(o, 1);
  const again = o.watchGauges();
  assert.ok(again.tight && again.conditions && o.done.leak);
});

test('the cutting lever drops the oxygen to the preheat: the neutral flame goes carburizing until readjusted', () => {
  const o = readyOutfit();
  lightTorch(o, ROW12, { noLever: true, ratio: 1.0 });
  assert.equal(o.flame.type, 'neutral');
  o.setLever(1);
  idle(o, 0.3);
  assert.equal(o.flame.type, 'carburizing');
});

test('cut at the chart speed: started at the kindling temperature, severed, perfect cut, square to ISO 9013 range 1', () => {
  const { S, run, ev, ses } = cut({ speed: 1 });
  assert.ok(run.preheatTime > 1.5 && run.preheatTime < 20, `preheat ${run.preheatTime}`);
  assert.equal(ev.start, 1);
  assert.ok(ev.severed === 1 && S.severed && S.gaps.length === 0);
  assert.ok(share(S, 'perfect', 'production') > 0.95, JSON.stringify(S.cats));
  assert.equal(S.range, 1);
  assert.equal(S.drossAdhShare, 0);
  assert.ok(S.topMax < 0.5);
  assert.ok(Math.abs(S.kerf - 0.06 * IN_MM) < 0.1);
  assert.ok(ses.record.starts[0].edge);
});

test('speed: slow gives rounded top edges and pressure marks, fast drag and slag on the bottom, too fast loses the cut', () => {
  const slow = cut({ speed: 0.55 }).S;
  assert.ok(share(slow, 'extremelySlow') > 0.9, JSON.stringify(slow.cats));
  assert.ok(slow.topMax > 1);
  const slight = cut({ speed: 0.75 }).S;
  assert.ok(share(slight, 'slightlySlow') > 0.9);
  const fast = cut({ speed: 1.45 }).S;
  assert.ok(fast.severed && share(fast, 'extremelyFast') > 0.9 && fast.drossAdhShare > 0.9, JSON.stringify(fast));
  const lost = cut({ speed: 1.8 });
  assert.ok(lost.ev.lost >= 1 && !lost.S.severed && share(lost.S, 'notSevered') > 0.5);
});

test('a lost cut is restarted from the end of the kerf: the restart leaves a gouge and the strip drops', () => {
  const { S, ev, ses } = cut({ speedAt: (x) => (x > 80 && x < 95 ? 1.9 : 1), recover: true });
  assert.ok(ev.lost >= 1 && ev.restart >= 1 && S.severed, JSON.stringify(ev));
  let gouge = false;
  for (let i = 0; i < ses.record.n; i++) if (ses.record.restart[i] && ses.record.gr[i] >= Math.fround(0.7)) gouge = true;
  assert.ok(gouge);
});

test('tip height: too close grooves and overheats the tip, too high a rounded top and slower preheat; touching the work backfires', () => {
  // cones buried in the kerf: grooves while it cuts, then the tip overheats and backfires
  const close = cut({ cone: 0.5 });
  assert.ok((close.S.cats.tooClose || 0) > 20 && !close.S.cats.perfect && !close.S.cats.production, JSON.stringify(close.S.cats));
  assert.ok(close.ev.backfire >= 1);
  const ok = cut({ cone: 3 });
  const high = cut({ cone: 10 });
  assert.ok(share(high.S, 'tooHigh') > 0.9 && high.run.preheatTime > ok.run.preheatTime);
  const touch = cut({ cone: -2.4, preheatMax: 20 });
  assert.ok(touch.ev.backfire >= 1 && !touch.S.severed);
});

test('oxygen: too much cutting oxygen (or too big a tip) gives pressure marks; too small a tip cuts like too fast', () => {
  const hi = cut({ speed: 1 }, { oxyPsig: 50 });
  assert.ok(share(hi.S, 'tooMuchO2') > 0.9);
  const big = cut({ speed: 1 }, { outfit: { tip: '2' } });
  assert.ok(share(big.S, 'tooMuchO2') > 0.9);
  const small = cut({ speed: 1 }, { outfit: { tip: '00' } });
  assert.ok(share(small.S, 'extremelyFast', 'slightlyFast') > 0.9);
});

test('cold start: the cutting oxygen on steel below the kindling temperature does not start the cut', () => {
  const { ev, S } = cut({ preheatTime: 0.5, preheatTemp: 1e9 });
  assert.equal(ev.cold, 1);
  assert.ok(!ev.start && share(S, 'notSevered') === 1);
  assert.equal(KINDLING_C, 816);
});

test('bevel: a 30 deg bevel cut with the torch at 30 deg is within ISO 9013; a tilted torch on a square cut is not', () => {
  const bev = cut({ speed: 1 }, { coupon: { bevel: 30 } });
  assert.ok(bev.S.severed && bev.S.range != null && bev.S.range <= 2, JSON.stringify(bev.S));
  assert.ok(Math.abs(bev.S.a - 12.7 / Math.cos(Math.PI / 6)) < 1e-6);
  assert.ok(nominalSpeed(bev.ses.c) < nominalSpeed(makeCutCoupon({ plate: 'P12' })));
  const tilt = cut({ speed: 1, bevel: 6 });
  assert.ok(tilt.S.range === 5 || tilt.S.range === null, JSON.stringify(tilt.S));
  assert.ok(Math.abs(ISO9013_U[4](12.7) - (0.8 + 0.02 * 12.7)) < 1e-12);
  assert.equal(iso9013Range(1.0, 12.7), 4);
  assert.equal(iso9013Range(3, 12.7), null);
});

test('moving too slowly lets the cut fuse together behind the jet', () => {
  const { ev, S } = cut({ pauseAt: 120, pauseTime: 2.5 });
  assert.ok(ev.fused >= 1 && !S.severed && S.gaps.length >= 1, JSON.stringify([ev, S.gaps]));
});

test('every category has the guide text; the record is deterministic', () => {
  for (const k of CATEGORY_ORDER) assert.ok(CUT_CATEGORIES[k] && CUT_CATEGORIES[k].text.length > 20);
  const a = cut({ speed: 1.1, wobble: 0.8 }).ses.record;
  const b = cut({ speed: 1.1, wobble: 0.8 }).ses.record;
  for (const k of ['depth', 'drag', 'top', 'dross', 'face', 'kerf', 'uTop', 'cat']) assert.deepEqual(Array.from(a[k]), Array.from(b[k]), k);
});

test('reverse flow with no check valves mixes the gases in a hose; lighting it flashes back unless an arrestor stops it', () => {
  for (const arrestors of [false, true]) {
    const o = readyOutfit('P12', { checkValves: false, arrestors });
    const ev = [];
    const orig = o.step.bind(o);
    o.step = (dt, ctx) => {
      const e = orig(dt, ctx);
      ev.push(...e);
      return e;
    };
    // both torch valves opened together with the torch unlit (improper start-up): oxygen at 32 psig pushes
    // back into the 4 psig fuel hose
    o.setValve('preheat', 0.8);
    o.setValve('fuel', 0.5);
    idle(o, 1);
    assert.ok(o.hose.fuel.mixed);
    o.setValve('preheat', 0);
    o.spark();
    idle(o, 0.1);
    assert.ok(ev.includes(arrestors ? 'flashbackStopped' : 'flashback'), JSON.stringify(ev));
  }
});
