// ISO 9606-1:2012 (BS EN ISO 9606-1:2017): test conditions, examination and testing, acceptance and range
// of qualification of the simulated welder tests. Clause numbers are those of the standard.

import { evaluate, ISO_LIMITS } from '../sim/rules/packs.js';
import { bendSpecimen, fractureSpecimen, macroAt } from './specimens.js';
import { FLAW_NAMES, ISO_REF } from './flaws.js';
import { clockAt, xAtClock } from '../sim/pipe.js';

const NP = 'Not permitted';
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100; // dimensions of the test piece and their ranges (e.g. NPS 2 Sch 80: 5.54 mm)

// ---- range of qualification tables ---------------------------------------------------------------------
// Table 9 (butt welds) and Table 10 (fillet welds): testing position -> positions qualified.
export const TABLE9 = {
  PA: ['PA'], PC: ['PA', 'PC'], PE: ['PA', 'PC', 'PE'], PF: ['PA', 'PF'], PH: ['PA', 'PE', 'PF'], PG: ['PG'],
  PJ: ['PA', 'PE', 'PG'], 'H-L045': ['PA', 'PC', 'PE', 'PF'], 'J-L045': ['PA', 'PC', 'PE', 'PG'],
};
export const TABLE10 = {
  PA: ['PA'], PB: ['PA', 'PB'], PC: ['PA', 'PB', 'PC'], PD: ['PA', 'PB', 'PC', 'PD', 'PE'], PE: ['PA', 'PB', 'PC', 'PD', 'PE'],
  PF: ['PA', 'PB', 'PF'], PH: ['PA', 'PB', 'PC', 'PD', 'PE', 'PF'], PG: ['PG'], PJ: ['PA', 'PB', 'PD', 'PE', 'PG'],
};
// Table 3: filler material group -> groups qualified.
export const TABLE3 = { FM1: ['FM1', 'FM2'], FM2: ['FM1', 'FM2'], FM3: ['FM1', 'FM2', 'FM3'], FM4: ['FM1', 'FM2', 'FM3', 'FM4'], FM5: ['FM5'], FM6: ['FM5', 'FM6'] };
// Table 4 (111): covering type in the test -> types qualified. R stands for the rutile group A, RA, RB, RC,
// RR, R (ISO 2560 03, 13, 14, 19, 20, 24, 27).
export const TABLE4 = { R: ['A, RA, RB, RC, RR, R'], B: ['A, RA, RB, RC, RR, R', 'B'], C: ['C'] };
// Table 5: filler material type -> types qualified.
export const TABLE5 = { S: ['S', 'M'], M: ['S', 'M'], B: ['B', 'R, P, V, W, Y, Z'], R: ['R, P, V, W, Y, Z'] };
// Table 11: weld details -> qualified.
export const TABLE11 = {
  'ss nb': ['ss nb', 'ss mb', 'bs', 'ss gb', 'ss fb'], 'ss mb': ['ss mb', 'bs'], bs: ['ss mb', 'bs'],
  'ss gb': ['ss mb', 'bs', 'ss gb'], ci: ['ss mb', 'bs', 'ci'], 'ss fb': ['ss mb', 'bs', 'ss fb'],
};

// Table 6: deposited thickness s of a butt weld -> range (mm). max null = no upper limit.
export function table6(s, layers = 3) {
  if (s < 3) return { min: s, max: Math.max(3, 2 * s), text: `${r2(s)} to ${r2(Math.max(3, 2 * s))}` };
  if (s < 12) return { min: 3, max: 2 * s, text: `3 to ${r2(2 * s)}` };
  if (layers >= 3) return { min: 3, max: null, text: '≥ 3' };
  return { min: 3, max: 2 * s, text: `3 to ${r2(2 * s)} (test piece in fewer than 3 layers)` };
}

// Table 7: outside pipe diameter D -> range.
export function table7(D) {
  if (D <= 25) return { min: D, max: 2 * D, text: `${r2(D)} to ${r2(2 * D)}` };
  const min = Math.max(25, 0.5 * D);
  return { min, max: null, text: `≥ ${r2(min)}` };
}

// Table 8: material thickness t of a fillet weld test piece -> range.
export function table8(t) {
  if (t < 3) return { min: t, max: Math.max(2 * t, 3), text: `${r2(t)} to ${r2(Math.max(2 * t, 3))}` };
  return { min: 3, max: null, text: '≥ 3' };
}

// ---- specimens -------------------------------------------------------------------------------------------
// Pipe specimen locations of Figure 8 (1 root, 2 face, 3 root, 4 face at the 45° diagonals): clock hours.
const FIG8 = [{ n: 1, kind: 'root', h: 1.5 }, { n: 2, kind: 'face', h: 4.5 }, { n: 3, kind: 'root', h: 7.5 }, { n: 4, kind: 'face', h: 10.5 }];

// A restart (stop and restart) of pass k inside the examination length, for 6.5 "one specimen from the
// start and stop area".
function restartAt(facts, k) {
  const r = facts.restarts.find((x) => x.pass === k);
  return r ? r.s : null;
}

// Specimens cut for a method. Positions are physical s (mm).
export function planSpecimens(method, facts) {
  const j = facts.joint;
  const a = facts.evalA, L = facts.evalL;
  const specs = [];
  if (facts.weldType === 'BW' && method === 'bend') {
    if (facts.product === 'P') {
      // 6.5.2.3: t < 12 mm: at least two root and two face bends and the complete examination length
      // tested; four specimens of equal width cover the 150 mm examination length
      const w = L / 4;
      ['root', 'face', 'root', 'face'].forEach((kind, n) => specs.push({ id: `B${n + 1}`, test: 'bend', kind, sc: a + w * (n + 0.5), w, ts: facts.t, d: 4 * facts.t, where: `${Math.round(w * n)}–${Math.round(w * (n + 1))} mm` }));
    }
    return specs;
  }
  if (facts.weldType === 'BW' && method === 'fracture') {
    if (facts.product === 'P') {
      // 6.5.2.2: the examination length cut into four specimens of equal width (Table 14: at least 35 mm)
      const w = L / 4;
      ['root', 'face', 'root', 'face'].forEach((kind, n) => specs.push({ id: `F${n + 1}`, test: 'fracture', kind, s0: a + w * n, s1: a + w * (n + 1), w, where: `${Math.round(w * n)}–${Math.round(w * (n + 1))} mm` }));
    } else {
      // pipe: the circumference cut into four specimens of equal width at the Figure 8 locations
      const w = j.L / 4;
      for (const f of FIG8) {
        const sc = xAtClock(j, f.h);
        specs.push({ id: `F${f.n}`, test: 'fracture', kind: f.kind, s0: sc - w / 2, s1: sc + w / 2, w, where: `${clockLabel(f.h)} (Figure 8 no. ${f.n})` });
      }
    }
    return specs;
  }
  if (facts.weldType === 'BW' && method === 'rtExtra') {
    // Table 13 b) and 6.5.2.4: one root and one face fracture specimen (Table 14: at least 35 mm wide), one
    // of them from a stop/start location
    const w = 35;
    const sR = restartAt(facts, 0) ?? a + L / 3;
    const sF = restartAt(facts, facts.capPass) ?? a + (2 * L) / 3;
    let s1 = sF;
    if (Math.abs(s1 - sR) < w) s1 = sR + (sR + w + w / 2 <= a + L ? w : -w);
    specs.push({ id: 'F1', test: 'fracture', kind: 'root', s0: sR - w / 2, s1: sR + w / 2, w, where: `${Math.round(sR - a)} mm${restartAt(facts, 0) != null ? ' (root stop/restart)' : ''}` });
    specs.push({ id: 'F2', test: 'fracture', kind: 'face', s0: s1 - w / 2, s1: s1 + w / 2, w, where: `${Math.round(s1 - a)} mm${restartAt(facts, facts.capPass) != null && s1 === sF ? ' (cap stop/restart)' : ''}` });
    return specs;
  }
  if (facts.weldType === 'FW' && method === 'fracture') {
    // 6.5.3: the examination length fractured as one complete specimen
    specs.push({ id: 'F1', test: 'fracture', kind: 'root', s0: a, s1: a + L, w: L, where: `0–${L} mm (whole examination length)` });
    return specs;
  }
  if (facts.weldType === 'FW' && method === 'macro') {
    // Table 13 e) and 6.5.3: at least two macro sections, one at the stop/start location
    const r = restartAt(facts, 0);
    const s1 = r ?? a + L / 3;
    let s2 = a + (2 * L) / 3;
    if (Math.abs(s2 - s1) < 20) s2 = a + L / 3 < s1 ? a + L / 4 : a + (3 * L) / 4;
    specs.push({ id: 'M1', test: 'macro', s: s1, where: `${Math.round(s1 - a)} mm${r != null ? ' (stop/restart)' : ''}` });
    specs.push({ id: 'M2', test: 'macro', s: s2, where: `${Math.round(s2 - a)} mm` });
    return specs;
  }
  return specs;
}

export function clockLabel(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh === 0 ? 12 : hh}:${String(mm).padStart(2, '0')}`;
}

// ---- acceptance -------------------------------------------------------------------------------------------
// Clause 7: ISO 5817 level B, level C for 501, 502, 503, 504 and 5214.
function levelFor(ref) {
  return ['5011', '5012', '502', '503', '504', '5214'].includes(ref) ? 'C' : 'B';
}

// An imperfection exposed on a fracture face or cut by a macro section, judged by clause 7.
//   s: the nominal thickness used by ISO 5817 (butt: t; fillet: the nominal throat a).
function judgeExposed(x, s, fillet) {
  const it = x.item;
  const ref = ISO_REF[it.type] || '';
  const lv = levelFor(ref);
  const name = FLAW_NAMES[it.type];
  const clause = `cl. 7 → ISO 5817 level ${lv}, ref. ${ref}`;
  if (it.type === 'pore') {
    const [k, mx] = ISO_LIMITS.porePore[lv];
    const lim = Math.min(k * s, mx);
    return { ref: '2011', name, measured: r1(it.d), unit: 'mm', limit: `d ≤ ${k}${fillet ? 'a' : 's'}, max ${mx} mm (${r1(lim)} mm)`, ok: it.d <= lim + 1e-9, clause: `cl. 7 → ISO 5817 level ${lv}, ref. 2011` };
  }
  if (it.type === 'slag') {
    const p = ISO_LIMITS.slag301[lv];
    const hl = Math.min(p.h[0] * s, p.h[1]);
    const ll = Math.min(s, p.l);
    const h = x.depth, l = x.length;
    return { ref, name, measured: `h ${r1(h)}, l ${r1(l)}`, unit: 'mm', limit: `h ≤ ${p.h[0]}s max ${p.h[1]} mm; l ≤ s max ${p.l} mm`, ok: h <= hl + 1e-9 && l <= ll + 1e-9, clause };
  }
  if (it.type === 'tungsten') return { ref, name, measured: r1(it.d), unit: 'mm', limit: 'limit not loaded in this build', ok: true, clause, info: true };
  // cracks, lack of fusion, incomplete root penetration, burn-through: not permitted at level B
  return { ref, name, measured: r1(x.length ?? it.len ?? 1), unit: 'mm long', limit: NP, ok: false, clause };
}

// Bend specimen, clause 7: no discrete discontinuity >= 3 mm in any direction; the sum of the greatest
// discontinuities exceeding 1 mm but less than 3 mm in one specimen not over 10 mm.
export function judgeBend(res) {
  const big = res.opened.filter((o) => o.size >= 3 - 1e-9);
  const mid = res.opened.filter((o) => o.size > 1 + 1e-9 && o.size < 3 - 1e-9);
  const sumMid = mid.reduce((a, o) => a + o.size, 0);
  const findings = [];
  for (const o of big) findings.push({ ref: ISO_REF[o.item.type], name: FLAW_NAMES[o.item.type], measured: r1(o.size), unit: 'mm', limit: '< 3 mm in any direction', ok: false, clause: 'cl. 7 (bend test)' });
  if (mid.length) findings.push({ ref: '', name: 'Discontinuities over 1 mm and under 3 mm, sum', measured: r1(sumMid), unit: 'mm', limit: '≤ 10 mm per specimen', ok: sumMid <= 10 + 1e-9, clause: 'cl. 7 (bend test)' });
  for (const o of res.opened.filter((q) => q.size <= 1 + 1e-9)) findings.push({ ref: ISO_REF[o.item.type], name: FLAW_NAMES[o.item.type], measured: r1(o.size), unit: 'mm', limit: 'not counted (1 mm or less)', ok: true, clause: 'cl. 7 (bend test)', info: true });
  return { ok: findings.every((f) => f.ok), findings };
}

// ---- the examinations of one test -------------------------------------------------------------------
// Test conditions to check before testing (6.3 and clause 7). Blocking ones make the test invalid.
export function conditions(facts) {
  const out = [];
  const passes = facts.passesWelded;
  const rootOK = facts.restarts.some((r) => r.pass === 0);
  const capOK = facts.restarts.some((r) => r.pass === facts.capPass);
  const single = passes === 1;
  out.push({
    id: 'restart', ok: single ? rootOK : rootOK && capOK, blocking: true, clause: '6.3',
    text: single ? 'At least one stop and restart in the run (single-run test piece)' : 'At least one stop and restart in the root run and in the capping run',
    detail: single ? (rootOK ? 'stop/restart found' : 'no restart found') : `root ${rootOK ? 'yes' : 'no'}, cap ${capOK ? 'yes' : 'no'}`,
  });
  out.push({ id: 'slag', ok: facts.slagLeft < 0.05, blocking: false, clause: '7', text: 'All slag and spatter removed before testing', detail: facts.slagLeft < 0.05 ? 'clean' : "{p}% of the last run still under slag: cleaned by the examiner's instruction before testing", vars: { p: Math.round(facts.slagLeft * 100) } });
  out.push({ id: 'wps', ok: facts.wpsInside == null || facts.wpsInside >= 0.9, blocking: false, clause: '6.3', text: 'Welded to the WPS', detail: facts.wpsInside == null ? '–' : '{p}% of the arc time inside the WPS ranges', vars: { p: Math.round((facts.wpsInside ?? 0) * 100) } });
  return out;
}

export function visual(sum) {
  const e = evaluate(sum, 'iso9606-1', null, { mode: 'visual' });
  const findings = e.findings.map((f) => ({ ref: f.ref, name: f.name, measured: typeof f.measured === 'number' ? r1(f.measured) : f.measured, unit: f.unit, limit: f.limitText, ok: f.verdict === 'accept', clause: f.clause, at: f.s0 }));
  return { id: 'vt', title: 'Visual testing (ISO 17637)', clause: '6.4, Table 13; cl. 7', verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings };
}

// Radiography of the examination length, judged by clause 7 (ISO 5817 level B, C for the listed types).
export function radiography(sum) {
  const e = evaluate(sum, 'iso9606-1', null, { mode: 'full' });
  const findings = e.findings.filter((f) => !f.visual).map((f) => ({ ref: f.ref, name: f.name, measured: typeof f.measured === 'number' ? r1(f.measured) : f.measured, unit: f.unit, limit: f.limitText, ok: f.verdict === 'accept', clause: f.clause, at: f.s0 }));
  // internal imperfections reported without a loaded limit (tungsten inclusions); surface items (spatter) belong to
  // the visual examination
  const info = (e.info || []).filter((x) => x.ref !== '602').map((x) => ({ ref: x.ref, name: x.name, measured: x.text, unit: '', limit: 'reported, not judged', ok: true, info: true, clause: 'cl. 7' }));
  return { id: 'rt', title: 'Radiographic testing (ISO 17636)', clause: '6.4, 6.5.2.1, Table 13; cl. 7', verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings: [...findings, ...info] };
}

export function bendTests(map, specs, facts) {
  const out = specs.map((sp) => {
    const res = bendSpecimen(map, { kind: sp.kind, sc: sp.sc, w: sp.w, ts: sp.ts, d: sp.d });
    const j = judgeBend(res);
    return { ...sp, label: `${sp.kind === 'root' ? 'Root' : 'Face'} bend ${sp.id}`, e: res.e, opened: res.opened, verdict: j.ok ? 'accept' : 'reject', findings: j.findings };
  });
  return {
    id: 'bend', title: 'Bend tests (ISO 5173)', clause: '6.5.2.3; cl. 7',
    verdict: out.some((s) => s.verdict === 'reject') ? 'reject' : 'accept', specimens: out,
    notes: [`Former diameter d = 4t = ${r1(4 * facts.t)} mm, bend angle 180° (parent metal elongation A ≥ 20 %: ${facts.material ? `${facts.material.label} ${facts.material.elong} %` : '–'}).`, 'Specimen preparation and dimensions otherwise per ISO 5173 (not loaded in this build): reinforcement and backing removed flush, full thickness.'],
  };
}

export function fractureTests(map, specs, facts) {
  const fillet = facts.weldType === 'FW';
  const s = fillet ? facts.aNom : facts.t;
  const out = specs.map((sp) => {
    const exposed = fractureSpecimen(map, sp.s0, sp.s1);
    const findings = exposed.map((x) => judgeExposed(x, s, fillet));
    return { ...sp, label: `${fillet ? 'Fillet' : sp.kind === 'root' ? 'Root' : 'Face'} fracture ${sp.id}`, exposed, verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings };
  });
  return {
    id: 'fracture', title: 'Fracture tests (ISO 9017)', clause: fillet ? '6.5.3; cl. 7' : '6.5.2.2; cl. 7',
    verdict: out.some((x) => x.verdict === 'reject') ? 'reject' : 'accept', specimens: out,
    notes: [fillet ? 'Fillet test piece broken with the root in tension (ISO 9017).' : 'Specimens notched in the weld centre on the side in tension (6.5.2.1).', 'Porosity by cross-sectional area (2012 on a fracture face) is not evaluated: its limit is not loaded in this build.'],
  };
}

export function macroTests(map, specs, facts, rec) {
  const a = facts.aNom;
  const out = specs.map((sp) => {
    const i = Math.round(sp.s);
    const k = rec.topPassAt(i);
    const smp = k >= 0 ? rec.sample(k, i) : null;
    const cut = macroAt(map, sp.s);
    const findings = cut.filter((it) => it.type !== 'undercut' && it.type !== 'lofSurface').map((it) => judgeExposed({ item: it, length: it.type === 'pore' ? it.d : 1, depth: it.v1 - it.v0 }, a, true));
    if (smp) {
      // profile in the section (ISO 5817 5213 insufficient throat, 5214 excessive throat, 503 convexity)
      const b5214 = ISO_LIMITS.throat5214.C;
      const lim14 = Math.min(1 + b5214[0] * a, b5214[1]);
      findings.push({ ref: '5214', name: 'Excessive throat thickness', measured: r1(smp.aA - a), unit: 'mm over a', limit: `h ≤ 1 mm + ${b5214[0]}a, max ${b5214[1]} mm (${r1(lim14)} mm)`, ok: smp.aA - a <= lim14 + 1e-9, clause: 'cl. 7 → ISO 5817 level C, ref. 5214' });
      findings.push({ ref: '5213', name: 'Insufficient throat thickness', measured: r1(Math.max(0, a - smp.aA)), unit: 'mm under a', limit: NP, ok: smp.aA >= a - 0.05, clause: 'cl. 7 → ISO 5817 level B, ref. 5213' });
      const c = ISO_LIMITS.convex503.C;
      const lim3 = Math.min(1 + c[0] * smp.b, c[1]);
      findings.push({ ref: '503', name: 'Excessive convexity', measured: r1(Math.max(0, smp.c)), unit: 'mm', limit: `h ≤ 1 mm + ${c[0]}b, max ${c[1]} mm (${r1(lim3)} mm)`, ok: smp.c <= lim3 + 1e-9, clause: 'cl. 7 → ISO 5817 level C, ref. 503' });
    }
    return { ...sp, label: `Macro section ${sp.id}`, i, cut, verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings, legs: smp ? { z1: smp.z1, z2: smp.z2, a: smp.aA, c: smp.c } : null };
  });
  return { id: 'macro', title: 'Macroscopic examination (ISO 17639)', clause: 'Table 13 e); 6.5.3; cl. 7', verdict: out.some((x) => x.verdict === 'reject') ? 'reject' : 'accept', specimens: out, notes: ['Sections etched on one side to reveal the weld (6.4).'] };
}

// ---- range of qualification ---------------------------------------------------------------------------
const PROCESS_RANGE = { 111: '111', 135: '135, 138 (5.2)', 136: '136', 141: '141, 142, 143, 145 (5.2)' };

export function range(facts) {
  const rows = [];
  const P = facts.process;
  rows.push({ label: 'Welding process', test: P, range: PROCESS_RANGE[P] || P, clause: '5.2' });
  if (P === '135' || P === '136') {
    const dip = facts.transfer === 'short';
    rows.push({ label: 'Transfer mode', test: facts.transferName, range: dip ? 'all transfer modes (dip qualifies the others)' : `${facts.transferName} only`, clause: '5.2' });
  }
  if (facts.product === 'T') {
    rows.push({ label: 'Product type', test: `T (pipe, D ${r1(facts.D)} mm)`, range: facts.D >= 25 ? 'T, and P (plates: D ≥ 25 mm, 5.3 a)' : 'T', clause: '5.3' });
  } else {
    rows.push({ label: 'Product type', test: 'P (plate)', range: 'P; pipe D ≥ 500 mm fixed, D ≥ 75 mm rotating in PA, PB, PC, PD (5.3 b, c)', clause: '5.3' });
  }
  rows.push({ label: 'Type of weld', test: facts.weldType, range: facts.weldType === 'BW' ? 'BW (also branch joints ≥ 60° from pipe tests); FW not qualified without the supplementary fillet test (5.4 e)' : 'FW', clause: '5.4' });
  rows.push({ label: 'Filler material group', test: facts.fm, range: (TABLE3[facts.fm] || [facts.fm]).join(', '), clause: '5.5, Table 3' });
  // filler material type
  if (P === '111') {
    const types = facts.fillerRoles;
    if (types.length === 2) {
      // each covering type used qualifies its Table 4 range; a root run without backing only the type used
      // for the root in the test (Table 4 footnote b)
      const other = [...new Set([...TABLE4[types[1].isoType], ...TABLE4[types[0].isoType]])];
      rows.push({ label: 'Filler material type', test: `${types[0].isoType} root (ss nb), ${types[1].isoType} fill and cap`, range: `root run ss nb: ${types[0].isoType} (Table 4 footnote b); other runs: ${other.join(', ')}`, clause: '5.6, Table 4' });
    } else rows.push({ label: 'Filler material type', test: types[0].isoType, range: TABLE4[types[0].isoType].join(', '), clause: '5.6, Table 4' });
  } else {
    const ty = facts.fillerRoles[0].isoType;
    rows.push({ label: 'Filler material type', test: ty, range: `${(TABLE5[ty] || [ty]).join(', ')}; also without filler (5.6)`, clause: '5.6, Table 5' });
  }
  if (facts.weldType === 'BW') {
    const r6 = table6(facts.s, facts.layers);
    rows.push({ label: 'Deposited thickness s (mm)', test: String(r2(facts.s)), range: r6.text, clause: 'Table 6' });
  } else {
    const r8 = table8(facts.t);
    rows.push({ label: 'Material thickness t (mm)', test: String(r2(facts.t)), range: r8.text, clause: 'Table 8' });
  }
  if (facts.product === 'T') rows.push({ label: 'Outside pipe diameter D (mm)', test: String(r2(facts.D)), range: table7(facts.D).text, clause: 'Table 7' });
  const tab = facts.weldType === 'BW' ? TABLE9 : TABLE10;
  rows.push({ label: 'Welding position', test: facts.position, range: (tab[facts.position] || [facts.position]).join(', '), clause: facts.weldType === 'BW' ? 'Table 9' : 'Table 10' });
  if (facts.weldType === 'BW') rows.push({ label: 'Weld details', test: facts.details, range: (TABLE11[facts.details] || [facts.details]).join(', '), clause: 'Table 11' });
  else rows.push({ label: 'Layer technique', test: facts.layerTech, range: facts.layerTech === 'ml' ? 'sl, ml' : 'sl', clause: 'Table 12' });
  rows.push({ label: 'Parent material group', test: `${facts.material.iso15608} (${facts.material.label})`, range: 'recorded (5.1); groups 1 to 11 with this filler group (5.5.2)', clause: '5.1, 5.5.2' });
  rows.push({ label: 'Type of current and polarity', test: facts.current, range: 'recorded (clause 10)', clause: '10' });
  if (facts.gas) rows.push({ label: 'Shielding gas', test: facts.gas, range: 'recorded (clause 10)', clause: '10' });
  return rows;
}

// Clause 11 designation.
export function designation(facts) {
  const types = facts.fillerRoles.map((f) => f.isoType).join('/');
  const dims = facts.weldType === 'BW' ? `s${r1(facts.s)}` : `t${r1(facts.t)}`;
  const D = facts.product === 'T' ? ` D${r1(facts.D)}` : '';
  const det = facts.weldType === 'BW' ? facts.details : facts.layerTech;
  return `ISO 9606-1 ${facts.process} ${facts.product} ${facts.weldType} ${facts.fm} ${types} ${dims}${D} ${facts.position} ${det}`;
}

// Clause 9 validity of a passed test (dates as yyyy-mm-dd): confirmation every 6 months (9.2); revalidation
// 9.3 a) retest every 3 years, b) every 2 years with two production welds tested, c) continuous with an
// ISO 3834-2/-3 quality system (Annex A example: a) +3 y, b) +2 y, c) +6 months).
export function validity(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const add = (m) => {
    const x = new Date(d);
    x.setUTCMonth(x.getUTCMonth() + m);
    return x.toISOString().slice(0, 10);
  };
  return {
    confirm: add(6),
    rows: [
      { method: '9.3 a)', until: add(36), text: 'retest every 3 years' },
      { method: '9.3 b)', until: add(24), text: 'every 2 years, two welds of the last 6 months tested (RT, UT or destructive)' },
      { method: '9.3 c)', until: add(6), text: 'valid while confirmed every 6 months, same manufacturer, ISO 3834-2 or -3' },
    ],
    note: 'The qualification begins on the date of welding the test piece (9.1); it is confirmed every 6 months by the person responsible for welding activities (9.2).',
  };
}

export const RETEST = 'Clause 8: if any test fails, the welder may be given the opportunity to repeat the qualification test once without further training.';

// Text lines of the test brief.
// Brief lines: plain strings, or { k, v } templates the interface translates with the values filled in.
export function brief(facts, method) {
  void method;
  const lines = [];
  if (facts.product === 'P') lines.push({ k: 'Test piece: two plates {w} mm wide each, {L} mm long, t = {t} mm; examination length {e} mm, 25 mm discarded at each end (6.2, Figures 3 and 7).', v: { w: facts.joint.plateW ?? 125, L: facts.joint.L, t: r2(facts.t), e: facts.evalL } });
  if (facts.product === 'T') lines.push({ k: "Test piece: two pipes D {D} × {t} mm, each {len} mm long (Figure 5); examination length the whole circumference (Figure 8). The 12 o'clock position is marked (6.1).", v: { D: r2(facts.D), t: r2(facts.t), len: facts.joint.pipe.length } });
  if (facts.weldType === 'FW') lines.push({ k: 'Test piece: base plate and web {h} mm high, {L} mm long, t = {t} mm; examination length {e} mm (Figures 4 and 10). Throat as the WPS requires (6.3).', v: { h: facts.joint.webH ?? 125, L: facts.joint.L, t: r2(facts.t), e: facts.evalL } });
  lines.push(facts.passesPlanned > 1 ? 'At least one stop and restart in the root run and in the capping run; they are marked (6.3).' : 'At least one stop and restart in the run (6.3).');
  lines.push('Minor imperfections may be ground out with the examiner\'s permission, except in the capping run where only the stop and restart may be ground (6.3).');
  return lines;
}
