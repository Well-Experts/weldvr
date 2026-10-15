// Safety and PPE drills: jobs, PPE checks against each job, hazard-hunt scoring, fire-watch rules,
// and the consequence monitor for defective PPE, the open curtain and demonstrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PPE_JOBS, jobTask, SPOTS, scoreTags, FIRE_WATCH_RULES, PERMIT_ITEMS } from '../../src/safety/drills.js';
import { checkPPE, standardKit, protection, PPE_ITEMS, DEFECTS } from '../../src/safety/ppe.js';
import { HAZARD_IDS } from '../../src/safety/hazards.js';
import { SafetyMonitor, INCIDENTS } from '../../src/safety/incidents.js';
import { REFS } from '../../src/safety/refs.js';

const kitWorn = (task) => {
  const k = standardKit(task);
  const w = {};
  for (const s in k) w[s] = { id: k[s].id, defect: null };
  return w;
};

test('each PPE job: the standard kit passes, its current comes from the process model', () => {
  for (const job of PPE_JOBS) {
    const task = jobTask(job);
    assert.ok(Number.isFinite(task.current) && task.current > 80 && task.current < 320, `${job.id} ${task.current} A`);
    const chk = checkPPE(kitWorn(task), { ...task, shade: 12 });
    assert.equal(chk.ok, true, `${job.id}: ${chk.failsShall.map((r) => r.id)}`);
    assert.equal(chk.failsShould.length, 0, `${job.id}: ${chk.failsShould.map((r) => r.id)}`);
    // every extra item on the rack is either defective or unsuitable for this job
    for (const e of job.extra) {
      assert.ok(PPE_ITEMS[e.id], e.id);
      if (e.defect) assert.ok(DEFECTS[e.defect].applies.includes(e.id), `${e.id} ${e.defect}`);
      const w = kitWorn(task);
      w[e.slot] = { id: e.id, defect: e.defect };
      const c = checkPPE(w, { ...task, shade: 12 });
      assert.ok(!c.ok || c.failsShould.length, `${job.id}: wearing ${e.id} ${e.defect || ''} should fail a check`);
    }
  }
});

test('overhead job needs cape and ear plugs (shall) and a cap (should); outdoor job needs a respirator', () => {
  const J2 = PPE_JOBS.find((j) => j.position === 'PD');
  const t2 = jobTask(J2);
  const w = kitWorn({ ...t2, position: 'PB' }); // kit without the overhead items
  const c = checkPPE(w, { ...t2, shade: 12 });
  assert.deepEqual(c.failsShall.map((r) => r.id).sort(), ['cape', 'ears']);
  assert.deepEqual(c.failsShould.map((r) => r.id), ['cap']);
  const J3 = PPE_JOBS.find((j) => j.levOk === false);
  const t3 = jobTask(J3);
  const c3 = checkPPE(kitWorn({ ...t3, levOk: true }), { ...t3, shade: 12 });
  assert.deepEqual(c3.failsShall.map((r) => r.id), ['resp']);
});

test('hunt scoring: right name, right place wrong name, missed, false alarm, two at one place', () => {
  // every hazard belongs to exactly one spot
  for (const h of HAZARD_IDS) assert.equal(SPOTS.filter((s) => s.hazards.includes(h)).length, 1, h);
  const present = ['extinguisherEmpty', 'curtainOpen', 'cableDamaged', 'oxyFuelTogether'];
  const tags = {
    extinguisher: { choices: ['extinguisherEmpty'] }, // found
    gasStore: { choices: ['acetyleneLying'] }, // right place, wrong name
    grinder: { choices: ['grinderGuard'] }, // false alarm
    spare: { choices: [], none: true }, // nothing wrong: correct, no effect
  };
  const r = scoreTags(present, tags);
  assert.deepEqual(r.found, ['extinguisherEmpty']);
  assert.deepEqual(r.misnamed, ['oxyFuelTogether']);
  assert.deepEqual(r.missed.sort(), ['cableDamaged', 'curtainOpen']);
  assert.deepEqual(r.falseAlarms, ['grinderGuard']);
  assert.ok(Math.abs(r.score - (1 + 0.5 - 0.25) / 4) < 1e-9);
  assert.equal(scoreTags(['curtainOpen'], { curtain: { choices: ['curtainOpen'] } }).score, 1);
  // both gas-store hazards named at the one place
  const both = scoreTags(['oxyFuelTogether', 'acetyleneLying'], { gasStore: { choices: ['acetyleneLying', 'oxyFuelTogether'] } });
  assert.equal(both.score, 1);
  // older single-choice tags are still read
  assert.equal(scoreTags(['curtainOpen'], { curtain: { choice: 'curtainOpen' } }).score, 1);
});

test('fire-watch durations and permit items cite registered sources', () => {
  assert.equal(FIRE_WATCH_RULES.osha.minutes, 30); // OSHA 1910.252(a)(2)(iii)(B): at least a half hour
  assert.equal(FIRE_WATCH_RULES.z49.minutes, 60); // ANSI Z49.1:2021 6.2.4: at least one hour
  for (const r of Object.values(FIRE_WATCH_RULES)) for (const c of r.refs) assert.ok(REFS[c.ref], c.ref);
  for (const p of PERMIT_ITEMS) for (const c of p.refs) assert.ok(REFS[c.ref], `${p.id} ${c.ref}`);
  for (const k in INCIDENTS) for (const c of INCIDENTS[k].rule.refs.concat(INCIDENTS[k].effectRefs || [])) assert.ok(REFS[c.ref], `${k} ${c.ref}`);
});

function ctx(over = {}) {
  const head = { pos: new THREE.Vector3(0, 1.5, 0.45), fwd: new THREE.Vector3(0, -0.6, -0.8).normalize() };
  return {
    dt: 1 / 72, arcOn: true, process: '135', current: 180, arcW: new THREE.Vector3(0, 1.0, 0),
    head, helmetWorn: true, helmetDown: true, adfFail: false, shade: 12, shadeMin: 10, shadeBelowMin: false,
    prot: protection(kitWorn({ process: '135', position: 'PB' })), defects: [], curtainOpen: false,
    hands: { left: { connected: false }, right: { connected: false } },
    hood: { mouth: new THREE.Vector3(0.05, 1.1, -0.05), d: 0.2, on: true },
    indoor: true, sparks: null, contactAt: null, ...over,
  };
}

test('monitor: defective PPE and an open curtain are reported once; a demo is not the trainee’s fume', () => {
  const m = new SafetyMonitor();
  let ev = [];
  for (let k = 0; k < 72 * 3; k++) ev = ev.concat(m.update(ctx({ defects: [{ id: 'gloves_gauntlet', defect: 'hole' }], curtainOpen: true })));
  assert.equal(ev.filter((e) => e.type === 'defectivePPE').length, 1);
  assert.equal(ev.filter((e) => e.type === 'curtainOpen').length, 1);
  // watching a demonstration: no fume or plume incident for the trainee, even with the hood far away
  const m2 = new SafetyMonitor();
  let e2 = [];
  for (let k = 0; k < 72 * 5; k++) e2 = e2.concat(m2.update(ctx({ observer: true, hood: { mouth: new THREE.Vector3(1, 2, 1), d: 0.2, on: false } })));
  assert.equal(e2.filter((e) => e.type === 'fume' || e.type === 'plume').length, 0);
});

test('monitor: spatter through a hole in the glove burns the hand', () => {
  const holed = { ...kitWorn({ process: '135', position: 'PB' }), hands: { id: 'gloves_gauntlet', defect: 'hole' } };
  const hand = { connected: true, pos: new THREE.Vector3(0.1, 1.0, 0.1), quat: new THREE.Quaternion() };
  // one glowing drop at the hand (bench frame = world here)
  const sparks = { n: 1, p: new Float32Array([0.1, 1.0, 0.1]), T: new Float32Array([1500]), life: new Float32Array([1]) };
  const m = new SafetyMonitor();
  const ev = m.update(ctx({ prot: protection(holed), hands: { left: hand, right: { connected: false } }, sparks, benchToWorld: new THREE.Matrix4() }));
  const b = ev.find((e) => e.type === 'spatterBurn');
  assert.ok(b, JSON.stringify(ev));
  assert.equal(b.hole, true);
  // the same drop on an intact glove does nothing
  const m2 = new SafetyMonitor();
  const sparks2 = { n: 1, p: new Float32Array([0.1, 1.0, 0.1]), T: new Float32Array([1500]), life: new Float32Array([1]) };
  const ev2 = m2.update(ctx({ hands: { left: hand, right: { connected: false } }, sparks: sparks2, benchToWorld: new THREE.Matrix4() }));
  assert.equal(ev2.filter((e) => e.type === 'spatterBurn').length, 0);
});
