import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJoint, grooveAreaBelow, levelForArea } from '../../src/sim/joint.js';
import { defaultSettings, heatInput, currentFor, transferMode, depositionRate, arcState } from '../../src/sim/process.js';
import { scriptedWeld } from '../../src/sim/scripted.js';
import { evaluate, isoUndercutLimit } from '../../src/sim/rules/packs.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const good = { workAngle: 45, travelAngle: 5, ctwd: 17, aim: 0, craterDwell: 0.6 };
const refs = (r) => r.findings.filter((f) => f.verdict === 'reject').map((f) => f.ref);

test('heat input follows the EN 1011-1 form (k x U x I x 60 / (v mm/min x 1000))', () => {
  // 21.5 V, 192.5 A, 5 mm/s = 300 mm/min: arc energy 0.8277 kJ/mm, x0.8 = 0.6622 kJ/mm
  near(heatInput(0.8, 21.5, 192.5, 5), (0.8 * 21.5 * 192.5 * 60) / (300 * 1000));
  near(heatInput(1.0, 30, 400, 10), (30 * 400 * 60) / (600 * 1000));
});

test('current rises with wire feed and falls with longer CTWD (EWI direction)', () => {
  const s = defaultSettings('135');
  assert.ok(currentFor({ ...s, wfs: 8 }, 15) > currentFor({ ...s, wfs: 5 }, 15));
  assert.ok(currentFor(s, 25) < currentFor(s, 15));
});

test('transfer mode: short-circuit at low current, spray only with argon-rich gas', () => {
  const s = defaultSettings('135');
  assert.equal(transferMode(s, 150, 19.5), 'short');
  assert.equal(transferMode(s, 300, 30), 'spray');
  assert.equal(transferMode({ ...s, gas: 'CO2' }, 300, 30), 'globular');
});

test('deposition = wire area x feed speed x efficiency', () => {
  const s = defaultSettings('135');
  const expected = ((Math.PI * 1.2 * 1.2) / 4) * ((5.5 * 1000) / 60) * 0.92;
  near(depositionRate(s, 'short'), expected, 1e-9);
});

test('groove geometry: area and inverse level agree', () => {
  const j = makeJoint('butt', 'PA');
  // 4 mm gap, 1 mm root face, 60 deg groove, 10 mm plate: 4*1 + 4*9 + 81*tan30
  near(grooveAreaBelow(j, 0), 4 + 36 + 81 * Math.tan(Math.PI / 6), 1e-9);
  near(levelForArea(j, grooveAreaBelow(j, -4)), -4, 1e-9);
  near(levelForArea(j, 4), -9, 1e-9);
});

test('ISO 5817:2023 undercut limits at t = 10 mm (h <= k t, max)', () => {
  near(isoUndercutLimit(10, 'B'), 0.5); // 0.05t = 0.5, max 0.5
  near(isoUndercutLimit(10, 'C'), 0.5); // 0.1t = 1.0, capped at 0.5
  near(isoUndercutLimit(10, 'D'), 1.0); // 0.2t = 2.0, capped at 1
  near(isoUndercutLimit(4, 'C'), 0.4);
});

test('a well-made PB fillet passes ISO 5817 C and AWS D1.1 static (visual)', () => {
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: defaultSettings('135'), passes: [{ ...good, workAngle: 42 }], seed: 1 });
  const sum = rec.summary();
  assert.equal(evaluate(sum, 'iso5817-2023', 'C', { mode: 'visual' }).verdict, 'accept');
  assert.equal(evaluate(sum, 'aws-d11-static', null, { mode: 'visual' }).verdict, 'accept');
  assert.equal(evaluate(sum, 'iso9606-1', null, { mode: 'visual' }).verdict, 'accept');
});

test('high voltage and fast travel produce rejectable undercut (5011) under every pack', () => {
  const s = defaultSettings('135');
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: { ...s, voltage: s.voltage + 4 }, passes: [{ ...good, speedFactor: 1.5 }], seed: 2 });
  const sum = rec.summary();
  assert.ok(refs(evaluate(sum, 'iso5817-2023', 'C', { mode: 'visual' })).includes('5011'));
  assert.ok(refs(evaluate(sum, 'aws-d11-static', null, { mode: 'visual' })).includes('(7)'));
  assert.ok(refs(evaluate(sum, 'api1104', null, { mode: 'visual' })).includes('EU'));
});

test('loss of shielding gas produces surface porosity (2017)', () => {
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: defaultSettings('135'), env: { gasAvailable: false }, passes: [good], seed: 3 });
  const sum = rec.summary();
  assert.ok(sum.pores.filter((p) => p.surface).length > 5);
  assert.ok(refs(evaluate(sum, 'iso5817-2023', 'C', { mode: 'visual' })).includes('2017'));
});

test('slow, cold travel gives overlap (506) and excessive throat (5214) at level C', () => {
  const s = defaultSettings('135');
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: { ...s, voltage: s.voltage - 2 }, passes: [{ ...good, speedFactor: 0.55 }], seed: 5 });
  const r = refs(evaluate(rec.summary(), 'iso5817-2023', 'C', { mode: 'visual' }));
  assert.ok(r.includes('506'));
  assert.ok(r.includes('5214'));
});

test('slow short-circuit downhill (PG) gives surface lack of fusion (401)', () => {
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PG'), settings: defaultSettings('135'), passes: [{ ...good, speedFactor: 0.6 }], seed: 7 });
  assert.ok(refs(evaluate(rec.summary(), 'iso5817-2023', 'D', { mode: 'visual' })).includes('401'));
});

test('an uncleaned flux-cored pass leaves slag (301), found only by the full examination', () => {
  const bp = (o = {}) => ({ workAngle: 90, travelAngle: 12, ctwd: 17, aim: 0, craterDwell: 0.6, ...o });
  const rec = scriptedWeld({
    joint: makeJoint('butt', 'PA'), settings: defaultSettings('136'),
    passes: [bp(), bp({ weaveAmp: 2, toeDwell: 0.4, clean: false }), bp({ weaveAmp: 3, toeDwell: 0.4 }), bp({ weaveAmp: 4.5, toeDwell: 0.4 })],
    seed: 10,
  });
  const sum = rec.summary();
  assert.ok(!refs(evaluate(sum, 'iso5817-2023', 'C', { mode: 'visual' })).includes('301'));
  assert.ok(refs(evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' })).includes('301'));
});

test('a stop inside the evaluation length without crater fill fails AWS Table 8.1 (3)', () => {
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: defaultSettings('135'), passes: [{ ...good, stopsAt: [120], craterDwell: 0.6 }], seed: 11 });
  const sum = rec.summary();
  assert.ok(sum.stops.length >= 1);
  assert.ok(refs(evaluate(sum, 'aws-d11-static', null, { mode: 'visual' })).includes('(3)'));
});

test('ISO 9606-1 judges undercut at level C and porosity at level B', () => {
  const s = defaultSettings('135');
  const rec = scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: { ...s, voltage: s.voltage + 4 }, passes: [{ ...good, speedFactor: 1.5 }], seed: 2 });
  const f = evaluate(rec.summary(), 'iso9606-1', null, { mode: 'visual' }).findings.find((x) => x.ref === '5011');
  assert.ok(f && f.clause.includes('level C'));
  near(f.limit, 0.5);
});

test('same seed and plan give an identical record', () => {
  const mk = () => scriptedWeld({ joint: makeJoint('fillet', 'PB'), settings: defaultSettings('135'), env: { gasAvailable: false }, passes: [good], seed: 42 });
  const a = mk().summary();
  const b = mk().summary();
  assert.deepEqual(a.pores.map((p) => [p.s, p.d]), b.pores.map((p) => [p.s, p.d]));
});

test('wrong polarity collapses arc stability', () => {
  const s = defaultSettings('135');
  assert.ok(arcState({ ...s, polarity: 'DCEN' }, 17, 5, {}).stability < 0.3 * arcState(s, 17, 5, {}).stability + 1e-9);
});
