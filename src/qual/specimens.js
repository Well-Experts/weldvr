// Test specimens cut from the simulated weld: what each bend, fracture and macro specimen and the
// radiograph show, from the imperfection map (flaws.js). Acceptance is applied per standard elsewhere
// (iso.js, asme.js, api.js); this module only measures.
//
// SIMULATION RULES (this build's model of the test, not taken from the codes):
//  Bend tests. The specimen is bent until the convex surface is stretched by the outer-fibre strain of the
//  jig, e = ts / (d + ts) for a former (plunger) of diameter d and a specimen ts thick: this is the relation
//  behind ISO 9606-1 6.5.2.3 (d = 100 ts / A - ts) and ASME IX QW-466.1 Note (1) (percent outer fibre
//  elongation = 100 t / (A + t)). An imperfection lying in the half of the specimen on the convex side opens
//  on the convex surface; its open size is its extent on that surface, stretched across the bend by the
//  strain at its depth (falling linearly to 0 at the mid-thickness). Imperfections in the compressed half
//  stay closed. Undercut and root concavity are surface profile, judged at the visual examination, and are
//  not opened. Real bend specimens can open imperfections more or less than this.
//  Fracture tests. The specimen breaks through the weld (it is notched in the weld or loaded with the root
//  in tension), so every imperfection inside the weld metal of the specimen lies on the fracture faces.
//  Radiography. An ideal film: every imperfection of the weld model is on it, at its projected size.

import { overlap, PLANAR } from './flaws.js';

const CLOSED_IN_BEND = new Set(['undercut', 'concavity']);
const NOT_ON_FRACTURE = new Set(['undercut', 'concavity', 'lofSurface']);

// Outer-fibre strain of a bend to a former (plunger) of diameter d.
export function bendStrain(ts, d) {
  return ts / (d + ts);
}

// s-range of a specimen centred at sc and w wide (physical s; may cross x = 0 on a pipe).
function rangeAt(sc, w) {
  return [sc - w / 2, sc + w / 2];
}

// Transverse root or face bend, or side bend.
//   spec: { kind: 'root' | 'face' | 'side', sc (centre, physical mm), w (width along the weld; side bend: the
//           specimen thickness ts along the weld), ts (thickness through the bend), d (former diameter), t }
// Returns the opened discontinuities on the convex surface: { item, size (largest dimension, mm), along,
// across, depth }.
export function bendSpecimen(map, spec) {
  const t = map.t;
  const e = bendStrain(spec.ts, spec.d);
  const out = [];
  if (spec.kind === 'side') {
    // slice of the weld ts thick along the weld; the convex face is one cut face of the slice. ASME
    // QW-162.1: the side with the greater discontinuities, if any, is turned to the gap of the jig.
    const [a, b] = rangeAt(spec.sc, spec.ts);
    const mid = spec.sc;
    const faces = [{ face: a, lo: a, hi: mid }, { face: b, lo: mid, hi: b }].map((f) => {
      const opened = [];
      for (const it of map.items) {
        if (CLOSED_IN_BEND.has(it.type) || it.fillet) continue;
        const inHalf = overlap(map, it, f.lo, f.hi);
        if (!(inHalf > 0)) continue;
        // distance of the item's nearest point from the convex face, along the weld
        const nearest = f.face === a ? Math.max(0, it.s0 - a) : Math.max(0, b - it.s1);
        const z = Math.min(nearest, spec.ts / 2);
        const ez = e * (1 - (2 * z) / spec.ts);
        const across = Math.max(0.05, it.u1 - it.u0) * (1 + ez); // the bend stretches the face across the weld
        const thru = Math.max(0.05, it.v1 - it.v0);
        opened.push({ item: it, size: Math.max(across, thru), along: thru, across, depth: z });
      }
      return { face: f.face, opened };
    });
    const worst = (f) => f.opened.reduce((m, o) => Math.max(m, o.size), 0) + 1e-3 * f.opened.length;
    const pick = worst(faces[1]) > worst(faces[0]) ? faces[1] : faces[0];
    return { e, convex: pick.face === a ? 'first face' : 'second face', opened: pick.opened, range: [a, b] };
  }
  const [a, b] = rangeAt(spec.sc, spec.w);
  const ts = spec.ts ?? t;
  // the specimen keeps ts of the thickness on its tension side (ASME QW-462.3(a): y = 3/8 in when T > 3/8 in)
  const vLo = spec.kind === 'face' ? -ts : -t;
  const vHi = spec.kind === 'face' ? 0 : -t + ts;
  for (const it of map.items) {
    if (CLOSED_IN_BEND.has(it.type) || it.fillet) continue;
    const along = overlap(map, it, a, b);
    if (!(along > 0)) continue;
    if (it.v1 < vLo || it.v0 > vHi) continue; // machined away
    const z = spec.kind === 'face' ? Math.max(0, -it.v1) : Math.max(0, it.v0 + t);
    if (z >= ts / 2) continue; // compressed half: stays closed
    const ez = e * (1 - (2 * z) / ts);
    const isPore = it.type === 'pore' || it.type === 'tungsten';
    const across = isPore ? it.d * (1 + ez) : Math.max(0.05, Math.min(it.u1 - it.u0, ts)) * (1 + ez);
    const al = isPore ? Math.min(it.d, along + it.d) : along;
    out.push({ item: it, size: Math.max(al, across), along: al, across, depth: z });
  }
  return { e, convex: spec.kind, opened: out, range: [a, b] };
}

// Fracture (or nick-break) specimen between s0 and s1 (physical): the imperfections on the fracture faces.
// Each: { item, length (along the weld inside the specimen), depth (through the thickness), d (pores),
// area (mm^2 of the fracture face it takes) }.
export function fractureSpecimen(map, s0, s1) {
  const out = [];
  for (const it of map.items) {
    if (NOT_ON_FRACTURE.has(it.type)) continue;
    const len = overlap(map, it, s0, s1);
    if (!(len > 0)) continue;
    const isPore = it.type === 'pore' || it.type === 'tungsten';
    const depth = Math.max(0.05, it.v1 - it.v0);
    const length = isPore ? it.d : len;
    const area = isPore ? (Math.PI * it.d * it.d) / 4 : length * depth;
    out.push({ item: it, length, depth, d: isPore ? it.d : null, area, planar: PLANAR.has(it.type) });
  }
  return out;
}

// Imperfections a macro section at physical s cuts through.
export function macroAt(map, s) {
  const out = [];
  for (const it of map.items) {
    const hit = it.type === 'pore' || it.type === 'tungsten' ? Math.abs(s - it.s) <= it.d / 2 : overlap(map, it, s - 0.5, s + 0.5) > 0;
    if (hit) out.push(it);
  }
  return out;
}

// Radiographic indications in the window [a, b): the projection of each imperfection on the film plane
// (s along the weld, u across), with its length, width and through-thickness extent.
export function rtIndications(map, a = map.a, b = map.b) {
  const out = [];
  for (const it of map.items) {
    const len = overlap(map, it, a, b);
    if (!(len > 0)) continue;
    const isPore = it.type === 'pore' || it.type === 'tungsten';
    const length = isPore ? it.d : len;
    const width = isPore ? it.d : Math.max(0.1, it.w ?? it.u1 - it.u0);
    out.push({ item: it, type: it.type, s0: Math.max(it.s0, a), s1: Math.min(it.s1, b), sc: isPore ? it.s : (Math.max(it.s0, a) + Math.min(it.s1, b)) / 2, u0: it.u0, u1: it.u1, length, width, depth: Math.max(0.05, it.v1 - it.v0) });
  }
  return out;
}

// Total length of the windows [a, b) covered by intervals, worst window of length win (periodic aware).
export function worstWindowLength(intervals, win, L, periodic) {
  if (!intervals.length) return 0;
  let worst = 0;
  const starts = intervals.map((iv) => iv[0]);
  for (const s of starts) {
    const a = s, b = s + win;
    let tot = 0;
    for (const [x0, x1] of intervals) {
      const shifts = periodic ? [-L, 0, L] : [0];
      for (const sh of shifts) tot += Math.max(0, Math.min(x1 + sh, b) - Math.max(x0 + sh, a));
    }
    worst = Math.max(worst, tot);
  }
  return worst;
}
