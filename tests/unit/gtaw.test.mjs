// GTAW (141): training WPS for 3 mm sheet, scripted TIG welds with filler dabbing, crater fill and
// post-flow, and the consequences of the classic mistakes: tungsten touching the work or the pool, the
// filler rod touching the tungsten, a hot rod end outside the gas, too much argon, DCEP, a short
// post-flow, pure tungsten on DC; arc starting (HF, lift-arc, scratch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wpsFor, gtawJoint, GTAW_TRAIN } from '../../src/scenarios.js';
import { WeldSession, speedTarget } from '../../src/sim/session.js';
import { scriptedPass, torchPoseFor, tigRodPose } from '../../src/sim/scripted.js';
import { gtawArcState, gtawDefaults, postflowFor, TUNGSTENS, ARGON_FLOW, ARC_WINDOW } from '../../src/sim/gtaw.js';
import { evaluate } from '../../src/sim/rules/packs.js';

function session(over = {}, type = 'fillet', pos = 'PB') {
  const joint = gtawJoint(type, pos);
  const wps = wpsFor('141', joint, {});
  return new WeldSession({ joint, settings: { ...wps.settings, ...over }, seed: 9, thermalDt: 1 / 12 });
}

function deposited(ses) {
  let n = 0;
  for (let i = 0; i < ses.joint.n; i++) if (ses.record.pass.area[i] > 0.05) n++;
  return n;
}

test('GTAW training WPS: CK Form 116 row for 1/8 in mild steel, DCEN, argon window, arc 1.6-3.2 mm, post-flow', () => {
  const j = gtawJoint('fillet', 'PB');
  assert.equal(j.t, 3.2);
  assert.equal(j.leg, 3.2);
  const w = wpsFor('141', j, {});
  assert.deepEqual(w.ranges.current, [200, 250]); // fillet row
  assert.equal(w.settings.gasFlow, 9); // 18 CFH
  assert.deepEqual(wpsFor('141', gtawJoint('plate', 'PA'), {}).ranges.current, [175, 225]); // butt row
  assert.equal(w.ranges.polarity, 'DCEN');
  assert.deepEqual(w.ranges.gasFlow, ARGON_FLOW);
  assert.deepEqual(w.stickOut, ARC_WINDOW);
  assert.deepEqual(w.travelAngle, [-20, -10]); // push 10-20 deg
  assert.equal(w.ranges.postflowMin, 25); // 1 s per 10 A at 250 A, at least 8 s
  assert.ok(w.settings.postflow >= w.ranges.postflowMin);
  assert.ok(!w.ranges.tungsten.includes('EWP'), 'pure tungsten is not for DC');
  assert.ok(w.ranges.tungsten.includes('EWCe-2'));
  assert.equal(w.settings.tdia, GTAW_TRAIN.tdia);
  // the model lays the fillet at the travel speed printed in the CK row (9 in/min)
  assert.ok(Math.abs(w.passes[0].target - w.sourceSpeed) / w.sourceSpeed < 0.02, `travel speed ${w.passes[0].target} vs ${w.sourceSpeed}`);
  assert.equal(postflowFor(50), 8);
  assert.equal(postflowFor(150), 15);
  const plate = gtawJoint('plate', 'PA');
  assert.equal(plate.type, 'plate');
  assert.equal(plate.t, 3.2);
  const wp = wpsFor('141', plate, {});
  assert.ok(Math.abs(wp.passes[0].target - wp.sourceSpeed) / wp.sourceSpeed < 0.02, 'bead on plate at 11 in/min');
});

test('scripted TIG fillet on 3.2 mm: filler dabbed, crater filled, post-flow held: accepted, tungsten clean', () => {
  const ses = session();
  scriptedPass(ses, { workAngle: 45, travelAngle: -15 });
  assert.ok(deposited(ses) > ses.joint.L - 20, `deposited ${deposited(ses)} mm`);
  assert.equal(ses.tig.contaminated, false);
  assert.equal(ses.tig.oxidized, false);
  assert.ok(ses.tig.rodLen < 915, 'the rod melted');
  const sum = ses.record.summary();
  assert.equal(sum.internal.filter((x) => x.type === 'tungsten').length, 0);
  const r = evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' });
  assert.equal(r.verdict, 'accept', JSON.stringify(r.findings.map((f) => f.ref + ' ' + f.name)));
  assert.ok(ses.record.pass.stops.every((s) => s.filled), 'crater filled by the ramp-down with filler');
});

test('TIG without filler on a fillet: no weld metal added', () => {
  const ses = session();
  scriptedPass(ses, { workAngle: 45, travelAngle: -15, noFiller: true });
  assert.equal(deposited(ses), 0);
});

test('too much argon (25 L/min, turbulence) gives porosity; inside the window none', () => {
  const bad = session({ gasFlow: 25 });
  scriptedPass(bad, { workAngle: 45, travelAngle: -15 });
  assert.ok(bad.record.summary().pores.length > 5, 'porosity with turbulent shielding');
  const good = session({ gasFlow: 8 });
  scriptedPass(good, { workAngle: 45, travelAngle: -15 });
  assert.equal(good.record.summary().pores.length, 0);
});

test('DCEP: the tungsten overheats and melts into the pool; shallow fusion', () => {
  const ses = session({ polarity: 'DCEP' });
  const events = [];
  const orig = ses.gtawIgnition.bind(ses);
  ses.gtawIgnition = (...a) => {
    const r = orig(...a);
    events.push(...ses.tig.events);
    return r;
  };
  scriptedPass(ses, { workAngle: 45, travelAngle: -15 });
  const sum = ses.record.summary();
  assert.ok(sum.internal.some((x) => x.type === 'tungsten'), 'tungsten inclusion');
  assert.equal(ses.tig.contaminated, true);
  const r = evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' });
  assert.equal(r.verdict, 'reject');
  assert.ok(r.findings.some((f) => f.ref === '401'), 'lack of fusion');
});

test('short post-flow (3 s at 225 A) oxidises the tungsten; the arc after it is less stable until reground', () => {
  const ses = session({ postflow: 3 });
  scriptedPass(ses, { workAngle: 45, travelAngle: -15 });
  assert.equal(ses.tig.oxidized, true);
  const s = ses.settings;
  const dirty = gtawArcState(s, 2.4, -15, {}, { pedal: 1, contaminated: true });
  const clean = gtawArcState(s, 2.4, -15, {}, { pedal: 1, contaminated: false });
  assert.ok(dirty.stability < clean.stability);
  ses.regrindTungsten();
  assert.equal(ses.tig.oxidized, false);
  assert.equal(ses.tig.contaminated, false);
  assert.equal(ses.tig.regrinds, 1);
});

test('tungsten dipped into the pool: contaminated, tungsten inclusion recorded', () => {
  const ses = session();
  const j = ses.joint;
  const dt = 1 / 72;
  // strike (HF) and weld a little, then push the tungsten into the pool
  let s = 20;
  let dipped = false;
  for (let k = 0; k < 400; k++) {
    const dip = k > 200 && k < 210;
    const pose = torchPoseFor(j, ses.record, s, 0, 45, -15, dip ? -0.5 : 2.4);
    const rod = tigRodPose(j, ses.record, s, 0, ses.pool, ses.arcOn && k % 58 < 20);
    ses.update(dt, pose.tip, pose.dir, 1, { rod });
    if (ses.tig.events.includes('dip')) dipped = true;
    if (ses.arcOn) s += 3 * dt;
  }
  assert.ok(dipped, 'dip event');
  assert.equal(ses.tig.contaminated, true);
  assert.ok(ses.record.summary().internal.some((x) => x.type === 'tungsten'));
});

test('filler rod touching the tungsten contaminates it', () => {
  const ses = session();
  const j = ses.joint;
  const dt = 1 / 72;
  let touched = false;
  for (let k = 0; k < 120; k++) {
    const pose = torchPoseFor(j, ses.record, 20, 0, 45, -15, 2.4);
    const rod = k > 60 ? pose.tip.slice() : tigRodPose(j, ses.record, 20, 0, ses.pool, false);
    ses.update(dt, pose.tip, pose.dir, 1, { rod });
    if (ses.tig.events.includes('rodTouch')) touched = true;
  }
  assert.ok(touched);
  assert.equal(ses.tig.contaminated, true);
});

test('arc starting: HF without touching; HF with the tungsten on the work contaminates it; lift-arc', () => {
  const dt = 1 / 72;
  // HF: switch on at the arc length: the arc starts after the pre-flow, no contamination
  const hf = session();
  const pose = torchPoseFor(hf.joint, hf.record, 20, 0, 45, -15, 2.4);
  let on = false;
  for (let k = 0; k < 40 && !on; k++) on = hf.update(dt, pose.tip, pose.dir, 1).arcOn;
  assert.ok(on);
  assert.equal(hf.tig.contaminated, false);
  // HF with the tungsten touching the work
  const hf2 = session();
  const touch = torchPoseFor(hf2.joint, hf2.record, 20, 0, 45, -15, 0);
  for (let k = 0; k < 20; k++) hf2.update(dt, touch.tip, touch.dir, 1);
  assert.equal(hf2.tig.contaminated, true);
  // lift-arc: touch with the switch on (still), then lift: the arc forms as the tungsten leaves the work
  const la = session({ startMode: 'lift' });
  const t0 = torchPoseFor(la.joint, la.record, 20, 0, 45, -15, 0);
  for (let k = 0; k < 30; k++) la.update(dt, t0.tip, t0.dir, 1);
  assert.equal(la.arcOn, false);
  const t1 = torchPoseFor(la.joint, la.record, 20, 0, 45, -15, 1.5);
  let started = false;
  for (let k = 0; k < 10 && !started; k++) started = la.update(dt, t1.tip, t1.dir, 1).arcOn;
  assert.ok(started, 'lift-arc start');
  assert.equal(la.tig.contaminated, false);
});

test('pure tungsten on DC gives a less stable arc than ceriated; the amperage control scales the current', () => {
  const s = gtawDefaults({ current: 135 });
  const ce = gtawArcState({ ...s, tungsten: 'EWCe-2' }, 2.4, -15, {}, { pedal: 1 });
  const wp = gtawArcState({ ...s, tungsten: 'EWP' }, 2.4, -15, {}, { pedal: 1 });
  assert.ok(wp.stability < ce.stability);
  assert.equal(TUNGSTENS.EWP.dc, false);
  assert.equal(TUNGSTENS['EWTh-2'].radioactive, true);
  const half = gtawArcState(s, 2.4, -15, {}, { pedal: 0.5 });
  assert.ok(Math.abs(half.I - 67.5) < 1e-9);
  // a long arc loses stability and shielding
  const long = gtawArcState(s, 8, -15, {}, { pedal: 1 });
  assert.ok(long.stability < ce.stability && long.shielding < ce.shielding);
});

test('GTAW tungsten: CK Form 116 typical DCEN ranges by diameter; overheating above the range or on DCEP', () => {
  const s = gtawDefaults({ current: 225 });
  assert.equal(gtawArcState(s, 2.4, -15, {}, { pedal: 1 }).overheat, false); // 225 A inside 150-250 A
  assert.equal(gtawArcState({ ...s, current: 300 }, 2.4, -15, {}, { pedal: 1 }).overheat, true);
  assert.equal(gtawArcState({ ...s, polarity: 'DCEP' }, 2.4, -15, {}, { pedal: 1 }).overheat, true);
  assert.equal(gtawArcState({ ...s, tdia: 3.2, current: 300 }, 2.4, -15, {}, { pedal: 1 }).overheat, false); // 1/8 in: 250-400 A
  const j = gtawJoint('fillet', 'PB');
  const w = wpsFor('141', j, {});
  assert.ok(Math.abs(speedTarget(j, w.settings, 0) - 9 * 25.4 / 60) < 0.1);
});
