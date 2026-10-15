// "Ground truth" list of visible imperfections on a coupon, independent of any code's limits,
// used to score an inspector's findings. Detection thresholds are SME placeholders: they describe
// what a careful inspector with gauges can reasonably see and measure.

import { clamp } from '../sim/util.js';

export const FINDING_TYPES = [
  { ref: '101', name: 'Crack (longitudinal)', fam: 'crack' },
  { ref: '104', name: 'Crater crack', fam: 'crack' },
  { ref: '2017', name: 'Surface pore', fam: 'pore' },
  { ref: '2025', name: 'End crater pipe', fam: 'crater' },
  { ref: '401', name: 'Lack of fusion (surface)', fam: 'lof' },
  { ref: '5011', name: 'Continuous undercut', fam: 'uc' },
  { ref: '5012', name: 'Intermittent undercut', fam: 'uc' },
  { ref: '502', name: 'Excess weld metal', fam: 'excess' },
  { ref: '503', name: 'Excessive convexity', fam: 'excess' },
  { ref: '506', name: 'Overlap', fam: 'ov' },
  { ref: '511', name: 'Incompletely filled groove', fam: 'underfill' },
  { ref: '5213', name: 'Insufficient throat', fam: 'throatLow' },
  { ref: '5214', name: 'Excessive throat', fam: 'throatHigh' },
  { ref: '517', name: 'Poor restart', fam: 'restart' },
  { ref: '601', name: 'Arc strike', fam: 'strike' },
  { ref: '602', name: 'Spatter', fam: 'spatter' },
];

export const FAMILY = Object.fromEntries(FINDING_TYPES.map((f) => [f.ref, f.fam]));

const TH = {
  undercut: 0.3, // mm depth
  overlap: 0.3,
  pore: 0.4, // mm diameter
  spatterPer100: 40, // particles per 100 mm considered "spatter present" (SME placeholder)
};

function segs(rows, val, pred, gap = 3) {
  const out = [];
  let cur = null;
  rows.forEach((r, i) => {
    const v = r ? val(r) : 0;
    if (r && pred(v)) {
      if (cur && i - cur.s1 <= gap) {
        cur.s1 = i + 1;
        if (v > cur.max) cur.max = v;
      } else {
        if (cur) out.push(cur);
        cur = { s0: i, s1: i + 1, max: v };
      }
    }
  });
  if (cur) out.push(cur);
  return out;
}

export function inventory(rec) {
  const sum = rec.summary();
  const j = sum.joint;
  const rows = sum.rows;
  const items = [];
  const add = (ref, name, s0, s1, size, unit, extra = {}) => items.push({ ref, fam: FAMILY[ref], name, s0, s1, size, unit, ...extra });
  for (const sg of segs(rows, (r) => Math.max(r.uc1 || 0, r.uc2 || 0), (v) => v >= TH.undercut)) add('5011', 'Undercut', sg.s0, sg.s1, sg.max, 'mm');
  for (const sg of segs(rows, (r) => Math.max(r.ov1 || 0, r.ov2 || 0), (v) => v >= TH.overlap)) add('506', 'Overlap', sg.s0, sg.s1, sg.max, 'mm');
  for (const sg of segs(rows, (r) => r.lofSurface || 0, (v) => v > 0)) add('401', 'Lack of fusion (surface)', sg.s0, sg.s1, null, '');
  // pores grouped within 10 mm
  const sp = sum.pores.filter((p) => p.surface && p.d >= TH.pore).sort((a, b) => a.s - b.s);
  let g = null;
  for (const p of sp) {
    if (g && p.s - g.s1 <= 10) {
      g.s1 = p.s + 1;
      g.size = Math.max(g.size, p.d);
      g.count++;
    } else {
      if (g) items.push(g);
      g = { ref: '2017', fam: 'pore', name: 'Surface pore', s0: p.s, s1: p.s + 1, size: p.d, unit: 'mm', count: 1 };
    }
  }
  if (g) items.push(g);
  for (const st of sum.stops) {
    if (!st.top || st.filled) continue;
    add('2025', 'End crater pipe', st.s - st.d / 2, st.s + st.d / 2, st.pipe, 'mm');
    if (st.crack) add('104', 'Crater crack', st.s - 1, st.s + 1, st.crackLen, 'mm');
  }
  const cracks = sum.internal.filter((x) => x.type === 'crack' && x.surface).map((x) => x.s).sort((a, b) => a - b);
  let c0 = null, c1 = null;
  for (const s of cracks) {
    if (c0 !== null && s - c1 <= 3) c1 = s + 1;
    else {
      if (c0 !== null) add('101', 'Crack (longitudinal)', c0, c1, c1 - c0, 'mm long');
      c0 = s;
      c1 = s + 1;
    }
  }
  if (c0 !== null) add('101', 'Crack (longitudinal)', c0, c1, c1 - c0, 'mm long');
  for (const as of sum.arcStrikes) add('601', 'Arc strike', as.s - 2, as.s + 2, null, '');
  for (const rs of sum.restarts) if (rs.gap > 1.0) add('517', 'Poor restart', rs.s - 2, rs.s + 2, rs.gap, 'mm');
  if (j.type === 'fillet') {
    for (const sg of segs(rows, (r) => r.c - Math.min(1 + 0.15 * r.b, 4), (v) => v > 0)) add('503', 'Excessive convexity', sg.s0, sg.s1, rows[clamp(sg.s0, 0, rows.length - 1)]?.c ?? null, 'mm');
    for (const sg of segs(rows, (r) => j.aNom - r.aA, (v) => v > 0.3)) add('5213', 'Insufficient throat', sg.s0, sg.s1, sg.max, 'mm');
    for (const sg of segs(rows, (r) => r.aA - j.aNom - Math.min(1 + 0.2 * j.aNom, 4), (v) => v > 0)) add('5214', 'Excessive throat', sg.s0, sg.s1, null, 'mm');
  } else {
    for (const sg of segs(rows, (r) => (r.h > 0 && r.wcap ? r.h - Math.min(1 + 0.15 * r.wcap, 7) : -1), (v) => v > 0)) {
      let mx = 0;
      for (let i = sg.s0; i < sg.s1; i++) if (rows[i]) mx = Math.max(mx, rows[i].h);
      add('502', 'Excess weld metal', sg.s0, sg.s1, mx, 'mm');
    }
    for (const sg of segs(rows, (r) => r.fill || 0, (v) => v > 0.5)) add('511', 'Incompletely filled groove', sg.s0, sg.s1, sg.max, 'mm');
  }
  const spatPer100 = (sum.spatter.length / Math.max(1, j.L)) * 100;
  if (spatPer100 >= TH.spatterPer100) add('602', 'Spatter', 0, j.L, Math.round(spatPer100), 'per 100 mm');
  return { items, sum };
}

// Score an inspector's findings against the inventory and the code verdict.
// findings: [{ref, s, size}], decision: 'accept'|'reject', truth: {items}, verdict: 'accept'|'reject'
export function scoreInspection(findings, decision, truth, verdict) {
  const matched = new Set();
  const results = findings.map((f) => {
    const fam = FAMILY[f.ref];
    let best = null;
    truth.items.forEach((it, k) => {
      if (it.fam !== fam || matched.has(k)) return;
      const d = f.s == null ? 0 : f.s < it.s0 ? it.s0 - f.s : f.s > it.s1 ? f.s - it.s1 : 0;
      if (d <= 10 && (!best || d < best.d)) best = { k, d };
    });
    if (!best) return { ...f, match: null };
    matched.add(best.k);
    const it = truth.items[best.k];
    const err = f.size != null && it.size != null ? Math.abs(f.size - it.size) : null;
    const tol = it.unit === 'mm' ? Math.max(0.2, 0.15 * (it.size || 0)) : Infinity;
    return { ...f, match: it, err, sizeOk: err == null ? null : err <= tol };
  });
  const missed = truth.items.filter((_, k) => !matched.has(k));
  const detection = truth.items.length ? matched.size / truth.items.length : 1;
  const falseCalls = results.filter((r) => !r.match).length;
  const sized = results.filter((r) => r.sizeOk != null);
  const sizing = sized.length ? sized.filter((r) => r.sizeOk).length / sized.length : null;
  const decisionOk = decision === verdict;
  return { results, missed, detection, falseCalls, sizing, decisionOk };
}
