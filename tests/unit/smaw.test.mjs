// SMAW (111): training WPS from the electrode data, two-step slag removal (chip, then brush), slag
// left between passes, crater fill while the arc is held still, scripted welds with electrode
// changes, and the electric-shock rule for changing electrodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wpsFor } from '../../src/scenarios.js';
import { makeJoint } from '../../src/sim/joint.js';
import { WeldSession } from '../../src/sim/session.js';
import { scriptedPass, needsNewElectrode } from '../../src/sim/scripted.js';
import { currentWindow, arcWindow, ELECTRODES, MIN_FREE } from '../../src/sim/smaw.js';
import { protection } from '../../src/safety/ppe.js';
import { electrodeChangeShock, INCIDENTS } from '../../src/safety/incidents.js';
import { PPE_JOBS, jobTask } from '../../src/safety/drills.js';

test('SMAW training WPS: data-sheet current window, 15% less out of position, electrode polarity', () => {
  const pb = wpsFor('111', makeJoint('fillet', 'PB'), { electrode: 'E7018', dia: 3.2 });
  assert.deepEqual(pb.ranges.current, [100, 140]);
  assert.equal(pb.ranges.polarity, 'DCEP');
  assert.ok(pb.ranges.current[0] <= pb.settings.current && pb.settings.current <= pb.ranges.current[1]);
  assert.deepEqual(pb.stickOut, arcWindow('E7018', 3.2).map((v) => Math.round(v * 10) / 10));
  const pf = wpsFor('111', makeJoint('fillet', 'PF'), { electrode: 'E7018', dia: 3.2 });
  assert.deepEqual(pf.ranges.current, currentWindow('E7018', 3.2, 'PF'));
  assert.equal(pf.ranges.current[1], Math.round(140 * 0.85));
  // E6013: AC first ("AC preferred", Fleetweld 37); E6010: DCEP only
  assert.equal(wpsFor('111', makeJoint('fillet', 'PB'), { electrode: 'E6013', dia: 3.2 }).ranges.polarity, 'AC');
  assert.deepEqual(ELECTRODES.E6010.polarities, ['DCEP']);
  assert.ok(pb.id.includes('E7018'));
});

function smawSession(type = 'fillet', pos = 'PB', electrode = 'E7018') {
  const joint = makeJoint(type, pos);
  const wps = wpsFor('111', joint, { electrode, dia: 3.2 });
  return new WeldSession({ joint, settings: { ...wps.settings }, seed: 5, thermalDt: 1 / 12 });
}

test('scripted SMAW run: electrode changes with restarts, no arc strikes, fresh electrode for the next run', () => {
  const ses = smawSession();
  scriptedPass(ses, { workAngle: 42, travelAngle: 20 });
  const rec = ses.record;
  const p = rec.pass;
  let dep = 0;
  for (let i = 0; i < ses.joint.n; i++) if (p.area[i] > 0.05) dep++;
  assert.ok(dep > ses.joint.L - 20, `deposited ${dep} mm`);
  assert.ok(p.starts.length >= 2, 'at least one electrode change and restart');
  assert.ok(p.starts.slice(1).every((s) => s.restart && s.backed), 'restarts struck ahead and backed into the crater');
  assert.equal(rec.arcStrikes.length, 0);
  assert.ok(p.stops.every((s) => s.filled), 'craters filled at every stop');
  // the electrode left is short: a new run starts with a fresh one
  ses.electrode.L = MIN_FREE + 5;
  assert.equal(needsNewElectrode(ses), true);
});

test('SMAW slag: brushing alone does not remove it; chip, then brush', () => {
  const ses = smawSession('butt', 'PA');
  scriptedPass(ses, { workAngle: 90, travelAngle: 20 });
  const rec = ses.record;
  const n0 = rec.brush(0, ses.joint.n - 1);
  assert.equal(n0, 0);
  assert.ok(rec.lastBrushBlocked > 50);
  assert.ok(rec.chipFraction() < 0.05);
  const c = rec.chip(0, ses.joint.n - 1);
  assert.ok(c > 50);
  assert.ok(rec.chipFraction() > 0.95);
  assert.ok(rec.cleanFraction() < 0.05, 'chipped is not yet clean');
  rec.brush(0, ses.joint.n - 1);
  assert.ok(rec.cleanFraction() > 0.95);
});

test('SMAW slag between passes: none when cleaned, a smaller residue when only chipped', () => {
  const run = (prep) => {
    const ses = smawSession('butt', 'PA');
    scriptedPass(ses, { workAngle: 90, travelAngle: 20 });
    prep(ses.record, ses.joint.n);
    ses.record.newPass();
    ses.reset();
    scriptedPass(ses, { workAngle: 90, travelAngle: 20, weaveAmp: 2, toeDwell: 0.4 });
    const sum = ses.record.summary();
    const sl = sum.internal.filter((f) => f.type === 'slag');
    return { n: sl.length, h: sl.length ? sl.reduce((a, f) => a + f.h, 0) / sl.length : 0 };
  };
  const clean = run((r, n) => { r.chip(0, n - 1); r.brush(0, n - 1); });
  const chipped = run((r, n) => r.chip(0, n - 1));
  const dirty = run(() => {});
  assert.equal(clean.n, 0);
  assert.ok(dirty.n > 50 && chipped.n > 50);
  assert.ok(chipped.h < 0.6 * dirty.h, `chipped ${chipped.h.toFixed(2)} vs not cleaned ${dirty.h.toFixed(2)} mm`);
});

test('changing the electrode: bare hand, wet or holed glove gives a shock; dry intact gauntlets do not', () => {
  const worn = (hands) => (hands ? { hands } : {});
  assert.equal(electrodeChangeShock(protection(worn(null))), 'bare');
  assert.equal(electrodeChangeShock(protection(worn({ id: 'gloves_gauntlet', defect: 'wet' }))), 'wet');
  assert.equal(electrodeChangeShock(protection(worn({ id: 'gloves_gauntlet', defect: 'hole' }))), 'hole');
  assert.equal(electrodeChangeShock(protection(worn({ id: 'gloves_gauntlet', defect: null }))), null);
  const inc = INCIDENTS.electricShock;
  assert.equal(inc.severity, 'injury');
  assert.ok(inc.rule.refs.some((r) => r.ref === 'CCOHS_ELEC'));
  assert.ok(inc.firstAid && inc.firstAid.refs.some((r) => r.ref === 'FS5'));
});

test('SMAW PPE job: current from the training WPS, shade guide row for 60-160 A', () => {
  const job = PPE_JOBS.find((j) => j.process === '111');
  assert.ok(job && job.tryWeld);
  const task = jobTask(job);
  assert.equal(task.current, 120);
});
