// Code rule packs and the verdict engine.
//
// Values are taken from the WELL EXPERTS scope document (Rev 0, 13 Oct 2026), which cites:
//  - ISO 5817:2023 Table 1 values checked against the 2023 text; Kiwa ISO 5817:2023 poster agrees
//    except 504 level C (poster examples follow the 2014 value).
//  - ISO 9606-1 clause 7 acceptance (level B; level C for 501, 502, 503, 504, 5214), checked against the
//    licensed ISO 9606-1:2012 (BS EN ISO 9606-1:2017) text supplied by WELL EXPERTS.
//  - AWS D1.1:2020 Table 8.1 values (statically loaded nontubular), short-weld undercut rule from
//    D1.1:2025 Amendment 1 (12 Jan 2026), short-weld porosity factor 0.06 from the Welding Journal
//    review of D1.1:2025 (secondary).
//  - AWS D1.1:2020 welder-test visual criteria (clause 6.10.1) via secondary sources.
//  - API 1104 22nd edition (2021) Section 9 (9.3.10 cracks, 9.7 Table 8 undercut, 9.8.2 internal concavity),
//    checked against the licensed copy supplied by WELL EXPERTS.
// TRAINING RULE PACKS: every value must be verified against licensed copies before any use
// beyond training (scope section "Validation, standards licensing and compliance").

import { clamp } from '../util.js';

export const PROVENANCE = {
  'iso5817-2023': {
    status: 'Checked against the ISO 5817:2023 text; Kiwa poster agrees except 504 level C',
    url: 'https://production.episerver.kiwa.com/globalassets/sweden/svets/svetsaffisch_a3-eng-lathund-iso-5817-250415--digital.pdf',
  },
  'iso9606-1': {
    status: 'Clause 7 acceptance checked against the licensed ISO 9606-1:2012 (BS EN ISO 9606-1:2017) text',
    url: null,
  },
  'aws-d11-static': {
    status: 'D1.1:2020 Table 8.1 values; short-weld rules per D1.1:2025 AMD1 and Welding Journal (secondary). Confirm against licensed D1.1:2025 + AMD1',
    url: 'https://pubs.aws.org/Download_PDFS/D1.1-D1.1M-2025-AMD1_PV.pdf',
  },
  'aws-d11-wq': {
    status: 'D1.1:2020 clause 6.10.1 via Material Welding and Welding Answers (secondary); D1.1:2025 clause 6.23 values unconfirmed',
    url: 'https://materialwelding.com/welder-qualification-test-wqt-acceptance-criteria-as-per-aws-d1-1/',
  },
  'api1104': {
    status: 'API Std 1104 22nd edition (2021) 9.3.10, 9.7 Table 8 and 9.8.2, checked against the licensed copy. API 1104 governs pipeline girth welds; applied to plate here for training only',
    url: null,
  },
};

export const PACKS = [
  { id: 'iso5817-2023', title: 'ISO 5817:2023', levels: ['B', 'C', 'D'] },
  { id: 'iso9606-1', title: 'ISO 9606-1 welder test', levels: ['test'] },
  { id: 'aws-d11-static', title: 'AWS D1.1 Table 8.1, statically loaded', levels: ['static'] },
  { id: 'aws-d11-wq', title: 'AWS D1.1 welder test, visual', levels: ['test'] },
  { id: 'api1104', title: 'API 1104 visual, 22nd ed. (training)', levels: ['visual'] },
];

// ---- helpers -----------------------------------------------------------------------------------

const NP = 'Not permitted';

// Group contiguous samples where `pred(i)` holds into segments with max value.
function segments(rows, valueOf, pred) {
  const segs = [];
  let cur = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const v = r ? valueOf(r, i) : 0;
    if (r && pred(v, r, i)) {
      if (!cur) cur = { s0: i, s1: i + 1, max: v, at: i };
      else { cur.s1 = i + 1; if (v > cur.max) { cur.max = v; cur.at = i; } }
    } else if (cur) {
      segs.push(cur);
      cur = null;
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

// Total length of segments inside the worst window of `win` mm.
function worstWindow(segs, win, L) {
  let worst = 0;
  const starts = segs.map((s) => s.s0);
  for (const a of starts.length ? starts : [0]) {
    const b = a + win;
    let tot = 0;
    for (const s of segs) tot += Math.max(0, Math.min(s.s1, b) - Math.max(s.s0, a));
    worst = Math.max(worst, tot);
  }
  return Math.min(worst, L);
}

// ISO 5817 "short imperfection": total <= 25 mm in any 100 mm, or <= 25% if weld < 100 mm.
function isShortSet(segs, L) {
  if (L < 100) return segs.reduce((a, s) => a + (s.s1 - s.s0), 0) <= 0.25 * L;
  return worstWindow(segs, 100, L) <= 25;
}

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

function mk(pack, ref, name, seg, measured, unit, limit, limitText, ok, opts = {}) {
  return {
    pack, ref, name,
    s0: seg ? seg.s0 : opts.s ?? null,
    s1: seg ? seg.s1 : opts.s != null ? opts.s + 1 : null,
    measured, unit, limit, limitText,
    verdict: ok ? 'accept' : 'reject',
    clause: opts.clause || '',
    visual: opts.visual !== false,
    note: opts.note || '',
  };
}

// ---- ISO 5817:2023 -----------------------------------------------------------------------------

const ISO = {
  undercut: { B: [0.05, 0.5], C: [0.1, 0.5], D: [0.2, 1.0] }, // h <= k*t, max
  excess502: { B: [0.1, 5], C: [0.15, 7], D: [0.25, 10] }, // h <= 1 + k*b, max
  convex503: { B: [0.1, 3], C: [0.15, 4], D: [0.25, 5] },
  pen504: { B: [0.2, 3], C: [0.45, 4], D: [1.0, 5] },
  toeButt: { B: 150, C: 110, D: 90 },
  toeFillet: { B: 110, C: 100, D: 90 },
  pore2017: { B: null, C: [0.2, 2], D: [0.3, 3] },
  crater2025: { B: null, C: { h: [0.1, 1], d: [0.2, 2] }, D: { h: [0.2, 2], d: [0.3, 3] } },
  fill511: { B: [0.05, 0.5], C: [0.1, 1], D: [0.25, 2] }, // short imperfections
  throat5213: { B: null, C: 1, D: 2 }, // h <= 0.1a + 0.3, max ; short imperfections
  throat5214: { B: [0.15, 3], C: [0.2, 4], D: null }, // D permitted
  misalign5071: { B: [0.1, 3], C: [0.15, 4], D: [0.25, 5] },
  porePore: { B: [0.2, 3], C: [0.3, 4], D: [0.4, 5] }, // 2011/2012 single pore
  poreArea: { B: [1, 2], C: [1.5, 3], D: [2.5, 5] }, // % single-layer / multi-layer
  slag301: { B: { h: [0.2, 2], l: 25 }, C: { h: [0.3, 3], l: 50 }, D: { h: [0.4, 4], l: 75 } },
  lof401Internal: { D: [0.4, 4] }, // short imperfections, internal only
  // root side of a weld made from one side without backing (open root, pipe)
  concave515: { B: [0.05, 0.5], C: [0.1, 1], D: [0.2, 2] }, // short imperfections: h <= k*t, max
  rootPen4021: { B: null, C: null, D: [0.2, 2] }, // B, C not permitted; D short imperfections h <= 0.2t, max 2
};

// Level map for ISO 9606-1: level B except 501, 502, 503, 504, 5214 at level C (clause 7).
function levelFor(packId, level, ref) {
  if (packId !== 'iso9606-1') return level;
  return ['5011', '5012', '502', '503', '504', '5214'].includes(ref) ? 'C' : 'B';
}

function evalISO(sum, packId, level, opts) {
  const j = sum.joint;
  const t = j.t;
  const L = j.L;
  const rows = sum.rows;
  const fillet = j.type === 'fillet';
  const name = packId === 'iso9606-1' ? 'ISO 9606-1' : `ISO 5817:2023 ${level}`;
  const F = [];
  const info = [];
  const lv = (ref) => levelFor(packId, level, ref);
  const clause = (ref) => (packId === 'iso9606-1' ? `cl. 7 → ISO 5817 level ${lv(ref)}, ref. ${ref}` : `Table 1, ref. ${ref}`);
  const visualOnly = opts.mode === 'visual';
  // a root-pass coupon (open root, the root run is the whole job): the root side and the run itself are
  // judged; the weld face (cap height, filling, toes, undercut and overlap of a cap) is not there yet
  const rootOnly = !!(j.openRoot && j.passPlan && j.passPlan.length === 1);

  // 100 / 104 cracks
  for (const st of sum.stops) {
    if (st.top && st.crack) F.push(mk(name, '104', 'Crater crack', null, st.crackLen, 'mm', 0, NP, false, { s: Math.round(st.s), clause: clause('104') }));
  }
  for (const it of sum.internal) {
    if (it.type === 'crack' && (it.surface || !visualOnly)) {
      F.push(mk(name, '101', 'Longitudinal crack', { s0: it.s, s1: it.s + 1 }, 1, 'mm', 0, NP, false, { clause: clause('101'), visual: !!it.surface }));
    }
  }

  // 5011 / 5012 undercut
  if (!rootOnly) {
    const [k, mx] = ISO.undercut[lv('5011')];
    const lim = Math.min(k * t, mx);
    const segs = segments(rows, (r) => Math.max(r.uc1 || 0, r.uc2 || 0), (v) => v > lim);
    for (const sg of segs) F.push(mk(name, '5011', 'Undercut', sg, sg.max, 'mm', lim, `h ≤ ${k}t, max ${mx} mm`, false, { clause: clause('5011') }));
  }

  if (fillet) {
    // 503 excessive convexity
    const [k, mx] = ISO.convex503[lv('503')];
    const segs = segments(rows, (r) => Math.max(0, r.c) - Math.min(1 + k * r.b, mx), (v) => v > 0);
    for (const sg of segs) {
      const r = rows[sg.at];
      F.push(mk(name, '503', 'Excessive convexity', sg, r.c, 'mm', Math.min(1 + k * r.b, mx), `h ≤ 1 mm + ${k}b, max ${mx} mm`, false, { clause: clause('503') }));
    }
    // 5213 insufficient throat (short imperfections only)
    {
      const mxT = ISO.throat5213[lv('5213')];
      const hOf = (r) => j.aNom - r.aA;
      const segsAll = segments(rows, hOf, (v) => v > 0.05);
      if (mxT === null) {
        for (const sg of segsAll) F.push(mk(name, '5213', 'Insufficient throat', sg, sg.max, 'mm', 0, NP, false, { clause: clause('5213') }));
      } else {
        const lim = Math.min(0.1 * j.aNom + 0.3, mxT);
        const over = segments(rows, hOf, (v) => v > lim);
        const short = isShortSet(segsAll, L);
        for (const sg of over) F.push(mk(name, '5213', 'Insufficient throat', sg, sg.max, 'mm', lim, `Short: h ≤ 0.1a + 0.3 mm, max ${mxT} mm`, false, { clause: clause('5213') }));
        if (!short && segsAll.length) {
          const tot = segsAll.reduce((a, s) => a + s.s1 - s.s0, 0);
          F.push(mk(name, '5213', 'Insufficient throat (not short)', segsAll[0], tot, 'mm length', 25, 'Only short imperfections permitted (≤ 25 mm per 100 mm)', false, { clause: clause('5213') }));
        }
      }
    }
    // 5214 excessive throat
    {
      const p = ISO.throat5214[lv('5214')];
      if (p) {
        const lim = Math.min(1 + p[0] * j.aNom, p[1]);
        const segs = segments(rows, (r) => r.aA - j.aNom, (v) => v > lim);
        for (const sg of segs) F.push(mk(name, '5214', 'Excessive throat', sg, sg.max, 'mm', lim, `h ≤ 1 mm + ${p[0]}a, max ${p[1]} mm`, false, { clause: clause('5214') }));
      }
    }
  } else if (!rootOnly) {
    // 502 excess weld metal (cap)
    const [k, mx] = ISO.excess502[lv('502')];
    const segs = segments(rows, (r) => (r.h > 0 && r.wcap ? r.h - Math.min(1 + k * r.wcap, mx) : -1), (v) => v > 0);
    for (const sg of segs) {
      const r = rows[sg.at];
      F.push(mk(name, '502', 'Excess weld metal', sg, r.h, 'mm', Math.min(1 + k * r.wcap, mx), `h ≤ 1 mm + ${k}b, max ${mx} mm`, false, { clause: clause('502') }));
    }
    // 511 incompletely filled groove (short imperfections only)
    {
      const [kk, mxx] = ISO.fill511[lv('511')];
      const lim = Math.min(kk * t, mxx);
      const all = segments(rows, (r) => r.fill || 0, (v) => v > 0.05);
      const missing = [];
      for (let i = 0; i < rows.length; i++) if (!rows[i]) missing.push(i);
      const over = segments(rows, (r) => r.fill || 0, (v) => v > lim);
      for (const sg of over) F.push(mk(name, '511', 'Incompletely filled groove', sg, sg.max, 'mm', lim, `Short: h ≤ ${kk}t, max ${mxx} mm`, false, { clause: clause('511') }));
      if (all.length && !isShortSet(all, L)) {
        const tot = all.reduce((a, s) => a + s.s1 - s.s0, 0);
        F.push(mk(name, '511', 'Incompletely filled groove (not short)', all[0], tot, 'mm length', 25, 'Only short imperfections permitted (≤ 25 mm per 100 mm)', false, { clause: clause('511') }));
      }
      if (missing.length) {
        F.push(mk(name, '511', 'Unwelded length', { s0: missing[0], s1: missing[missing.length - 1] + 1 }, missing.length, 'mm', 0, 'Joint not welded', false, { clause: clause('511') }));
      }
    }
    // 5071 linear misalignment
    if (j.misalignment > 0) {
      const [k, mx] = ISO.misalign5071[lv('5071')];
      const lim = Math.min(k * t, mx);
      F.push(mk(name, '5071', 'Linear misalignment', { s0: 0, s1: L }, j.misalignment, 'mm', lim, `h ≤ ${k}t, max ${mx} mm`, j.misalignment <= lim, { clause: clause('5071') }));
    }
  }
  if (fillet) {
    const missing = [];
    for (let i = 0; i < rows.length; i++) if (!rows[i]) missing.push(i);
    if (missing.length) F.push(mk(name, '5213', 'Unwelded length', { s0: missing[0], s1: missing[missing.length - 1] + 1 }, missing.length, 'mm', 0, 'Joint not welded', false, { clause: clause('5213') }));
  }

  // Root side of an open-root weld (pipe, welded from one side without backing): seen from inside the
  // pipe. 504 excessive penetration, 515 root concavity, 510 burn-through, 4021 incomplete root penetration.
  if (sum.rootRows) {
    const rr = sum.rootRows;
    {
      const [k, mx] = ISO.pen504[lv('504')];
      const segs = segments(rr, (r) => (r.rootH > 0 ? r.rootH - Math.min(1 + k * r.rootW, mx) : -1), (v) => v > 0);
      for (const sg of segs) {
        const r = rr[sg.at];
        F.push(mk(name, '504', 'Excessive penetration', sg, r.rootH, 'mm', Math.min(1 + k * r.rootW, mx), `h ≤ 1 mm + ${k}b, max ${mx} mm`, false, { clause: clause('504'), note: 'root side' }));
      }
    }
    {
      const [k, mx] = ISO.concave515[lv('515')];
      const lim = Math.min(k * t, mx);
      const depth = (r) => (r.rootH < 0 ? -r.rootH : 0);
      const all = segments(rr, depth, (v) => v > 0.05);
      for (const sg of segments(rr, depth, (v) => v > lim)) F.push(mk(name, '515', 'Root concavity', sg, sg.max, 'mm', lim, `Short: h ≤ ${k}t, max ${mx} mm`, false, { clause: clause('515'), note: 'root side' }));
      if (all.length && !isShortSet(all, L)) {
        const tot = all.reduce((a, q) => a + q.s1 - q.s0, 0);
        F.push(mk(name, '515', 'Root concavity (not short)', all[0], tot, 'mm length', 25, 'Only short imperfections permitted (≤ 25 mm per 100 mm)', false, { clause: clause('515') }));
      }
    }
    for (const sg of segments(rr, (r) => r.burn || 0, (v) => v > 0)) F.push(mk(name, '510', 'Burn-through', sg, 1, '', 0, NP, false, { clause: clause('510'), note: 'root side' }));
    {
      const p = ISO.rootPen4021[lv('4021')];
      const all = segments(rr, (r) => r.lop || 0, (v) => v > 0);
      const short = isShortSet(all, L);
      for (const sg of all) {
        const lim = p ? Math.min(p[0] * t, p[1]) : 0;
        const ok = !!p && short && sg.max <= lim;
        F.push(mk(name, '4021', 'Incomplete root penetration', sg, sg.max, 'mm', lim, p ? `Short: h ≤ ${p[0]}t, max ${p[1]} mm` : NP, ok, { clause: clause('4021'), note: 'root side' }));
      }
    }
  }

  // 505 incorrect weld toe
  if (!rootOnly) {
    const lim = (fillet ? ISO.toeFillet : ISO.toeButt)[lv('505')];
    const segs = segments(rows, (r) => (r.toe1 != null ? Math.min(r.toe1, r.toe2) : 999), (v) => v < lim);
    for (const sg of segs) {
      let mn = 999;
      for (let i = sg.s0; i < sg.s1; i++) if (rows[i]) mn = Math.min(mn, rows[i].toe1, rows[i].toe2);
      F.push(mk(name, '505', 'Incorrect weld toe', sg, mn, '°', lim, `α ≥ ${lim}°`, false, { clause: clause('505') }));
    }
  }

  // 506 overlap
  if (!rootOnly) {
    const segs = segments(rows, (r) => Math.max(r.ov1 || 0, r.ov2 || 0), (v) => v > 0.2);
    const l = lv('506');
    for (const sg of segs) {
      const r = rows[sg.at];
      const b = fillet ? r.b : r.wcap || r.wb;
      const ok = l === 'D' && sg.max <= 0.2 * b;
      F.push(mk(name, '506', 'Overlap', sg, sg.max, 'mm', l === 'D' ? 0.2 * b : 0, l === 'D' ? 'h ≤ 0.2b' : NP, ok, { clause: clause('506') }));
    }
  }

  // 401 lack of fusion at the surface (cold lap) - not permitted at any level
  {
    const segs = segments(rows, (r) => r.lofSurface || 0, (v) => v > 0);
    for (const sg of segs) F.push(mk(name, '401', 'Lack of fusion (surface)', sg, 1, '', 0, NP, false, { clause: clause('401') }));
  }

  // 2017 surface pore
  {
    const p = ISO.pore2017[lv('2017')];
    for (const po of sum.pores) {
      if (!po.surface) continue;
      const i = clamp(Math.round(po.s), 0, rows.length - 1);
      const ref = fillet ? rows[i]?.aA ?? j.aNom : t;
      const lim = p ? Math.min(p[0] * ref, p[1]) : 0;
      const ok = p ? po.d <= lim : false;
      F.push(mk(name, '2017', 'Surface pore', null, po.d, 'mm', lim, p ? `d ≤ ${p[0]}${fillet ? 'a' : 's'}, max ${p[1]} mm` : NP, ok, { s: Math.round(po.s), clause: clause('2017') }));
    }
  }

  // 2025 end crater pipe
  {
    const p = ISO.crater2025[lv('2025')];
    for (const st of sum.stops) {
      if (!st.top || st.filled) continue;
      const i = clamp(Math.round(st.s), 0, rows.length - 1);
      const ref = fillet ? rows[i]?.aA ?? j.aNom : t;
      let ok = false, lim = 0, txt = NP;
      if (p) {
        const hl = Math.min(p.h[0] * ref, p.h[1]);
        const dl = Math.min(p.d[0] * ref, p.d[1]);
        ok = st.pipe <= hl && st.d <= dl;
        lim = hl;
        txt = `h ≤ ${p.h[0]}${fillet ? 'a' : 's'} max ${p.h[1]} mm; d ≤ ${p.d[0]}${fillet ? 'a' : 's'} max ${p.d[1]} mm`;
      }
      F.push(mk(name, '2025', 'End crater pipe', null, st.pipe, 'mm', lim, txt, ok, { s: Math.round(st.s), clause: clause('2025'), note: `d = ${f1(st.d)} mm` }));
    }
  }

  // 517 poor restart
  for (const rs of sum.restarts) {
    if (rs.gap > 1.0) {
      const ok = lv('517') === 'D';
      F.push(mk(name, '517', 'Poor restart', null, rs.gap, 'mm gap', 0, ok ? 'Permitted; limit set by the resulting imperfection' : NP, ok, { s: Math.round(rs.s), clause: clause('517') }));
    }
  }

  // 601 arc strike
  for (const as of sum.arcStrikes) {
    const ok = lv('601') === 'D';
    F.push(mk(name, '601', 'Arc strike', null, 1, '', 0, ok ? 'Permitted if parent metal properties are unaffected' : NP, ok, { s: Math.round(as.s), clause: clause('601'), note: ok ? 'Check parent metal' : '' }));
  }

  // 602 spatter (information only)
  if (sum.spatter.length) info.push({ ref: '602', name: 'Spatter', text: `${sum.spatter.length} particles; acceptance depends on application (ISO 5817)` });

  // Internal imperfections (radiography / macro), only in full mode
  if (!visualOnly) {
    const pp = ISO.porePore[lv('2011')];
    for (const po of sum.pores) {
      if (po.surface) continue;
      const lim = Math.min(pp[0] * t, pp[1]);
      if (po.d > lim) F.push(mk(name, '2011', 'Gas pore (internal)', null, po.d, 'mm', lim, `d ≤ ${pp[0]}s, max ${pp[1]} mm`, false, { s: Math.round(po.s), clause: clause('2011'), visual: false }));
    }
    const intArea = sum.pores.filter((p) => !p.surface).reduce((a, p) => a + (Math.PI * p.d * p.d) / 4, 0);
    const width = rows.reduce((a, r) => (r ? a + (r.wcap || r.b || r.wb || 0) : a), 0) / Math.max(1, rows.filter(Boolean).length);
    const projArea = Math.max(1, L * width);
    const pct = (100 * intArea) / projArea;
    const [single, multi] = ISO.poreArea[lv('2012')];
    const lim = sum.passes > 1 ? multi : single;
    if (pct > lim) F.push(mk(name, '2012', 'Porosity, projected area', { s0: 0, s1: L }, pct, '%', lim, `${sum.passes > 1 ? 'multi' : 'single'}-layer ≤ ${lim}%`, false, { clause: clause('2012'), visual: false }));

    const lofs = sum.internal.filter((x) => x.type === 'lofRoot' || x.type === 'lofSide' || x.type === 'lofInter');
    if (lofs.length) {
      const segsAll = mergeSegs(lofs);
      const l = lv('401');
      const short = isShortSet(segsAll, L);
      for (const sg of segsAll) {
        let ok = false, limTxt = NP, limV = 0;
        if (l === 'D') {
          limV = Math.min(0.4 * t, 4);
          ok = short && sg.max <= limV;
          limTxt = 'Short: h ≤ 0.4s, max 4 mm';
        }
        F.push(mk(name, '401', `Lack of fusion (${sg.kind})`, sg, sg.max, 'mm', limV, limTxt, ok, { clause: clause('401'), visual: false }));
      }
    }
    const slag = sum.internal.filter((x) => x.type === 'slag');
    if (slag.length) {
      const segsAll = mergeSegs(slag);
      const p = ISO.slag301[lv('301')];
      for (const sg of segsAll) {
        const hl = Math.min(p.h[0] * t, p.h[1]);
        const ll = Math.min(t, p.l);
        const ok = sg.max <= hl && sg.s1 - sg.s0 <= ll;
        F.push(mk(name, '301', 'Slag inclusion', sg, sg.max, 'mm', hl, `h ≤ ${p.h[0]}s max ${p.h[1]} mm; l ≤ s max ${p.l} mm`, ok, { clause: clause('301'), visual: false, note: `l = ${sg.s1 - sg.s0} mm` }));
      }
    }
    // GTAW tungsten inclusions: reported, not judged (the metallic-inclusion limits have not been checked
    // against the code text in this build)
    const tung = sum.internal.filter((x) => x.type === 'tungsten');
    if (tung.length) info.push({ ref: '–', name: 'Tungsten inclusion', text: `${tung.length} at ${tung.map((x) => Math.round(x.s)).join(', ')} mm; not judged in this build (limit not verified)` });
  }

  return finish(packId, name, level, F, info, [], visualOnly);
}

function mergeSegs(items) {
  const byS = items.slice().sort((a, b) => a.s - b.s);
  const segs = [];
  let cur = null;
  for (const it of byS) {
    if (cur && it.s <= cur.s1 + 1) {
      cur.s1 = Math.max(cur.s1, it.s + 1);
      cur.max = Math.max(cur.max, it.h);
      if (!cur.kinds.includes(it.type)) cur.kinds.push(it.type);
    } else {
      if (cur) segs.push(cur);
      cur = { s0: it.s, s1: it.s + 1, max: it.h, kinds: [it.type] };
    }
  }
  if (cur) segs.push(cur);
  const kindName = { lofRoot: 'root', lofSide: 'side wall', lofInter: 'inter-run', slag: 'slag' };
  for (const s of segs) s.kind = s.kinds.map((k) => kindName[k] || k).join(', ');
  return segs;
}

// ---- AWS D1.1 Table 8.1, statically loaded nontubular ------------------------------------------

function evalAWSStatic(sum, opts) {
  const j = sum.joint;
  const L = j.L;
  const rows = sum.rows;
  const name = 'AWS D1.1 Table 8.1 (static)';
  const F = [];
  const notEval = [
    'Weld profiles (reinforcement, convexity): Table 8.1 refers to the fabrication clause; values not loaded',
    'Arc strikes: not a Table 8.1 item; fabrication clause not loaded',
  ];
  // (1) Crack prohibition
  for (const st of sum.stops) if (st.top && st.crack) F.push(mk(name, '(1)', 'Crack (crater)', null, st.crackLen, 'mm', 0, 'Any crack unacceptable', false, { s: Math.round(st.s), clause: 'Table 8.1 (1)' }));
  for (const it of sum.internal) if (it.type === 'crack' && it.surface) F.push(mk(name, '(1)', 'Crack', { s0: it.s, s1: it.s + 1 }, 1, '', 0, 'Any crack unacceptable', false, { clause: 'Table 8.1 (1)' }));
  // (2) Weld/base-metal fusion (visible)
  for (const sg of segments(rows, (r) => r.lofSurface || 0, (v) => v > 0)) F.push(mk(name, '(2)', 'Incomplete fusion (surface)', sg, 1, '', 0, 'Complete fusion required', false, { clause: 'Table 8.1 (2)' }));
  // (3) Crater cross-section
  for (const st of sum.stops) if (st.top && !st.filled) F.push(mk(name, '(3)', 'Unfilled crater', null, st.pipe, 'mm', 0, 'Craters filled to the specified weld size', false, { s: Math.round(st.s), clause: 'Table 8.1 (3)' }));
  // Unwelded length
  const missing = rows.reduce((a, r) => a + (r ? 0 : 1), 0);
  if (missing) F.push(mk(name, '(3)', 'Weld size not provided (unwelded length)', null, missing, 'mm', 0, 'Specified weld size required', false, { s: rows.findIndex((r) => !r), clause: 'Table 8.1' }));
  // (6) Undersized fillet welds
  if (j.type === 'fillet') {
    const Lnom = j.leg;
    const Umax = Lnom <= 5 ? 2 : Lnom < 8 ? 2.5 : 3;
    const under = (r) => Lnom - Math.min(r.z1, r.z2);
    const over = segments(rows, under, (v) => v > Umax);
    for (const sg of over) F.push(mk(name, '(6)', 'Undersized fillet', sg, sg.max, 'mm', Umax, `U ≤ ${Umax} mm for L = ${Lnom} mm`, false, { clause: 'Table 8.1 (6)' }));
    const anyUnder = segments(rows, under, (v) => v > 0.05);
    const tot = anyUnder.reduce((a, s) => a + s.s1 - s.s0, 0);
    if (tot > 0.1 * L) F.push(mk(name, '(6)', 'Undersize length over 10%', anyUnder[0], tot, 'mm', 0.1 * L, 'Undersize portion ≤ 10% of weld length', false, { clause: 'Table 8.1 (6)' }));
  }
  // (7)(A) Undercut, material < 1 in [25 mm]
  {
    const uc = (r) => Math.max(r.uc1 || 0, r.uc2 || 0);
    for (const sg of segments(rows, uc, (v) => v > 2.0)) F.push(mk(name, '(7)', 'Undercut over 2 mm', sg, sg.max, 'mm', 2, '≤ 1/16 in [2 mm] at any length', false, { clause: 'Table 8.1 (7)(A)' }));
    const mid = segments(rows, uc, (v) => v > 1.0 && v <= 2.0);
    const allow = L < 300 ? 0.16 * L : 50;
    const acc = L < 300 ? mid.reduce((a, s) => a + s.s1 - s.s0, 0) : worstWindow(mid, 300, L);
    if (mid.length) {
      const ok = acc <= allow;
      F.push(mk(name, '(7)', 'Undercut 1–2 mm, accumulated length', mid[0], acc, 'mm', allow,
        L < 300 ? `≤ weld length × 0.16 (${f1(allow)} mm) for welds < 300 mm (D1.1:2025 AMD1)` : '≤ 2 in [50 mm] in any 12 in [300 mm]', ok, { clause: 'Table 8.1 (7)(A)(1)' }));
    }
  }
  // (8)(A) Porosity, statically loaded
  {
    const sp = sum.pores.filter((p) => p.surface && p.d >= 1.0);
    if (j.type === 'butt' && opts.cjpTransverse !== false) {
      for (const p of sum.pores.filter((p) => p.surface)) F.push(mk(name, '(8)', 'Visible porosity, CJP butt transverse to stress', null, p.d, 'mm', 0, 'No visible piping porosity', false, { s: Math.round(p.s), clause: 'Table 8.1 (8)(A)' }));
    } else if (sp.length) {
      let worst25 = 0;
      for (const p of sp) {
        const sumD = sp.filter((q) => q.s >= p.s && q.s < p.s + 25).reduce((a, q) => a + q.d, 0);
        worst25 = Math.max(worst25, sumD);
      }
      const total = sp.reduce((a, q) => a + q.d, 0);
      const allowL = L < 300 ? 0.06 * L : 20;
      F.push(mk(name, '(8)', 'Visible porosity ≥ 1 mm, per 25 mm', null, worst25, 'mm', 10, 'Σd ≤ 3/8 in [10 mm] in any 1 in [25 mm]', worst25 <= 10, { s: Math.round(sp[0].s), clause: 'Table 8.1 (8)(A)' }));
      F.push(mk(name, '(8)', 'Visible porosity ≥ 1 mm, weld length', null, total, 'mm', allowL, L < 300 ? `≤ weld length × 0.06 (${f1(allowL)} mm) for welds < 300 mm (secondary source)` : 'Σd ≤ 3/4 in [20 mm] in any 12 in [300 mm]', total <= allowL, { s: Math.round(sp[0].s), clause: 'Table 8.1 (8)(A)' }));
    }
  }
  return finish('aws-d11-static', name, 'static', F, [], notEval, true);
}

// ---- AWS D1.1 welder test, visual (2020 clause 6.10.1, secondary) -----------------------------

function evalAWSWQ(sum) {
  const j = sum.joint;
  const rows = sum.rows;
  const name = 'AWS D1.1 welder test, visual';
  const F = [];
  for (const st of sum.stops) {
    if (st.top && st.crack) F.push(mk(name, 'crack', 'Crack', null, st.crackLen, 'mm', 0, 'No cracks', false, { s: Math.round(st.s), clause: '6.10.1 (2020)' }));
    if (st.top && !st.filled) F.push(mk(name, 'crater', 'Unfilled crater', null, st.pipe, 'mm', 0, 'Craters filled', false, { s: Math.round(st.s), clause: '6.10.1 (2020)' }));
  }
  for (const it of sum.internal) if (it.type === 'crack' && it.surface) F.push(mk(name, 'crack', 'Crack', { s0: it.s, s1: it.s + 1 }, 1, '', 0, 'No cracks', false, { clause: '6.10.1 (2020)' }));
  const uc = (r) => Math.max(r.uc1 || 0, r.uc2 || 0);
  for (const sg of segments(rows, uc, (v) => v > 1.0)) F.push(mk(name, 'undercut', 'Undercut', sg, sg.max, 'mm', 1, '≤ 1/32 in [1 mm]', false, { clause: '6.10.1 (2020)' }));
  if (j.type === 'butt') {
    for (const sg of segments(rows, (r) => r.h || 0, (v) => v > 3.0)) F.push(mk(name, 'reinf', 'Face reinforcement', sg, sg.max, 'mm', 3, '≤ 1/8 in [3 mm]', false, { clause: '6.10.1 (2020)' }));
  }
  for (const sg of segments(rows, (r) => r.lofSurface || 0, (v) => v > 0)) F.push(mk(name, 'fusion', 'Incomplete fusion (surface)', sg, 1, '', 0, 'Not permitted', false, { clause: '6.10.1 (2020)' }));
  return finish('aws-d11-wq', name, 'test', F, [], ['Bend tests (6.10.3.3) arrive with Phase 2 virtual testing'], true);
}

// ---- API 1104 22nd edition, visual acceptance of Section 9 (training application to plate) ---------
// 9.7.2 Table 8 undercut (same values as the 19th edition), 9.3.10 cracks (a crater or star crack up to 5/32 in
// [4 mm] only), 9.8.2 internal concavity seen visually: a defect where deeper than the cap height there.

function evalAPI(sum) {
  const j = sum.joint;
  const t = j.t;
  const L = j.L;
  const rows = sum.rows;
  const name = 'API 1104 (22nd ed.)';
  const F = [];
  const rej = Math.min(0.8, 0.125 * t);
  const low = Math.min(0.4, 0.06 * t);
  const uc = (r) => Math.max(r.uc1 || 0, r.uc2 || 0);
  for (const sg of segments(rows, uc, (v) => v > rej)) F.push(mk(name, 'EU', 'External undercut, deep', sg, sg.max, 'mm', rej, `> 1/32 in [0.8 mm] or > 12.5% wall (smaller) not acceptable`, false, { clause: '9.7.2, Table 8' }));
  const mid = segments(rows, uc, (v) => v > low && v <= rej);
  if (mid.length) {
    const acc = L < 300 ? mid.reduce((a, s) => a + s.s1 - s.s0, 0) : worstWindow(mid, 300, L);
    const allow = Math.min(L < 300 ? (50 * L) / 300 : 50, L / 6);
    F.push(mk(name, 'EU', 'External undercut, intermediate depth', mid[0], acc, 'mm', allow, '≤ 2 in [50 mm] per 12 in [300 mm] or 1/6 of weld length (smaller)', acc <= allow, { clause: '9.7.2, Table 8' }));
  }
  for (const st of sum.stops) {
    if (st.top && st.crack) {
      const ok = st.crackLen <= 4;
      F.push(mk(name, 'C', 'Crater crack', null, st.crackLen, 'mm', 4, 'Crater or star crack ≤ 5/32 in [4 mm]; any other crack not acceptable', ok, { s: Math.round(st.s), clause: '9.3.10' }));
    }
  }
  for (const it of sum.internal) if (it.type === 'crack' && it.surface) F.push(mk(name, 'C', 'Crack', { s0: it.s, s1: it.s + 1 }, 1, '', 0, 'Not acceptable (not a crater or star crack)', false, { clause: '9.3.10' }));
  // 9.8.2: internal concavity of any length is a defect where it is deeper than the cap height at the same place
  if (sum.rootRows) {
    const capH = (i) => (rows[i] && rows[i].h > 0 ? rows[i].h : 0);
    const deep = segments(sum.rootRows, (r, i) => (r.rootH < 0 ? -r.rootH - capH(i) : -1), (v) => v > 0);
    for (const sg of deep) {
      const r = sum.rootRows[sg.at];
      F.push(mk(name, 'IC', 'Internal concavity deeper than the cap', sg, -r.rootH, 'mm', capH(sg.at), 'depth ≤ cap height at the same location', false, { clause: '9.8.2', note: 'root side' }));
    }
  }
  return finish('api1104', name, 'visual', F, [], ['Radiographic criteria (9.3): Welder qualification mode (simulated radiography)'], true);
}

function finish(id, name, level, findings, info, notEvaluated, visualOnly) {
  const visibleFindings = visualOnly ? findings.filter((f) => f.visual) : findings;
  const verdict = visibleFindings.some((f) => f.verdict === 'reject') ? 'reject' : 'accept';
  return { id, name, level, verdict, findings: visibleFindings, info, notEvaluated, provenance: PROVENANCE[id], visualOnly };
}

// Evaluate a weld summary against a pack.
//   opts.mode: 'visual' (surface only) or 'full' (adds internal imperfections the model knows)
export function evaluate(sum, packId, level, opts = {}) {
  switch (packId) {
    case 'iso5817-2023': return evalISO(sum, packId, level || 'C', opts);
    case 'iso9606-1': return evalISO(sum, packId, 'test', opts);
    case 'aws-d11-static': return evalAWSStatic(sum, opts);
    case 'aws-d11-wq': return evalAWSWQ(sum, opts);
    case 'api1104': return evalAPI(sum, opts);
    default: throw new Error(`Unknown pack ${packId}`);
  }
}

// Limit values exposed for the rule-pack viewer and tests.
export const ISO_LIMITS = ISO;
export function isoUndercutLimit(t, level) {
  const [k, mx] = ISO.undercut[level];
  return Math.min(k * t, mx);
}
