// Macro section (etched cross-section) drawn from the internal weld record at one position.
// The same record drives the surface bead, so the section shows the weld the trainee made:
// fusion boundary, heat-affected zone, passes, lack of fusion, slag, pores and cracks.

import { grooveWidthAt, levelForArea } from '../sim/joint.js';
import { plateHeight } from '../sim/record.js';
import { clamp, rng, hashSeed } from '../sim/util.js';

const PARENT = '#c3c2bd';
const PARENT2 = '#b9b8b3';
const HAZ = 'rgba(112,104,94,0.85)';
const WELD = ['#8e8981', '#99938a', '#8a857e', '#958f86', '#8d8880', '#9a948b'];
const DARK = '#050505';

export function drawSection(ctx, rec, i, x, y, w, h) {
  const j = rec.joint;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#040506';
  ctx.fillRect(x, y, w, h);
  const out = j.type === 'fillet' ? drawFillet(ctx, rec, i, x, y, w, h) : j.type === 'plate' ? drawPlate(ctx, rec, i, x, y, w, h) : j.openRoot ? drawOpenRoot(ctx, rec, i, x, y, w, h) : drawButt(ctx, rec, i, x, y, w, h);
  ctx.restore();
  return out;
}

function makeTx(x, y, w, h, pmin, pmax, qmin, qmax) {
  const sc = Math.min(w / (pmax - pmin), h / (qmax - qmin));
  const ox = x + (w - sc * (pmax - pmin)) / 2;
  const oy = y + (h - sc * (qmax - qmin)) / 2;
  return { sc, X: (p) => ox + (p - pmin) * sc, Y: (q) => oy + (qmax - q) * sc };
}

function path(ctx, T, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([p, q], k) => (k ? ctx.lineTo(T.X(p), T.Y(q)) : ctx.moveTo(T.X(p), T.Y(q))));
  if (close) ctx.closePath();
}

function fill(ctx, T, pts, color, stroke = null, lw = 1.2) {
  path(ctx, T, pts);
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function grain(ctx, T, poly, seed, n = 1400) {
  // fine etch speckle inside a polygon
  ctx.save();
  path(ctx, T, poly);
  ctx.clip();
  const r = rng(seed);
  const xs = poly.map((p) => T.X(p[0])), ys = poly.map((p) => T.Y(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.6, 1.6);
  }
  ctx.restore();
}

// Columnar grains: short strokes from the fusion boundary toward a growth centre.
function dendrites(ctx, T, boundary, centre, region, seed) {
  ctx.save();
  path(ctx, T, region);
  ctx.clip();
  const r = rng(seed);
  ctx.strokeStyle = 'rgba(40,36,32,0.28)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 90; k++) {
    const a = boundary[Math.floor(r() * (boundary.length - 1))];
    const b = boundary[Math.min(boundary.length - 1, Math.floor(r() * (boundary.length - 1)) + 1)];
    const f = r();
    const p0 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const len = 0.35 + 0.35 * r();
    ctx.beginPath();
    ctx.moveTo(T.X(p0[0]), T.Y(p0[1]));
    ctx.lineTo(T.X(p0[0] + (centre[0] - p0[0]) * len), T.Y(p0[1] + (centre[1] - p0[1]) * len));
    ctx.stroke();
  }
  ctx.restore();
}

// Heat-affected zone: a wide stroke along the fusion boundary, clipped to the parent metal.
function hazBand(ctx, T, boundary, parentPolys, width) {
  ctx.save();
  ctx.beginPath();
  for (const poly of parentPolys) {
    poly.forEach(([p, q], k) => (k ? ctx.lineTo(T.X(p), T.Y(q)) : ctx.moveTo(T.X(p), T.Y(q))));
    ctx.closePath();
  }
  ctx.clip();
  path(ctx, T, boundary, false);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = HAZ;
  ctx.lineWidth = 2 * width * T.sc;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80,72,64,0.55)';
  ctx.lineWidth = 0.9 * width * T.sc;
  ctx.stroke();
  ctx.restore();
}

function scaleBar(ctx, T, x, y, h) {
  const px = 5 * T.sc;
  const bx = x + 24, by = y + h - 28;
  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(bx, by, px, 6);
  ctx.font = '600 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('5 mm', bx + px + 10, by + 8);
}

function crackLine(ctx, T, from, to, seed) {
  const r = rng(seed);
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(T.X(from[0]), T.Y(from[1]));
  for (let q = 1; q <= 8; q++) {
    const f = q / 8;
    ctx.lineTo(T.X(from[0] + (to[0] - from[0]) * f + (r() - 0.5) * 0.35), T.Y(from[1] + (to[1] - from[1]) * f + (r() - 0.5) * 0.35));
  }
  ctx.stroke();
}

function porePoints(rec, i) {
  const out = [];
  for (let k = 0; k < rec.passes.length; k++) {
    for (let q = Math.max(0, i - 1); q <= Math.min(rec.joint.n - 1, i + 1); q++) {
      if (rec.passes[k].area[q] <= 0.05) continue;
      const s = rec.sample(k, q);
      if (!s) continue;
      for (const po of s.events.pores) if (Math.abs(po.s - (i + 0.5)) <= po.d / 2 + 0.5) out.push({ ...po, pass: k });
    }
  }
  return out;
}

function drawPore(ctx, T, p, q, d) {
  ctx.beginPath();
  ctx.arc(T.X(p), T.Y(q), Math.max(2, (d / 2) * T.sc), 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---- fillet (T-joint), drawn with the base plate horizontal and the web vertical --------------------
function drawFillet(ctx, rec, i, x, y, w, h) {
  const j = rec.joint;
  const t = j.t;
  const k = rec.topPassAt(i);
  const s = k >= 0 ? rec.sample(k, i) : null;
  const z1 = s ? s.z1 : 0, z2 = s ? s.z2 : 0;
  const span = Math.max(13, Math.max(z1, z2) + 6);
  const T = makeTx(x + 20, y + 16, w - 40, h - 52, -t - 2, span + 3, -t - 2, span + 1.5);
  const base = [[-t, -t], [span + 3, -t], [span + 3, 0], [-t, 0]];
  const web = [[-t, 0], [0, 0], [0, span + 1.5], [-t, span + 1.5]];
  fill(ctx, T, base, PARENT);
  fill(ctx, T, web, PARENT2);
  grain(ctx, T, base, 7);
  grain(ctx, T, web, 9);
  ctx.strokeStyle = 'rgba(60,60,58,0.9)';
  ctx.lineWidth = 1.2;
  path(ctx, T, [[0, span + 1.5], [0, 0], [span + 3, 0]], false);
  ctx.stroke(); // plate interface line (unfused contact face)
  if (!s) {
    scaleBar(ctx, T, x, y, h);
    return [];
  }
  const F = Math.max(0.2, s.F);
  const lof = s.lofRoot || 0;
  // face (toe2 on the web -> toe1 on the base) with convexity
  const hl = Math.hypot(z1, z2);
  const nu = z2 / hl, nv = z1 / hl;
  const face = [];
  for (let q = 0; q <= 24; q++) {
    const tau = q / 24;
    const b = 4 * s.c * tau * (1 - tau);
    face.push([z1 * tau + b * nu, z2 * (1 - tau) + b * nv]);
  }
  // fusion boundary: web branch, root bowl, base branch
  const Fw = F * 0.85, Fb = F * 0.85;
  const fus = [];
  for (let q = 0; q <= 14; q++) {
    const qq = z2 * (1 - q / 14);
    const d = lof > 0 && qq < lof ? 0 : Fw * Math.sqrt(Math.max(0, 1 - (qq / z2) ** 2));
    fus.push([-d, qq]);
  }
  if (lof <= 0) {
    for (let q = 1; q < 10; q++) {
      const th = (q / 10) * (Math.PI / 2);
      fus.push([-Fw * Math.cos(th), -Fb * Math.sin(th)]);
    }
  } else {
    fus.push([0, lof]);
    fus.push([lof, 0]);
  }
  for (let q = 0; q <= 14; q++) {
    const pp = z1 * (q / 14);
    const d = lof > 0 && pp < lof ? 0 : Fb * Math.sqrt(Math.max(0, 1 - (pp / z1) ** 2));
    fus.push([pp, -d]);
  }
  hazBand(ctx, T, fus, [base, web], 1.1 + 0.45 * F);
  const weld = [...face.slice().reverse(), ...fus.slice(1, -1)];
  fill(ctx, T, weld, WELD[0], 'rgba(58,54,50,0.9)', 1.2);
  grain(ctx, T, weld, 11, 600);
  dendrites(ctx, T, fus, [z1 * 0.35, z2 * 0.35], weld, hashSeed(rec.seed, i, 41));
  if (lof > 0) fill(ctx, T, [[0, 0], [lof, 0.04], [0.04, lof]], DARK);
  // undercut notches cut into the plates just beyond the toes
  if (s.uc1 > 0) fill(ctx, T, [[z1 - 0.15, 0.02], [z1 + 0.35 + 0.4 * s.uc1, -s.uc1], [z1 + 1.0 + 1.2 * s.uc1, 0.02]], '#040506');
  if (s.uc2 > 0) fill(ctx, T, [[0.02, z2 - 0.15], [-s.uc2, z2 + 0.35 + 0.4 * s.uc2], [0.02, z2 + 1.0 + 1.2 * s.uc2]], '#040506');
  // overlap: weld metal rolled onto the plate surface without fusing
  if (s.ov1 > 0.05) {
    fill(ctx, T, [[z1 - 0.3, 0.6], [z1 + s.ov1, 0.02], [z1 - 0.2, 0.02]], WELD[0], 'rgba(58,54,50,0.9)');
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    path(ctx, T, [[z1, 0.03], [z1 + s.ov1, 0.03]], false);
    ctx.stroke();
  }
  if (s.ov2 > 0.05) {
    fill(ctx, T, [[0.6, z2 - 0.3], [0.02, z2 + s.ov2], [0.02, z2 - 0.2]], WELD[0], 'rgba(58,54,50,0.9)');
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    path(ctx, T, [[0.03, z2], [0.03, z2 + s.ov2]], false);
    ctx.stroke();
  }
  if (s.crackCentre) {
    const mid = face[12];
    crackLine(ctx, T, mid, [mid[0] * 0.3, mid[1] * 0.3], hashSeed(rec.seed, i, 43));
  }
  for (const po of porePoints(rec, i)) {
    const tau = clamp(0.5 + po.u / Math.max(4, s.b), 0.15, 0.85);
    const depth = 0.3 + 0.35 * ((po.s * 7.3) % 1);
    const fp = face[Math.round(tau * 24)];
    drawPore(ctx, T, fp[0] * (1 - depth), fp[1] * (1 - depth), po.d);
  }
  // dimensions
  ctx.font = '600 21px sans-serif';
  ctx.fillStyle = '#ffd36a';
  ctx.strokeStyle = '#ffd36a';
  ctx.lineWidth = 1.5;
  ctx.direction = 'ltr';
  const fp = (z1 * z2 * z2) / (hl * hl), fq = (z2 * z1 * z1) / (hl * hl);
  ctx.setLineDash([6, 5]);
  path(ctx, T, [[0, 0], [fp + nu * s.c, fq + nv * s.c]], false);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
  ctx.fillText(`a ${s.aA.toFixed(1)}`, T.X(fp * 0.55) + 10, T.Y(fq * 0.55) - 4);
  ctx.textAlign = 'center';
  ctx.fillText(`z1 ${z1.toFixed(1)}`, T.X(z1 * 0.55), T.Y(-F) + 30);
  ctx.save();
  ctx.translate(T.X(-F) - 22, T.Y(z2 * 0.5));
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`z2 ${z2.toFixed(1)}`, 0, 0);
  ctx.restore();
  scaleBar(ctx, T, x, y, h);
  return [
    { label: 'Leg z1 (base)', value: z1, unit: 'mm' },
    { label: 'Leg z2 (web)', value: z2, unit: 'mm' },
    { label: 'Throat a', value: s.aA, unit: 'mm' },
    { label: 'Fusion depth', value: s.F, unit: 'mm' },
    { label: 'Convexity', value: s.c, unit: 'mm' },
    { label: 'Root fusion', value: lof > 0 ? null : 1, unit: lof > 0 ? `lack of fusion ${lof.toFixed(1)} mm` : 'ok' },
  ];
}

// ---- butt joint on backing ----------------------------------------------------------------------------
function drawButt(ctx, rec, i, x, y, w, h) {
  const j = rec.joint;
  const t = j.t;
  const half = j.topWidth / 2;
  const mis = j.misalignment || 0;
  const g = j.rootGap, f = j.rootFace;
  const bev = (t - f) * j.halfTan;
  const bk = j.backing;
  const k0 = rec.topPassAt(i);
  const top = k0 >= 0 ? rec.sample(k0, i) : null;
  const capH = top && top.h ? top.h : 0;
  const Wd = half + 10;
  const T = makeTx(x + 20, y + 16, w - 40, h - 52, -Wd, Wd, -t - bk.thickness - 1, Math.max(3.5, capH + 1.2));
  const p1 = [[-g / 2, -t], [-g / 2, -t + f], [-(g / 2 + bev), 0], [-Wd, 0], [-Wd, -t]];
  const p2 = [[g / 2, -t - mis], [Wd, -t - mis], [Wd, -mis], [g / 2 + bev, -mis], [g / 2, -t + f - mis]];
  const back = [[-bk.width / 2, -t - bk.thickness], [bk.width / 2, -t - bk.thickness], [bk.width / 2, -t], [-bk.width / 2, -t]];
  fill(ctx, T, p1, PARENT);
  fill(ctx, T, p2, PARENT2);
  fill(ctx, T, back, '#b0afaa');
  for (const [pl, sd] of [[p1, 7], [p2, 9], [back, 13]]) grain(ctx, T, pl, sd, 900);
  if (k0 < 0) {
    scaleBar(ctx, T, x, y, h);
    return [];
  }
  // pass geometry from the record
  const passes = [];
  let cum = 0;
  for (let k = 0; k < rec.passes.length; k++) {
    const A = rec.passes[k].area[i];
    if (A <= 0.05) continue;
    const s = rec.sample(k, i);
    if (!s) continue;
    const lv0 = cum > 0 ? levelForArea(j, cum) : -t;
    cum += A;
    passes.push({ k, s, lv0, cap: cum > j.grooveArea, lv1: cum > j.grooveArea ? 0 : levelForArea(j, cum) });
  }
  const F0 = passes.length ? Math.max(0.2, passes[0].s.F) : 0.3;
  const melt = (s) => Math.min(1.4, Math.max(0.15, s.F) * 0.45);
  // top curve of a pass (convex surface across the groove at its level, or the cap)
  const topCurve = (ps) => {
    const s = ps.s;
    const pts = [];
    if (ps.cap) {
      const wcap = s.wcap || j.topWidth + 2;
      for (let q = 0; q <= 20; q++) {
        const u = -wcap / 2 + (wcap * q) / 20;
        const xx = (2 * u) / wcap;
        pts.push([u, (u > 0 ? -mis * Math.min(1, u / (wcap / 2)) : 0) + s.h * (1 - xx * xx)]);
      }
      return pts;
    }
    const wg = grooveWidthAt(j, ps.lv1) / 2;
    for (let q = 0; q <= 16; q++) {
      const u = -wg + (2 * wg * q) / 16;
      const xx = u / Math.max(wg, 0.5);
      pts.push([u, ps.lv1 + Math.max(0, s.c) * 0.6 * (1 - xx * xx)]);
    }
    return pts;
  };
  // outer fusion boundary: root bowl into the backing, side walls melted back, cap toes
  const wall = (lv, side, m) => {
    const wg = grooveWidthAt(j, Math.min(lv, 0)) / 2;
    return [side * (wg + m), lv];
  };
  const left = [], right = [];
  const r0 = passes[0];
  const rootMelt = r0.s.lofRoot > 0 ? 0.05 : melt(r0.s);
  // root bowl
  const bowl = [];
  for (let q = 0; q <= 12; q++) {
    const a = Math.PI * (q / 12);
    bowl.push([-(g / 2 + rootMelt) * Math.cos(a), -t - (r0.s.lofRoot > 0 ? 0.05 : F0 * 0.8) * Math.sin(a)]);
  }
  for (const ps of passes) {
    if (ps.cap) continue;
    const mL = ps.s.lofSide1 > 0 ? 0.02 : melt(ps.s);
    const mR = ps.s.lofSide2 > 0 ? 0.02 : melt(ps.s);
    const steps = 4;
    for (let q = 0; q <= steps; q++) {
      const lv = ps.lv0 + ((ps.lv1 - ps.lv0) * q) / steps;
      const bulge = Math.sin((Math.PI * q) / steps);
      left.push(wall(lv, -1, 0.05 + (mL - 0.05) * (0.6 + 0.4 * bulge)));
      right.push(wall(lv, 1, 0.05 + (mR - 0.05) * (0.6 + 0.4 * bulge)));
    }
  }
  const capPs = passes.find((p) => p.cap);
  const capCurve = capPs ? topCurve(capPs) : topCurve(passes[passes.length - 1]);
  const boundary = [...bowl.slice().reverse().map(([u, v]) => [u, v])];
  void boundary;
  const outline = [...bowl, ...right.map(([u, v]) => [u, v - (u > 0 ? mis * 0 : 0)]), ...capCurve.slice().reverse(), ...left.slice().reverse()];
  // fusion line from the left cap toe down the left wall, round the root and up the right wall
  const fusionLine = [...left.slice().reverse(), ...bowl, ...right];
  hazBand(ctx, T, [capCurve[0], ...fusionLine, capCurve[capCurve.length - 1]], [p1, p2, back], 1.0 + 0.4 * F0);
  fill(ctx, T, outline, WELD[0], 'rgba(58,54,50,0.9)', 1.2);
  grain(ctx, T, outline, 17, 900);
  // individual passes (shade + boundaries)
  passes.forEach((ps, n) => {
    const below = n === 0 ? [[-g / 2 - rootMelt, -t], [g / 2 + rootMelt, -t]] : topCurve(passes[n - 1]);
    const above = topCurve(ps);
    const region = [...below, ...above.slice().reverse()];
    ctx.save();
    path(ctx, T, outline);
    ctx.clip();
    fill(ctx, T, region, WELD[n % WELD.length]);
    const cy = (ps.lv0 + (ps.cap ? ps.s.h : ps.lv1)) / 2;
    dendrites(ctx, T, below, [0, cy + 0.4], region, hashSeed(rec.seed, i * 7 + n, 47));
    ctx.restore();
    if (n > 0) {
      ctx.strokeStyle = ps.s.lofInter > 0 ? DARK : 'rgba(55,50,46,0.75)';
      ctx.lineWidth = ps.s.lofInter > 0 ? 3 : 1.2;
      const wg = grooveWidthAt(j, Math.min(ps.lv0, 0)) / 2;
      path(ctx, T, below.filter(([u]) => Math.abs(u) <= wg * (ps.s.lofInter > 0 ? 0.85 : 1)), false);
      ctx.stroke();
    }
    // side-wall lack of fusion: unfused slit along the bevel face
    for (const [side, val] of [[-1, ps.s.lofSide1], [1, ps.s.lofSide2]]) {
      if (!(val > 0) || ps.cap) continue;
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3.2;
      path(ctx, T, [wall(ps.lv0, side, 0.02), wall(ps.lv1, side, 0.02)], false);
      ctx.stroke();
    }
    if (ps.s.slag > 0 && n > 0) {
      const r0s = rng(hashSeed(rec.seed, ps.k * 31 + i, 5));
      const side = r0s() < 0.5 ? -1 : 1;
      const wg = grooveWidthAt(j, Math.min(ps.lv0, 0)) / 2;
      const cx = side * (wg - 0.6 - ps.s.slag * 0.4), cy0 = ps.lv0 + 0.15;
      const blob = [];
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * Math.PI * 2;
        const rr = (ps.s.slag / 2) * (0.75 + 0.45 * r0s());
        blob.push([cx + Math.cos(a) * rr * 1.5, cy0 + Math.sin(a) * rr * 0.7]);
      }
      fill(ctx, T, blob, '#2b2016', '#140e09', 1);
    }
    if (ps.s.crackCentre) crackLine(ctx, T, [0.1, ps.cap ? ps.s.h * 0.8 : ps.lv1], [0, ps.lv0 + 0.6], hashSeed(rec.seed, i, 49 + n));
  });
  if (r0.s.lofRoot > 0) {
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 3;
    path(ctx, T, [[-g / 2, -t], [-g / 2, -t + f + 0.3]], false);
    ctx.stroke();
    path(ctx, T, [[g / 2, -t - mis], [g / 2, -t + f + 0.3 - mis]], false);
    ctx.stroke();
    path(ctx, T, [[-g / 2, -t - 0.02], [g / 2, -t - 0.02]], false);
    ctx.stroke();
  }
  // cap toes: undercut
  if (capPs) {
    const wcap = capPs.s.wcap || j.topWidth + 2;
    if (capPs.s.uc1 > 0) fill(ctx, T, [[-wcap / 2 - 1.0 - 1.2 * capPs.s.uc1, 0.02], [-wcap / 2 - 0.35 - 0.4 * capPs.s.uc1, -capPs.s.uc1], [-wcap / 2 + 0.15, 0.02]], '#040506');
    if (capPs.s.uc2 > 0) fill(ctx, T, [[wcap / 2 - 0.15, -mis + 0.02], [wcap / 2 + 0.35 + 0.4 * capPs.s.uc2, -mis - capPs.s.uc2], [wcap / 2 + 1.0 + 1.2 * capPs.s.uc2, -mis + 0.02]], '#040506');
  }
  for (const po of porePoints(rec, i)) {
    const ps = passes.find((p) => p.k === po.pass) || passes[passes.length - 1];
    const v = ps.cap ? ps.s.h * 0.4 : (ps.lv0 + ps.lv1) / 2;
    drawPore(ctx, T, clamp(po.u * 0.6, -half, half), v, po.d);
  }
  // dimensions
  ctx.font = '600 21px sans-serif';
  ctx.fillStyle = '#ffd36a';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  if (capH > 0) ctx.fillText(`h ${capH.toFixed(1)}`, T.X(0) + 8, T.Y(capH) - 10);
  scaleBar(ctx, T, x, y, h);
  return [
    { label: 'Reinforcement h', value: capH, unit: 'mm' },
    { label: 'Cap width', value: top && top.wcap ? top.wcap : null, unit: 'mm' },
    { label: 'Groove fill', value: top ? -Math.min(0, top.level) : null, unit: 'mm below face' },
    { label: 'Root fusion into backing', value: F0 * 0.8, unit: 'mm' },
    { label: 'Passes', value: passes.length, unit: '' },
  ];
}

// ---- open root (pipe, single-V without backing): the root run fills the gap and forms the inside bead ----
// Section through the pipe wall at sample i (the wall curvature over the section width is not drawn). The
// inside bead, root concavity, burn-through, incomplete root penetration and an unfused land come from the
// record's open-root state (record.js openRootSide).
function drawOpenRoot(ctx, rec, i, x, y, w, h) {
  const j = rec.joint;
  const t = j.t;
  const half = j.topWidth / 2;
  const mis = j.misalignment || 0;
  const g = j.rootGap, f = j.rootFace;
  const bev = (t - f) * j.halfTan;
  const k0 = rec.topPassAt(i);
  const top = k0 >= 0 ? rec.sample(k0, i) : null;
  const capH = top && top.h ? top.h : 0;
  const s0 = rec.passes[0].area[i] > 0.05 ? rec.sample(0, i) : null;
  const rh = s0 && s0.rootH != null ? s0.rootH : 0;
  const Wd = half + 10;
  const T = makeTx(x + 20, y + 16, w - 40, h - 52, -Wd, Wd, -t - Math.max(2, rh + 1.2), Math.max(3.5, capH + 1.2));
  const p1 = [[-g / 2, -t], [-g / 2, -t + f], [-(g / 2 + bev), 0], [-Wd, 0], [-Wd, -t]];
  const p2 = [[g / 2, -t - mis], [Wd, -t - mis], [Wd, -mis], [g / 2 + bev, -mis], [g / 2, -t + f - mis]];
  fill(ctx, T, p1, PARENT);
  fill(ctx, T, p2, PARENT2);
  for (const [pl, sd] of [[p1, 7], [p2, 9]]) grain(ctx, T, pl, sd, 900);
  if (k0 < 0 || !s0) {
    scaleBar(ctx, T, x, y, h);
    return [];
  }
  // pass levels: the root's metal that went through the gap (inside bead) is below the root surface
  const rootOff = s0.rootA != null ? s0.rootA - s0.voidA : 0;
  const passes = [];
  let cum = -rootOff;
  for (let k = 0; k < rec.passes.length; k++) {
    const A = rec.passes[k].area[i];
    if (A <= 0.05) continue;
    const s = rec.sample(k, i);
    if (!s) continue;
    const lv0 = cum > 0 ? levelForArea(j, cum) : -t;
    cum += A;
    passes.push({ k, s, lv0, cap: cum > j.grooveArea, lv1: cum > j.grooveArea ? 0 : cum > 0 ? levelForArea(j, cum) : -t + 0.2 });
  }
  if (!passes.length) {
    scaleBar(ctx, T, x, y, h);
    return [];
  }
  const melt = (s) => Math.min(1.4, Math.max(0.15, s.F) * 0.45);
  const topCurve = (ps) => {
    const s = ps.s;
    const pts = [];
    if (ps.cap) {
      const wcap = s.wcap || j.topWidth + 2;
      for (let q = 0; q <= 20; q++) {
        const u = -wcap / 2 + (wcap * q) / 20;
        const xx = (2 * u) / wcap;
        pts.push([u, (u > 0 ? -mis * Math.min(1, u / (wcap / 2)) : 0) + s.h * (1 - xx * xx)]);
      }
      return pts;
    }
    const wg = grooveWidthAt(j, ps.lv1) / 2;
    for (let q = 0; q <= 16; q++) {
      const u = -wg + (2 * wg * q) / 16;
      const xx = u / Math.max(wg, 0.5);
      pts.push([u, ps.lv1 + Math.max(0, s.c) * 0.6 * (1 - xx * xx)]);
    }
    return pts;
  };
  const wall = (lv, side, m) => [side * (grooveWidthAt(j, Math.min(lv, 0)) / 2 + m), lv];
  // root: the lands melted back (unless unfused), the inside bead (or concavity) under the gap, or the gap
  // left open at the bottom (incomplete root penetration)
  const lop = s0.lop || 0;
  const mL = s0.lofRoot1 > 0 ? 0.02 : melt(s0), mR = s0.lofRoot2 > 0 ? 0.02 : melt(s0);
  const rw = Math.max(g + 0.2, s0.rootW || g + 1);
  const bottom = [];
  if (lop > 0) {
    bottom.push([-g / 2 - 0.02, -t + lop], [g / 2 + 0.02, -t + lop - mis]);
  } else {
    bottom.push([-g / 2 - mL, -t + 0.02]);
    for (let q = 0; q <= 16; q++) {
      const u = -rw / 2 + (rw * q) / 16;
      const xx = (2 * u) / rw;
      bottom.push([u, -t - rh * (1 - xx * xx) - (u > 0 ? mis * Math.min(1, u / (rw / 2)) : 0)]);
    }
    bottom.push([g / 2 + mR, -t + 0.02 - mis]);
  }
  const left = [], right = [];
  // land faces (root run) then the bevel walls of each pass
  left.push([-g / 2 - mL, -t + (lop > 0 ? lop : 0.02)]);
  right.push([g / 2 + mR, -t + (lop > 0 ? lop : 0.02) - mis]);
  for (const ps of passes) {
    if (ps.cap) continue;
    const a = ps.k === 0 ? mL : ps.s.lofSide1 > 0 ? 0.02 : melt(ps.s);
    const b = ps.k === 0 ? mR : ps.s.lofSide2 > 0 ? 0.02 : melt(ps.s);
    const steps = 4;
    for (let q = 0; q <= steps; q++) {
      const lv = Math.max(-t + 0.05, ps.lv0 + ((ps.lv1 - ps.lv0) * q) / steps);
      const bulge = Math.sin((Math.PI * q) / steps);
      left.push(wall(lv, -1, 0.05 + (a - 0.05) * (0.6 + 0.4 * bulge)));
      right.push(wall(lv, 1, 0.05 + (b - 0.05) * (0.6 + 0.4 * bulge)));
    }
  }
  const capPs = passes.find((q) => q.cap);
  const capCurve = capPs ? topCurve(capPs) : topCurve(passes[passes.length - 1]);
  const outline = [...bottom, ...right, ...capCurve.slice().reverse(), ...left.slice().reverse()];
  const fusionLine = [...left.slice().reverse(), ...bottom, ...right];
  hazBand(ctx, T, [capCurve[0], ...fusionLine, capCurve[capCurve.length - 1]], [p1, p2], 1.0 + 0.4 * Math.max(0.2, s0.F));
  fill(ctx, T, outline, WELD[0], 'rgba(58,54,50,0.9)', 1.2);
  grain(ctx, T, outline, 17, 900);
  passes.forEach((ps, n) => {
    const below = n === 0 ? bottom : topCurve(passes[n - 1]);
    const above = topCurve(ps);
    const region = [...below, ...above.slice().reverse()];
    ctx.save();
    path(ctx, T, outline);
    ctx.clip();
    fill(ctx, T, region, WELD[n % WELD.length]);
    const cy = (ps.lv0 + (ps.cap ? ps.s.h : ps.lv1)) / 2;
    dendrites(ctx, T, below, [0, cy + 0.4], region, hashSeed(rec.seed, i * 7 + n, 47));
    ctx.restore();
    if (n > 0) {
      ctx.strokeStyle = ps.s.lofInter > 0 ? DARK : 'rgba(55,50,46,0.75)';
      ctx.lineWidth = ps.s.lofInter > 0 ? 3 : 1.2;
      const wg = grooveWidthAt(j, Math.min(ps.lv0, 0)) / 2;
      path(ctx, T, below.filter(([u]) => Math.abs(u) <= wg * (ps.s.lofInter > 0 ? 0.85 : 1)), false);
      ctx.stroke();
    }
    for (const [side, val] of [[-1, ps.s.lofSide1], [1, ps.s.lofSide2]]) {
      if (!(val > 0) || ps.cap || ps.k === 0) continue;
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3.2;
      path(ctx, T, [wall(ps.lv0, side, 0.02), wall(ps.lv1, side, 0.02)], false);
      ctx.stroke();
    }
    if (ps.s.slag > 0 && n > 0) {
      const r0s = rng(hashSeed(rec.seed, ps.k * 31 + i, 5));
      const side = r0s() < 0.5 ? -1 : 1;
      const wg = grooveWidthAt(j, Math.min(ps.lv0, 0)) / 2;
      const cx = side * (wg - 0.6 - ps.s.slag * 0.4), cy0 = ps.lv0 + 0.15;
      const blob = [];
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * Math.PI * 2;
        const rr = (ps.s.slag / 2) * (0.75 + 0.45 * r0s());
        blob.push([cx + Math.cos(a) * rr * 1.5, cy0 + Math.sin(a) * rr * 0.7]);
      }
      fill(ctx, T, blob, '#2b2016', '#140e09', 1);
    }
    if (ps.s.crackCentre) crackLine(ctx, T, [0.1, ps.cap ? ps.s.h * 0.8 : ps.lv1], [0, ps.lv0 + 0.6], hashSeed(rec.seed, i, 49 + n));
  });
  // unfused land(s): the original land face still there, a dark slit (lack of root fusion)
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 3;
  if (s0.lofRoot1 > 0) {
    path(ctx, T, [[-g / 2, -t], [-g / 2, -t + Math.min(f, s0.lofRoot1) + 0.2]], false);
    ctx.stroke();
  }
  if (s0.lofRoot2 > 0) {
    path(ctx, T, [[g / 2, -t - mis], [g / 2, -t + Math.min(f, s0.lofRoot2) + 0.2 - mis]], false);
    ctx.stroke();
  }
  // burn-through: the root pool fell through, leaving a hole above a drop of metal
  if (s0.burn) {
    const hole = [];
    for (let q = 0; q < 14; q++) {
      const a = (q / 14) * Math.PI * 2;
      hole.push([Math.cos(a) * g * 0.42, -t + f * 0.55 + Math.sin(a) * f * 0.45]);
    }
    fill(ctx, T, hole, DARK);
  }
  if (capPs) {
    const wcap = capPs.s.wcap || j.topWidth + 2;
    if (capPs.s.uc1 > 0) fill(ctx, T, [[-wcap / 2 - 1.0 - 1.2 * capPs.s.uc1, 0.02], [-wcap / 2 - 0.35 - 0.4 * capPs.s.uc1, -capPs.s.uc1], [-wcap / 2 + 0.15, 0.02]], '#040506');
    if (capPs.s.uc2 > 0) fill(ctx, T, [[wcap / 2 - 0.15, -mis + 0.02], [wcap / 2 + 0.35 + 0.4 * capPs.s.uc2, -mis - capPs.s.uc2], [wcap / 2 + 1.0 + 1.2 * capPs.s.uc2, -mis + 0.02]], '#040506');
  }
  for (const po of porePoints(rec, i)) {
    const ps = passes.find((q) => q.k === po.pass) || passes[passes.length - 1];
    const v = ps.cap ? ps.s.h * 0.4 : (ps.lv0 + ps.lv1) / 2;
    drawPore(ctx, T, clamp(po.u * 0.6, -half, half), v, po.d);
  }
  ctx.font = '600 21px sans-serif';
  ctx.fillStyle = '#ffd36a';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  if (capH > 0) ctx.fillText(`h ${capH.toFixed(1)}`, T.X(0) + 8, T.Y(capH) - 10);
  if (lop === 0) ctx.fillText(`${rh >= 0 ? 'inside' : 'concave'} ${Math.abs(rh).toFixed(1)}`, T.X(rw / 2) + 8, T.Y(-t - Math.max(0, rh)) + 22);
  scaleBar(ctx, T, x, y, h);
  return [
    { label: 'Inside bead (root side) h', value: lop > 0 ? null : rh, unit: 'mm' },
    { label: 'Root not penetrated', value: lop > 0 ? lop : 0, unit: 'mm' },
    { label: 'Reinforcement h', value: capH, unit: 'mm' },
    { label: 'Cap width', value: top && top.wcap ? top.wcap : null, unit: 'mm' },
    { label: 'Passes', value: passes.length, unit: '' },
  ];
}

// ---- bead on plate (technique drills): every bead crossing the section, in welding order -------------
function drawPlate(ctx, rec, i, x, y, w, h) {
  const j = rec.joint;
  const t = j.t;
  const beads = [];
  for (let k = 0; k < rec.passes.length; k++) {
    if (!(rec.passes[k].area[i] > 0.05)) continue;
    const s = rec.sample(k, i);
    if (s && s.wb > 0) beads.push({ k, s });
  }
  let u0, u1;
  if (beads.length) {
    u0 = Math.min(...beads.map((b) => b.s.uc - b.s.wb / 2)) - 7;
    u1 = Math.max(...beads.map((b) => b.s.uc + b.s.wb / 2)) + 7;
  } else {
    const l = j.lanes && j.lanes.length ? j.lanes : [0];
    u0 = Math.min(...l) - 12;
    u1 = Math.max(...l) + 12;
  }
  const span = Math.max(u1 - u0, 28);
  const mid = (u0 + u1) / 2;
  u0 = mid - span / 2;
  u1 = mid + span / 2;
  const top = beads.length ? Math.max(...beads.map((b) => b.s.base + b.s.h)) : 0;
  const T = makeTx(x + 20, y + 16, w - 40, h - 52, u0, u1, -t - 0.6, Math.max(4, top + 1.5));
  const plate = [[u0 - 1, -t], [u1 + 1, -t], [u1 + 1, 0], [u0 - 1, 0]];
  fill(ctx, T, plate, PARENT);
  grain(ctx, T, plate, 7, 1400);
  if (!beads.length) {
    scaleBar(ctx, T, x, y, h);
    return [];
  }
  const N = 28;
  // fusion line of each bead: below the surface it was laid on, deepest under the centre
  const fusionOf = (b) => {
    const s = b.s;
    const wf = 0.5 * s.wb * 0.94;
    const Fd = s.lofSurface ? 0.08 : Math.max(0.15, s.F) * 0.85;
    const pts = [];
    for (let q = 0; q <= N; q++) {
      const u = s.uc - wf + (2 * wf * q) / N;
      const xx = (u - s.uc) / wf;
      const under = plateHeight(rec, i, u, b.k);
      // where the bead lies on an earlier bead that it does not fuse into (inter-run lack of fusion)
      const dd = s.lofInter > 0 && under > 0.05 ? 0.04 : Fd * Math.sqrt(Math.max(0, 1 - xx * xx));
      pts.push([u, under - dd]);
    }
    return pts;
  };
  const capOf = (b) => {
    const s = b.s;
    const pts = [];
    for (let q = 0; q <= N; q++) {
      const u = s.uc - s.wb / 2 + (s.wb * q) / N;
      pts.push([u, plateHeight(rec, i, u, b.k + 1)]);
    }
    return pts;
  };
  // heat-affected zone along every fusion line in the parent plate
  for (const b of beads) hazBand(ctx, T, fusionOf(b), [plate], 1.0 + 0.4 * Math.max(0.2, b.s.F));
  beads.forEach((b, n) => {
    const s = b.s;
    const fus = fusionOf(b);
    const cap = capOf(b);
    const region = [...fus, ...cap.slice().reverse()];
    fill(ctx, T, region, WELD[n % WELD.length], 'rgba(58,54,50,0.9)', 1.2);
    grain(ctx, T, region, 21 + n, 500);
    dendrites(ctx, T, fus, [s.uc, s.base + s.h * 0.45], region, hashSeed(rec.seed, i * 13 + n, 53));
    // unfused interface where the bead lies on an earlier one
    if (s.lofInter > 0) {
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3;
      path(ctx, T, fus.filter(([u, v]) => v > 0.02), false);
      ctx.stroke();
    }
    // cold lap: weld metal resting on the plate without fusing
    if (s.lofSurface) {
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2.6;
      path(ctx, T, fus, false);
      ctx.stroke();
    }
    // slag trapped against the previous bead
    if (s.slag > 0) {
      const r0 = rng(hashSeed(rec.seed, b.k * 31 + i, 5));
      const side = r0() < 0.5 ? -1 : 1;
      const cx = s.uc + side * s.wb * 0.3, cy = plateHeight(rec, i, s.uc + side * s.wb * 0.3, b.k) + 0.15;
      const blob = [];
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * Math.PI * 2;
        const rr = (s.slag / 2) * (0.75 + 0.45 * r0());
        blob.push([cx + Math.cos(a) * rr * 1.5, cy + Math.sin(a) * rr * 0.7]);
      }
      fill(ctx, T, blob, '#2b2016', '#140e09', 1);
    }
    // free toes: undercut notch and overlap
    const tl = s.uc - s.wb / 2, tr = s.uc + s.wb / 2;
    const sl = plateHeight(rec, i, tl - 1, b.k), sr = plateHeight(rec, i, tr + 1, b.k);
    if (s.uc1 > 0) fill(ctx, T, [[tl + 0.15, sl + 0.02], [tl - 0.35 - 0.4 * s.uc1, sl - s.uc1], [tl - 1.0 - 1.2 * s.uc1, sl + 0.02]], '#040506');
    if (s.uc2 > 0) fill(ctx, T, [[tr - 0.15, sr + 0.02], [tr + 0.35 + 0.4 * s.uc2, sr - s.uc2], [tr + 1.0 + 1.2 * s.uc2, sr + 0.02]], '#040506');
    for (const [side, ov, sv, toe] of [[-1, s.ov1, sl, tl], [1, s.ov2, sr, tr]]) {
      if (!(ov > 0.05)) continue;
      fill(ctx, T, [[toe - side * 0.3, sv + 0.6], [toe + side * ov, sv + 0.02], [toe - side * 0.2, sv + 0.02]], WELD[n % WELD.length], 'rgba(58,54,50,0.9)');
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2;
      path(ctx, T, [[toe, sv + 0.03], [toe + side * ov, sv + 0.03]], false);
      ctx.stroke();
    }
    if (s.crackCentre) crackLine(ctx, T, [s.uc + 0.1, s.base + s.h * 0.85], [s.uc, s.base - Math.max(0.2, s.F) * 0.6], hashSeed(rec.seed, i, 59 + n));
  });
  for (const po of porePoints(rec, i)) {
    const b = beads.find((q) => q.k === po.pass) || beads[beads.length - 1];
    const s = b.s;
    const u = clamp(po.u, s.uc - s.wb * 0.35, s.uc + s.wb * 0.35);
    drawPore(ctx, T, u, s.base + s.h * (0.35 + 0.25 * ((po.s * 7.3) % 1)), po.d);
  }
  // dimensions of the last bead
  const last = beads[beads.length - 1].s;
  ctx.font = '600 21px sans-serif';
  ctx.fillStyle = '#ffd36a';
  ctx.strokeStyle = '#ffd36a';
  ctx.lineWidth = 1.5;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  const yTop = last.base + last.h;
  ctx.fillText(`w ${last.wb.toFixed(1)}  h ${last.h.toFixed(1)}`, T.X(last.uc), T.Y(yTop) - 14);
  scaleBar(ctx, T, x, y, h);
  const pen = Math.max(...beads.filter((b) => b.s.base < 0.05).map((b) => (b.s.lofSurface ? 0 : Math.max(0.15, b.s.F) * 0.85)), 0);
  const inter = beads.some((b) => b.s.lofInter > 0);
  return [
    { label: 'Bead width', value: last.wb, unit: 'mm' },
    { label: 'Bead height above its toes', value: last.h, unit: 'mm' },
    { label: 'Penetration into the plate', value: pen, unit: 'mm' },
    { label: 'Beads in this section', value: beads.length, unit: '' },
    { label: 'Fusion between beads', value: inter ? null : 1, unit: inter ? 'lack of fusion' : 'ok' },
  ];
}
