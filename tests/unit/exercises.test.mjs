// Technique drills (scope family B): a well-made attempt meets every criterion, and each typical
// mistake is caught by the criterion written for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, exerciseJoint, laneFor, evaluateExercise, demoPlan, TRAINING_INTERPASS_MAX } from '../../src/exercises.js';
import { WeldSession } from '../../src/sim/session.js';
import { scriptedPass, waitInterpass, scriptedPipeWeld, keyholeWindow } from '../../src/sim/scripted.js';
import { wpsFor, passSettings } from '../../src/scenarios.js';

// Pipe drills: the scripted pipe welder with the pipe WPS electrode of each pass; the keyhole share of the root
// run collected as the welding station does (station.js stats).
function runPipeExercise(ex, mod = {}) {
  const joint = exerciseJoint(ex);
  const wps = wpsFor('111', joint);
  const session = new WeldSession({ joint, settings: { ...wps.settings, ...(mod.settings || {}) }, seed: 7, thermalDt: 1 / 12 });
  const kh = { t: 0, tin: 0 };
  const upd = session.update.bind(session);
  session.update = (dt, tip, dir, trig, extra) => {
    const st = upd(dt, tip, dir, trig, extra);
    if (st && st.arcOn && session.record.passes.length === 1 && st.keyhole != null) {
      const w = keyholeWindow(joint, st.hit.x, session.sigma || 1);
      kh.t += dt;
      if (st.keyhole >= w.lo && st.keyhole <= w.hi) kh.tin += dt;
    }
    return st;
  };
  const passes = joint.passPlan.map((pl, k) => ({ ...demoPlan(ex, joint, k, '111'), settings: { ...passSettings(wps, k), ...(mod.settings || {}) }, ...(mod.plan || {}), noWait: !!mod.noWait, cleanFinal: !mod.noClean }));
  scriptedPipeWeld({ session, passes, dt: 1 / 60 });
  const rec = session.record;
  return evaluateExercise(ex, { rec, sum: rec.summary(), tech: [{ keyhole: kh }], readings: [] });
}

function runExercise(ex, process, mod = {}) {
  if (ex.joint[0] === 'pipe') return runPipeExercise(ex, mod);
  const joint = exerciseJoint(ex);
  const wps = wpsFor(process, joint);
  const session = new WeldSession({ joint, settings: { ...wps.settings, ...(mod.settings || {}) }, seed: 7, thermalDt: 1 / 12 });
  const rec = session.record;
  const readings = [];
  for (let k = 0; k < ex.passes; k++) {
    if (k > 0) {
      if (!mod.noClean) rec.clean();
      rec.newPass();
      session.reset();
      if (!mod.noWait) waitInterpass(session, ex.interpass ?? TRAINING_INTERPASS_MAX, 0);
      if (ex.measure && !mod.noMeasure) readings.push({ t: rec.time, x: 120, T: session.thermal.maxNear(20, 220, 10), pass: k });
    }
    const lane = laneFor(mod.overlap != null ? { ...ex, padOverlap: mod.overlap } : ex, joint, rec, k);
    if (joint.type === 'plate') rec.pass.lane = lane;
    const plan = { ...demoPlan(ex, joint, k, process), ...(mod.plan || {}) };
    if (joint.type === 'plate') plan.aim = lane + (mod.aimOff || 0);
    scriptedPass(session, plan);
  }
  if (rec.pass.slagProcess && !mod.noClean) rec.clean();
  return evaluateExercise(ex, { rec, sum: rec.summary(), tech: [], readings });
}

test('every exercise and process: a well-made attempt meets all its criteria', () => {
  for (const ex of EXERCISES) {
    for (const proc of ex.processes) {
      const r = runExercise(ex, proc);
      const failed = r.items.filter((i) => !i.ok).map((i) => `${i.id} ${i.measured}`);
      assert.equal(failed.length, 0, `${ex.id} ${proc}: ${failed.join('; ')}`);
    }
  }
});

test('each typical mistake fails the criterion written for it', () => {
  const E = (id) => EXERCISES.find((e) => e.id === id);
  const cases = [
    ['B1-S', '135', { aimOff: 4 }, 'straight'],
    ['B1-S', '135', { plan: { speedNoise: 0.45 } }, 'widthSd'],
    ['B1-S', '135', { plan: { craterDwell: 0 } }, 'craterEnd'],
    ['B1-S', '135', { settings: { voltage: 26 }, plan: { speedFactor: 1.5 } }, 'undercut'],
    ['B2', '135', { plan: { toeDwell: 0 } }, 'dwell'],
    ['B1-P', '136', { noClean: true }, 'slag'],
    ['B1-P', '135', { overlap: 0.1 }, 'padFlat'],
    ['B1-S', '135', { settings: { gasFlow: 3 } }, 'pores'],
    ['B7', '135', { plan: { craterAtStops: 'none', restartTech: 'same', endBackup: false } }, 'cratersFilled'],
    ['B7', '135', { plan: { craterAtStops: 'pause', restartTech: 'same', pauseAtStops: 6, endBackup: false } }, 'tieIns'],
    ['B7', '135', { plan: { craterAtStops: 'pause', restartTech: 'same', restartGap: 4, endBackup: false } }, 'tieIns'],
    ['B8', '136', { noMeasure: true }, 'measured'],
    ['B8', '136', { noWait: true }, 'interpass'],
    ['B8', '136', { noClean: true }, 'cleaning'],
    // pipe: too little current for the root closes the keyhole and leaves the root unpenetrated
    ['B6-R5', '111', { settings: { current: 70 }, plan: { keyhole: false } }, 'keyhole'],
    ['B6-R5', '111', { settings: { current: 70 }, plan: { keyhole: false } }, 'code'],
  ];
  for (const [id, proc, mod, crit] of cases) {
    const r = runExercise(E(id), proc, mod);
    const it = r.items.find((x) => x.id === crit);
    assert.ok(it && !it.ok, `${id} ${JSON.stringify(mod)} should fail ${crit}`);
  }
});
