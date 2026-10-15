// ASME BPVC Section IX-2023, Article III (welder performance qualification): examination and testing of the
// simulated test coupons and the range qualified. Paragraph numbers are those of the 2023 edition; the
// figures not in the 2023 extract supplied are read from the 2015 edition (QW-462.4(b), QW-463.2,
// QW-466.1, Form QW-484A).

import { bendSpecimen, fractureSpecimen, macroAt, rtIndications } from './specimens.js';
import { FLAW_NAMES, PLANAR } from './flaws.js';
import { xAtClock } from '../sim/pipe.js';
import { clockLabel } from './iso.js';

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
export const IN = 25.4;
const inch = (mm) => `${r2(mm / IN)} in`;

// Table QW-461.9: test position -> positions qualified (groove: plate and pipe over 24 in O.D., pipe of 24 in
// O.D. and under; fillet or tack).
export const QW4619 = {
  plate: {
    '1G': { groove: 'F', pipe: 'F (pipe ≥ 2-7/8 in O.D.)', fillet: 'F' },
    '2G': { groove: 'F, H', pipe: 'F, H (pipe ≥ 2-7/8 in O.D.)', fillet: 'F, H' },
    '3G': { groove: 'F, V', pipe: 'F (pipe ≥ 2-7/8 in O.D.)', fillet: 'F, H, V' },
    '4G': { groove: 'F, O', pipe: 'F (pipe ≥ 2-7/8 in O.D.)', fillet: 'F, H, O' },
    '1F': { fillet: 'F (pipe ≥ 2-7/8 in O.D.)' },
    '2F': { fillet: 'F, H (pipe ≥ 2-7/8 in O.D.)' },
    '3F': { fillet: 'F, H, V (pipe ≥ 2-7/8 in O.D.)' },
    '4F': { fillet: 'F, H, O (pipe ≥ 2-7/8 in O.D.)' },
  },
  pipe: {
    '1G': { groove: 'F', pipe: 'F', fillet: 'F' },
    '2G': { groove: 'F, H', pipe: 'F, H', fillet: 'F, H' },
    '5G': { groove: 'F, V, O', pipe: 'F, V, O', fillet: 'All' },
    '6G': { groove: 'All', pipe: 'All', fillet: 'All' },
  },
};

// Form QW-433: F-Number qualified with -> qualified for. Keys 'F<n><w|wo>' (with / without backing).
export const QW433 = {
  F1w: ['F1w'], F1wo: ['F1w', 'F1wo'],
  F2w: ['F1w', 'F2w'], F2wo: ['F1w', 'F2w', 'F2wo'],
  F3w: ['F1w', 'F2w', 'F3w'], F3wo: ['F1w', 'F2w', 'F3w', 'F3wo'],
  F4w: ['F1w', 'F2w', 'F3w', 'F4w'], F4wo: ['F1w', 'F2w', 'F3w', 'F4w', 'F4wo'],
  F5w: ['F1w', 'F5w'], F5wo: ['F1w', 'F5w', 'F5wo'],
};
// QW-433 as printed: 'Qualified With' columns down, 'Qualified For' rows across.
// Column F-No. 1 With Backing marks only row F-No. 1 With Backing, and so on (see the table); F-No. 6:
// "Any F-No. 6 -> All F-No. 6".
export function fNoRange(list) {
  const set = new Set();
  let f6 = false;
  for (const x of list) {
    if (x.fNo === 6) {
      f6 = true;
      continue;
    }
    for (const q of QW433[`F${x.fNo}${x.backing ? 'w' : 'wo'}`] || []) set.add(q);
  }
  const out = [];
  for (let f = 1; f <= 5; f++) {
    const w = set.has(`F${f}w`), wo = set.has(`F${f}wo`);
    if (w && wo) out.push(`F-No. ${f} with and without backing`);
    else if (w) out.push(`F-No. ${f} with backing`);
    else if (wo) out.push(`F-No. ${f} without backing`);
  }
  if (f6) out.push('all F-No. 6');
  return out;
}

// Table QW-452.3: groove-weld test coupon O.D. -> O.D. qualified.
export function qw4523(D) {
  if (D < 25) return { min: D, text: `${r1(D)} mm (size welded) and over` };
  if (D <= 73) return { min: 25, text: '1 in (25 mm) O.D. and over' };
  return { min: 73, text: '2-7/8 in (73 mm) O.D. and over' };
}

// Table QW-452.1(b): deposited weld metal thickness t -> maximum qualified.
export function qw4521b(t, layers) {
  if (t >= 13 && layers >= 3) return { max: null, text: 'maximum to be welded (t ≥ 1/2 in with at least 3 layers)' };
  return { max: 2 * t, text: `2t = ${r1(2 * t)} mm (${inch(2 * t)})` };
}

// Table QW-452.1(a): bend specimens for the weld metal thickness t (all welders and processes) and position.
export function bendPlan(facts, method) {
  const t = facts.depositTotal;
  const pipe = facts.product === 'pipe';
  const fixed = pipe && (facts.aws === '5G' || facts.aws === '6G');
  const sideRequired = t >= 10 - 1e-6; // 3/8 in (10 mm) and over
  const faceRoot = !sideRequired || method === 'bendFR'; // Note (3): one face and one root (5G/6G: two of each) for the side bends
  const ts = sideRequired ? 10 : t; // QW-462.3(a): y = T below 3/8 in, 3/8 in (10 mm) above; QW-462.2 side bends 3/8 in
  const wFR = pipe ? (facts.D <= 114.3 + 1e-6 && facts.D >= 60.3 - 1e-6 ? 19 : facts.D < 60.3 ? 10 : 38) : 38; // QW-462.3(a), Note (b)
  const specs = [];
  const mk = (id, kind, sc, where) => specs.push(kind === 'side'
    ? { id, test: 'bend', kind, sc, w: 10, ts: 10, d: 40, where }
    : { id, test: 'bend', kind, sc, w: wFR, ts: Math.min(ts, t), d: 4 * Math.min(ts, t), where });
  if (!pipe) {
    // Figure QW-463.2(a) root and face bends, (b) side bends, between the discards
    const a = facts.evalA, L = facts.evalL;
    const kinds = faceRoot ? ['root', 'face'] : ['side', 'side'];
    kinds.forEach((k, n) => mk(`B${n + 1}`, k, a + (L * (n + 1)) / 3, `${Math.round((L * (n + 1)) / 3)} mm`));
    return { specs, figure: faceRoot ? 'QW-463.2(a)' : 'QW-463.2(b)', note: faceRoot && sideRequired ? 'QW-452.1(a) Note (3): one face and one root bend in place of the two side bends.' : null };
  }
  const j = facts.joint;
  if (fixed) {
    // QW-302.3 and Figure QW-463.2(d): four specimens at 45° from the vertical centre line
    const locs = [{ h: 10.5, fr: 'root' }, { h: 1.5, fr: 'face' }, { h: 7.5, fr: 'face' }, { h: 4.5, fr: 'root' }];
    locs.forEach((l, n) => mk(`B${n + 1}`, faceRoot ? l.fr : 'side', xAtClock(j, l.h), `${clockLabel(l.h)} o'clock`));
    return { specs, figure: 'QW-463.2(d)', note: faceRoot && sideRequired ? 'QW-452.1(a) Note (3): two face and two root bends in place of the four side bends.' : null };
  }
  // 1G or 2G: QW-302.3, two specimens: the upper-left root bend of Figure QW-463.2(d) replaced by a face bend,
  // upper-right and lower-left omitted
  mk('B1', faceRoot ? 'face' : 'side', xAtClock(j, 10.5), "10:30 o'clock");
  mk('B2', faceRoot ? 'root' : 'side', xAtClock(j, 4.5), "4:30 o'clock");
  return { specs, figure: 'QW-463.2(d), QW-302.3', note: null };
}

// QW-163: no open discontinuity in the weld or heat-affected zone over 1/8 in (3 mm) in any direction on the
// convex surface; corner openings not counted unless from lack of fusion, slag or other internal
// discontinuities.
export function bendTests(map, plan, facts) {
  const out = plan.specs.map((sp) => {
    const res = bendSpecimen(map, { kind: sp.kind, sc: sp.sc, w: sp.w, ts: sp.ts, d: sp.d });
    const findings = res.opened.map((o) => ({ ref: '', name: FLAW_NAMES[o.item.type], measured: r1(o.size), unit: 'mm', limit: '≤ 1/8 in (3 mm) in any direction', ok: o.size <= 3 + 1e-9, clause: 'QW-163' }));
    const label = sp.kind === 'side' ? `Side bend ${sp.id}` : `${sp.kind === 'root' ? 'Root' : 'Face'} bend ${sp.id}`;
    return { ...sp, label, e: res.e, opened: res.opened, verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings };
  });
  const fr = plan.specs[0] && plan.specs[0].kind !== 'side';
  return {
    id: 'bend', title: 'Guided-bend tests', clause: 'QW-302.1, QW-452.1(a), QW-160',
    verdict: out.some((s) => s.verdict === 'reject') ? 'reject' : 'accept', specimens: out,
    notes: [
      fr ? `Transverse ${plan.specs.some((s) => s.kind === 'face') ? 'face and root' : 'root'} bends, Figure QW-462.3(a): ${r1(plan.specs[0].w)} mm wide, ${r1(plan.specs[0].ts)} mm thick (reinforcement and backing removed flush).` : 'Transverse side bends, Figure QW-462.2: 3/8 in (10 mm) thick, coupon thickness wide.',
      `Jig QW-466.1 (all other metals, elongation ≥ 20 %): plunger 4t, 180° bend; outer-fibre elongation 100t/(A + t) = ${Math.round(100 * (out[0]?.e ?? 0))} %.`,
      `Removed as Figure ${plan.figure}.${plan.note ? ` ${plan.note}` : ''}`,
    ],
  };
}

// QW-191.1.2.2: radiography of qualification test welds.
// Chart data measured from Figure QW-191.1.2.2(b)(4) (2023), each chart printed 150 mm (6 in) long: the
// number of indications and their total area in the chart, by thickness range.
export const QW191_CHARTS = [
  { tMin: 3, tMax: 6, label: '1/8 in (3 mm) to 1/4 in (6 mm)', n: 41, area: 17.4 },
  { tMin: 6, tMax: 13, label: 'over 1/4 in (6 mm) to 1/2 in (13 mm)', n: 63, area: 30.2 },
  { tMin: 13, tMax: 25, label: 'over 1/2 in (13 mm) to 1 in (25 mm)', n: 67, area: 33.1 },
  { tMin: 25, tMax: 1e9, label: 'over 1 in (25 mm)', n: 71, area: 33.3 },
];

export function relevantRounded(t) {
  if (t < 3) return t / 10;
  if (t <= 6) return 0.4;
  if (t <= 50) return 0.8;
  return 1.5;
}

export function linearLimit(t) {
  if (t <= 10) return { lim: 3, text: '1/8 in (3 mm) for t up to 3/8 in (10 mm)' };
  if (t <= 57) return { lim: t / 3, text: `t/3 = ${r1(t / 3)} mm for t over 3/8 in to 2-1/4 in` };
  return { lim: 19, text: '3/4 in (19 mm) for t over 2-1/4 in' };
}

export function radiography(map, facts) {
  const t = facts.depositTotal;
  const ind = rtIndications(map);
  const findings = [];
  // (a)(1) cracks, incomplete fusion or penetration: any
  for (const x of ind) {
    if (PLANAR.has(x.type)) findings.push({ ref: '', name: FLAW_NAMES[x.type], measured: r1(x.length), unit: 'mm long', limit: 'Not acceptable (crack, incomplete fusion or penetration)', ok: false, clause: 'QW-191.1.2.2(a)(1)', at: x.sc });
  }
  // slag: linear when its length is more than 3 times its width (QW-191.1.2.1)
  const lin = linearLimit(t);
  const elongated = ind.filter((x) => x.type === 'slag' && x.length > 3 * x.width);
  for (const x of elongated) findings.push({ ref: '', name: 'Elongated slag indication', measured: r1(x.length), unit: 'mm', limit: lin.text, ok: x.length <= lin.lim + 1e-9, clause: 'QW-191.1.2.2(a)(2)', at: x.sc });
  // (a)(3) aligned group: aggregate length over t in a length of 12t, unless the gaps exceed 6L
  if (elongated.length > 1) {
    const sorted = elongated.slice().sort((a, b) => a.s0 - b.s0);
    for (let k = 0; k < sorted.length; k++) {
      const grp = [sorted[k]];
      for (let m = k + 1; m < sorted.length && sorted[m].s1 <= sorted[k].s0 + 12 * t; m++) grp.push(sorted[m]);
      if (grp.length < 2) continue;
      const Lmax = Math.max(...grp.map((g) => g.length));
      const gapsBig = grp.slice(1).every((g, n) => g.s0 - grp[n].s1 > 6 * Lmax);
      const agg = grp.reduce((a, g) => a + g.length, 0);
      if (!gapsBig && agg > t + 1e-9) {
        findings.push({ ref: '', name: 'Aligned elongated indications', measured: r1(agg), unit: 'mm in 12t', limit: `≤ t (${r1(t)} mm) in 12t (${r1(12 * t)} mm) unless spaced over 6L`, ok: false, clause: 'QW-191.1.2.2(a)(3)', at: grp[0].sc });
        break;
      }
    }
  }
  // (b) rounded indications: pores, tungsten and short slag
  const rounded = ind.filter((x) => x.type === 'pore' || x.type === 'tungsten' || (x.type === 'slag' && x.length <= 3 * x.width));
  const rel = relevantRounded(t);
  const relevant = rounded.filter((x) => Math.max(x.length, x.width) > rel + 1e-9);
  const maxDim = Math.min(0.2 * t, 3);
  for (const x of relevant) {
    const d = Math.max(x.length, x.width);
    if (d > maxDim + 1e-9) findings.push({ ref: '', name: `Rounded indication (${FLAW_NAMES[x.type].toLowerCase()})`, measured: r1(d), unit: 'mm', limit: `20% of t or 1/8 in (3 mm), smaller: ${r1(maxDim)} mm`, ok: false, clause: 'QW-191.1.2.2(b)(2)(-a)', at: x.sc });
  }
  const notes = [`Relevant rounded indications: over ${rel} mm (QW-191.1.2.2(b)(1)); t = ${r1(t)} mm, reinforcement not counted.`];
  if (t < 3) {
    const n = relevant.length;
    const allow = Math.floor((12 * map.joint.evalL) / 150);
    findings.push({ ref: '', name: 'Rounded indications, number', measured: n, unit: '', limit: `≤ 12 in 6 in (150 mm), ${allow} in this length`, ok: n <= allow, clause: 'QW-191.1.2.2(b)(2)(-b)' });
  } else {
    // (b)(2)(-c) and (b)(4): compared with the chart of the thickness range: the simulator compares the number and
    // the total area of the relevant rounded indications in the worst 150 mm with those of the chart
    const ch = QW191_CHARTS.find((c) => t > c.tMin - 1e-9 && t <= c.tMax + 1e-9) || QW191_CHARTS[1];
    const L = map.L;
    let worstN = 0, worstA = 0;
    for (const x of relevant) {
      const win = relevant.filter((y) => {
        let d = y.sc - x.sc;
        if (map.periodic) d -= L * Math.round(d / L);
        return d >= 0 && d < 150;
      });
      worstN = Math.max(worstN, win.length);
      worstA = Math.max(worstA, win.reduce((a, y) => a + (Math.PI * Math.max(y.length, y.width) ** 2) / 4, 0));
    }
    findings.push({ ref: '', name: `Rounded indications in 150 mm against the chart for ${ch.label}`, measured: `${worstN}, ${r1(worstA)} mm²`, unit: '', limit: `chart: ${ch.n} indications, ${ch.area} mm²`, ok: worstN <= ch.n && worstA <= ch.area + 1e-9, clause: 'QW-191.1.2.2(b)(4)' });
    notes.push('Chart comparison: the code compares the film with Figure QW-191.1.2.2(b)(4) by eye; the simulator compares the number and total area of the relevant rounded indications in the worst 6 in (150 mm) with those of the chart, measured from the figure at its printed 150 mm length.');
  }
  notes.push('Root concavity, burn-through and undercut are surface conditions with no QW-191 criterion; they are judged at the visual examination.');
  return { id: 'rt', title: 'Radiographic examination', clause: 'QW-302.2, QW-191.1.2.2', verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings, notes, indications: ind };
}

// QW-194 / QW-302.4: visual examination of the completed coupon (plate: all surfaces except discards;
// pipe: the entire circumference inside and outside): no cracks, complete joint penetration with complete
// fusion of weld metal and base metal.
export function visual(sum, map, facts) {
  const findings = [];
  const surf = map.items.filter((it) => it.surf && (map.periodic || (it.s1 > map.a && it.s0 < map.b)));
  for (const it of surf) {
    if (it.type === 'crack' || it.type === 'craterCrack') findings.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.len ?? it.h), unit: 'mm', limit: 'No cracks', ok: false, clause: 'QW-194', at: it.s0 });
    if (it.type === 'lofSurface' || it.type === 'lofRoot') findings.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.len ?? 1), unit: 'mm long', limit: 'Complete fusion of weld metal and base metal', ok: false, clause: 'QW-194', at: it.s0 });
    if (it.type === 'lop') findings.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.len ?? 1), unit: 'mm long', limit: 'Complete joint penetration', ok: false, clause: 'QW-194', at: it.s0 });
  }
  const missing = sum.rows.reduce((a, r) => a + (r ? 0 : 1), 0);
  if (missing) findings.push({ ref: '', name: 'Joint not welded', measured: missing, unit: 'mm', limit: 'Complete joint penetration', ok: false, clause: 'QW-194' });
  if (facts.weldType === 'FW' && sum.rows.some((r) => r && r.lofRoot > 0)) {
    // fillet root fusion is not visible: judged by the fracture test and the macro (QW-182, QW-184)
  }
  return {
    id: 'vt', title: 'Visual examination', clause: facts.product === 'pipe' ? 'QW-302.4 (entire circumference, inside and outside), QW-194' : 'QW-302.4 (all surfaces except discards), QW-194',
    verdict: findings.some((f) => !f.ok) ? 'reject' : 'accept', findings,
    notes: ['Section IX sets no visual limits for undercut, reinforcement or surface porosity; those are construction-code requirements.'],
  };
}

// QW-181.2: plate fillet coupon cut into a centre section about 4 in (100 mm) long, fracture tested (QW-182),
// and two end sections about 1 in (25 mm) long, the cut end of one macro-examined (QW-184).
export function filletPlan(facts) {
  const a = facts.evalA;
  const c0 = a + facts.evalL / 2 - 50;
  return {
    fracture: { id: 'F1', test: 'fracture', kind: 'root', s0: c0, s1: c0 + 100, w: 100, where: 'centre section, 4 in (100 mm)' },
    macro: { id: 'M1', test: 'macro', s: c0, where: 'cut end of an end section' },
  };
}

export function filletTests(map, plan, facts, rec) {
  // QW-182: root in tension; no cracks or incomplete root fusion; inclusions and porosity, sum of lengths
  // <= 3/8 in (10 mm)
  const exposed = fractureSpecimen(map, plan.fracture.s0, plan.fracture.s1);
  const fF = [];
  for (const x of exposed) {
    if (x.item.type === 'crack' || x.item.type === 'craterCrack') fF.push({ ref: '', name: FLAW_NAMES[x.item.type], measured: r1(x.length), unit: 'mm', limit: 'No cracks', ok: false, clause: 'QW-182' });
    if (x.item.type === 'lofRoot') fF.push({ ref: '', name: 'Incomplete root fusion', measured: r1(x.length), unit: 'mm', limit: 'No incomplete root fusion', ok: false, clause: 'QW-182' });
  }
  const incl = exposed.filter((x) => ['pore', 'slag', 'tungsten'].includes(x.item.type));
  const sumL = incl.reduce((a, x) => a + x.length, 0);
  fF.push({ ref: '', name: 'Inclusions and porosity on the fracture, sum of lengths', measured: r1(sumL), unit: 'mm', limit: '≤ 3/8 in (10 mm)', ok: sumL <= 10 + 1e-9, clause: 'QW-182' });
  const frac = { ...plan.fracture, label: 'Fracture test, centre section', exposed, verdict: fF.some((f) => !f.ok) ? 'reject' : 'accept', findings: fF };
  // QW-184 macro
  const i = Math.round(plan.macro.s);
  const k = rec.topPassAt(i);
  const smp = k >= 0 ? rec.sample(k, i) : null;
  const cut = macroAt(map, plan.macro.s);
  const fM = [];
  for (const it of cut) {
    if (it.type === 'lofRoot' || it.type === 'lofSurface') fM.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.h), unit: 'mm', limit: 'No incomplete fusion', ok: false, clause: 'QW-184(a)' });
    else if (it.type === 'crack' || it.type === 'craterCrack') fM.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.h), unit: 'mm', limit: 'No cracks', ok: false, clause: 'QW-184(b)' });
    else if (it.type === 'slag') fM.push({ ref: '', name: 'Linear indication (slag)', measured: r1(it.w ?? it.h), unit: 'mm', limit: '≤ 1/32 in (0.8 mm)', ok: (it.w ?? it.h) <= 0.8, clause: 'QW-184(c)' });
  }
  if (smp) {
    const cv = smp.c;
    fM.push({ ref: '', name: cv >= 0 ? 'Convexity' : 'Concavity', measured: r1(Math.abs(cv)), unit: 'mm', limit: '≤ 1/16 in (1.5 mm)', ok: Math.abs(cv) <= 1.5 + 1e-9, clause: 'QW-184(d)' });
    const dl = Math.abs(smp.z1 - smp.z2);
    fM.push({ ref: '', name: 'Difference between the leg lengths', measured: `${r1(dl)} (legs ${r1(smp.z1)} × ${r1(smp.z2)})`, unit: 'mm', limit: '≤ 1/8 in (3 mm)', ok: dl <= 3 + 1e-9, clause: 'QW-184(e)' });
  }
  const macro = { ...plan.macro, label: 'Macro examination, end section', i, cut, verdict: fM.some((f) => !f.ok) ? 'reject' : 'accept', findings: fM, legs: smp ? { z1: smp.z1, z2: smp.z2, a: smp.aA, c: smp.c } : null };
  return {
    id: 'fillet', title: 'Fillet weld fracture and macro tests', clause: 'QW-181.2, QW-182, QW-184; Table QW-452.5',
    verdict: frac.verdict === 'reject' || macro.verdict === 'reject' ? 'reject' : 'accept', specimens: [frac, macro],
    notes: ['Coupon per Figure QW-462.4(b): fracture specimen loaded laterally with the root of the weld in tension (QW-182).'],
  };
}

// Is radiography allowed for this test (QW-304)? GMAW only outside the short-circuiting mode.
export function rtAllowed(facts) {
  if (facts.process === '111' || facts.process === '141') return { ok: true };
  if (facts.process === '135') return facts.transfer === 'short' ? { ok: false, why: 'QW-304: radiography is not permitted for GMAW in the short-circuiting mode.' } : { ok: true };
  return { ok: false, why: 'QW-304 names SMAW, SAW, GTAW, PAW and GMAW; this build offers bend tests for flux-cored wires.' };
}

// ---- range qualified (Form QW-484A rows) ---------------------------------------------------------------
export function range(facts) {
  const rows = [];
  const proc = { 111: 'SMAW', 135: 'GMAW', 136: 'FCAW', 141: 'GTAW' }[facts.process];
  rows.push({ label: 'Welding process', test: proc, range: proc, clause: 'QW-301.2, QW-351' });
  rows.push({ label: 'Type', test: facts.process === '135' ? 'semi-automatic' : 'manual', range: facts.process === '135' ? 'semi-automatic' : 'manual', clause: 'QW-484A' });
  if (facts.weldType === 'BW') {
    rows.push({ label: 'Backing', test: facts.backing ? 'with' : 'without', range: facts.backing ? 'with backing (incl. double-welded and fillet welds)' : 'with and without', clause: 'QW-402.4' });
  }
  if (facts.product === 'pipe') {
    rows.push({ label: 'Pipe O.D.', test: `${r1(facts.D)} mm (${inch(facts.D)})`, range: facts.weldType === 'BW' ? qw4523(facts.D).text : '2-7/8 in (73 mm) O.D. and over', clause: 'QW-403.16, QW-452.3' });
  } else {
    rows.push({ label: 'Plate / pipe', test: 'plate', range: facts.weldType === 'BW' ? 'plate; pipe 2-7/8 in (73 mm) O.D. and over in the positions of QW-461.9 Note (3)' : 'plate; pipe 2-7/8 in (73 mm) O.D. and over (Table QW-452.5)', clause: 'QW-461.9, QW-452.5' });
  }
  rows.push({ label: 'Base metal P-No.', test: `P-No. ${facts.material.pNo} to P-No. ${facts.material.pNo} (${facts.material.spec}${facts.material.grade ? ` Gr ${facts.material.grade}` : ''})`, range: 'P-No. 1 through P-No. 15F, P-No. 34, P-No. 41 through P-No. 49', clause: 'QW-403.18, QW-423.1' });
  rows.push({ label: 'Filler specification (info)', test: [...new Set(facts.fillerRoles.map((f) => f.sfa))].join(', '), range: '–', clause: 'QW-484A' });
  rows.push({ label: 'Filler classification (info)', test: facts.fillerRoles.map((f) => f.aws.replace('AWS A5.1 ', '').replace('AWS A5.18 ', '')).join(', '), range: '–', clause: 'QW-484A' });
  const fl = facts.fillerRoles.map((f) => ({ fNo: f.fNo, backing: f.backing }));
  rows.push({ label: 'Filler F-No.', test: facts.fillerRoles.map((f) => `F-No. ${f.fNo} ${f.backing ? 'with' : 'without'} backing${facts.fillerRoles.length > 1 ? ` (${f.role})` : ''}`).join('; '), range: fNoRange(fl).join('; '), clause: 'QW-404.15, QW-433' });
  if (facts.process === '141') {
    rows.push({ label: 'Consumable insert', test: 'none', range: 'none (fillet welds)', clause: 'QW-404.22' });
    rows.push({ label: 'Filler product form', test: 'solid', range: 'solid', clause: 'QW-404.23' });
    rows.push({ label: 'Filler metal', test: 'with filler', range: 'with filler', clause: 'QW-404.14' });
  }
  if (facts.weldType === 'BW') {
    for (const f of facts.fillerRoles) {
      const dep = f.deposit;
      const r = facts.process === '135' && facts.transfer === 'short' && dep < 13
        ? { text: `1.1 × t = ${r1(1.1 * dep)} mm (QW-404.32, short-circuiting transfer)` }
        : qw4521b(dep, f.layers);
      rows.push({ label: `Deposit thickness, ${proc}${facts.fillerRoles.length > 1 ? ` F-No. ${f.fNo}` : ''}`, test: `${r1(dep)} mm, ${f.layers >= 3 ? '3 layers minimum: yes' : '3 layers minimum: no'}`, range: r.text, clause: 'QW-404.30, QW-452.1(b)' });
    }
  } else {
    const T = facts.t;
    rows.push({ label: 'Fillet test coupon thickness T', test: `${r1(T)} mm (${inch(T)})`, range: T >= 5 - 1e-6 ? 'all base material thicknesses, fillet sizes and diameters 2-7/8 in (73 mm) O.D. and over' : `T to 2T base material thickness (${r1(T)}–${r1(2 * T)} mm), T maximum fillet size (${r1(T)} mm)`, clause: 'Table QW-452.5' });
  }
  const pos = QW4619[facts.product === 'pipe' ? 'pipe' : 'plate'][facts.aws] || {};
  if (facts.weldType === 'BW') {
    rows.push({ label: 'Position, groove', test: facts.aws, range: facts.product === 'pipe' ? `${pos.groove} (plate and pipe)` : `${pos.groove} (plate and pipe over 24 in O.D.); ${pos.pipe} for pipe 24 in O.D. and under`, clause: 'QW-405.1, QW-461.9' });
    rows.push({ label: 'Position, fillet', test: facts.aws, range: `${pos.fillet} (all thicknesses and diameters, QW-303.1)`, clause: 'QW-303.1, QW-461.9' });
  } else rows.push({ label: 'Position, fillet', test: facts.aws, range: pos.fillet, clause: 'QW-303.2, QW-461.9' });
  if (facts.progression) rows.push({ label: 'Vertical progression', test: facts.progression === 'up' ? 'uphill' : 'downhill', range: facts.progression === 'up' ? 'uphill' : 'downhill', clause: 'QW-405.3' });
  if (facts.process === '135' || facts.process === '141') rows.push({ label: 'Inert gas backing', test: 'without', range: 'with or without', clause: 'QW-408.8' });
  if (facts.process === '135') rows.push({ label: 'Transfer mode', test: facts.transferName, range: facts.transfer === 'short' ? 'short-circuiting' : 'spray, globular or pulsed spray', clause: 'QW-409.2' });
  if (facts.process === '141') rows.push({ label: 'GTAW current / polarity', test: 'DCEN', range: 'DCEN', clause: 'QW-409.4' });
  return rows;
}

export function validity(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return {
    confirm: d.toISOString().slice(0, 10),
    rows: [{ method: 'QW-322.1', until: d.toISOString().slice(0, 10), text: 'valid while no more than 6 months pass without using the process; continuity confirmed by the organization' }],
    note: 'Continuity begins on the date the test coupon was completed with acceptable results (QW-300.1). QW-322.2 revocation; QW-322.3 renewal by one test coupon of any material, thickness, diameter and position.',
  };
}

export const RETEST = 'QW-321: immediate retest after a failed visual or mechanical test: two consecutive test coupons for each position failed, all of which shall pass (QW-321.1, QW-321.2); after further training or practice, a new test for each position failed (QW-321.4).';

// Brief lines: plain strings, or { k, v } templates the interface translates with the values filled in.
export function brief(facts) {
  const lines = [];
  if (facts.product === 'pipe') lines.push({ k: facts.progression ? 'Test coupon: pipe {D} × {t} mm ({in} O.D.), {pos}, uphill; Figure QW-469.2 style groove without backing. Visual examination of the entire circumference inside and outside (QW-302.4).' : 'Test coupon: pipe {D} × {t} mm ({in} O.D.), {pos}; Figure QW-469.2 style groove without backing. Visual examination of the entire circumference inside and outside (QW-302.4).', v: { D: r1(facts.D), t: r2(facts.t), in: inch(facts.D), pos: facts.aws } });
  else if (facts.weldType === 'BW') lines.push({ k: 'Test coupon: plate t = {t} mm on a backing strip (QW-310.2, Figure QW-469.1 groove dimensions), {pos}; ends designated discard.', v: { t: r2(facts.t), pos: facts.aws } });
  else lines.push({ k: 'Test coupon: tee fillet per Figure QW-462.4(b): base and web t = {t} mm, length {L} mm (6 in minimum), fillet size not over T; stop and restart near the centre.', v: { t: r2(facts.t), L: facts.joint.L } });
  lines.push('Welded to the WPS; preheat and PWHT of the WPS may be omitted (QW-301.2).');
  return lines;
}
