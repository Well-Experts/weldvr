// Procedural textures (no external image files, so the app is a single self-contained page).

import * as THREE from 'three';
import { rng } from '../sim/util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function blotches(ctx, w, h, rand, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h;
    const r = rMin + (rMax - rMin) * rand();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = colorFn(rand);
    g.addColorStop(0, c);
    g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Hot-rolled plate with mill scale: fairly even blue-grey with faint mottling and a few flaked spots.
export function millScale(seed = 3) {
  const w = 512, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#4b525b';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rand, 140, 8, 40, (r) => `rgba(${34 + r() * 14},${38 + r() * 14},${46 + r() * 14},0.16)`);
  blotches(ctx, w, h, rand, 50, 4, 18, (r) => `rgba(${100 + r() * 30},${106 + r() * 30},${114 + r() * 30},0.14)`);
  blotches(ctx, w, h, rand, 10, 3, 10, () => `rgba(120,80,48,0.12)`);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 9;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = rand() < 0.5 ? '#202428' : '#8a949c';
    ctx.lineWidth = 0.5 + rand();
    const y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rand() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c, 1);
}

export function steelTable(seed = 7) {
  const w = 512, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#2b2e32';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rand, 120, 20, 80, (r) => `rgba(${20 + r() * 15},${22 + r() * 15},${25 + r() * 15},0.4)`);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = rand() < 0.5 ? '#111' : '#666';
    ctx.lineWidth = 0.6;
    const x = rand() * w, y = rand() * h;
    const a = rand() * Math.PI;
    const l = 5 + rand() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // old spatter marks and arc burns on a working table
  blotches(ctx, w, h, rand, 60, 1, 4, () => 'rgba(10,10,10,0.6)');
  return finish(c, 2);
}

export function concrete(seed = 11) {
  const w = 512, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#6b6966';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rand, 220, 15, 70, (r) => `rgba(${80 + r() * 40},${78 + r() * 40},${74 + r() * 38},0.25)`);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(30,30,30,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h); // slab joints
  return finish(c, 6);
}

export function curtain() {
  const w = 256, h = 64;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    const s = 0.75 + 0.25 * Math.sin(k * Math.PI * 8);
    g.addColorStop(k, `rgba(${Math.round(190 * s)},${Math.round(60 * s)},${Math.round(25 * s)},1)`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const t = finish(c, 1);
  t.repeat.set(3, 1);
  return t;
}

// Soft radial sprite for glare, sparks and smoke.
export function softDot(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, hard = 0.15) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(hard, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Arc glare with a faint starburst (lens and eye scatter).
export function glare() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const m = size / 2;
  const g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(235,245,255,0.95)');
  g.addColorStop(0.2, 'rgba(170,200,255,0.35)');
  g.addColorStop(0.5, 'rgba(120,150,255,0.08)');
  g.addColorStop(1, 'rgba(100,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    const lg = ctx.createLinearGradient(m - Math.cos(a) * m, m - Math.sin(a) * m, m + Math.cos(a) * m, m + Math.sin(a) * m);
    lg.addColorStop(0, 'rgba(200,220,255,0)');
    lg.addColorStop(0.5, 'rgba(220,235,255,0.07)');
    lg.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m - Math.cos(a) * m, m - Math.sin(a) * m);
    ctx.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- workshop materials ------------------------------------------------------------------------
// Height noise -> tangent-space normal map (generated once at start-up; no image files).
export function normalFromHeight(hc, strength = 2, repeat = 1) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((dy / l) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noiseCanvas(size, seed, octaves, base = 128, amp = 60) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);
  const rand = rng(seed);
  for (const [n, r0, r1, a] of octaves) blotches(ctx, size, size, rand, n, r0, r1, () => (rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`));
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amp * 0.3;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Workshop floor: sealed concrete slab with tyre marks, oil stains and saw-cut joints every 3 m
// (the texture repeats every 3 m).
export function workshopFloor(seed = 21) {
  const w = 1024;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#7b7873';
  ctx.fillRect(0, 0, w, w);
  blotches(ctx, w, w, rand, 500, 20, 110, (r) => `rgba(${88 + r() * 40},${86 + r() * 40},${80 + r() * 38},0.22)`);
  blotches(ctx, w, w, rand, 26, 18, 70, () => `rgba(38,34,30,${0.10 + rand() * 0.12})`); // oil stains
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = '#2a2826';
    ctx.lineWidth = 20 + rand() * 26;
    const y = rand() * w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 200, w * 0.7, y + (rand() - 0.5) * 200, w, y + (rand() - 0.5) * 80);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, w, w);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(28,27,26,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, w - 3);
  return finish(c, 1);
}

export function floorNormal(seed = 22) {
  return normalFromHeight(noiseCanvas(512, seed, [[300, 2, 10, 0.18], [60, 10, 40, 0.1]]), 3);
}

// Matte painted steel (booth panels, machine cases): even colour, faint orange peel, edge wear.
export function paintedSteel(color = '#3d434b', seed = 31, wear = 0.5) {
  const w = 512;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, w);
  blotches(ctx, w, w, rand, 160, 10, 60, () => `rgba(${rand() < 0.5 ? 255 : 0},${rand() < 0.5 ? 255 : 0},${rand() < 0.5 ? 255 : 0},0.025)`);
  blotches(ctx, w, w, rand, Math.round(40 * wear), 2, 9, () => 'rgba(150,150,150,0.25)'); // chips
  blotches(ctx, w, w, rand, Math.round(30 * wear), 3, 14, () => 'rgba(20,18,16,0.35)'); // grime, spatter
  ctx.globalAlpha = 0.04 * wear;
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = rand() < 0.5 ? '#000' : '#fff';
    ctx.lineWidth = 0.6;
    const x = rand() * w, y = rand() * w, a = rand() * Math.PI, l = 4 + rand() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c, 1);
}

export function paintNormal(seed = 32) {
  return normalFromHeight(noiseCanvas(256, seed, [[400, 1, 4, 0.12]]), 1.2);
}

// Painted blockwork wall: light upper wall, darker dado band.
export function blockWall(seed = 41) {
  const w = 512, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#b9bcbe';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rand, 120, 10, 50, () => `rgba(${rand() < 0.5 ? 255 : 90},${rand() < 0.5 ? 255 : 90},${rand() < 0.5 ? 255 : 90},0.05)`);
  ctx.strokeStyle = 'rgba(80,82,84,0.35)';
  ctx.lineWidth = 2;
  const bh = h / 8, bw = w / 2;
  for (let r = 0; r < 8; r++) {
    const y = r * bh;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    const off = r % 2 ? bw / 2 : 0;
    for (let x = off; x < w; x += bw) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + bh);
      ctx.stroke();
    }
  }
  return finish(c, 1);
}

// Leather (gloves, aprons, jackets): base colour with grain and worn, darker creases.
export function leather(color = '#8a6a4a', seed = 51) {
  const w = 256;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, w);
  blotches(ctx, w, w, rand, 300, 2, 10, () => `rgba(${rand() < 0.5 ? 255 : 0},${rand() < 0.5 ? 230 : 0},${rand() < 0.5 ? 200 : 0},0.06)`);
  blotches(ctx, w, w, rand, 20, 8, 30, () => 'rgba(30,20,10,0.15)');
  return finish(c, 1);
}

export function leatherNormal(seed = 52) {
  return normalFromHeight(noiseCanvas(256, seed, [[900, 1, 3, 0.2]]), 2.2);
}

// Woven fabric (FR cotton jacket, curtains): fine twill.
export function fabric(color = '#3c4a5a', seed = 61) {
  const w = 256;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, w);
  ctx.globalAlpha = 0.12;
  for (let i = -w; i < w; i += 3) {
    ctx.strokeStyle = (i / 3) % 2 ? '#000' : '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + w, w);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  blotches(ctx, w, w, rand, 40, 6, 24, () => 'rgba(0,0,0,0.05)');
  return finish(c, 2);
}

// Corrugated cardboard boxes with tape.
export function cardboard(seed = 71) {
  const w = 256;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#b08a5a';
  ctx.fillRect(0, 0, w, w);
  blotches(ctx, w, w, rand, 60, 6, 30, () => 'rgba(90,60,30,0.10)');
  ctx.fillStyle = 'rgba(200,180,140,0.55)';
  ctx.fillRect(0, w * 0.45, w, w * 0.1); // tape
  ctx.fillStyle = 'rgba(40,30,20,0.6)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('THIS SIDE UP', 20, 40);
  return finish(c, 1);
}

export function wood(seed = 81) {
  const w = 256;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#a07a50';
  ctx.fillRect(0, 0, w, w);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = rand() < 0.5 ? '#6a4a2a' : '#c09a6a';
    ctx.lineWidth = 1 + rand() * 2;
    const y = rand() * w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 12, w * 0.6, y + (rand() - 0.5) * 12, w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c, 1);
}

// Perforated hardboard (tool board).
export function pegboard() {
  const w = 256;
  const c = canvas(w, w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6f6150';
  ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = '#2a241c';
  for (let y = 8; y < w; y += 16) for (let x = 8; x < w; x += 16) {
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, 4);
}

// Transparent welding curtain strip: orange-red with vertical light streaks.
export function curtainStrip() {
  const w = 128, h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(205,72,26,0.75)');
  g.addColorStop(0.5, 'rgba(232,104,40,0.68)');
  g.addColorStop(1, 'rgba(205,72,26,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.1;
  for (let x = 6; x < w; x += 11) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, 0, 2, h);
  }
  ctx.globalAlpha = 1;
  const t = finish(c, 1);
  t.repeat.set(4, 1);
  return t;
}
