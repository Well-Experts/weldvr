// Imperfection map of a finished weld, in joint-local millimetres, for the simulated qualification tests
// (radiography, bend, fracture and macro specimens).
//
// The weld record keeps each imperfection per 1 mm sample and pass (record.js); the macro section
// (render/section.js) draws where each one lies in the cross-section. This module places them the same
// way, so that the film, the bent specimens, the fracture faces and the macro sections all show the same
// weld:
//   s  along the weld (physical sample coordinate, 0..L; periodic on a pipe)
//   u  across the joint (butt: -u first plate, +u second; centre of the gap at 0)
//   v  through the thickness (butt: 0 at the plate face or pipe outside surface, -t at the root side)
// Fillet welds use the macro section's frame instead: p along the base plate surface from the corner and
// q up the web surface (stored in u and v, with fillet: true).
//
// Types and what they are (ISO 6520-1 reference numbers as ISO 5817 uses them):
//   pore 2011 (2017 at the surface), slag 301, tungsten 3041 (metallic inclusion), lofSide 4011, lofInter
//   4012, lofRoot 4013 (root of a butt weld; root of a fillet weld), lop 4021 incomplete root penetration
//   (open root), crack 1011 (longitudinal, weld metal), craterCrack 104, burn 510 burn-through, concavity
//   515 root concavity, undercut 5011, lofSurface 401 at the surface (cold lap at a cap toe).

import { grooveWidthAt, levelForArea } from '../sim/joint.js';
import { clamp, rng, hashSeed } from '../sim/util.js';

export const ISO_REF = {
  pore: '2011', slag: '301', tungsten: '3041', lofSide: '4011', lofInter: '4012', lofRoot: '4013', lop: '4021',
  crack: '1011', craterCrack: '104', burn: '510', concavity: '515', undercut: '5011', lofSurface: '401',
};

export const FLAW_NAMES = {
  pore: 'Gas pore', slag: 'Slag inclusion', tungsten: 'Tungsten inclusion', lofSide: 'Lack of side-wall fusion',
  lofInter: 'Lack of inter-run fusion', lofRoot: 'Lack of root fusion', lop: 'Incomplete root penetration',
  crack: 'Longitudinal crack', craterCrack: 'Crater crack', burn: 'Burn-through', concavity: 'Root concavity',
  undercut: 'Undercut', lofSurface: 'Lack of fusion at the surface (cold lap)',
};

// Planar imperfections (cracks, lack of fusion and penetration): the codes treat them apart from the
// volumetric ones (pores, inclusions).
export const PLANAR = new Set(['lofSide', 'lofInter', 'lofRoot', 'lop', 'crack', 'craterCrack', 'lofSurface']);

// Pass layers through a butt weld at sample i, as the macro section builds them: each pass between level
// lv0 and lv1 (the cap from lv0 up to the weld face). Open root: the root's metal pushed through the gap
// (inside bead) is below the root surface and shifts the levels.
export function passLayers(rec, i) {
  const j = rec.joint;
  if (j.type !== 'butt') return [];
  let cum = 0;
  if (j.openRoot) {
    const s0 = rec.passes[0].area[i] > 0.05 ? rec.sample(0, i) : null;
    if (!s0) return [];
    cum = -(s0.rootA != null ? s0.rootA - s0.voidA : 0);
  }
  const out = [];
  for (let k = 0; k < rec.passes.length; k++) {
    const A = rec.passes[k].area[i];
    if (!(A > 0.05)) continue;
    const s = rec.sample(k, i);
    if (!s) continue;
    const lv0 = cum > 0 ? levelForArea(j, cum) : -j.t;
    cum += A;
    const cap = cum > j.grooveArea;
    const lv1 = cap ? 0 : cum > 0 ? levelForArea(j, cum) : -j.t + 0.2;
    out.push({ k, s, lv0, lv1, cap });
  }
  return out;
}

// Weld metal thickness at sample i excluding the reinforcement on either side (the root's level and the
// highest level reached), and the thickness of each pass there.
export function depositAt(rec, i) {
  const L = passLayers(rec, i);
  if (!L.length) return null;
  const t = rec.joint.t;
  return { top: Math.min(0, L[L.length - 1].lv1), passes: L.map((p) => ({ k: p.k, from: p.lv0 + t, to: Math.min(0, p.lv1) + t })) };
}

function seg(type, i, k, side, extra) {
  return { type, s0: i, s1: i + 1, k, side, ...extra };
}

// Fillet weld face polyline (as section.js): from the base toe (z1, 0) to the web toe (0, z2), with the
// convexity c added along the face normal.
function filletFace(s) {
  const hl = Math.hypot(s.z1, s.z2);
  const nu = s.z2 / hl, nv = s.z1 / hl;
  const face = [];
  for (let q = 0; q <= 24; q++) {
    const tau = q / 24;
    const b = 4 * s.c * tau * (1 - tau);
    face.push([s.z1 * tau + b * nu, s.z2 * (1 - tau) + b * nv]);
  }
  return face;
}

// Build the imperfection map. Contiguous samples of the same kind (same pass and side) merge into one
// imperfection with its extent along the weld and its largest size; pores stay individual.
export function flawMap(rec) {
  const j = rec.joint;
  const n = j.n;
  const fillet = j.type === 'fillet';
  const butt = j.type === 'butt';
  const t = j.t;
  const raw = []; // per-sample pieces before merging
  const pores = [];
  const topK = (i) => rec.topPassAt(i);

  for (let i = 0; i < n; i++) {
    if (fillet) {
      const k = topK(i);
      if (k < 0) continue;
      const s = rec.sample(k, i);
      if (!s) continue;
      if (s.lofRoot > 0) raw.push(seg('lofRoot', i, k, 0, { h: s.lofRoot, u0: 0, u1: s.lofRoot, v0: 0, v1: s.lofRoot, fillet: true, surf: null }));
      if (s.crackCentre) {
        const face = filletFace(s);
        const m = face[12];
        raw.push(seg('crack', i, k, 0, { h: Math.hypot(m[0], m[1]) * 0.7, u0: m[0] * 0.3, u1: m[0], v0: m[1] * 0.3, v1: m[1], fillet: true, surf: 'face' }));
      }
      if (s.uc1 > 0.05) raw.push(seg('undercut', i, k, 1, { h: s.uc1, u0: s.z1, u1: s.z1 + 1, v0: -s.uc1, v1: 0, fillet: true, surf: 'face' }));
      if (s.uc2 > 0.05) raw.push(seg('undercut', i, k, 2, { h: s.uc2, u0: -s.uc2, u1: 0, v0: s.z2, v1: s.z2 + 1, fillet: true, surf: 'face' }));
      if (s.lofSurface) raw.push(seg('lofSurface', i, k, 1, { h: 0.5, u0: s.z1 - 0.5, u1: s.z1 + Math.max(0.5, s.ov1 || 0), v0: 0, v1: 0.2, fillet: true, surf: 'face' }));
      for (let kk = 0; kk <= k; kk++) {
        if (!(rec.passes[kk].area[i] > 0.05)) continue;
        const sk = rec.sample(kk, i);
        if (!sk) continue;
        for (const po of sk.events.pores) {
          // position in the section as section.js draws it
          const face = filletFace(s);
          const tau = clamp(0.5 + po.u / Math.max(4, s.b), 0.15, 0.85);
          const depth = 0.3 + 0.35 * ((po.s * 7.3) % 1);
          const fp = face[Math.round(tau * 24)];
          const pu = fp[0] * (1 - depth), pv = fp[1] * (1 - depth);
          pores.push({ type: 'pore', s: po.s, s0: po.s - po.d / 2, s1: po.s + po.d / 2, d: po.d, h: po.d, k: kk, u0: pu - po.d / 2, u1: pu + po.d / 2, v0: pv - po.d / 2, v1: pv + po.d / 2, fillet: true, surf: po.surface && kk === k ? 'face' : null });
        }
      }
      continue;
    }
    if (!butt) continue;
    const layers = passLayers(rec, i);
    if (!layers.length) continue;
    const g = j.rootGap, f = j.rootFace;
    const half = j.topWidth / 2;
    const top = layers[layers.length - 1];
    const s0 = j.openRoot ? layers[0].s : null;
    // root side
    if (j.openRoot && s0) {
      if (s0.lop > 0) raw.push(seg('lop', i, 0, 0, { h: s0.lop, u0: -g / 2, u1: g / 2, v0: -t, v1: -t + s0.lop, surf: 'root' }));
      if (s0.lofRoot1 > 0) raw.push(seg('lofRoot', i, 0, 1, { h: Math.min(f, s0.lofRoot1) + 0.2, u0: -g / 2 - 0.05, u1: -g / 2 + 0.05, v0: -t, v1: -t + Math.min(f, s0.lofRoot1) + 0.2, surf: 'root' }));
      if (s0.lofRoot2 > 0) raw.push(seg('lofRoot', i, 0, 2, { h: Math.min(f, s0.lofRoot2) + 0.2, u0: g / 2 - 0.05, u1: g / 2 + 0.05, v0: -t, v1: -t + Math.min(f, s0.lofRoot2) + 0.2, surf: 'root' }));
      if (s0.burn) raw.push(seg('burn', i, 0, 0, { h: f * 0.9, u0: -g * 0.42, u1: g * 0.42, v0: -t + f * 0.1, v1: -t + f, cap: top.cap ? top.s.h || 0 : 0, inside: Math.max(0, s0.rootH || 0), surf: null }));
      if (!(s0.lop > 0) && s0.rootH < 0) raw.push(seg('concavity', i, 0, 0, { h: -s0.rootH, u0: -(s0.rootW || g) / 2, u1: (s0.rootW || g) / 2, v0: -t, v1: -t - s0.rootH, cap: top.cap ? top.s.h || 0 : 0, surf: 'root' }));
    } else if (!j.openRoot) {
      const r0 = layers[0];
      if (r0.k === 0 && r0.s.lofRoot > 0) raw.push(seg('lofRoot', i, 0, 0, { h: r0.s.lofRoot, u0: -g / 2 - 0.05, u1: g / 2 + 0.05, v0: -t, v1: -t + f + 0.3, surf: null })); // under the backing strip: not visible
    }
    for (let n2 = 0; n2 < layers.length; n2++) {
      const ps = layers[n2];
      const s = ps.s;
      const wgAt = (lv) => grooveWidthAt(j, Math.min(lv, 0)) / 2;
      // side-wall lack of fusion along the bevel face between the levels of the pass
      if (!ps.cap && !(j.openRoot && ps.k === 0)) {
        for (const [side, val] of [[1, s.lofSide1], [2, s.lofSide2]]) {
          if (!(val > 0)) continue;
          const sg = side === 1 ? -1 : 1;
          const ua = sg * wgAt(ps.lv0), ub = sg * wgAt(ps.lv1);
          raw.push(seg('lofSide', i, ps.k, side, { h: Math.max(0.3, ps.lv1 - ps.lv0), u0: Math.min(ua, ub), u1: Math.max(ua, ub), v0: ps.lv0, v1: ps.lv1, surf: null }));
        }
      }
      if (n2 > 0 && s.lofInter > 0) {
        const wg = wgAt(ps.lv0) * 0.85;
        raw.push(seg('lofInter', i, ps.k, 0, { h: s.lofInter, u0: -wg, u1: wg, v0: ps.lv0 - 0.05, v1: ps.lv0 + 0.05, surf: null }));
      }
      if (n2 > 0 && s.slag > 0) {
        // the side and the size as the macro section draws them
        const r0s = rng(hashSeed(rec.seed, ps.k * 31 + i, 5));
        const sg = r0s() < 0.5 ? -1 : 1;
        const wg = wgAt(ps.lv0);
        const cx = sg * (wg - 0.6 - s.slag * 0.4);
        raw.push(seg('slag', i, ps.k, sg < 0 ? 1 : 2, { h: s.slag * 0.7, w: s.slag * 1.5, u0: cx - s.slag * 0.75, u1: cx + s.slag * 0.75, v0: ps.lv0 + 0.15 - s.slag * 0.35, v1: ps.lv0 + 0.15 + s.slag * 0.35, surf: null }));
      }
      if (s.crackCentre) {
        const vTop = ps.cap ? (s.h || 0) * 0.8 : ps.lv1;
        raw.push(seg('crack', i, ps.k, 0, { h: Math.max(0.5, vTop - (ps.lv0 + 0.6)), u0: -0.05, u1: 0.05, v0: ps.lv0 + 0.6, v1: vTop, surf: ps === top && ps.cap ? 'face' : null }));
      }
    }
    // weld face: undercut and cold lap at the cap toes
    if (top.cap) {
      const wcap = top.s.wcap || j.topWidth + 2;
      if (top.s.uc1 > 0.05) raw.push(seg('undercut', i, top.k, 1, { h: top.s.uc1, u0: -wcap / 2 - 1, u1: -wcap / 2, v0: -top.s.uc1, v1: 0, surf: 'face' }));
      if (top.s.uc2 > 0.05) raw.push(seg('undercut', i, top.k, 2, { h: top.s.uc2, u0: wcap / 2, u1: wcap / 2 + 1, v0: -top.s.uc2, v1: 0, surf: 'face' }));
      if (top.s.lofSurface) raw.push(seg('lofSurface', i, top.k, 1, { h: 0.5, u0: -wcap / 2 - 0.5, u1: -wcap / 2 + 0.5, v0: -0.5, v1: 0, surf: 'face' }));
    }
    // pores of every pass at this sample
    for (const ps of layers) {
      for (const po of ps.s.events.pores) {
        const v = ps.cap ? (ps.s.h || 0) * 0.4 : (ps.lv0 + ps.lv1) / 2;
        const u = clamp(po.u * 0.6, -half, half);
        const surface = po.surface && ps === top;
        pores.push({ type: 'pore', s: po.s, s0: po.s - po.d / 2, s1: po.s + po.d / 2, d: po.d, h: po.d, k: ps.k, u0: u - po.d / 2, u1: u + po.d / 2, v0: v - po.d / 2, v1: v + po.d / 2, surf: surface ? 'face' : null });
      }
    }
  }
  // GTAW tungsten inclusions (record.tungsten: where the tungsten touched the pool)
  for (const w of rec.tungsten || []) {
    const i = clamp(Math.round(w.s), 0, n - 1);
    let u = w.u || 0, v = -t / 2;
    if (fillet) {
      const k = topK(i);
      const s = k >= 0 ? rec.sample(k, i) : null;
      if (s) {
        u = s.z1 * 0.3;
        v = s.z2 * 0.3;
      }
    } else if (butt) {
      const L = passLayers(rec, i);
      const ps = L.find((p) => p.k === w.pass) || L[L.length - 1];
      if (ps) v = ps.cap ? 0.3 : (ps.lv0 + ps.lv1) / 2;
    }
    pores.push({ type: 'tungsten', s: w.s, s0: w.s - 0.25, s1: w.s + 0.25, d: 0.5, h: 0.5, k: w.pass, u0: u - 0.25, u1: u + 0.25, v0: v - 0.25, v1: v + 0.25, fillet, surf: null });
  }
  // crater cracks of the top pass at its stops
  for (const p of rec.passes) {
    for (const st of p.stops) {
      if (!st.crack) continue;
      const i = clamp(Math.round(st.s), 0, n - 1);
      if (rec.topPassAt(i) !== p.index) continue;
      const len = st.crackLen || 1;
      pores.push({ type: 'craterCrack', s: st.s, s0: st.s - len / 2, s1: st.s + len / 2, h: len, len, k: p.index, u0: -len / 2, u1: len / 2, v0: -0.8, v1: 0, fillet, surf: 'face' });
    }
  }
  const items = merge(raw, j).concat(pores);
  items.sort((a, b) => a.s0 - b.s0);
  return { joint: j, items, L: j.L, t, periodic: !!j.pipe, a: j.tab ?? 0, b: (j.tab ?? 0) + (j.evalL ?? j.L) };
}

// Merge per-sample pieces: same type, pass and side, contiguous along the weld (and across x = 0 on a
// pipe). The merged item keeps the largest size and the union of the section extents.
function merge(raw, j) {
  const groups = new Map();
  for (const r of raw) {
    const key = `${r.type}|${r.k}|${r.side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.s0 - b.s0);
    const runs = [];
    for (const r of list) {
      const cur = runs[runs.length - 1];
      if (cur && r.s0 <= cur.s1 + 0.01) {
        cur.s1 = Math.max(cur.s1, r.s1);
        cur.h = Math.max(cur.h, r.h);
        if (r.w != null) cur.w = Math.max(cur.w || 0, r.w);
        cur.u0 = Math.min(cur.u0, r.u0);
        cur.u1 = Math.max(cur.u1, r.u1);
        cur.v0 = Math.min(cur.v0, r.v0);
        cur.v1 = Math.max(cur.v1, r.v1);
        if (r.cap != null) cur.cap = Math.min(cur.cap ?? r.cap, r.cap);
        if (r.inside != null) cur.inside = Math.min(cur.inside ?? r.inside, r.inside);
        if (r.surf && !cur.surf) cur.surf = r.surf;
      } else runs.push({ ...r });
    }
    // a pipe weld closes on itself: a run reaching the end joins one starting at 0
    if (j.pipe && runs.length > 1 && runs[0].s0 <= 0.01 && runs[runs.length - 1].s1 >= j.L - 0.01) {
      const last = runs.pop();
      const first = runs[0];
      first.s0 = last.s0 - j.L; // negative start: the run crosses x = 0
      first.h = Math.max(first.h, last.h);
      first.u0 = Math.min(first.u0, last.u0);
      first.u1 = Math.max(first.u1, last.u1);
      first.v0 = Math.min(first.v0, last.v0);
      first.v1 = Math.max(first.v1, last.v1);
    }
    for (const r of runs) {
      r.len = r.s1 - r.s0;
      out.push(r);
    }
  }
  return out;
}

// Length of an item inside the window [a, b) along the weld (periodic on a pipe).
export function overlap(map, item, a, b) {
  if (!map.periodic) return Math.max(0, Math.min(item.s1, b) - Math.max(item.s0, a));
  const L = map.L;
  let tot = 0;
  for (const sh of [-L, 0, L]) tot += Math.max(0, Math.min(item.s1 + sh, b) - Math.max(item.s0 + sh, a));
  return Math.min(tot, item.s1 - item.s0);
}

// Items inside the examination window [a, b) (default: the evaluation length of the joint).
export function itemsIn(map, a = map.a, b = map.b) {
  return map.items.filter((it) => overlap(map, it, a, b) > 0);
}
