// Safety module: shade tables, PPE rules, UV exposure (AWS FS 26), contact burns, fume capture and
// the hazard hunt. Expected values are the published table values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shadeGuide, assessShade } from '../../src/safety/shade.js';
import { checkPPE, standardKit, protection } from '../../src/safety/ppe.js';
import { FS26, d1At, uvDoseRate, deepBurnTime, contactBurn, superficialBurn, hoodCaptures } from '../../src/safety/exposure.js';
import { SafetyMonitor } from '../../src/safety/incidents.js';
import { HAZARDS, HAZARD_IDS, pickHazards, scoreHunt } from '../../src/safety/hazards.js';
import { REFS } from '../../src/safety/refs.js';

test('shade guide matches OSHA 1910.133(a)(5) minimums and Z49.1 Table 1 suggestions', () => {
  // SMAW 3.2 mm electrode around 120 A: minimum 8, suggested 10
  let g = shadeGuide('111', 120);
  assert.equal(g.min, 8);
  assert.equal(g.suggested, 10);
  // GMAW 180 A: minimum 10, suggested 12
  g = shadeGuide('135', 180);
  assert.equal(g.min, 10);
  assert.equal(g.suggested, 12);
  // FCAW uses the GMAW/FCAW rows
  assert.equal(shadeGuide('136', 300).suggested, 14);
  // GTAW 120 A: minimum 8, suggested 12; 40 A: 8 / 10
  assert.deepEqual([shadeGuide('141', 120).min, shadeGuide('141', 120).suggested], [8, 12]);
  assert.deepEqual([shadeGuide('141', 40).min, shadeGuide('141', 40).suggested], [8, 10]);
  // oxygen cutting by thickness (mm)
  assert.equal(shadeGuide('OC', 20).min, 3);
  assert.deepEqual(shadeGuide('OC', 20).suggested, [3, 4]);
  assert.equal(shadeGuide('OC', 100).min, 4);
  // boundary current belongs to two rows: the darker one is used and flagged
  g = shadeGuide('111', 160);
  assert.equal(g.min, 10);
  assert.equal(g.boundary, true);
  // assessment
  assert.equal(assessShade(9, shadeGuide('135', 180)).below, true);
  assert.equal(assessShade(10, shadeGuide('135', 180)).belowSuggested, true);
  assert.equal(assessShade(12, shadeGuide('135', 180)).ok, true);
  assert.equal(assessShade(12, shadeGuide('135', 180)).belowSuggested, false);
});

test('FS 26 distances follow the inverse-square law (1 min, 10 min, 8 h)', () => {
  for (const r of FS26) {
    const [d1, d10, d8h] = [r[4], r[5], r[6]];
    // dose ~ t / d^2 constant: d10 = d1 sqrt(10), d8h = d1 sqrt(480), within the table rounding
    assert.ok(Math.abs(d10 / (d1 * Math.sqrt(10)) - 1) < 0.08, `${r[0]} ${r[2]} ${r[3]} 10 min`);
    assert.ok(Math.abs(d8h / (d1 * Math.sqrt(480)) - 1) < 0.1, `${r[0]} ${r[2]} ${r[3]} 8 h`);
  }
});

test('UV dose: one minute at the 1-min distance is the daily limit; closer is faster', () => {
  const u = d1At('111', 150);
  assert.equal(u.d1, 3.2);
  assert.ok(Math.abs(uvDoseRate(u.d1, u.d1) * 60 - 1) < 1e-9);
  // helmet up at 0.4 m from a SMAW arc: about one second reaches the daily limit
  const perS = uvDoseRate(u.d1, 0.4);
  assert.ok(perS > 1 && perS < 1.2, `${perS}`);
  // GMAW with an Ar-rich gas uses the 95% Ar + 5% O2 rows and says so
  const g = d1At('135', 250);
  assert.equal(g.exact, false);
  assert.ok(g.d1 > 2.9 && g.d1 < 6.7);
  // GTAW at 150 A: 0.90 m
  assert.equal(d1At('141', 150).d1, 0.9);
});

test('contact burn thresholds', () => {
  assert.ok(contactBurn(300, 0.1));
  assert.ok(contactBurn(70, 0.2));
  assert.equal(contactBurn(60, 2), null);
  assert.ok(contactBurn(60, 6));
  assert.equal(deepBurnTime(44), 6 * 3600);
  assert.equal(deepBurnTime(30), Infinity);
  // CENELEC Guide 29: uncoated metal 51 C for 1 min
  assert.equal(superficialBurn(51, 59), false);
  assert.equal(superficialBurn(51, 60), true);
  assert.equal(superficialBurn(48, 600), true);
});

test('fume hood captures within one hood diameter (HSE WL3)', () => {
  const arc = new THREE.Vector3(0, 0, 0);
  assert.equal(hoodCaptures(new THREE.Vector3(0.15, 0.1, 0), 0.2, arc, true), true);
  assert.equal(hoodCaptures(new THREE.Vector3(0.3, 0.2, 0), 0.2, arc, true), false);
  assert.equal(hoodCaptures(new THREE.Vector3(0.1, 0.1, 0), 0.2, arc, false), false);
});

test('PPE rules: the standard kit passes; typical mistakes are named', () => {
  const task = { process: '135', current: 180, position: 'PB', levOk: true, shade: 12 };
  const ok = checkPPE(standardKit(task), task);
  assert.equal(ok.ok, true, JSON.stringify(ok.failsShall.map((r) => r.id)));
  // synthetic fleece, no glasses, holed gloves, shade too light
  const bad = { ...standardKit(task), torso: { id: 'fleece' }, hands: { id: 'gloves_gauntlet', defect: 'hole' } };
  delete bad.eyes;
  const r = checkPPE(bad, { ...task, shade: 9 });
  const ids = r.failsShall.map((x) => x.id).sort();
  assert.deepEqual(ids, ['clothing', 'glasses', 'gloves', 'shade']);
  // overhead adds cape, ear plugs (shall) and cap (should)
  const oh = checkPPE(standardKit({ ...task, position: 'PE' }), { ...task, position: 'PE' });
  assert.equal(oh.ok, true);
  const ohMissing = checkPPE(standardKit(task), { ...task, position: 'PE' });
  assert.deepEqual(ohMissing.failsShall.map((x) => x.id).sort(), ['cape', 'ears']);
  // thin TIG gloves are named for GMAW, fine for GTAW
  const tig = { ...standardKit(task), hands: { id: 'gloves_tig' } };
  assert.equal(checkPPE(tig, task).failsShall[0].id, 'gloves');
  const gt = { process: '141', current: 120, position: 'PA', levOk: true, shade: 12 };
  assert.equal(checkPPE(standardKit(gt), gt).ok, true);
  // no extraction: respirator required
  assert.equal(checkPPE(standardKit(task), { ...task, levOk: false }).failsShall[0].id, 'resp');
  // protection flags
  const p = protection(bad);
  assert.equal(p.armsMelt, true);
  assert.equal(p.glasses, false);
  assert.equal(p.handHole, true);
});

function ctxBase(over = {}) {
  const head = { pos: new THREE.Vector3(0, 1.5, 0.45), fwd: new THREE.Vector3(0, -0.6, -0.8).normalize() };
  return {
    dt: 1 / 72, arcOn: true, process: '135', current: 180, arcW: new THREE.Vector3(0, 1.0, 0),
    head, helmetWorn: true, helmetDown: true, adfFail: false, shade: 12, shadeMin: 10, shadeBelowMin: false,
    prot: protection(standardKit({ process: '135', position: 'PB' })),
    hands: { left: { connected: false }, right: { connected: false } },
    hood: { mouth: new THREE.Vector3(0.12, 1.12, -0.05), d: 0.2, on: true },
    indoor: true, sparks: null, contactAt: null, ...over,
  };
}

test('monitor: helmet up while welding gives arc eye; helmet down does not', () => {
  const m = new SafetyMonitor();
  for (let k = 0; k < 72 * 5; k++) m.update(ctxBase());
  assert.equal(m.log.length, 0, JSON.stringify(m.log));
  const m2 = new SafetyMonitor();
  let ev = [];
  for (let k = 0; k < 72 * 3; k++) ev = ev.concat(m2.update(ctxBase({ helmetDown: false })));
  assert.ok(ev.some((e) => e.type === 'arcEye'));
});

test('monitor: fume without capture, bare-hand contact burn, gloved warning', () => {
  const m = new SafetyMonitor();
  let ev = [];
  for (let k = 0; k < 72 * 4; k++) ev = ev.concat(m.update(ctxBase({ hood: { mouth: new THREE.Vector3(0.6, 1.4, -0.4), d: 0.2, on: true } })));
  assert.ok(ev.some((e) => e.type === 'fume'));
  const hand = { connected: true, pos: new THREE.Vector3(0.1, 1.0, 0.1), quat: new THREE.Quaternion() };
  const contactAt = () => ({ T: 250, what: 'coupon' });
  const bare = ctxBase({ arcOn: false, hands: { left: hand, right: { connected: false } }, contactAt, prot: { ...protection({}), hands: false } });
  const m2 = new SafetyMonitor();
  const e2 = m2.update(bare);
  assert.equal(e2[0].type, 'contactBurn');
  const gloved = ctxBase({ arcOn: false, hands: { left: hand, right: { connected: false } }, contactAt });
  const m3 = new SafetyMonitor();
  assert.equal(m3.update(gloved)[0].type, 'hotHandling');
});

test('hazard hunt: every hazard cites a registered source; picks are unique and exclusive', () => {
  for (const id of HAZARD_IDS) {
    const h = HAZARDS[id];
    assert.ok(h.refs.length);
    for (const r of h.refs) assert.ok(REFS[r.ref], `${id}: ${r.ref}`);
  }
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 50; k++) {
    const p = pickHazards(6, rand);
    assert.equal(new Set(p).size, p.length);
    assert.ok(p.filter((x) => x.startsWith('extinguisher')).length <= 1);
  }
  const sc = scoreHunt(['a', 'b', 'c'], ['a', 'c'], ['x']);
  assert.deepEqual(sc.missed, ['b']);
  assert.ok(Math.abs(sc.score - 2 / 3) < 1e-9);
});
