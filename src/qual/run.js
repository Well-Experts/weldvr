// Runs a simulated welder qualification test on a finished test piece: the facts of the test (essential
// variables as welded), the test conditions, the visual examination, the chosen tests, the verdict with the
// deciding clause and, for a pass, the range of qualification and the record data.

import { MATERIALS, FILLERS, STANDARDS } from './catalog.js';
import { flawMap, passLayers } from './flaws.js';
import * as ISO from './iso.js';
import * as ASME from './asme.js';
import * as API from './api.js';
import { evaluate } from '../sim/rules/packs.js';

const TRANSFER = { short: 'short-circuit (dip)', spray: 'spray', globular: 'globular' };
const r1 = (x) => Math.round(x * 10) / 10;

// Dominant transfer mode of the weld (by laid length), for the GMAW essential variables.
function transferOf(rec) {
  const count = {};
  for (const p of rec.passes) {
    for (let i = 0; i < rec.joint.n; i++) {
      if (!(p.area[i] > 0.05)) continue;
      const s = rec.sample(p.index, i);
      if (s) count[s.mode] = (count[s.mode] || 0) + 1;
    }
  }
  let best = null, n = 0;
  for (const k in count) if (count[k] > n) { n = count[k]; best = k; }
  return best;
}

// Mean deposited thickness at the root's level and at the top, over the examination length (butt welds;
// reinforcement on either side excluded).
function deposits(rec) {
  const j = rec.joint;
  const a = j.tab ?? 0, b = a + (j.evalL ?? j.L);
  let n = 0, root = 0, top = 0;
  for (let i = a; i < b; i++) {
    const L = passLayers(rec, i);
    if (!L.length) continue;
    root += Math.min(0, L[0].lv1) + j.t;
    top += Math.min(0, L[L.length - 1].lv1) + j.t;
    n++;
  }
  return n ? { root: root / n, total: top / n } : { root: 0, total: 0 };
}

// Facts known before welding (the brief): the test piece and its position.
export function plannedFacts(test, j) {
  const pipe = !!j.pipe;
  const fillet = j.type === 'fillet';
  const progression = pipe ? j.pipe.progression || null : j.position === 'PF' ? 'up' : j.position === 'PG' ? 'down' : null;
  return {
    std: test.std, testId: test.id, joint: j, process: test.process,
    material: MATERIALS[test.material] || null,
    product: pipe ? (test.std === 'iso' ? 'T' : 'pipe') : test.std === 'iso' ? 'P' : 'plate',
    D: pipe ? j.pipe.D : null, t: j.t, aNom: fillet ? j.aNom : null,
    weldType: fillet ? 'FW' : 'BW',
    position: j.position, aws: j.aws, progression, rolled: pipe && !!j.pipe.rotated,
    details: pipe ? 'ss nb' : 'ss mb', backing: !pipe,
    fm: FILLERS[test.fillers[0]] ? FILLERS[test.fillers[0]].fm : 'FM1',
    evalA: j.tab ?? 0, evalL: j.evalL ?? j.L, passesPlanned: j.passPlan.length, depositTotal: j.t,
  };
}

export function deriveFacts(test, ctx) {
  const rec = ctx.rec;
  const sum = ctx.sum;
  const j = rec.joint;
  const pipe = !!j.pipe;
  const fillet = j.type === 'fillet';
  const welded = rec.passes.filter((p) => p.area.some((v) => v > 0.05));
  const capPass = welded.length ? welded[welded.length - 1].index : 0;
  const a = j.tab ?? 0;
  const mode = test.process === '135' || test.process === '136' ? transferOf(rec) : null;
  const dep = fillet ? null : deposits(rec);
  const f0 = test.fillers.map((id) => FILLERS[id]);
  let fillerRoles;
  if (pipe && f0.length === 2) {
    fillerRoles = [
      { ...f0[0], role: 'root', passes: [0], deposit: dep.root, layers: 1, backing: false },
      // F-No. 4 laid on the F-No. 3 root: recorded as welded with backing (the root deposit backs it), the
      // conservative reading of QW-433; ISO and API take each filler as used
      { ...f0[1], role: welded.length > 2 ? 'fill and cap' : 'cap', passes: welded.slice(1).map((p) => p.index), deposit: Math.max(0, dep.total - dep.root), layers: Math.max(0, welded.length - 1), backing: true },
    ];
  } else {
    fillerRoles = [{ ...f0[0], role: 'all runs', passes: welded.map((p) => p.index), deposit: dep ? dep.total : j.t, layers: welded.length, backing: !pipe }];
  }
  const s = ctx.settings || {};
  const pol = s.polarity === 'DCEN' ? 'DC (−) electrode negative' : s.polarity === 'AC' ? 'AC' : 'DC (+) electrode positive';
  const gas = test.process === '141' ? 'Ar (ISO 14175 I1)' : test.process === '135' || test.process === '136' ? 'Ar + 18 % CO2' : null;
  const cleanLeft = (() => {
    const p = rec.passes[capPass];
    if (!p || !p.slagProcess) return 0;
    return 1 - rec.cleanFraction(capPass);
  })();
  return {
    ...plannedFacts(test, j),
    layerTech: welded.length > 1 ? 'ml' : 'sl',
    fillerRoles,
    s: dep ? dep.total : null, depositTotal: dep ? dep.total : j.t,
    layers: welded.length, passesWelded: welded.length, capPass,
    transfer: mode, transferName: mode ? TRANSFER[mode] || mode : null,
    current: pol, gas,
    restarts: sum.restarts.map((r) => ({ pass: r.pass, s: r.s + a, gap: r.gap })),
    stops: sum.stops.map((r) => ({ pass: r.pass, s: r.s + a })),
    slagLeft: cleanLeft,
    wpsInside: ctx.wpsInside ?? null,
  };
}

// Methods available for a test after the weld (ASME: radiography only where QW-304 allows it).
export function methodsFor(test, facts) {
  if (test.std !== 'asme' || !facts) return test.methods;
  return test.methods.filter((m) => {
    if (m === 'rt') return ASME.rtAllowed(facts).ok;
    if (m === 'bendFR') return facts.depositTotal >= 10 - 1e-6; // Note (3) applies where side bends are required
    return true;
  });
}

const firstReject = (exam) => {
  if (!exam) return null;
  if (exam.findings) {
    const f = exam.findings.find((x) => !x.ok);
    if (f) return { exam, finding: f };
  }
  if (exam.specimens) {
    for (const sp of exam.specimens) {
      const f = sp.findings && sp.findings.find((x) => !x.ok);
      if (f) return { exam, specimen: sp, finding: f };
    }
  }
  return null;
};

// Run the examinations of a test. ctx: { rec, sum, settings, wpsInside, date (yyyy-mm-dd), demo }
export function runQualification(test, method, ctx) {
  const sum = ctx.sum;
  const facts = deriveFacts(test, ctx);
  const map = flawMap(ctx.rec);
  const out = { test, method, std: STANDARDS[test.std], facts, map, exams: [], conditions: [], date: ctx.date, demo: !!ctx.demo };
  if (test.std === 'aws') {
    const e = evaluate(sum, test.pack, null, { mode: 'visual' });
    const findings = e.findings.map((f) => ({ ref: f.ref, name: f.name, measured: typeof f.measured === 'number' ? r1(f.measured) : f.measured, unit: f.unit, limit: f.limitText, ok: f.verdict === 'accept', clause: f.clause }));
    out.exams.push({ id: 'vt', title: 'Visual examination (secondary-source criteria)', clause: e.provenance ? e.provenance.status : '', verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings, notes: [test.note] });
    return finishResult(out);
  }
  // test conditions
  if (test.std === 'iso') out.conditions = ISO.conditions(facts);
  else if (test.std === 'asme' && facts.weldType === 'FW') {
    // Figure QW-462.4(b): "Stop and restart weld near the center": taken here as inside the 4 in (100 mm) centre
    // section that is fracture tested (QW-181.2)
    const c = facts.evalA + facts.evalL / 2;
    const near = facts.restarts.some((r) => Math.abs(r.s - c) <= 50);
    out.conditions = [{ id: 'restart', ok: near, blocking: true, clause: 'Figure QW-462.4(b)', text: 'Stop and restart near the centre of the fillet coupon (inside the 4 in centre section)', detail: near ? 'restart inside the centre section' : facts.restarts.length ? 'restart outside the centre section' : 'no restart' }];
  }
  if (test.std !== 'iso') out.conditions.push({ id: 'wps', ok: facts.wpsInside == null || facts.wpsInside >= 0.9, blocking: false, clause: test.std === 'asme' ? 'QW-301.2' : '6.1', text: 'Welded to the WPS', detail: facts.wpsInside == null ? '–' : '{p}% of the arc time inside the WPS ranges', vars: { p: Math.round((facts.wpsInside ?? 0) * 100) } });
  out.valid = !out.conditions.some((c) => c.blocking && !c.ok);
  if (!out.valid) return finishResult(out);
  // visual examination first; a failure ends the test (ISO 6.4, ASME QW-302.4 / QW-321.1, API 6.4)
  const vt = test.std === 'iso' ? ISO.visual(sum) : test.std === 'asme' ? ASME.visual(sum, map, facts) : API.visual(sum, map, facts);
  out.exams.push(vt);
  if (vt.verdict === 'reject') {
    out.stoppedAfterVisual = true;
    return finishResult(out);
  }
  if (test.std === 'iso') {
    if (method === 'rt') {
      out.exams.push(ISO.radiography(sum));
      // Table 13 b): with radiography, additional bend or fracture tests for 131, 135, 138 and 311
      if (['131', '135', '138', '311'].includes(test.process)) out.exams.push({ ...ISO.fractureTests(map, ISO.planSpecimens('rtExtra', facts), facts), title: 'Additional fracture tests (ISO 9017)', clause: 'Table 13 b); 6.5.2.4; cl. 7' });
    } else if (method === 'bend') out.exams.push(ISO.bendTests(map, ISO.planSpecimens('bend', facts), facts));
    else if (method === 'fracture') out.exams.push(ISO.fractureTests(map, ISO.planSpecimens('fracture', facts), facts));
    else if (method === 'macro') out.exams.push(ISO.macroTests(map, ISO.planSpecimens('macro', facts), facts, ctx.rec));
  } else if (test.std === 'asme') {
    if (facts.weldType === 'FW') out.exams.push(ASME.filletTests(map, ASME.filletPlan(facts), facts, ctx.rec));
    else if (method === 'rt') out.exams.push(ASME.radiography(map, facts));
    else out.exams.push(ASME.bendTests(map, ASME.bendPlan(facts, method), facts));
  } else if (test.std === 'api') {
    if (method === 'rt' || method === 'rtDestructive') out.exams.push(API.radiography(map, facts));
    if (method === 'destructive' || method === 'rtDestructive') out.exams.push(API.destructive(map, API.plan(facts), facts));
  }
  return finishResult(out);
}

function finishResult(out) {
  const test = out.test;
  if (out.valid === false) {
    out.verdict = 'invalid';
    out.deciding = { condition: out.conditions.find((c) => c.blocking && !c.ok) };
  } else {
    const rej = out.exams.map(firstReject).find(Boolean);
    out.verdict = rej ? 'fail' : 'pass';
    out.deciding = rej || null;
  }
  const mod = test.std === 'iso' ? ISO : test.std === 'asme' ? ASME : test.std === 'api' ? API : null;
  out.retest = mod ? mod.RETEST : 'No licensed AWS D1.1 copy: retest rules not loaded.';
  if (mod && out.verdict === 'pass') {
    out.range = mod.range(out.facts);
    out.validity = out.date ? mod.validity(out.date) : null;
    if (test.std === 'iso') out.designation = ISO.designation(out.facts);
  }
  return out;
}

export function briefLines(test, facts) {
  if (test.std === 'iso') return ISO.brief(facts);
  if (test.std === 'asme') return ASME.brief(facts);
  if (test.std === 'api') return API.brief(facts);
  return [test.note];
}
