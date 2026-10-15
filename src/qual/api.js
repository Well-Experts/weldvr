// API Standard 1104, 22nd edition (2021), Section 6: single qualification of welders on pipe butt welds:
// visual examination (6.4), destructive testing (6.5 with 5.6.3 and 5.6.4), radiography (6.6 with 9.3),
// retest (6.7), records (6.8) and the essential variables (6.2.2).

import { bendSpecimen, fractureSpecimen, rtIndications, worstWindowLength } from './specimens.js';
import { FLAW_NAMES } from './flaws.js';
import { xAtClock } from '../sim/pipe.js';
import { clockLabel } from './iso.js';

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const IN = 25.4;

// Table 4 filler metal groups (welder qualification).
export const TABLE4 = {
  'WF-1': 'SMAW, A5.1 or A5.5 EXX10-X(X), EXX11-X(X) (cellulosic)',
  'WF-2': 'SMAW, A5.1 or A5.5 EXX15, EXX16, EXX18 (low hydrogen)',
  'WF-3': 'SMAW, A5.5 E8045, E9045, E10045 (low hydrogen vertical down)',
  'WF-4': 'GMAW or GTAW, A5.18 ERXXS-X, A5.28 ERXX(X)S-XX(X)',
  'WF-5': 'OFW, A5.2 RG60, RG65',
  'WF-6': 'FCAW, A5.20 / A5.36 / A5.29',
};

// 6.2.2 d) O.D. groups.
export function odGroup(D) {
  if (D < 60.3) return { n: 1, text: 'specified O.D. less than 2.375 in (60.3 mm)' };
  if (D <= 323.9) return { n: 2, text: 'specified O.D. 2.375 in (60.3 mm) through 12.750 in (323.9 mm)' };
  return { n: 3, text: 'specified O.D. greater than 12.750 in (323.9 mm)' };
}

// Table 5 wall thickness group of a single qualification test.
export function table5(t) {
  if (t < 3.9) return { text: `${r1(t)} mm to ${r1(Math.max(3.9, 1.5 * t))} mm (t to the greater of 0.154 in (3.9 mm) or 1.5t)` };
  if (t < 19) return { text: `3.9 mm to ${r1(Math.max(19, 1.5 * t))} mm (0.154 in to the greater of 0.75 in (19 mm) or 1.5t)` };
  return { text: '19 mm (0.75 in) to unlimited' };
}

// Table 7: specimens per welder by O.D. and wall thickness.
export function table7(D, t) {
  const thin = t <= 12.7 + 1e-9;
  if (thin) {
    if (D > 323.9) return { nb: 4, rb: 2, fb: 2, sb: 0 };
    return { nb: 2, rb: 2, fb: 0, sb: 0 };
  }
  if (D > 323.9) return { nb: 4, rb: 0, fb: 0, sb: 4 };
  return { nb: 2, rb: 0, fb: 0, sb: 2 };
}

// Figure 12 locations (full circumference): for O.D. over 4.500 in to 12.750 in, root (or side) bend at
// about 10:30 and 4:30, nick break at about 1:30 and 7:30 from the top of the pipe; for 2.375 in to 4.500 in
// the figure pairs them, and its note allows the locations to be rotated when equally spaced: the same
// four equally spaced locations are used here. Specimens about 1 in (25 mm) wide (Figures 5 and 7); side
// bends about 1/2 in (13 mm) wide (Figure 9).
export function plan(facts) {
  const j = facts.joint;
  const t7 = table7(facts.D, facts.t);
  const bendKind = t7.sb ? 'side' : 'root';
  const locs = [{ h: 10.5, k: bendKind }, { h: 1.5, k: 'nick' }, { h: 4.5, k: bendKind }, { h: 7.5, k: 'nick' }];
  const specs = locs.map((l, n) => {
    const sc = xAtClock(j, l.h);
    if (l.k === 'nick') return { id: `NB${n < 2 ? 1 : 2}`, test: 'nick', kind: 'nick', s0: sc - 12.5, s1: sc + 12.5, sc, w: 25, where: `${clockLabel(l.h)} o'clock` };
    if (l.k === 'side') return { id: `SB${n < 2 ? 1 : 2}`, test: 'bend', kind: 'side', sc, w: 13, ts: 13, d: 90, where: `${clockLabel(l.h)} o'clock` };
    return { id: `RB${n < 2 ? 1 : 2}`, test: 'bend', kind: 'root', sc, w: 25, ts: facts.t, d: 90, where: `${clockLabel(l.h)} o'clock` };
  });
  return { specs, t7 };
}

// 5.6.3.3 nick break: complete penetration and fusion; gas pocket greatest dimension <= 1/16 in (1.6 mm);
// gas pockets <= 2 % of the exposed area; slag depth <= 1/32 in (0.8 mm) and length <= 1/8 in (3 mm) or half
// the wall thickness, smaller; at least 1/2 in (13 mm) between adjacent slag inclusions.
export function judgeNick(exposed, t, area) {
  const f = [];
  for (const x of exposed) {
    const ty = x.item.type;
    if (ty === 'lop' || ty === 'lofRoot' || ty === 'lofSide' || ty === 'lofInter' || ty === 'burn') {
      f.push({ ref: '', name: FLAW_NAMES[ty], measured: r1(x.length), unit: 'mm', limit: 'Complete penetration and fusion', ok: false, clause: '5.6.3.3' });
    } else if (ty === 'crack' || ty === 'craterCrack') {
      f.push({ ref: '', name: FLAW_NAMES[ty], measured: r1(x.length), unit: 'mm', limit: 'Complete penetration and fusion (no cracks)', ok: false, clause: '5.6.3.3' });
    } else if (ty === 'pore') {
      f.push({ ref: '', name: 'Gas pocket', measured: r1(x.d), unit: 'mm', limit: '≤ 1/16 in (1.6 mm)', ok: x.d <= 1.6 + 1e-9, clause: '5.6.3.3' });
    } else if (ty === 'slag') {
      const lmax = Math.min(3, t / 2);
      f.push({ ref: '', name: 'Slag inclusion', measured: `depth ${r1(x.depth)}, length ${r1(x.length)}`, unit: 'mm', limit: `depth ≤ 1/32 in (0.8 mm), length ≤ ${r1(lmax)} mm`, ok: x.depth <= 0.8 + 1e-9 && x.length <= lmax + 1e-9, clause: '5.6.3.3' });
    } else if (ty === 'tungsten') {
      f.push({ ref: '', name: FLAW_NAMES[ty], measured: r1(x.d), unit: 'mm', limit: 'no 5.6.3.3 criterion', ok: true, clause: '5.6.3.3', info: true });
    }
  }
  const pockets = exposed.filter((x) => x.item.type === 'pore');
  if (pockets.length) {
    const pa = pockets.reduce((a, x) => a + x.area, 0);
    const pct = (100 * pa) / area;
    f.push({ ref: '', name: 'Gas pockets, combined area', measured: r1(pct), unit: '% of the exposed area', limit: '≤ 2 %', ok: pct <= 2 + 1e-9, clause: '5.6.3.3' });
  }
  const slag = exposed.filter((x) => x.item.type === 'slag').map((x) => x.item).sort((a, b) => a.s0 - b.s0);
  for (let k = 1; k < slag.length; k++) {
    const gap = slag[k].s0 - slag[k - 1].s1;
    if (gap < 13 - 1e-9) {
      f.push({ ref: '', name: 'Separation of adjacent slag inclusions', measured: r1(Math.max(0, gap)), unit: 'mm', limit: '≥ 1/2 in (13 mm)', ok: false, clause: '5.6.3.3' });
      break;
    }
  }
  return f;
}

export function destructive(map, plan0, facts) {
  const t = facts.t;
  const out = plan0.specs.map((sp) => {
    if (sp.test === 'nick') {
      const exposed = fractureSpecimen(map, sp.s0, sp.s1);
      const findings = judgeNick(exposed, t, sp.w * t);
      return { ...sp, label: `Nick break ${sp.id}`, exposed, verdict: findings.some((x) => !x.ok) ? 'reject' : 'accept', findings };
    }
    // 5.6.4.3 (and 5.6.5.3): no crack or other imperfection over 1/8 in (3 mm) or half the wall thickness,
    // smaller, in any direction in the weld or between the weld and the fusion zone
    const res = bendSpecimen(map, { kind: sp.kind, sc: sp.sc, w: sp.w, ts: sp.ts, d: sp.d });
    const lim = Math.min(3, t / 2);
    const findings = res.opened.map((o) => ({ ref: '', name: FLAW_NAMES[o.item.type], measured: r1(o.size), unit: 'mm', limit: `≤ ${r1(lim)} mm (1/8 in or t/2, smaller)`, ok: o.size <= lim + 1e-9, clause: sp.kind === 'side' ? '5.6.5.3' : '5.6.4.3' }));
    return { ...sp, label: `${sp.kind === 'side' ? 'Side' : 'Root'} bend ${sp.id}`, e: res.e, opened: res.opened, verdict: findings.some((x) => !x.ok) ? 'reject' : 'accept', findings };
  });
  const t7 = plan0.t7;
  return {
    id: 'destructive', title: 'Destructive testing', clause: '6.5, Table 7, Figure 12; 5.6.3.3, 5.6.4.3',
    verdict: out.some((s) => s.verdict === 'reject') ? 'reject' : 'accept', specimens: out,
    notes: [
      `Table 7 for O.D. ${r1(facts.D)} mm, wall ${r1(t)} mm: ${t7.nb} nick break, ${t7.rb} root bend, ${t7.fb} face bend, ${t7.sb} side bend.`,
      'Nick break specimens about 9 in × 1 in (230 × 25 mm), notched on each side at the weld centre (5.6.3.1); no replacement for welder qualification (6.5.2).',
      `Bend jig no larger than Figure 8: plunger radius 1-3/4 in (45 mm), die radius 2-5/16 in (60 mm); outer-fibre strain ${Math.round(100 * (out.find((s) => s.e)?.e ?? 0))} % for this wall.`,
      'A bend specimen that cracks is not rejected only for not bending to a full U if its broken faces meet 5.6.3.3 (6.5.3).',
    ],
  };
}

// 9.3 radiographic acceptance (6.6.2: the welder is disqualified if a test weld does not meet 9.3).
export function radiography(map, facts) {
  const t = facts.t;
  const L = map.L;
  const ind = rtIndications(map, 0, L);
  const f = [];
  const iv = (list) => list.map((x) => [x.s0, x.s1]);
  const agg = (list) => list.reduce((a, x) => a + x.length, 0);
  const worst = (list) => worstWindowLength(iv(list), 300, L, map.periodic);
  const short = L < 300;
  const rule = (name, list, indiv, aggr300, pct8, clause) => {
    if (!list.length) return;
    const longest = Math.max(...list.map((x) => x.length));
    if (indiv != null) f.push({ ref: '', name: `${name}: individual length`, measured: r1(longest), unit: 'mm', limit: `≤ ${indiv} mm`, ok: longest <= indiv + 1e-9, clause });
    if (aggr300 != null) f.push({ ref: '', name: `${name}: aggregate in any 300 mm`, measured: r1(worst(list)), unit: 'mm', limit: `≤ ${aggr300} mm`, ok: worst(list) <= aggr300 + 1e-9, clause });
    if (pct8) {
      const a = agg(list);
      f.push({ ref: '', name: `${name}: aggregate, % of the weld length`, measured: r1((100 * a) / L), unit: '%', limit: '≤ 8 %', ok: a <= 0.08 * L + 1e-9, clause });
    }
  };
  // 9.3.1 IP: individual > 25 mm; aggregate > 25 mm in 300 mm; > 8 % in a weld under 300 mm
  rule('Inadequate penetration (IP)', ind.filter((x) => x.type === 'lop'), 25, 25, short, '9.3.1');
  // 9.3.4 IF (surface connected: unfused land at the root, cold lap at a cap toe)
  rule('Incomplete fusion (IF)', ind.filter((x) => x.type === 'lofRoot' || x.type === 'lofSurface'), 25, 25, short, '9.3.4');
  // 9.3.5 IFD (cold lap between beads or bead and parent metal, not surface connected): individual > 50 mm,
  // aggregate > 50 mm in 300 mm, aggregate > 8 % of the weld length
  rule('Incomplete fusion due to cold lap (IFD)', ind.filter((x) => x.type === 'lofSide' || x.type === 'lofInter'), 50, 50, true, '9.3.5');
  // 9.3.6 IC: a defect where the image is darker than the thinnest adjacent parent metal: the concavity is
  // deeper than the cap reinforcement over it
  for (const x of ind.filter((y) => y.type === 'concavity')) {
    const capH = x.item.cap ?? 0;
    f.push({ ref: '', name: 'Internal concavity (IC): weld thinner than the pipe wall', measured: r1(x.item.h - capH), unit: 'mm', limit: 'density not darker than the thinnest adjacent parent metal', ok: x.item.h <= capH + 1e-9, clause: '9.3.6' });
  }
  // 9.3.7 BT: a defect where thinner than the thinnest adjacent parent metal (the hole under the cap)
  // (radiographic thickness there: the wall plus the cap and the metal that dropped inside, less the hole)
  for (const x of ind.filter((y) => y.type === 'burn')) {
    const net = (x.item.cap ?? 0) + (x.item.inside ?? 0) - x.depth;
    f.push({ ref: '', name: 'Burn-through (BT): weld thickness less the wall', measured: r1(net), unit: 'mm', limit: 'not thinner than the thinnest adjacent parent metal (≥ 0)', ok: net >= -1e-9, clause: '9.3.7' });
  }
  // 9.3.8 slag inclusions: interpass slag at the toes of the previous run lies at the fusion zones: elongated
  // slag (ESI); parallel lines about a root bead apart count as one unless either is wider than 0.8 mm
  const slag = ind.filter((x) => x.type === 'slag');
  if (slag.length) {
    if (facts.D >= 60.3) {
      rule('Elongated slag (ESI)', slag, 50, 50, false, '9.3.8.2 a), c)');
      const wmax = Math.max(...slag.map((x) => x.width));
      f.push({ ref: '', name: 'Elongated slag (ESI): width', measured: r1(wmax), unit: 'mm', limit: '≤ 1/16 in (1.6 mm)', ok: wmax <= 1.6 + 1e-9, clause: '9.3.8.2 d)' });
      const a = agg(slag);
      f.push({ ref: '', name: 'ESI and ISI: aggregate, % of the weld length', measured: r1((100 * a) / L), unit: '%', limit: '≤ 8 %', ok: a <= 0.08 * L + 1e-9, clause: '9.3.8.2 h)' });
    } else {
      const longest = Math.max(...slag.map((x) => x.length));
      f.push({ ref: '', name: 'Elongated slag (ESI): length', measured: r1(longest), unit: 'mm', limit: `≤ 3t (${r1(3 * t)} mm)`, ok: longest <= 3 * t + 1e-9, clause: '9.3.8.3 a)' });
      const wmax = Math.max(...slag.map((x) => x.width));
      f.push({ ref: '', name: 'Elongated slag (ESI): width', measured: r1(wmax), unit: 'mm', limit: '≤ 1/16 in (1.6 mm)', ok: wmax <= 1.6 + 1e-9, clause: '9.3.8.3 c)' });
      const a = agg(slag);
      f.push({ ref: '', name: 'ESI and ISI: aggregate, % of the weld length', measured: r1((100 * a) / L), unit: '%', limit: '≤ 8 %', ok: a <= 0.08 * L + 1e-9, clause: '9.3.8.3 e)' });
    }
  }
  // 9.3.9.2 porosity: individual pore over 1/8 in (3 mm) or 25 % of the wall, smaller
  const pores = ind.filter((x) => x.type === 'pore');
  if (pores.length) {
    const lim = Math.min(3, 0.25 * t);
    const dmax = Math.max(...pores.map((x) => x.length));
    f.push({ ref: '', name: 'Individual pore', measured: r1(dmax), unit: 'mm', limit: `≤ ${r1(lim)} mm (1/8 in or 25 % of the wall, smaller)`, ok: dmax <= lim + 1e-9, clause: '9.3.9.2 a), b)' });
  }
  // 9.3.10 cracks: any crack other than a crater or star crack; crater or star crack over 5/32 in (4 mm)
  for (const x of ind.filter((y) => y.type === 'crack')) f.push({ ref: '', name: 'Crack', measured: r1(x.length), unit: 'mm', limit: 'not acceptable', ok: false, clause: '9.3.10 a)' });
  for (const x of ind.filter((y) => y.type === 'craterCrack')) f.push({ ref: '', name: 'Crater crack', measured: r1(x.length), unit: 'mm', limit: '≤ 5/32 in (4 mm)', ok: x.length <= 4 + 1e-9, clause: '9.3.10 b)' });
  // 9.3.11 undercut on the film
  const uc = ind.filter((x) => x.type === 'undercut');
  if (uc.length) {
    const w = worst(uc), a = agg(uc);
    const allow = Math.min(50, L / 6);
    f.push({ ref: '', name: 'Undercut (EU, IU): aggregate', measured: `${r1(w)} in 300 mm, ${r1(a)} total`, unit: 'mm', limit: '≤ 2 in (50 mm) in 300 mm and ≤ 1/6 of the weld length', ok: w <= 50 + 1e-9 && a <= L / 6 + 1e-9, clause: '9.3.11' });
    void allow;
  }
  // 9.3.12 accumulation, excluding IPD and undercut
  const acc = ind.filter((x) => x.type !== 'undercut' && x.type !== 'concavity');
  if (acc.length) {
    const w = worst(acc), a = agg(acc);
    f.push({ ref: '', name: 'Accumulation of imperfections', measured: `${r1(w)} in 300 mm; ${r1((100 * a) / L)} %`, unit: '', limit: '≤ 2 in (50 mm) in any 12 in (300 mm), ≤ 8 % of the weld length', ok: w <= 50 + 1e-9 && a <= 0.08 * L + 1e-9, clause: '9.3.12' });
  }
  return {
    id: 'rt', title: 'Radiography of the test weld', clause: '6.6.2, 9.3',
    verdict: f.some((x) => !x.ok) ? 'reject' : 'accept', findings: f, indications: ind,
    notes: [
      'Porosity distribution (Figures 20 and 21, pictorial) is shown on the film for comparison and is not scored by the simulator.',
      'RT is not used to locate areas for the destructive tests (6.6.2, 9.1).',
    ],
  };
}

// 6.4 visual examination.
export function visual(sum, map, facts) {
  const t = facts.t;
  const f = [];
  for (const it of map.items) {
    if (!it.surf) continue;
    if (it.type === 'crack' || it.type === 'craterCrack') f.push({ ref: '', name: FLAW_NAMES[it.type], measured: r1(it.len ?? it.h), unit: 'mm', limit: 'Free from cracks', ok: false, clause: '6.4', at: it.s0 });
    if (it.type === 'lop') f.push({ ref: '', name: 'Inadequate penetration', measured: r1(it.len), unit: 'mm long', limit: 'Free from inadequate penetration', ok: false, clause: '6.4', at: it.s0 });
    if (it.type === 'concavity') {
      const capH = it.cap ?? 0;
      f.push({ ref: '', name: 'Internal concavity', measured: `${r1(it.h)} deep, cap ${r1(capH)}`, unit: 'mm', limit: 'depth not over the cap height at the same location', ok: it.h <= capH + 1e-9, clause: '9.8.2', at: it.s0 });
    }
  }
  for (const it of map.items.filter((x) => x.type === 'burn')) f.push({ ref: '', name: 'Burn-through (BT)', measured: r1(it.len), unit: 'mm long', limit: 'No burn-through in a butt weld', ok: false, clause: '6.4', at: it.s0 });
  // Table 8 undercut
  const deep = Math.min(0.8, 0.125 * t);
  const low = Math.min(0.4, 0.06 * t);
  const uc = map.items.filter((x) => x.type === 'undercut');
  for (const it of uc.filter((x) => x.h > deep + 1e-9)) f.push({ ref: '', name: 'Undercut', measured: r1(it.h), unit: 'mm', limit: `> ${r1(deep)} mm (1/32 in or 12.5 % of the wall, smaller) not acceptable`, ok: false, clause: '9.7.2, Table 8', at: it.s0 });
  const mid = uc.filter((x) => x.h > low + 1e-9 && x.h <= deep + 1e-9);
  if (mid.length) {
    const w = worstWindowLength(mid.map((x) => [x.s0, x.s1]), 300, map.L, map.periodic);
    const allow = Math.min(50, map.L / 6);
    f.push({ ref: '', name: `Undercut ${r1(low)}–${r1(deep)} mm, length`, measured: r1(w), unit: 'mm', limit: `≤ ${r1(allow)} mm (2 in in 12 in, or 1/6 of the weld length, smaller)`, ok: w <= allow + 1e-9, clause: '9.7.2, Table 8' });
  }
  const missing = sum.rows.reduce((a, r) => a + (r ? 0 : 1), 0);
  if (missing) f.push({ ref: '', name: 'Joint not completed', measured: missing, unit: 'mm', limit: 'test joint welded', ok: false, clause: '6.4' });
  const ifRoot = map.items.filter((x) => x.type === 'lofRoot' && x.surf);
  for (const it of ifRoot) f.push({ ref: '', name: 'Incomplete fusion at the root, visible inside', measured: r1(it.len), unit: 'mm long', limit: 'workmanlike appearance acceptable to the company (6.4); RT limit 9.3.4', ok: true, info: true, clause: '6.4' });
  return {
    id: 'vt', title: 'Visual examination', clause: '6.4',
    verdict: f.some((x) => !x.ok) ? 'reject' : 'accept', findings: f,
    notes: ['"Neat workmanlike appearance acceptable to the company" and the WPS dimensional requirements are the examiner\'s judgement and are not scored.', 'Failure of the visual examination is cause to stop further testing (6.4).'],
  };
}

// 6.2.2 essential variables of a single qualification: the range qualified.
export function range(facts) {
  const rows = [];
  rows.push({ label: 'Welding process', test: 'SMAW', range: 'SMAW', clause: '6.2.2 a)' });
  const dir = facts.rolled ? 'rolled (no progression)' : facts.aws === '2G' ? 'horizontal progression' : facts.progression === 'up' ? 'vertical up' : 'vertical down';
  rows.push({ label: 'Direction of welding', test: dir, range: dir, clause: '6.2.2 b)' });
  rows.push({ label: 'Filler metal groups (Table 4)', test: facts.fillerRoles.map((f) => `${f.api} ${f.role}`).join(', '), range: `${facts.fillerRoles.map((f) => `${f.api} (${f.role})`).join(', ')}, as tested`, clause: '6.2.2 c)' });
  const og = odGroup(facts.D);
  rows.push({ label: 'Outside diameter group', test: `${r1(facts.D)} mm (${r1(facts.D / IN * 1000) / 1000} in)`, range: og.text, clause: '6.2.2 d)' });
  rows.push({ label: 'Wall thickness group (Table 5)', test: `${r1(facts.t)} mm`, range: table5(facts.t).text, clause: '6.2.2 e)' });
  rows.push({ label: 'Rolled or fixed', test: facts.rolled ? 'rolled' : 'fixed', range: facts.rolled ? 'rolled only' : 'fixed and rolled', clause: '6.2.2 f)' });
  const pos = facts.rolled ? 'rolled (1G)' : facts.aws === '6G' ? 'all positions, butt and lap fillet welds' : facts.aws === '5G' ? 'fixed, axis horizontal (and rolled)' : 'fixed, axis vertical (and rolled)';
  rows.push({ label: 'Position', test: facts.rolled ? 'rolled, axis horizontal' : facts.aws === '6G' ? 'fixed, axis inclined 45°' : facts.aws === '5G' ? 'fixed, axis horizontal' : 'fixed, axis vertical', range: pos, clause: '6.2.2 g)' });
  rows.push({ label: 'Joint design', test: 'butt weld, single V, no backing', range: 'butt welds, and fillet welds within the essential variables qualified', clause: '6.2.2 h)' });
  rows.push({ label: 'Backing', test: 'none', range: 'with or without backing', clause: '6.2.2 i)' });
  return rows;
}

export const RETEST = '6.7: if the welder fails because of conditions beyond the welder\'s control (in the mutual opinion of the company and the contractor), a second opportunity should be given; no further retests until proof of subsequent training acceptable to the company.';

export function validity() {
  return {
    confirm: null,
    rows: [],
    note: 'API 1104 Section 6 sets no expiry period: a welder shall requalify if a question arises about the welder\'s competence (6.8); companies often set their own periods.',
  };
}

// Brief lines: plain strings, or { k, v } templates the interface translates with the values filled in.
export function brief(facts) {
  const lines = [];
  const how = facts.rolled ? 'rolled' : facts.aws === '6G' ? 'fixed with the axis inclined 45° from horizontal' : facts.aws === '5G' ? 'fixed with the axis horizontal' : 'fixed with the axis vertical';
  lines.push({ k: `Test joint: two pipe nipples {D} × {t} mm, ${how} (6.2.1); full circumference welded by one welder.`, v: { D: r1(facts.D), t: r2(facts.t) } });
  lines.push('The welder fits up the test joint (6.1) and follows the WPS; the joint thickness is completed by one welder.');
  lines.push('Acceptable if it meets 6.4 (visual) and either 6.5 (destructive) or 6.6 (radiography); when both are used, failing either fails the test (6.7).');
  return lines;
}
