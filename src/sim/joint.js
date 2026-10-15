// Joint geometry in joint-local millimetres.
//   x : along the joint (travel direction of the scenario)
//   u : across the joint. Fillet: +u is the base plate (leg 1), -u the web plate (leg 2).
//       Butt: -u is plate 1, +u is plate 2.
//   v : out of the joint (fillet bisector / butt weld-face normal).
// World placement uses a "bench frame" (X right, Y up, Z toward the welder); the renderer maps
// the bench frame onto the virtual or calibrated real bench.

import { clamp } from './util.js';

const S2 = Math.SQRT1_2;

// Position definitions. d1/d2 are fillet plate-surface directions from the corner;
// for butt joints v is the face normal and u the across-joint direction.
// AWS/ISO pairing per Lincoln Electric trainer pages (PA-1G, PC-2G, PF/PG-3G, PE-4G,
// PB-2F, PF/PG-3F, PD-4F).
export const POSITIONS = {
  fillet: {
    PA: { aws: '1F', label: 'PA flat (1F)', d1: [0, S2, S2], d2: [0, S2, -S2], t: [1, 0, 0] },
    PB: { aws: '2F', label: 'PB horizontal-vertical (2F)', d1: [0, 0, 1], d2: [0, 1, 0], t: [1, 0, 0] },
    PD: { aws: '4F', label: 'PD horizontal-overhead (4F)', d1: [0, 0, 1], d2: [0, -1, 0], t: [1, 0, 0], overhead: true },
    PF: { aws: '3F', label: 'PF vertical up (3F)', d1: [1, 0, 0], d2: [0, 0, 1], t: [0, 1, 0], vertical: true },
    PG: { aws: '3F', label: 'PG vertical down (3F)', d1: [1, 0, 0], d2: [0, 0, 1], t: [0, -1, 0], vertical: true },
  },
  butt: {
    PA: { aws: '1G', label: 'PA flat (1G)', v: [0, 1, 0], u: [0, 0, 1], t: [1, 0, 0] },
    PC: { aws: '2G', label: 'PC horizontal (2G)', v: [0, 0, 1], u: [0, 1, 0], t: [1, 0, 0] },
    PE: { aws: '4G', label: 'PE overhead (4G)', v: [0, -1, 0], u: [0, 0, 1], t: [1, 0, 0], overhead: true },
    PF: { aws: '3G', label: 'PF vertical up (3G)', v: [0, 0, 1], u: [1, 0, 0], t: [0, 1, 0], vertical: true },
    PG: { aws: '3G', label: 'PG vertical down (3G)', v: [0, 0, 1], u: [1, 0, 0], t: [0, -1, 0], vertical: true },
  },
  // Bead on plate (technique drills B1, B2, B7): a flat plate with scribed lanes.
  plate: {
    PA: { aws: 'flat', label: 'PA flat, bead on plate', v: [0, 1, 0], u: [0, 0, 1], t: [1, 0, 0] },
  },
};

const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function makeJoint(type, position, opts = {}) {
  const pos = POSITIONS[type][position];
  if (!pos) throw new Error(`Unknown position ${type}/${position}`);
  // Evaluation length between run-on and run-off zones; the physical joint is longer.
  const evalL = opts.length ?? 200; // mm judged against the code
  const tab = opts.tab ?? 20; // mm run-on / run-off zone at each end (not judged)
  const L = evalL + 2 * tab; // physical joint length
  const t = opts.thickness ?? 10; // mm plate thickness
  let u, v;
  if (type === 'fillet') {
    v = norm([pos.d1[0] + pos.d2[0], pos.d1[1] + pos.d2[1], pos.d1[2] + pos.d2[2]]);
    u = norm([pos.d1[0] - pos.d2[0], pos.d1[1] - pos.d2[1], pos.d1[2] - pos.d2[2]]);
  } else {
    v = pos.v.slice();
    u = pos.u.slice();
  }
  const tdir = pos.t.slice();
  const g = [0, -1, 0];
  const gravity = { t: dot(g, tdir), u: dot(g, u), v: dot(g, v) };

  const joint = {
    type, position, aws: pos.aws, label: pos.label,
    L, t, ds: 1, n: Math.round(L), evalL, tab, // 1 mm samples
    axes: { t: tdir, u, v, d1: pos.d1, d2: pos.d2 },
    gravity,
    overhead: !!pos.overhead, vertical: !!pos.vertical,
    misalignment: opts.misalignment ?? 0, // mm high-low (butt fit-up)
  };

  if (type === 'plate') {
    joint.width = opts.width ?? 150; // plate width across u (centred on u = 0)
    joint.lanes = opts.lanes ?? [0]; // scribed lane centres (u, mm)
    const area = opts.beadArea ?? 16; // target bead cross-section (mm^2). seed
    const n = opts.passes ?? joint.lanes.length;
    joint.passPlan = Array.from({ length: Math.max(1, n) }, () => ({ kind: opts.weave ? 'weave' : 'stringer', target: area }));
    joint.marks = opts.marks || []; // stop marks along x (B7)
    joint.weldSize = opts.weldSize ?? 8; // nominal bead width (mm) for start/stop technique. seed
    return joint;
  }
  if (type === 'fillet') {
    joint.leg = opts.leg ?? 6; // nominal leg size z (AWS fillet size L)
    joint.aNom = joint.leg * S2; // nominal throat a (ISO)
    joint.backExt = opts.backExt ?? 40; // base plate beyond the back face of the web (T-joint)
    // Target a leg about 12% over nominal so a well-made weld clears the minimum size. seed
    joint.passPlan = [{ kind: 'single', target: filletTargetArea(joint.leg * 1.12, 0.6) }];
    joint.marks = opts.marks || [];
    joint.weldSize = joint.leg;
    joint.webH = opts.webH ?? 100; // web height (mm); qualification test pieces: ISO 9606-1 Figure 4, at least 125
  } else {
    joint.grooveAngle = opts.grooveAngle ?? 60;
    joint.rootFace = opts.rootFace ?? 1;
    joint.rootGap = opts.rootGap ?? 4;
    joint.backing = opts.backing ?? { width: 25, thickness: 6 };
    joint.plateW = opts.plateW ?? 100; // width of each plate (mm); qualification test pieces: ISO 9606-1 Figure 3, at least 125
    joint.halfTan = Math.tan(((joint.grooveAngle / 2) * Math.PI) / 180);
    joint.grooveArea = grooveAreaBelow(joint, 0);
    joint.topWidth = grooveWidthAt(joint, 0);
    const capArea = (2 / 3) * (joint.topWidth + 3) * 1.6; // ~1.6 mm reinforcement target
    const total = joint.grooveArea + capArea;
    // Four-pass plan for 10 mm plate on backing: root, two fills, cap.
    const root = Math.min(26, total * 0.24);
    const cap = joint.grooveArea * 0.18 + capArea;
    const fill = (total - root - cap) / 2;
    joint.passPlan = [
      { kind: 'root', target: root },
      { kind: 'fill', target: fill },
      { kind: 'fill', target: fill },
      { kind: 'cap', target: cap },
    ];
    joint.marks = opts.marks || [];
    joint.weldSize = opts.weldSize ?? 6; // seed
  }
  return joint;
}

export function filletTargetArea(leg, convexity) {
  return 0.5 * leg * leg + (2 / 3) * convexity * leg * Math.SQRT2;
}

// ---- Butt groove helpers (v measured from the plate face, root at v = -t) ----
export function grooveWidthAt(j, level) {
  const vRootFaceTop = -j.t + j.rootFace;
  if (level <= vRootFaceTop) return j.rootGap;
  return j.rootGap + 2 * (level - vRootFaceTop) * j.halfTan;
}

// Area of the groove below a given level (level in [-t, 0]); above 0 returns the full groove.
export function grooveAreaBelow(j, level) {
  const lv = clamp(level, -j.t, 0);
  const h = lv + j.t; // height from root
  const f = j.rootFace;
  if (h <= f) return j.rootGap * h;
  const hb = h - f;
  return j.rootGap * f + j.rootGap * hb + hb * hb * j.halfTan;
}

// Fill level reached by a given deposited area (inverse of grooveAreaBelow).
export function levelForArea(j, area) {
  const f = j.rootFace;
  const a0 = j.rootGap * f;
  if (area <= a0) return -j.t + area / j.rootGap;
  // a = g*hb + hb^2*tan  ->  hb = (-g + sqrt(g^2 + 4*tan*a)) / (2*tan)
  const a = area - a0;
  const g = j.rootGap;
  const hb = (-g + Math.sqrt(g * g + 4 * j.halfTan * a)) / (2 * j.halfTan);
  return Math.min(-j.t + f + hb, 0);
}

// Plate surface height v(u) with no weld metal (used for torch-to-work distance).
export function plateSurface(j, u) {
  if (j.type === 'plate') return Math.abs(u) <= j.width / 2 ? 0 : -1e3;
  if (j.type === 'fillet') return Math.abs(u);
  const half = grooveWidthAt(j, 0) / 2;
  if (Math.abs(u) >= half) return 0 + (u > 0 ? -j.misalignment : 0);
  // inside the groove: bevel walls down to the root faces, root gap open to the backing
  const vRootFaceTop = -j.t + j.rootFace;
  const halfRoot = j.rootGap / 2;
  // backing bar surface; open root (pipe): the arc spans the gap between the edges of the lands, so the
  // gap counts as a surface level with the top of the lands until the root run fills it
  if (Math.abs(u) <= halfRoot) return j.backing ? -j.t : vRootFaceTop;
  const d = (Math.abs(u) - halfRoot) / j.halfTan; // height above root-face top along the bevel
  return Math.min(0, vRootFaceTop + d);
}
