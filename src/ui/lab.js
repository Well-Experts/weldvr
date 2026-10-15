// Test lab panel of the welder qualification: the radiograph of the test weld on a film viewer, the bent
// specimens, the fracture and nick-break faces, and the macro sections, all drawn from the weld record and
// its imperfection map (qual/flaws.js) so that they show the weld the trainee made.
//
// The film is an ideal radiograph computed from the steel thickness the beam crosses at each point: the
// plate or pipe wall, the cap and root reinforcement, the backing strip, less the voids of pores, slag, lack
// of fusion and penetration, plus the denser tungsten. Film brightness follows the transmitted intensity
// exp(-mu x) (mu = 0.1 per mm of steel, a visual value): thicker steel is lighter, voids are darker. Lead
// location markers and a wire-type image quality indicator (IQI) are drawn as on a real film (lead and the
// wires are lighter). It is an illustration of the weld model, not a simulation of exposure conditions.

import { COLORS } from './ui.js';
import { t } from './i18n.js';
import { grooveWidthAt } from '../sim/joint.js';
import { rng, hashSeed, clamp } from '../sim/util.js';
import { clockAt } from '../sim/pipe.js';
import { drawSection as paintSection } from '../render/section.js';
import { FLAW_NAMES } from '../qual/flaws.js';

const MU = 0.1; // 1/mm, film rendering only
const r1 = (x) => Math.round(x * 10) / 10;

// ---- radiograph -------------------------------------------------------------------------------------------
function wrapI(j, i) {
  if (!j.pipe) return clamp(i, 0, j.n - 1);
  const n = j.n;
  return ((i % n) + n) % n;
}

// Extra steel thickness (mm, relative to the wall) at (sample i, u) from the weld profile on both faces.
function profileAt(rec, i, u) {
  const j = rec.joint;
  let d = 0;
  const k = rec.topPassAt(i);
  if (k < 0) {
    // empty groove: the gap through the wall, the bevels open above the land
    const half = j.topWidth / 2;
    const au = Math.abs(u);
    if (au <= j.rootGap / 2) return -j.t + (j.backing ? j.backing.thickness : 0) * (Math.abs(u) <= (j.backing?.width ?? 0) / 2 ? 1 : 0);
    if (au < half) d -= (j.t - j.rootFace) * (1 - (au - j.rootGap / 2) / Math.max(0.1, half - j.rootGap / 2));
  } else {
    const s = rec.sample(k, i);
    if (s && s.h > 0 && s.wcap) {
      const x = (2 * u) / s.wcap;
      if (Math.abs(x) < 1) d += s.h * (1 - x * x);
    } else if (s && s.level < 0) {
      const wg = grooveWidthAt(j, s.level) / 2;
      const half = j.topWidth / 2;
      const au = Math.abs(u);
      if (au <= wg) d += s.level;
      else if (au < half) d += s.level * (1 - (au - wg) / Math.max(0.1, half - wg));
    }
  }
  if (j.openRoot) {
    const s0 = rec.passes[0].area[i] > 0.05 ? rec.sample(0, i) : null;
    if (s0) {
      if (s0.lop > 0) {
        if (Math.abs(u) < j.rootGap / 2) d -= s0.lop;
      } else if (s0.rootW) {
        const x = (2 * u) / s0.rootW;
        if (Math.abs(x) < 1) d += s0.rootH * (1 - x * x);
      }
    }
  } else if (j.backing && Math.abs(u) <= j.backing.width / 2) d += j.backing.thickness;
  return d;
}

// Splat the imperfections onto the thickness buffer.
function splatFlaws(buf, W, H, map, s0, pxmm, uHalf) {
  const L = map.L;
  const toPx = (s) => {
    let x = s - s0;
    if (map.periodic) x = ((x % L) + L) % L;
    return x * pxmm;
  };
  const add = (px, py, v) => {
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    buf[py * W + px] += v;
  };
  const uToPy = (u) => (uHalf - u) * pxmm;
  for (const it of map.items) {
    if (it.fillet) continue;
    if (it.type === 'pore' || it.type === 'tungsten') {
      const r = it.d / 2;
      const cx = toPx(it.s), cy = uToPy((it.u0 + it.u1) / 2);
      const R = Math.ceil(r * pxmm) + 1;
      const f = it.type === 'tungsten' ? 6 : -1;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const rho2 = (dx * dx + dy * dy) / (pxmm * pxmm);
        if (rho2 >= r * r) continue;
        add(Math.round(cx + dx), Math.round(cy + dy), f * 2 * Math.sqrt(r * r - rho2));
      }
      continue;
    }
    if (it.type === 'craterCrack') {
      const cx = toPx(it.s), cy = uToPy(0);
      const n = Math.max(2, Math.round(it.len * pxmm * 0.6));
      const rr = rng(hashSeed(Math.round(it.s * 10), 7, 3));
      for (let arm = 0; arm < 3; arm++) {
        const a = rr() * Math.PI * 2;
        for (let q = 0; q < n; q++) add(Math.round(cx + Math.cos(a) * q * 0.5), Math.round(cy + Math.sin(a) * q * 0.5), -0.8);
      }
      continue;
    }
    // per-type strength (mm of steel missing along the beam) and band across u
    let du0 = it.u0, du1 = it.u1, v = 0;
    switch (it.type) {
      case 'slag': v = -0.6 * it.h * 2; break; // slag is far less dense than steel
      case 'lofSide': v = -0.35; break; // thin unfused face, inclined to the beam
      case 'lofInter': v = -0.12; break; // flat unfused interface, across the beam
      case 'lofRoot': du0 = it.u0 - 0.15; du1 = it.u1 + 0.15; v = -Math.min(1.5, it.h); break; // land face edge-on
      case 'lop': v = 0; break; // drawn by the root profile (the unfilled gap)
      case 'crack': du0 = -0.1; du1 = 0.1; v = -0.9 * Math.min(2, it.h); break;
      case 'burn': v = -0.6 * it.h; break;
      case 'undercut': v = -it.h; break;
      case 'lofSurface': v = -0.3; break;
      default: v = 0;
    }
    if (!v) continue;
    const pa = Math.floor(toPx(it.s0)), pb = Math.ceil(toPx(it.s0) + (it.s1 - it.s0) * pxmm);
    const ya = Math.floor(uToPy(du1)), yb = Math.ceil(uToPy(du0));
    for (let px = pa; px <= pb; px++) {
      let pxw = px;
      if (map.periodic) pxw = ((px % W) + W) % W;
      for (let py = ya; py <= Math.max(ya, yb); py++) {
        // slag: elliptical across its width
        let f = 1;
        if (it.type === 'slag' || it.type === 'burn') {
          const cy = (ya + yb) / 2, hy = Math.max(1, (yb - ya) / 2);
          f = Math.max(0, 1 - ((py - cy) / hy) ** 2);
        }
        add(pxw, py, v * f);
      }
    }
  }
}

// Film of the window [s0, s1) (physical), u in [-uHalf, uHalf]. Returns an offscreen canvas.
export function renderFilm(rec, map, opts = {}) {
  const j = rec.joint;
  const s0 = opts.s0 ?? (j.pipe ? 0 : map.a - 10);
  const s1 = opts.s1 ?? (j.pipe ? j.L : map.b + 10);
  const pxmm = opts.pxmm ?? (j.pipe ? 4 : 5);
  const uHalf = opts.uHalf ?? Math.max(28, j.topWidth / 2 + 16);
  const W = Math.round((s1 - s0) * pxmm), H = Math.round(2 * uHalf * pxmm);
  const buf = new Float32Array(W * H);
  // weld profile, sampled per pixel column
  for (let px = 0; px < W; px++) {
    const s = s0 + (px + 0.5) / pxmm;
    const i = wrapI(j, Math.floor(s));
    for (let py = 0; py < H; py++) {
      const u = uHalf - (py + 0.5) / pxmm;
      buf[py * W + px] = profileAt(rec, i, u);
    }
  }
  splatFlaws(buf, W, H, map, s0, pxmm, uHalf);
  // IQI on the source side across the weld near the start of the film: seven wires of falling diameter
  const wires = [0.4, 0.32, 0.25, 0.2, 0.16, 0.125, 0.1];
  const iqX = Math.round(12 * pxmm);
  wires.forEach((d, k) => {
    const px = iqX + Math.round(k * 2.4 * pxmm);
    for (let py = Math.round(H * 0.18); py < Math.round(H * 0.82); py++) for (let w = 0; w < Math.max(1, Math.round(d * pxmm)); w++) if (px + w < W) buf[py * W + px + w] += d;
  });
  // brightness with grain and a little unsharpness
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rr = rng(hashSeed(rec.seed || 1, 77, 5));
  const val = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) val[k] = clamp(0.3 + 1.1 * (1 - Math.exp(-MU * buf[k])), 0.02, 0.97);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const k = py * W + px;
      const a = val[k], b = val[py * W + Math.min(W - 1, px + 1)], c = val[Math.min(H - 1, py + 1) * W + px];
      const v = (2 * a + b + c) / 4 + (rr() - 0.5) * 0.045;
      const g = Math.round(clamp(v, 0, 1) * 255);
      img.data[k * 4] = Math.round(g * 0.94);
      img.data[k * 4 + 1] = Math.round(g * 0.98);
      img.data[k * 4 + 2] = g;
      img.data[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // lead markers (white on the film)
  ctx.fillStyle = 'rgba(245,248,250,0.95)';
  ctx.font = `700 ${Math.round(4 * pxmm)}px monospace`;
  ctx.textBaseline = 'top';
  if (j.pipe) {
    for (let h = 1; h <= 12; h++) {
      const x = ((xAtClockLocal(j, h) - s0 + j.L) % j.L) * pxmm;
      ctx.fillText(String(h), x - 2 * pxmm, 1.5 * pxmm);
    }
  } else {
    for (let mm = 0; mm <= (map.b - map.a); mm += 50) {
      const x = (map.a + mm - s0) * pxmm;
      ctx.fillText(String(mm), x - 2 * pxmm, 1.5 * pxmm);
      ctx.fillRect(x - 0.3 * pxmm, 6.5 * pxmm, 0.6 * pxmm, 2 * pxmm);
    }
  }
  ctx.font = `700 ${Math.round(3.4 * pxmm)}px monospace`;
  ctx.fillText(opts.id || 'WX', 4 * pxmm, H - 6 * pxmm);
  return { canvas: cv, s0, s1, pxmm, uHalf, W, H };
}

function xAtClockLocal(j, hours) {
  const a = ((6 - hours) * Math.PI) / 6 - (j.pipe.roll || 0);
  const x = a * j.pipe.Rx;
  return ((x % j.L) + j.L) % j.L;
}

// Specimen label and location in the interface language: 'Root bend B1' -> t('Root bend') + ' B1';
// "10:30 o'clock" -> 10:30 + t("o'clock").
export function spLabel(sp) {
  const id = sp.id ? ` ${sp.id}` : '';
  return id && sp.label.endsWith(id) ? `${t(sp.label.slice(0, -id.length))}${id}` : t(sp.label);
}

export function whereText(w) {
  const s = String(w ?? '');
  return s.endsWith(" o'clock") ? `${s.slice(0, -8)} ${t("o'clock")}` : t(s);
}

// ---- specimens --------------------------------------------------------------------------------------------
function drawBend(ui, sp, x, y, w, h, map) {
  const c = ui.ctx;
  const ok = sp.verdict === 'accept';
  ui.rect(x, y, w, h, '#10161d', 12, ok ? '#24563a' : '#6a2a26', 2);
  ui.text(`${spLabel(sp)} · ${whereText(sp.where)}`, x + 14, y + 30, { size: 20, weight: 700, maxW: w - 160 });
  ui.text(ok ? t('ACCEPT') : t('REJECT'), x + w - 14, y + 30, { size: 20, weight: 700, color: ok ? COLORS.ok : COLORS.bad, align: 'end' });
  // side view: the bent U
  const cx = x + 90, cy = y + 120, R = 46, th = 12;
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = '#8f949a';
  c.lineWidth = th;
  c.beginPath();
  c.arc(cx, cy, R, Math.PI, 0, true);
  c.lineTo(cx + R, cy + 60);
  c.moveTo(cx - R, cy);
  c.lineTo(cx - R, cy + 60);
  c.stroke();
  // weld zone at the bottom of the bend (convex surface outside)
  c.strokeStyle = '#b8a27a';
  c.lineWidth = th;
  c.beginPath();
  c.arc(cx, cy, R, Math.PI * 0.4, Math.PI * 0.6, false);
  c.stroke();
  c.restore();
  ui.text(`${Math.round((sp.e || 0) * 100)} %`, cx - 22, cy + 82, { size: 17, color: COLORS.dim });
  // convex surface, unrolled: 80 mm across the weld x specimen width
  const fx = x + 190, fy = y + 52, fw = w - 206, fh = Math.min(h - 70, 120);
  const span = 80;
  const sx = fw / span;
  const sw = sp.kind === 'side' ? map.t : sp.w;
  const sy = Math.min(fh / Math.max(sw, 1), 8);
  const hh = sw * sy;
  c.fillStyle = '#9da2a8';
  c.fillRect(fx, fy, fw, hh);
  // weld and heat-affected zone band
  const wz = sp.kind === 'side' ? map.joint.topWidth ?? 14 : (map.joint.topWidth ?? 14) + 2;
  c.fillStyle = '#b3a07e';
  c.fillRect(fx + fw / 2 - (wz / 2) * sx, fy, wz * sx, hh);
  c.fillStyle = 'rgba(120,100,70,0.35)';
  c.fillRect(fx + fw / 2 - (wz / 2 + 2) * sx, fy, 2 * sx, hh);
  c.fillRect(fx + fw / 2 + (wz / 2) * sx, fy, 2 * sx, hh);
  // opened discontinuities
  let worst = 0;
  for (const o of sp.opened || []) {
    const it = o.item;
    worst = Math.max(worst, o.size);
    const uc = (it.u0 + it.u1) / 2;
    const ox = fx + fw / 2 + uc * (1 + (sp.e || 0)) * sx;
    let oy;
    if (sp.kind === 'side') oy = fy + clamp((it.v0 + it.v1) / 2 + map.t, 0, sw) * sy;
    else {
      const sMid = clamp(((it.s0 + it.s1) / 2) - (sp.sc - sp.w / 2), 0, sp.w);
      oy = fy + sMid * sy;
    }
    const ow = Math.max(3, o.across * sx), oh = Math.max(3, (sp.kind === 'side' ? Math.min(o.along, sw) : Math.min(o.along, sw)) * sy);
    c.fillStyle = o.size > 3 ? '#140707' : '#2a2222';
    c.beginPath();
    c.ellipse(ox, oy, ow / 2, oh / 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = '#5b6168';
  c.lineWidth = 1;
  c.strokeRect(fx, fy, fw, hh);
  const lines = (sp.findings || []).filter((f) => !f.info).slice(0, 2).map((f) => `${t(f.name)} ${f.measured} ${f.unit || ''} (${f.limit})`);
  let ty = ui.wrap(sp.opened && sp.opened.length ? `${t('Largest opening')}: ${r1(worst)} mm` : t('No open discontinuity on the convex surface'), fx, fy + hh + 24, fw, { size: 17, color: COLORS.dim, maxLines: 2 });
  for (const ln of lines) ty = ui.wrap(ln, fx, ty, fw, { size: 15, color: COLORS.faint, maxLines: 2 });
}

function drawFracture(ui, sp, x, y, w, h, map) {
  const c = ui.ctx;
  const ok = sp.verdict === 'accept';
  ui.rect(x, y, w, h, '#10161d', 12, ok ? '#24563a' : '#6a2a26', 2);
  ui.text(`${spLabel(sp)} · ${whereText(sp.where)}`, x + 14, y + 30, { size: 20, weight: 700, maxW: w - 160 });
  ui.text(ok ? t('ACCEPT') : t('REJECT'), x + w - 14, y + 30, { size: 20, weight: 700, color: ok ? COLORS.ok : COLORS.bad, align: 'end' });
  const fillet = map.joint.type === 'fillet';
  const depthMM = fillet ? map.joint.aNom * 1.25 : map.t;
  const len = sp.s1 - sp.s0;
  const fx = x + 14, fy = y + 50, fw = w - 28;
  const sx = fw / len;
  const sy = Math.min((h - 110) / depthMM, 10);
  const fh = depthMM * sy;
  // fibrous fracture texture
  const rr = rng(hashSeed(Math.round(sp.s0), 3, 9));
  c.fillStyle = '#7d8086';
  c.fillRect(fx, fy, fw, fh);
  for (let k = 0; k < 900; k++) {
    c.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    c.fillRect(fx + rr() * fw, fy + rr() * fh, 2, 2);
  }
  const L = map.L;
  const sPos = (s) => {
    let d = s - sp.s0;
    if (map.periodic) d = ((d % L) + L) % L;
    return fx + clamp(d, 0, len) * sx;
  };
  const vPos = (v) => (fillet ? fy + fh - clamp(v, 0, depthMM) * sy : fy + clamp(-v, 0, depthMM) * sy);
  for (const ex of sp.exposed || []) {
    const it = ex.item;
    if (it.type === 'pore' || it.type === 'tungsten') {
      const px = sPos(it.s), py = vPos(fillet ? (it.v0 + it.v1) / 2 : (it.v0 + it.v1) / 2);
      c.fillStyle = it.type === 'tungsten' ? '#d9dde2' : '#1a1a1c';
      c.beginPath();
      c.arc(px, py, Math.max(2.5, (it.d / 2) * Math.min(sx, sy)), 0, Math.PI * 2);
      c.fill();
      continue;
    }
    const a = sPos(Math.max(it.s0, sp.s0)), b = a + Math.max(2, ex.length * sx);
    const ya = vPos(fillet ? it.v1 : it.v1), yb = vPos(fillet ? it.v0 : it.v0);
    const top = Math.min(ya, yb), hgt = Math.max(3, Math.abs(yb - ya));
    if (it.type === 'slag') c.fillStyle = '#2b2116';
    else if (it.type === 'crack' || it.type === 'craterCrack') c.fillStyle = '#0d0d0f';
    else c.fillStyle = '#b9bcc0'; // unfused faces: smooth and bright beside the fibrous fracture
    c.fillRect(a, top, b - a, hgt);
    c.strokeStyle = '#2e3135';
    c.lineWidth = 1;
    c.strokeRect(a, top, b - a, hgt);
  }
  c.strokeStyle = '#5b6168';
  c.strokeRect(fx, fy, fw, fh);
  ui.text(`${r1(len)} mm × ${r1(depthMM)} mm`, fx, fy + fh + 22, { size: 16, color: COLORS.faint });
  const bad = (sp.findings || []).filter((f) => !f.ok && !f.info);
  const lines = (bad.length ? bad : (sp.findings || []).filter((f) => !f.info)).slice(0, 2).map((f) => `${t(f.name)}: ${f.measured} ${f.unit || ''} (${f.limit})`);
  if (!lines.length) lines.push(t('Sound fracture face: no imperfection exposed'));
  lines.forEach((ln, k) => ui.text(ln, fx, fy + fh + 46 + k * 22, { size: 16, color: bad.length ? COLORS.warn : COLORS.dim, maxW: fw }));
}

// ---- panel -----------------------------------------------------------------------------------------------
// app.labView: { result (qual/run.js), exam (index into result.exams), page, overlay }
export function drawLab(ui, app) {
  ui.background('rgba(8,10,12,0.97)', 22);
  const lv = app.labView;
  if (!lv || !lv.result) return;
  const res = lv.result;
  const exams = res.exams.filter((e) => e.id !== 'vt');
  if (!exams.length) {
    ui.text(t('Test lab'), 26, 50, { size: 30, weight: 700 });
    ui.wrap(res.verdict === 'invalid' ? t('The test piece was not accepted for testing.') : t('The test stopped at the visual examination.'), 26, 110, ui.W - 52, { size: 24, color: COLORS.dim });
    ui.button('lab-close', ui.W - 110, 14, 86, 52, '✕', () => app.showLab(false), { size: 28 });
    return;
  }
  const k = clamp(lv.exam ?? 0, 0, exams.length - 1);
  const ex = exams[k];
  ui.text(t('Test lab'), 26, 50, { size: 30, weight: 700 });
  ui.button('lab-close', ui.W - 110, 14, 86, 52, '✕', () => app.showLab(false), { size: 28 });
  if (exams.length > 1) {
    ui.segmented('lab-exam', 210, 14, ui.W - 210 - 130, 52, exams.map((e, n) => ({ value: n, label: t(e.title).split(' (')[0] })), k, (v) => {
      lv.exam = v;
      lv.page = 0;
      app.lab.invalidate();
    }, { size: 18 });
  } else ui.text(t(ex.title), 210, 50, { size: 24, color: COLORS.accent, weight: 600, maxW: ui.W - 360 });
  const rec = app.station.record;
  const map = res.map;
  const y0 = 82;
  if (ex.id === 'rt') {
    if (!lv.film || lv.film.res !== res) {
      lv.film = { res, f: renderFilm(rec, map, { id: res.test.id }) };
    }
    const f = lv.film.f;
    const pipe = !!rec.joint.pipe;
    // a pipe's circumference on as many films (rows) as shows it largest
    const avail = ui.W - 52;
    const gap = pipe ? 36 : 14;
    let rows = 1, scale = 0;
    for (let r = 1; r <= (pipe ? 4 : 1); r++) {
      const sc = Math.min(avail / (f.W / r), (560 - r * gap) / r / f.H);
      if (sc > scale) {
        scale = sc;
        rows = r;
      }
    }
    const segW = f.W / rows;
    for (let r = 0; r < rows; r++) {
      const yy = y0 + gap + r * (f.H * scale + gap);
      // film viewer light around the film
      ui.rect(20, yy - 6, segW * scale + 12, f.H * scale + 12, '#e8eef2', 6);
      ui.ctx.drawImage(f.canvas, r * segW, 0, segW, f.H, 26, yy, segW * scale, f.H * scale);
      if (lv.overlay) {
        for (const ind of ex.indications || []) {
          let px = ((ind.sc - f.s0) % rec.joint.L + rec.joint.L) % rec.joint.L * f.pxmm;
          if (!pipe) px = (ind.sc - f.s0) * f.pxmm;
          if (px < r * segW || px >= (r + 1) * segW) continue;
          const X = 26 + (px - r * segW) * scale;
          const Y = yy + (f.uHalf - (ind.u0 + ind.u1) / 2) * f.pxmm * scale;
          const wpx = Math.max(10, ind.length * f.pxmm * scale), hpx = Math.max(10, ind.width * f.pxmm * scale);
          ui.ctx.strokeStyle = '#ffcf3f';
          ui.ctx.lineWidth = 2;
          ui.ctx.strokeRect(X - wpx / 2 - 3, Y - hpx / 2 - 3, wpx + 6, hpx + 6);
        }
      }
      if (pipe) ui.text(rows > 1 ? `${t('Film')} ${r + 1}/${rows}` : t('Film: whole circumference'), 26, yy - 12, { size: 15, color: COLORS.faint });
    }
    const by = y0 + gap + rows * (f.H * scale + gap);
    ui.button('lab-ovl', 26, by, 300, 50, lv.overlay ? t('Hide indications') : t('Mark indications'), () => {
      lv.overlay = !lv.overlay;
      app.lab.invalidate();
    }, { size: 19, selected: !!lv.overlay });
    let y = by + 74;
    const bad = (ex.findings || []).filter((x) => !x.ok);
    const show = bad.length ? bad : (ex.findings || []).filter((x) => !x.info).slice(0, 3);
    if (!show.length) y = ui.wrap(t('No reportable indications on the film.'), 26, y, ui.W - 52, { size: 20, color: COLORS.ok });
    for (const fd of show.slice(0, 5)) y = ui.wrap(`${fd.ok ? '✓' : '✗'} ${fd.clause}: ${t(fd.name)} ${fd.measured} ${fd.unit || ''} — ${fd.limit}`, 26, y, ui.W - 52, { size: 18, color: fd.ok ? COLORS.dim : COLORS.bad, maxLines: 2 });
    ui.wrap(t('Simulated radiograph: an ideal image of the weld model (every imperfection shown at its size); location markers and a wire IQI as on a real film.'), 26, ui.H - 44, ui.W - 52, { size: 15, color: COLORS.faint, maxLines: 2 });
    return;
  }
  const specs = ex.specimens || [];
  if (!specs.length) return;
  // macro sections: one per page
  if (specs[0].test === 'macro') {
    const page = clamp(lv.page ?? 0, 0, specs.length - 1);
    const sp = specs[page];
    ui.text(`${spLabel(sp)} · ${whereText(sp.where)}`, 26, y0 + 30, { size: 22, weight: 700, color: sp.verdict === 'accept' ? COLORS.ok : COLORS.bad });
    paintSection(ui.ctx, rec, wrapI(rec.joint, Math.round(sp.s)), 20, y0 + 44, ui.W - 40, 470);
    let y = y0 + 540;
    for (const fd of (sp.findings || []).slice(0, 6)) y = ui.wrap(`${fd.ok ? '✓' : '✗'} ${fd.clause}: ${t(fd.name)} ${fd.measured} ${fd.unit || ''} (${fd.limit})`, 26, y, ui.W - 52, { size: 17, color: fd.ok ? COLORS.dim : COLORS.bad, maxLines: 1 });
    pager(ui, app, lv, specs.length, page);
    return;
  }
  // bend and fracture specimens: up to four per page
  const per = 4;
  const pages = Math.ceil(specs.length / per);
  const page = clamp(lv.page ?? 0, 0, pages - 1);
  const list = specs.slice(page * per, page * per + per);
  const cw = (ui.W - 52 - 16) / 2;
  const ch = (ui.H - y0 - 90 - 16) / 2;
  list.forEach((sp, n) => {
    const x = 26 + (n % 2) * (cw + 16), y = y0 + 6 + Math.floor(n / 2) * (ch + 16);
    if (sp.test === 'bend') drawBend(ui, sp, x, y, cw, ch, map);
    else drawFracture(ui, sp, x, y, cw, ch, map);
  });
  if (pages > 1) pager(ui, app, lv, pages, page);
  if (ex.notes && ex.notes.length) ui.wrap(t(ex.notes[0]), 26, ui.H - 46, ui.W - 52, { size: 15, color: COLORS.faint, maxLines: 2 });
}

function pager(ui, app, lv, n, page) {
  if (n <= 1) return;
  const by = ui.H - 112;
  ui.button('lab-prev', ui.W - 340, by, 150, 50, '‹', () => { lv.page = Math.max(0, page - 1); app.lab.invalidate(); }, { size: 26, disabled: page === 0 });
  ui.text(`${page + 1} / ${n}`, ui.W - 175, by + 34, { size: 20, color: COLORS.dim, align: 'center' });
  ui.button('lab-next', ui.W - 160, by, 150, 50, '›', () => { lv.page = Math.min(n - 1, page + 1); app.lab.invalidate(); }, { size: 26, disabled: page >= n - 1 });
}

// Where a pipe position is (for labels).
export function clockOf(j, s) {
  return j.pipe ? clockAt(j, s) : null;
}
export { FLAW_NAMES };
