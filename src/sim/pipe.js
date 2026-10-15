// Pipe butt joints (single-V groove, open root, no backing) for welder training in the 1G, 2G, 5G and
// 6G test positions, and the geometry that wraps the joint-local weld coordinates around the pipe.
//
// Coordinates. The weld record, the session and the heat-flow model use the same joint-local (x, u, v)
// millimetres as the plate joints, unwrapped around the pipe:
//   x  arc length around the outside of the pipe, 0 <= x < L (L = whole millimetres, see Rx below);
//   u  along the pipe axis, across the joint (+u is the second pipe);
//   v  radially outward from the outside surface (the root is at v = -t, the inside surface).
// Pipe-local Cartesian millimetres (the coupon frame) are P = (r sin a, u, -r cos a), r = R + v, with the
// angle a = x / Rx measured from -Z. The local frame at x is t = (cos a, 0, sin a), u = (0, 1, 0),
// v = (sin a, 0, -cos a); as for the plate joints, t x u = -v. Because the circumference is closed, x is
// periodic: positions wrap at L and distances along the joint are taken the short way round.
//
// Placement. `basis` gives the pipe-local X, Y (axis) and Z directions in the bench frame. For the
// horizontal and inclined pipe a = 0 (-Z) is the lowest point of the joint (6 o'clock) and +X points to
// the welder, so x grows from 6 o'clock up the near side through 3 o'clock to 12 o'clock. A rotated pipe
// (1G) turns about its axis by `roll`: the point at angle a is then at a + roll in the fixed frame.
//
// Sources
//   Positions: ASME BPVC Section IX-2023 QW-122: 1G "Pipe with its axis horizontal and rolled during
//   welding so that the weld metal is deposited from above"; 2G "Pipe with its axis vertical and the axis
//   of the weld in a horizontal plane. Pipe shall not be rotated during welding"; 5G "Pipe with its axis
//   horizontal and with the welding groove in a vertical plane. Welding shall be done without rotating the
//   pipe"; 6G "Pipe with its axis inclined at 45 deg to horizontal. Welding shall be done without rotating
//   the pipe". QW-120: "an angular deviation of ±15 deg from the specified horizontal and vertical planes,
//   and an angular deviation of ±5 deg from the specified inclined plane are permitted during welding".
//   ISO designations: ISO 6947:2019 Table B.1 and ISO 9606-1:2012 Table 9 (1G = PA pipe rotating,
//   2G = PC, 5G = PH upward / PJ downward, 6G = H-L045 upward / J-L045 downward).
//   Sizes (ASME B36.10 values as printed by InfraBuild, Oct 2022, and Tioga Pipe, 12/2013): NPS 6 (DN 150)
//   OD 168.3 mm, Sch 40 wall 7.11 mm, Sch 80 wall 10.97 mm; NPS 2 (DN 50) OD 60.3 mm, Sch 80 wall 5.54 mm,
//   XXS wall 11.07 mm. Training coupons of this kind: Hobart Institute 6-inch uphill course ("Schedule
//   80"), Lincoln Electric school ASME pipe course ("6-inch schedule 40, schedule 80 pipes & 2 inch extra
//   strong pipe").
//   Test piece: ISO 9606-1:2012 Figure 5, each pipe at least 125 mm long; clause 6.2 "the examination
//   length is 150 mm" and, for pipe, the whole circumference (Figure 8). Clause 6.1: "for fixed pipe
//   welds, the 12 o'clock welding position shall also be marked".
//   Joint preparation of the training coupon (vertical up, no backing ring): Lincoln Electric C2.420
//   (10/02) in-plant pipe figure: bevel 30 deg (+7 1/2, -0), land 3/32 - 1/8 in, gap 3/32 - 1/8 in, and
//   "A 1/8" (3.2mm) gap must be maintained accurately all the way around the joint." This build uses a
//   60 deg included angle, 2.4 mm (3/32 in) land and 3.2 mm (1/8 in) gap.

import { clamp } from './util.js';
import { grooveAreaBelow, grooveWidthAt } from './joint.js';

export const PIPE_SIZES = {
  'NPS6-80': { id: 'NPS6-80', nps: '6', dn: 150, sch: '80', D: 168.3, t: 10.97, label: 'NPS 6 (DN 150) Sch 80' },
  'NPS6-40': { id: 'NPS6-40', nps: '6', dn: 150, sch: '40', D: 168.3, t: 7.11, label: 'NPS 6 (DN 150) Sch 40' },
  'NPS2-80': { id: 'NPS2-80', nps: '2', dn: 50, sch: '80', D: 60.3, t: 5.54, label: 'NPS 2 (DN 50) Sch 80' },
  'NPS2-XXS': { id: 'NPS2-XXS', nps: '2', dn: 50, sch: 'XXS', D: 60.3, t: 11.07, label: 'NPS 2 (DN 50) XXS' },
};

const A = Math.SQRT1_2;
// Pipe-local X, Y (axis), Z directions in the bench frame for each axis orientation.
const BASIS = {
  // axis left-right; a = 0 at the bottom (-Z local = down); +X local toward the welder (bench +Z)
  horizontal: { ex: [0, 0, 1], ey: [1, 0, 0], ez: [0, 1, 0] },
  // axis vertical; a = 0 on the far side of the joint (away from the welder); +X local to the right
  vertical: { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] },
  // axis inclined 45 deg in the welder's left-right plane, rising to the right; a = 0 at the lowest point
  inclined: { ex: [0, 0, 1], ey: [A, A, 0], ez: [-A, A, 0] },
};

// Test positions (AWS/ASME designations) with their ISO 6947 equivalents.
export const PIPE_POSITIONS = {
  '1G': { aws: '1G', iso: 'PA', axis: 'horizontal', rotated: true, label: '1G pipe rotated (PA)', progressions: [null] },
  '2G': { aws: '2G', iso: 'PC', axis: 'vertical', label: '2G pipe axis vertical (PC)', progressions: [null] },
  '5G': { aws: '5G', iso: { up: 'PH', down: 'PJ' }, axis: 'horizontal', label: { up: '5G pipe fixed, axis horizontal, uphill (PH)', down: '5G pipe fixed, axis horizontal, downhill (PJ)' }, progressions: ['up', 'down'] },
  '6G': { aws: '6G', iso: { up: 'H-L045', down: 'J-L045' }, axis: 'inclined', incl: 45, label: { up: '6G pipe fixed at 45°, uphill (H-L045)', down: '6G pipe fixed at 45°, downhill (J-L045)' }, progressions: ['up', 'down'] },
};

// Pass plan of the open-root groove: root (with the inside bead), fills, cap. The inside bead target is
// the C2.420 minimum ("This inside bead should have an even surface and be at least 1/16" (1.6 mm)") and
// the cap "about 1/16" (1.6mm) higher than the pipe walls" overlapping the groove "by 1/16 to 1/8"" (C2.420
// in-plant pipe). How the rest is split between the passes is a seed.
export const INSIDE_BEAD = 1.6; // mm
export const CAP_HEIGHT = 1.6; // mm
export const CAP_OVERLAP = 2.4; // mm each side (inside the C2.420 1/16-1/8 in range)

function pipePassPlan(j) {
  const insideA = (2 / 3) * (j.rootGap + 1.6) * INSIDE_BEAD;
  j.insideA = insideA; // planned inside bead section (mm^2)
  const rootTop = Math.min(0, -j.t + j.rootFace + 1.5); // root run fills the land and about 1.5 mm above (seed)
  const rootA = grooveAreaBelow(j, rootTop) + insideA;
  const capA = (2 / 3) * (j.topWidth + 2 * CAP_OVERLAP) * CAP_HEIGHT;
  const rest = j.grooveArea - grooveAreaBelow(j, rootTop) + capA;
  const nFill = j.t >= 9 ? 2 : j.t >= 7 ? 1 : 0; // seed (C2.420 pass counts: 1/4 in wall 2 passes, 3/8 and 1/2 in 3-4)
  const plan = [{ kind: 'root', target: rootA }];
  if (nFill === 0) {
    plan.push({ kind: 'cap', target: rest });
    return plan;
  }
  const cap = capA + 0.18 * (rest - capA);
  const fill = (rest - cap) / nFill;
  for (let k = 0; k < nFill; k++) plan.push({ kind: 'fill', target: fill });
  plan.push({ kind: 'cap', target: cap });
  return plan;
}

// opts: { size, position ('1G' | '2G' | '5G' | '6G'), progression ('up' | 'down'), length (mm, each pipe),
//         rootGap, rootFace, grooveAngle, misalignment, height (joint centre above the bench top, m),
//         rootOnly (a root-pass coupon: the root run is the whole job) }
export function makePipeJoint(opts = {}) {
  const size = PIPE_SIZES[opts.size] || PIPE_SIZES['NPS6-80'];
  const pos = PIPE_POSITIONS[opts.position] || PIPE_POSITIONS['5G'];
  const progression = pos.progressions.includes(opts.progression) ? opts.progression : pos.progressions[0];
  const R = size.D / 2;
  const t = size.t;
  const n = Math.round(2 * Math.PI * R); // samples (1 mm) around the outside
  const Rx = n / (2 * Math.PI); // radius at which x is measured (within 0.1 mm of R)
  const basis = BASIS[pos.axis];
  const iso = typeof pos.iso === 'string' ? pos.iso : pos.iso[progression];
  const label = typeof pos.label === 'string' ? pos.label : pos.label[progression];
  const j = {
    type: 'butt', position: iso, aws: pos.aws, label,
    L: n, t, ds: 1, n, evalL: n, tab: 0,
    axes: { t: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    gravity: { t: 0, u: 0, v: 0 }, // varies around the pipe: gravityAt()
    overhead: pos.axis !== 'vertical' && !pos.rotated, vertical: pos.axis !== 'vertical' && !pos.rotated,
    misalignment: opts.misalignment ?? 0,
    backing: null, openRoot: true,
    grooveAngle: opts.grooveAngle ?? 60,
    rootFace: opts.rootFace ?? 2.4,
    rootGap: opts.rootGap ?? 3.2,
    marks: [],
    weldSize: 6, // seed, as for the plate groove (start/stop back-up length)
    pipe: {
      size: size.id, nps: size.nps, dn: size.dn, sch: size.sch, sizeLabel: size.label,
      D: size.D, R, Ri: R - t, Rx, length: opts.length ?? 125,
      axis: pos.axis, incl: pos.incl ?? (pos.axis === 'vertical' ? 90 : 0), rotated: !!pos.rotated,
      progression, basis, roll: 0,
      height: opts.height ?? 0.35,
    },
  };
  j.halfTan = Math.tan(((j.grooveAngle / 2) * Math.PI) / 180);
  j.grooveArea = grooveAreaBelow(j, 0);
  j.topWidth = grooveWidthAt(j, 0);
  j.passPlan = pipePassPlan(j);
  if (opts.rootOnly) {
    j.passPlan = j.passPlan.slice(0, 1);
    j.rootOnly = true;
  }
  return j;
}

export const isPipe = (j) => !!(j && j.pipe);

// ---- periodic x ---------------------------------------------------------------------------------------
export function wrapX(j, x) {
  if (!j.pipe) return x;
  const L = j.L;
  const r = x % L;
  return r < 0 ? r + L : r;
}

// a - b along the joint (the short way round on a pipe)
export function diffX(j, a, b) {
  const d = a - b;
  if (!j.pipe) return d;
  const L = j.L;
  return d - L * Math.round(d / L);
}

export function wrapIndex(j, i) {
  if (!j.pipe) return i;
  const n = j.n;
  const r = i % n;
  return r < 0 ? r + n : r;
}

// ---- local frame and mapping ---------------------------------------------------------------------------
export function angleAt(j, x) {
  return x / j.pipe.Rx;
}

// Local frame (t, u, v) at x in pipe-local Cartesian coordinates.
export function pipeFrame(j, x, out = { t: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 0] }) {
  const a = angleAt(j, x);
  const c = Math.cos(a), s = Math.sin(a);
  out.t[0] = c; out.t[1] = 0; out.t[2] = s;
  out.u[0] = 0; out.u[1] = 1; out.u[2] = 0;
  out.v[0] = s; out.v[1] = 0; out.v[2] = -c;
  return out;
}

// Joint-local (x, u, v) -> pipe-local Cartesian (mm).
export function pipePoint(j, x, u, v, out = [0, 0, 0]) {
  const a = angleAt(j, x);
  const r = j.pipe.R + v;
  out[0] = r * Math.sin(a);
  out[1] = u;
  out[2] = -r * Math.cos(a);
  return out;
}

// Pipe-local Cartesian (mm) -> joint-local (x, u, v), x in [0, L).
export function pipeLocal(j, X, Y, Z, out = [0, 0, 0]) {
  let a = Math.atan2(X, -Z);
  if (a < 0) a += 2 * Math.PI;
  out[0] = wrapX(j, a * j.pipe.Rx);
  out[1] = Y;
  out[2] = Math.hypot(X, Z) - j.pipe.R;
  return out;
}

// Direction d (pipe-local Cartesian) -> components in the local frame at x.
export function dirToJoint(j, x, d, out = [0, 0, 0]) {
  const a = angleAt(j, x);
  const c = Math.cos(a), s = Math.sin(a);
  const dt = d[0] * c + d[2] * s;
  const du = d[1];
  const dv = d[0] * s - d[2] * c;
  out[0] = dt; out[1] = du; out[2] = dv;
  return out;
}

// Direction in the local frame at x -> pipe-local Cartesian.
export function dirFromJoint(j, x, d, out = [0, 0, 0]) {
  const a = angleAt(j, x);
  const c = Math.cos(a), s = Math.sin(a);
  out[0] = d[0] * c + d[2] * s;
  out[1] = d[1];
  out[2] = d[0] * s - d[2] * c;
  return out;
}

// ---- gravity ---------------------------------------------------------------------------------------------
// Gravity (unit, pointing down) in pipe-local Cartesian coordinates, with the 1G roll applied.
export function pipeGravity(j) {
  const b = j.pipe.basis;
  // g = (0, -1, 0) in the bench frame; components on the pipe-local axes (before the roll)
  const gx = -b.ex[1], gy = -b.ey[1], gz = -b.ez[1];
  const r = j.pipe.roll || 0;
  if (!r) return [gx, gy, gz];
  // the pipe turned by `roll` about its axis (a -> a + roll): gravity seen from the pipe turns back by roll.
  // Rotation of the local (X, Z) components by -roll in the a-sense (a measured from -Z toward +X).
  const c = Math.cos(r), s = Math.sin(r);
  return [gx * c + gz * s, gy, -gx * s + gz * c];
}

// Gravity components in the joint frame at x: t along the travel direction (sigma = +1 travelling toward
// +x, -1 toward -x), u across the joint, v out of the joint. Plate joints: the constant joint.gravity.
// Same sign conventions as joint.js: g.t > 0 downhill, g.t < 0 uphill, g.v > 0 overhead, g.v < 0 flat.
export function gravityAt(j, x, sigma = 1) {
  if (!j.pipe) return sigma === 1 ? j.gravity : { t: -j.gravity.t, u: j.gravity.u, v: j.gravity.v };
  const g = pipeGravity(j);
  const a = angleAt(j, x);
  const c = Math.cos(a), s = Math.sin(a);
  return {
    t: sigma * (g[0] * c + g[2] * s),
    u: g[1],
    v: g[0] * s - g[2] * c,
  };
}

// Position class at x from the local gravity, used where the plate joints have fixed flags (the record's
// overhead and vertical factors, cues). Thresholds are seeds: overhead when the weld face points down
// (g.v > 0.5), flat when it points up (g.v < -0.5) with the joint level across, vertical when the joint
// runs steeply up or down (|g.t| > 0.6), horizontal otherwise.
export function positionClassAt(j, x) {
  const g = gravityAt(j, x, 1);
  if (g.v > 0.5) return 'overhead';
  if (g.v < -0.5 && Math.abs(g.u) < 0.5) return 'flat';
  if (Math.abs(g.t) > 0.6) return 'vertical';
  return 'horizontal';
}

// Clock position (hours, 0 < h <= 12) of x seen along the pipe axis, in the fixed frame: 6 at the lowest
// point, 12 at the top, 3 on the welder's side (horizontal and inclined pipe). For a vertical axis (2G)
// there is no top or bottom: the angle from the far side is returned as hours as well.
export function clockAt(j, x) {
  const a = angleAt(j, wrapX(j, x)) + (j.pipe.roll || 0);
  let h = 6 - (a * 6) / Math.PI;
  h = ((h % 12) + 12) % 12;
  return h === 0 ? 12 : h;
}

// x at a clock position (the near side for 1-6 and the far side for 6-12, as clockAt).
export function xAtClock(j, hours) {
  const a = ((6 - hours) * Math.PI) / 6 - (j.pipe.roll || 0);
  return wrapX(j, a * j.pipe.Rx);
}

// Upward direction along the joint at x (+1 toward +x, -1 toward -x), 0 where the joint is level.
export function uphillSign(j, x) {
  const g = gravityAt(j, x, 1);
  if (Math.abs(g.t) < 0.05) return 0;
  return g.t < 0 ? 1 : -1;
}

// Physical length factor at height v (mm per mm of x): the arc at radius R + v.
export function metricAt(j, v) {
  if (!j.pipe) return 1;
  return clamp((j.pipe.R + v) / j.pipe.Rx, 0.2, 2);
}

// ---- technique ------------------------------------------------------------------------------------------
// Electrode travel angle window (degrees, drag positive) for covered electrodes at x on a pipe, from the
// position the joint is in there. ESAB University, "The Art and Science of Stick Electrode Angle Control"
// (Sep 2025): flat "The travel angle should remain between 5-10 degrees drag"; horizontal "Travel angles
// stay within the 5-10 degree drag range"; vertical up "shift to a push technique with the electrode tilted
// 5-10 degrees toward the direction of travel"; overhead "travel angles remain minimal at 0-10 degrees
// drag"; "5G/5F contains 1G/1F, 3G/3F and 4G/4F positions" and "6G contains all 4 positions so angles will
// be determined and adjusted accordingly". The article does not cover vertical down: there the plate window
// of Lincoln C2.410 ("Tip the electrode 10 to 30 degrees in the direction of travel") is used.
export const SMAW_PIPE_ANGLES = {
  flat: [5, 10],
  horizontal: [5, 10],
  up: [-10, -5],
  down: [10, 30],
  overhead: [0, 10],
};

export function pipeTravelWindow(j, x, sigma = 1) {
  const cls = positionClassAt(j, x);
  if (cls === 'vertical') return gravityAt(j, x, sigma).t < 0 ? SMAW_PIPE_ANGLES.up : SMAW_PIPE_ANGLES.down;
  return SMAW_PIPE_ANGLES[cls];
}
