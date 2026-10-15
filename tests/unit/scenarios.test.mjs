// Scenario data checks: every troubleshooting fault produces the imperfection it teaches,
// and the same joint welded to the training WPS without the fault does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TROUBLESHOOT, INSPECT_COUPONS, wpsFor, jointFor } from '../../src/scenarios.js';
import { QUAL_TESTS } from '../../src/qual/catalog.js';
import { scriptedWeld } from '../../src/sim/scripted.js';
import { evaluate } from '../../src/sim/rules/packs.js';
import { envFromEquipment } from '../../src/weld/station.js';
import { inventory, scoreInspection } from '../../src/inspect/inventory.js';

function rejects(sum, internal) {
  const iso = evaluate(sum, 'iso5817-2023', 'C', { mode: internal ? 'full' : 'visual' });
  const aws = evaluate(sum, 'aws-d11-static', null, { mode: 'visual' });
  return new Set([...iso.findings, ...aws.findings].filter((f) => f.verdict === 'reject').map((f) => f.ref));
}
const spatterPer100 = (sum) => (sum.spatter.length / sum.joint.L) * 100;

for (const sc of TROUBLESHOOT) {
  test(`${sc.id} ${sc.title}: fault shows ${sc.targets.join('/')}, corrected weld does not`, () => {
    const joint = jointFor(sc.joint);
    const wps = wpsFor(sc.process, joint, sc.smaw || sc.gtaw || {});
    const settings = { ...wps.settings, ...(sc.fault.settings || {}) };
    const rec = scriptedWeld({ joint, settings, env: envFromEquipment(sc.fault.equipment), seed: sc.seed, passes: sc.preweld });
    const sum = rec.summary();
    const r = rejects(sum, sc.internal);
    const shows = sc.targets.some((t) => r.has(t)) || (sc.targets.includes('602') && spatterPer100(sum) > 40);
    assert.ok(shows, `fault weld should show ${sc.targets} (got ${[...r]})`);
    // corrected weld: the training WPS and good technique (SMAW: nominal arc length, 20 deg drag; GTAW:
    // nominal arc length, 15 deg push, filler dabbed inside the gas)
    const smaw = sc.process === '111';
    const tig = sc.process === '141';
    const ta = sc.process === '135' ? 5 : smaw ? 20 : tig ? -15 : 12;
    const ct = smaw || tig ? undefined : 17;
    const plans = joint.type === 'fillet'
      ? [{ workAngle: 42, travelAngle: ta, ctwd: ct, aim: 0, craterDwell: 0.6 }]
      : [0, 1, 2, 3].map((k) => ({ workAngle: 90, travelAngle: ta, ctwd: ct, aim: 0, craterDwell: 0.6, weaveAmp: [0.5, 2, 3, 4.5][k], toeDwell: k ? 0.4 : 0 }));
    const good = scriptedWeld({ joint: jointFor(sc.joint), settings: wps.settings, env: envFromEquipment({}), seed: sc.seed + 1000, passes: plans }).summary();
    const r2 = rejects(good, sc.internal);
    assert.ok(!sc.targets.some((t) => r2.has(t)), `corrected weld still shows ${[...r2]}`);
    if (sc.targets.includes('602')) assert.ok(spatterPer100(good) <= 40);
  });
}

test('inspector coupons: each has a code verdict, and a perfect inspection scores 100%', () => {
  for (const c of INSPECT_COUPONS) {
    const joint = jointFor(c.joint);
    const wps = wpsFor(c.process, joint);
    const rec = scriptedWeld({ joint, settings: { ...wps.settings, ...(c.settings || {}) }, env: envFromEquipment({}), seed: c.seed, passes: c.passes });
    const truth = inventory(rec);
    const verdict = evaluate(truth.sum, c.pack, c.level, { mode: 'visual' }).verdict;
    const findings = truth.items.map((it) => ({ ref: it.ref, s: (it.s0 + it.s1) / 2, size: it.size }));
    const sc = scoreInspection(findings, verdict, truth, verdict);
    assert.equal(sc.detection, 1, c.id);
    assert.equal(sc.falseCalls, 0, c.id);
    assert.ok(sc.decisionOk, c.id);
  }
});

test('mock tests: a weld made to the training WPS passes its own code (visual): AWS D1.1 welder tests and the ISO 9606-1 MAG test pieces', () => {
  const tests = QUAL_TESTS.filter((q) => q.std === 'aws' || (q.std === 'iso' && q.process === '135'));
  tests.forEach((tst, n) => {
    const joint = jointFor(tst.joint);
    const wps = wpsFor(tst.process, joint);
    const ta = tst.process === '135' ? 5 : 12;
    const up = joint.position === 'PF';
    const plans = joint.type === 'fillet'
      ? [{ workAngle: 42, travelAngle: ta, ctwd: 17, aim: 0, craterDwell: 0.6 }]
      : [0, 1, 2, 3].map((k) => ({ workAngle: 90, travelAngle: ta, ctwd: 17, aim: 0, craterDwell: 0.6, weaveAmp: [0.5, 2, 3, 4.5][k] * (up && k ? 1 : 1), toeDwell: k ? 0.4 : 0 }));
    const sum = scriptedWeld({ joint, settings: wps.settings, env: envFromEquipment({}), seed: 501 + n, passes: plans }).summary();
    const pack = tst.std === 'aws' ? tst.pack : 'iso9606-1';
    const e = evaluate(sum, pack, null, { mode: 'visual' });
    assert.equal(e.verdict, 'accept', `${tst.id}: ${JSON.stringify(e.findings.filter((f) => f.verdict === 'reject').map((f) => `${f.ref} ${f.name} ${f.measured}`))}`);
  });
});
