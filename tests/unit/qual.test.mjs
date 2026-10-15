// Welder qualification (stage 6): the code tables of ISO 9606-1:2012, ASME IX-2023 and API 1104 22nd edition
// as coded, the imperfection map of a weld, and the simulated tests on scripted welds with known faults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUAL_TESTS, MATERIALS, FILLERS, testById } from '../../src/qual/catalog.js';
import * as ISO from '../../src/qual/iso.js';
import * as ASME from '../../src/qual/asme.js';
import * as API from '../../src/qual/api.js';
import { flawMap, passLayers } from '../../src/qual/flaws.js';
import { bendSpecimen, fractureSpecimen, bendStrain } from '../../src/qual/specimens.js';
import { runQualification, deriveFacts, plannedFacts } from '../../src/qual/run.js';
import { jointFor, wpsFor, TROUBLESHOOT } from '../../src/scenarios.js';
import { makePipeJoint } from '../../src/sim/pipe.js';
import { WeldSession } from '../../src/sim/session.js';
import { scriptedWeld, scriptedPipeWeld, scriptedPipeRun, pipeRunsFor } from '../../src/sim/scripted.js';
import { smawDefaults } from '../../src/sim/smaw.js';
import { envFromEquipment } from '../../src/weld/station.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('catalogue: every test builds its joint, names its material and fillers, and offers methods', () => {
  for (const t of QUAL_TESTS) {
    const j = jointFor(t.joint);
    assert.ok(j && j.L > 0, t.id);
    if (t.material) assert.ok(MATERIALS[t.material], `${t.id} material`);
    for (const f of t.fillers) assert.ok(FILLERS[f], `${t.id} filler ${f}`);
    assert.ok(t.methods.length > 0);
    const wps = wpsFor(t.process, j, t.smaw || t.gtaw || {});
    assert.ok(wps && wps.id, `${t.id} WPS`);
    if (t.std === 'iso' && !j.pipe) {
      // ISO 9606-1 6.2, Figures 3, 4, 7, 10: test piece >= 200 mm long, examination length 150 mm, 25 mm discards
      assert.equal(j.L, 200);
      assert.equal(j.evalL, 150);
      assert.equal(j.tab, 25);
      if (j.type === 'butt') assert.ok(j.plateW >= 125, 'plates at least 125 mm wide');
      if (j.type === 'fillet') assert.ok(j.webH >= 125, 'web at least 125 mm');
    }
    if (j.pipe) assert.ok(j.pipe.length >= 125, 'ISO 9606-1 Figure 5: each pipe at least 125 mm');
  }
  // materials as Table QW/QB-422 lists them
  assert.deepEqual([MATERIALS['SA-106-B'].pNo, MATERIALS['SA-106-B'].iso15608, MATERIALS['SA-106-B'].smtsMPa], [1, '11.1', 415]);
  assert.deepEqual([MATERIALS['SA-516-60'].pNo, MATERIALS['SA-516-60'].iso15608], [1, '1.1']);
  // F-Numbers (QW-432), ISO covering types (Table 4), API groups (Table 4)
  assert.deepEqual([FILLERS.E6010.fNo, FILLERS.E7018.fNo, FILLERS['ER70S-6'].fNo, FILLERS.E6013.fNo], [3, 4, 6, 2]);
  assert.deepEqual([FILLERS.E6010.isoType, FILLERS.E7018.isoType], ['C', 'B']);
  assert.deepEqual([FILLERS.E6010.api, FILLERS.E7018.api, FILLERS['ER70S-2'].api], ['WF-1', 'WF-2', 'WF-4']);
});

test('ISO 9606-1 range tables as printed (Tables 3, 6, 7, 8, 9, 10, 11)', () => {
  assert.deepEqual(ISO.TABLE3.FM1, ['FM1', 'FM2']);
  assert.equal(ISO.table6(10.97).text, '3 to 21.94');
  assert.equal(ISO.table6(2).text, '2 to 4');
  assert.equal(ISO.table6(14, 4).text, '≥ 3');
  assert.equal(ISO.table7(168.3).text, '≥ 84.15');
  assert.equal(ISO.table7(60.3).text, '≥ 30.15');
  assert.equal(ISO.table7(40).text, '≥ 25');
  assert.equal(ISO.table7(20).text, '20 to 40');
  assert.equal(ISO.table8(3.2).text, '≥ 3');
  assert.equal(ISO.table8(2).text, '2 to 4');
  assert.deepEqual(ISO.TABLE9['H-L045'], ['PA', 'PC', 'PE', 'PF']);
  assert.deepEqual(ISO.TABLE9.PH, ['PA', 'PE', 'PF']);
  assert.deepEqual(ISO.TABLE9.PF, ['PA', 'PF']);
  assert.deepEqual(ISO.TABLE10.PB, ['PA', 'PB']);
  assert.deepEqual(ISO.TABLE11['ss nb'], ['ss nb', 'ss mb', 'bs', 'ss gb', 'ss fb']);
  assert.deepEqual(ISO.TABLE11['ss mb'], ['ss mb', 'bs']);
  // clause 9: Annex A example (2007-01-20): 9.3 a) +3 years, b) +2 years, c) +6 months
  const v = ISO.validity('2007-01-20');
  assert.deepEqual(v.rows.map((r) => r.until), ['2010-01-20', '2009-01-20', '2007-07-20']);
});

test('ASME IX-2023 tables as printed (QW-433, QW-452.3, QW-452.1(b), QW-461.9, QW-191 limits)', () => {
  assert.deepEqual(ASME.fNoRange([{ fNo: 3, backing: false }, { fNo: 4, backing: true }]), ['F-No. 1 with backing', 'F-No. 2 with backing', 'F-No. 3 with and without backing', 'F-No. 4 with backing']);
  assert.deepEqual(ASME.fNoRange([{ fNo: 4, backing: true }]), ['F-No. 1 with backing', 'F-No. 2 with backing', 'F-No. 3 with backing', 'F-No. 4 with backing']);
  assert.deepEqual(ASME.fNoRange([{ fNo: 6, backing: true }]), ['all F-No. 6']);
  assert.equal(ASME.qw4523(168.3).min, 73);
  assert.equal(ASME.qw4523(60.3).min, 25);
  assert.equal(ASME.qw4523(20).min, 20);
  assert.equal(ASME.qw4521b(10.97, 4).max, 21.94);
  assert.equal(ASME.qw4521b(14, 3).max, null);
  assert.equal(ASME.QW4619.pipe['6G'].groove, 'All');
  assert.equal(ASME.QW4619.plate['3G'].fillet, 'F, H, V');
  assert.equal(ASME.relevantRounded(5.54), 0.4);
  assert.equal(ASME.relevantRounded(10.97), 0.8);
  assert.ok(near(ASME.linearLimit(10.97).lim, 10.97 / 3));
  assert.equal(ASME.linearLimit(10).lim, 3);
  // jig: plunger 4t gives 20 % outer-fibre elongation (QW-466.1 note: 100t / (A + t))
  assert.ok(near(bendStrain(10, 40), 0.2));
});

test('API 1104 22nd edition groups as printed (6.2.2 d, Table 5, Table 7)', () => {
  assert.equal(API.odGroup(168.3).n, 2);
  assert.equal(API.odGroup(60.3).n, 2);
  assert.equal(API.odGroup(48.3).n, 1);
  assert.equal(API.odGroup(406.4).n, 3);
  assert.match(API.table5(7.11).text, /^3\.9 mm to 19 mm/);
  assert.match(API.table5(3).text, /^3 mm to 4\.5 mm/);
  assert.match(API.table5(20).text, /unlimited/);
  assert.deepEqual(API.table7(168.3, 7.11), { nb: 2, rb: 2, fb: 0, sb: 0 });
  assert.deepEqual(API.table7(406.4, 9.5), { nb: 4, rb: 2, fb: 2, sb: 0 });
  assert.deepEqual(API.table7(168.3, 14.3), { nb: 2, rb: 0, fb: 0, sb: 2 });
});

// ---- welds ------------------------------------------------------------------------------------------------
const ROOT = (I = 90) => ({ ...smawDefaults('E6010', 3.2, 'PF'), current: I, polarity: 'DCEP' });
function pipeWeld(size, position, progression = 'up', seed = 3, rootI = 90) {
  const j = makePipeJoint({ size, position, progression });
  const small = j.pipe.D < 100 && position !== '2G';
  const fill = { ...smawDefaults('E7018', small ? 2.5 : 3.2, 'PF'), current: small ? 95 : 125, polarity: 'DCEP' };
  const ses = new WeldSession({ joint: j, settings: ROOT(rootI), seed, thermalDt: 1 / 12 });
  const plans = j.passPlan.map((pl, k) => ({ settings: k ? fill : ROOT(rootI), weaveAmp: pl.kind === 'root' ? 0 : pl.kind === 'cap' ? 3 : 1.5 + 0.5 * k, toeDwell: k ? 0.4 : 0 }));
  scriptedPipeWeld({ session: ses, passes: plans, dt: 1 / 60 });
  return ses;
}
const ctxOf = (ses, extra = {}) => ({ rec: ses.record, sum: ses.record.summary(), settings: ses.settings, wpsInside: 1, date: '2026-10-15', ...extra });

test('imperfection map: a sound pipe weld has its layers stacked root to cap and few imperfections', () => {
  const ses = pipeWeld('NPS6-80', '6G');
  const rec = ses.record;
  const L = passLayers(rec, 100);
  assert.equal(L.length, 4);
  for (let k = 1; k < L.length; k++) assert.ok(L[k].lv0 >= L[k - 1].lv0 - 1e-9, 'layers stacked');
  assert.ok(L[L.length - 1].cap, 'cap on top');
  const map = flawMap(rec);
  const planar = map.items.filter((it) => ['lop', 'lofRoot', 'lofSide', 'lofInter', 'crack'].includes(it.type));
  assert.equal(planar.length, 0, JSON.stringify(planar.map((p) => `${p.type}@${Math.round(p.s0)}`)));
  // pores lie inside the weld section
  for (const it of map.items.filter((x) => x.type === 'pore')) assert.ok(it.v0 > -rec.joint.t - 1 && it.v1 < 4);
});

test('ASME 6G (side bends, F-No. 3 root / F-No. 4 fill): a sound scripted weld passes and qualifies all positions', () => {
  const ses = pipeWeld('NPS6-80', '6G');
  const t = testById('ASME-SMAW-6G');
  const res = runQualification(t, 'bend', ctxOf(ses));
  assert.equal(res.exams[0].id, 'vt');
  const bend = res.exams.find((e) => e.id === 'bend');
  assert.ok(bend, JSON.stringify(res.exams.map((e) => [e.id, e.verdict])));
  assert.equal(bend.specimens.length, 4, 'QW-452.1(a) Note (1): four bends for 6G');
  assert.ok(bend.specimens.every((s) => s.kind === 'side'), 'weld metal 3/8 in and over: side bends');
  assert.equal(res.verdict, 'pass', JSON.stringify(res.deciding && res.deciding.finding));
  const rows = Object.fromEntries(res.range.map((r) => [r.label, r.range]));
  assert.match(rows['Position, groove'], /^All/);
  assert.match(rows['Filler F-No.'], /F-No\. 3 with and without backing/);
  assert.equal(rows['Pipe O.D.'], '2-7/8 in (73 mm) O.D. and over');
  assert.equal(rows['Vertical progression'], 'uphill');
  const f = deriveFacts(t, ctxOf(ses));
  assert.ok(f.fillerRoles[0].deposit > 2 && f.fillerRoles[0].deposit < 6, `F-No. 3 root deposit ${f.fillerRoles[0].deposit}`);
  assert.ok(Math.abs(f.fillerRoles[0].deposit + f.fillerRoles[1].deposit - f.depositTotal) < 1e-9);
  // the same weld by radiography (SMAW: QW-304 allows it)
  const rt = runQualification(t, 'rt', ctxOf(ses));
  assert.ok(rt.exams.some((e) => e.id === 'rt'));
});

test('API 1104 6G (Table 7: 2 nick breaks, 2 root bends) and ISO 9606-1 H-L045 (fracture) on sound welds', () => {
  const ses = pipeWeld('NPS6-40', '6G');
  const api = runQualification(testById('API-SMAW-6G'), 'destructive', ctxOf(ses));
  const d = api.exams.find((e) => e.id === 'destructive');
  assert.ok(d, JSON.stringify(api.exams.map((e) => [e.id, e.verdict, e.findings && e.findings.filter((x) => !x.ok)])));
  assert.deepEqual(d.specimens.map((s) => s.test).sort(), ['bend', 'bend', 'nick', 'nick']);
  assert.equal(api.verdict, 'pass', JSON.stringify(api.deciding && api.deciding.finding));
  const rows = Object.fromEntries(api.range.map((r) => [r.label, r.range]));
  assert.equal(rows.Position, 'all positions, butt and lap fillet welds');
  assert.match(rows['Wall thickness group (Table 5)'], /^3\.9 mm to 19 mm/);
  const ses2 = pipeWeld('NPS6-80', '6G');
  const iso = runQualification(testById('ISO-111-T-BW-HL045'), 'fracture', ctxOf(ses2));
  // ISO 6.3: stop and restart in the root and the cap: the scripted welder changes electrodes
  const restart = iso.conditions.find((c) => c.id === 'restart');
  assert.ok(restart, 'condition checked');
  if (restart.ok) {
    const fr = iso.exams.find((e) => e.id === 'fracture');
    if (iso.exams[0].verdict === 'accept') assert.equal(fr.specimens.length, 4, 'Figure 8: four quarters');
    if (iso.verdict === 'pass') assert.match(iso.designation, /^ISO 9606-1 111 T BW FM1 C\/B s\d/);
  } else assert.equal(iso.verdict, 'invalid');
});

test('faults show in the tests: unpenetrated root fails the root bend and the nick break; side-wall lack of fusion fails a side bend', () => {
  // cold root: incomplete root penetration all along the first run
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'up' });
  const cold = new WeldSession({ joint: j, settings: ROOT(62), seed: 3, thermalDt: 1 / 12 });
  const [run] = pipeRunsFor(j, 0);
  scriptedPipeRun(cold, { ...run, keyhole: false }, { dt: 1 / 60 });
  const map = flawMap(cold.record);
  const lop = map.items.filter((it) => it.type === 'lop');
  assert.ok(lop.length && lop.some((x) => x.len > 30), 'incomplete root penetration mapped');
  const at = lop.find((x) => x.len > 30);
  const sc = (at.s0 + at.s1) / 2;
  const rb = bendSpecimen(map, { kind: 'root', sc, w: 25, ts: j.t, d: 90 });
  assert.ok(rb.opened.some((o) => o.item.type === 'lop' && o.size > 3), 'root bend opens the unpenetrated root');
  const fb = bendSpecimen(map, { kind: 'face', sc, w: 25, ts: j.t, d: 90 });
  assert.ok(!fb.opened.some((o) => o.item.type === 'lop'), 'a face bend keeps the root in compression');
  const nb = fractureSpecimen(map, sc - 12.5, sc + 12.5);
  const nf = API.judgeNick(nb, j.t, 25 * j.t);
  assert.ok(nf.some((f) => !f.ok && /penetration/.test(f.name)), 'nick break: complete penetration and fusion required');
  // C7: fill pass aimed at one side wall and run fast: side-wall lack of fusion
  const sc7 = TROUBLESHOOT.find((s) => s.id === 'C7');
  const j7 = jointFor(sc7.joint);
  const w7 = wpsFor(sc7.process, j7);
  const rec7 = scriptedWeld({ joint: j7, settings: w7.settings, env: envFromEquipment({}), seed: sc7.seed, passes: sc7.preweld });
  const m7 = flawMap(rec7);
  const side = m7.items.filter((it) => it.type === 'lofSide');
  assert.ok(side.length, 'side-wall lack of fusion mapped');
  const s7 = side.reduce((a, b) => (b.len > a.len ? b : a));
  const sb = bendSpecimen(m7, { kind: 'side', sc: (s7.s0 + s7.s1) / 2, ts: 10, w: 10, d: 40 });
  assert.ok(sb.opened.some((o) => o.item.type === 'lofSide' && o.size > 3), `side bend opens it: ${JSON.stringify(sb.opened.map((o) => [o.item.type, o.size]))}`);
});

test('fillet tests: ASME 2F (QW-182 fracture, QW-184 macro) and ISO PB fracture on a scripted SMAW fillet', () => {
  const t = testById('ASME-SMAW-2F');
  const j = jointFor(t.joint);
  const wps = wpsFor(t.process, j, t.smaw);
  const GS = { workAngle: 42, travelAngle: 20, aim: 0, craterDwell: 0.6 };
  const rec = scriptedWeld({ joint: j, settings: wps.settings, env: envFromEquipment({}), seed: 7, passes: [{ ...GS }] });
  const sum = rec.summary();
  const res = runQualification(t, 'fillet', { rec, sum, settings: wps.settings, wpsInside: 1, date: '2026-10-15' });
  const restart = res.conditions.find((c) => c.id === 'restart');
  assert.ok(restart);
  if (res.valid) {
    const fx = res.exams.find((e) => e.id === 'fillet');
    if (res.exams[0].verdict === 'accept') {
      assert.equal(fx.specimens.length, 2);
      assert.ok(fx.specimens[1].legs, 'macro measures the legs');
    }
  }
  const iso = runQualification(testById('ISO-135-P-FW-PB'), 'fracture', { rec, sum, settings: wps.settings, wpsInside: 1, date: '2026-10-15' });
  assert.ok(['pass', 'fail', 'invalid'].includes(iso.verdict));
});

test('brief facts before welding: product, test piece and methods', () => {
  for (const t of QUAL_TESTS) {
    const j = jointFor(t.joint);
    const f = plannedFacts(t, j);
    assert.ok(f.weldType === 'BW' || f.weldType === 'FW');
    if (t.std === 'iso') assert.ok(ISO.brief({ ...f, passesPlanned: j.passPlan.length }).length >= 2);
    if (t.std === 'asme') assert.ok(ASME.brief(f).length >= 1);
    if (t.std === 'api') assert.ok(API.brief(f).length >= 2);
  }
});

// ---- stops and restarts (ISO 9606-1 6.3, ASME Figure QW-462.4(b)) -------------------------------------------
const stopTest = (id, plan, seed = 21) => {
  const t = testById(id);
  const j = jointFor(t.joint);
  const wps = wpsFor(t.process, j, t.smaw || t.gtaw || {});
  const base = { workAngle: j.type === 'fillet' ? (j.position === 'PB' ? 42 : 45) : 90, travelAngle: t.process === '111' ? 20 : t.process === '141' ? -15 : 10, craterDwell: 0.6 };
  const rec = scriptedWeld({ joint: j, settings: wps.settings, env: envFromEquipment({}), seed, passes: [{ ...base, ...plan }] });
  return { t, j, wps, rec, sum: rec.summary() };
};

test('TIG restart (crater filled, post-flow, arc on the crater centre until the pool matches it): a sound restart', () => {
  const { t, wps, rec, sum } = stopTest('ISO-141-P-FW-PB', { stopsAt: [85] });
  const p = rec.passes[0];
  const st = p.stops.find((s) => Math.abs(s.s - 85) < 2);
  assert.ok(st && st.filled, 'crater filled by the current ramp-down with filler');
  const rs = p.starts.find((s) => s.restart);
  assert.ok(rs && rs.gap <= 0 && rs.gap > -3, JSON.stringify(rs));
  for (let i = 78; i <= 95; i++) assert.ok(!(p.area[i] > 0.05 && rec.sample(0, i).lofSurface), `no cold lap at ${i}`);
  const res = runQualification(t, 'fracture', { rec, sum, settings: wps.settings, wpsInside: 1, date: '2026-10-15' });
  assert.equal(res.conditions.find((c) => c.id === 'restart').ok, true);
  assert.notEqual(res.verdict, 'invalid');
});

test('a restart backed into a crater left unfilled remelts and fills it; restarting on it without the back-up does not', () => {
  const backed = stopTest('ISO-135-P-FW-PB', { stopsAt: [85], craterAtStops: 'none', restartTech: 'aheadBackup' });
  const s1 = backed.rec.passes[0].stops.find((s) => Math.abs(s.s - 85) < 2);
  assert.ok(s1.filled && s1.pipe === 0 && !s1.crack && /remelted/.test(s1.method), JSON.stringify(s1));
  const direct = stopTest('ISO-135-P-FW-PB', { stopsAt: [85], craterAtStops: 'none', restartTech: 'same', pauseAtStops: 0.8 });
  const s2 = direct.rec.passes[0].stops.find((s) => Math.abs(s.s - 85) < 2);
  assert.ok(!s2.filled, 'no back-up: the crater stays as it was left');
});

test('the end of a bead is the furthest point of the run however slow the crater back-up (no false poor restart)', () => {
  // SMAW vertical-up cap: crater back-up at 1.5 x a slow travel speed takes longer than the 5 s back-up window
  const t = testById('ISO-111-P-BW-PF');
  const j = jointFor(t.joint);
  const wps = wpsFor(t.process, j, t.smaw || {});
  const session = new WeldSession({ joint: j, settings: wps.settings, env: envFromEquipment({}), seed: 5, thermalDt: 1 / 12 });
  const rec = scriptedWeld({ joint: j, settings: wps.settings, session, passes: [{ workAngle: 90, travelAngle: 20, weaveAmp: 2, toeDwell: 0.4, speedFactor: 0.5, stopsAt: [100], craterAtStops: 'backup', restartTech: 'aheadBackup', craterDwell: 0.6 }] });
  const p = rec.passes[0];
  const st = p.stops.find((s) => s.method.startsWith('back-up'));
  assert.ok(st, JSON.stringify(p.stops.map((s) => [s.s, s.sEnd, s.method])));
  assert.ok(Math.abs(st.sEnd - 100) < 1.5, `bead end ${st.sEnd}`);
  const rs = p.starts.find((s) => s.restart && Math.abs(s.stopS - st.sEnd) < 0.01);
  assert.ok(rs && rs.gap <= 1.0, JSON.stringify(rs));
});

test('qualification demo technique: the stop and restart of each process gives a valid test piece', () => {
  // GMAW: crater filled with a pause, restart in the still-hot crater (qualification.js demoPlanFor)
  const g = stopTest('ISO-135-P-FW-PB', { stopsAt: [85], craterAtStops: 'pause', restartTech: 'same', pauseAtStops: 1.0 });
  const rg = runQualification(g.t, 'fracture', { rec: g.rec, sum: g.sum, settings: g.wps.settings, wpsInside: 1, date: '2026-10-15' });
  assert.equal(rg.conditions.find((c) => c.id === 'restart').ok, true);
  assert.notEqual(rg.verdict, 'invalid');
  // ASME fillet: the restart inside the 4 in centre section
  const a = stopTest('ASME-GTAW-2F', { stopsAt: [100] });
  const ra = runQualification(a.t, 'fillet', { rec: a.rec, sum: a.sum, settings: a.wps.settings, wpsInside: 1, date: '2026-10-15' });
  assert.equal(ra.conditions.find((c) => c.id === 'restart').ok, true, JSON.stringify(ra.conditions));
});
