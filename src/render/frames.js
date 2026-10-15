// Placement of each joint/position on the bench and conversion between joint-local millimetres
// and bench-frame metres. Bench frame: origin at the table-top centre, X right, Y up, Z toward
// the welder. The workstation group maps the bench frame into the XR world.

import * as THREE from 'three';

const S2 = Math.SQRT1_2;

// Origin (bench frame, metres) of the joint start for each position; physical length 240 mm.
const ORIGINS = {
  fillet: {
    PA: [-0.12, 0.06, 0.0],
    PB: [-0.12, 0.010, -0.04],
    PD: [-0.12, 0.85, 0.05],
    PF: [-0.03, 0.10, -0.02],
    PG: [-0.03, 0.34, -0.02],
  },
  plate: {
    PA: [-0.12, 0.010, 0.0], // plate lying on the bench (10 mm thick)
  },
  butt: {
    PA: [-0.12, 0.06, 0.0],
    PC: [-0.12, 0.25, -0.02],
    PE: [-0.12, 0.85, 0.05],
    PF: [0.0, 0.10, -0.02],
    PG: [0.0, 0.34, -0.02],
  },
};

// Pipe joints: the coupon frame is the pipe-local frame (mm; sim/pipe.js) turned into the bench by the
// pipe's basis and the 1G roll about its axis; the joint centre stands at PIPE_AT (bench m), raised to
// pipe.height, just in front of the bench edge so there is room under the pipe for the 6 o'clock part.
export const PIPE_AT = [0, 0.35, 0.42];

export function pipePlacement(joint) {
  const p = joint.pipe;
  const b = p.basis;
  const ex = new THREE.Vector3(...b.ex), ey = new THREE.Vector3(...b.ey), ez = new THREE.Vector3(...b.ez);
  const m = new THREE.Matrix4().makeBasis(ex.multiplyScalar(0.001), ey.multiplyScalar(0.001), ez.multiplyScalar(0.001));
  if (p.roll) m.multiply(new THREE.Matrix4().makeRotationY(-p.roll)); // a -> a + roll (see sim/pipe.js)
  const origin = new THREE.Vector3(PIPE_AT[0], p.height ?? PIPE_AT[1], PIPE_AT[2]);
  m.setPosition(origin);
  const inv = m.clone().invert();
  return { t: ex.clone().normalize(), u: ey.clone().normalize(), v: ez.clone().normalize(), origin, jointToBench: m, benchToJoint: inv, pipe: true };
}

export function jointPlacement(joint, opts = {}) {
  if (joint.pipe) return pipePlacement(joint);
  const a = joint.axes;
  const t = new THREE.Vector3(...a.t);
  const u = new THREE.Vector3(...a.u);
  const v = new THREE.Vector3(...a.v);
  const o = ORIGINS[joint.type][joint.position];
  const origin = new THREE.Vector3(...o);
  void opts;
  // Left-handed travel is handled by the app (sample index mirrored along x), not by the frame,
  // so the frame stays right-handed and geometry winding is unchanged.
  // jointToBench maps (x, u, v) in mm to bench metres.
  const m = new THREE.Matrix4().makeBasis(t.clone().multiplyScalar(0.001), u.clone().multiplyScalar(0.001), v.clone().multiplyScalar(0.001));
  m.setPosition(origin);
  const inv = m.clone().invert();
  return { t, u, v, origin, jointToBench: m, benchToJoint: inv };
}

// Helpers to build coupon geometry directly in joint-local mm.
export function boxFromAxes(o, a, b, c) {
  // o: corner [x,u,v]; a, b, c: edge vectors [x,u,v]
  const P = (i, j, k) => [o[0] + a[0] * i + b[0] * j + c[0] * k, o[1] + a[1] * i + b[1] * j + c[1] * k, o[2] + a[2] * i + b[2] * j + c[2] * k];
  const faces = [
    [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)],
    [P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1)],
    [P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0)],
    [P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)],
    [P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)],
    [P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0)],
  ];
  return quadsToGeometry(faces);
}

export function quadsToGeometry(quads) {
  const pos = [];
  const uv = [];
  for (const q of quads) {
    const [p0, p1, p2, p3] = q;
    const tri = [p0, p1, p2, p0, p2, p3];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const uvs = [[0, 0], [l1, 0], [l1, l2], [0, 0], [l1, l2], [0, l2]];
    tri.forEach((p, k) => {
      pos.push(p[0], p[1], p[2]);
      uv.push(uvs[k][0] / 100, uvs[k][1] / 100);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Extrude a 2D polygon in (u, v) along x from 0 to L (mm). Polygon counter-clockwise.
export function extrudeUV(poly, L) {
  const quads = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    quads.push([[0, a[0], a[1]], [0, b[0], b[1]], [L, b[0], b[1]], [L, a[0], a[1]]]);
  }
  const g = quadsToGeometry(quads);
  // caps (fan triangulation; polygons used here are convex)
  const capPos = [];
  for (let i = 1; i < n - 1; i++) {
    capPos.push(0, poly[0][0], poly[0][1], 0, poly[i + 1][0], poly[i + 1][1], 0, poly[i][0], poly[i][1]);
    capPos.push(L, poly[0][0], poly[0][1], L, poly[i][0], poly[i][1], L, poly[i + 1][0], poly[i + 1][1]);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((capPos.length / 3) * 2).fill(0), 2));
  cap.computeVertexNormals();
  return mergeGeometries([g, cap]);
}

export function mergeGeometries(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list) {
    const gp = g.attributes.position.array;
    pos.set(gp, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

export const FILLET_DIRS = {
  d1: [S2, S2], // base plate surface direction in (u, v)
  d2: [-S2, S2], // web plate surface direction
  n1: [-S2, S2], // base plate outward normal (into the joint wedge)
  n2: [S2, S2], // web plate outward normal
};
