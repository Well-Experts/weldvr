// Safety signs drawn on canvas in the ISO 7010 style (shape and colour by sign type: blue circle =
// mandatory action, yellow triangle = warning, red square = fire equipment, green square = safe
// condition, red circle with bar = prohibition). Pictograms are simplified drawings, not copies of the
// registered artwork. Codes and names as listed for ISO 7010 (secondary source, see safety/refs.js).
// Z49.1:2021 4.1.2: signs shall designate welding areas and show the protection to be worn.

import * as THREE from 'three';

const BLUE = '#1f5aa8';
const YELLOW = '#f9c31a';
const RED = '#c8202a';
const GREEN = '#1f8a4c';

export const SIGNS = {
  M019: { kind: 'mandatory', en: 'Wear a welding mask', ar: 'ارتدِ قناع اللحام', draw: drawWeldMask },
  M004: { kind: 'mandatory', en: 'Wear eye protection', ar: 'ارتدِ واقي العينين', draw: drawGlasses },
  M009: { kind: 'mandatory', en: 'Wear protective gloves', ar: 'ارتدِ قفازات واقية', draw: drawGlove },
  M010: { kind: 'mandatory', en: 'Wear protective clothing', ar: 'ارتدِ ملابس واقية', draw: drawCoat },
  M008: { kind: 'mandatory', en: 'Wear safety footwear', ar: 'ارتدِ حذاء السلامة', draw: drawBoot },
  M003: { kind: 'mandatory', en: 'Wear ear protection', ar: 'ارتدِ واقي الأذنين', draw: drawMuffs },
  W012: { kind: 'warning', en: 'Warning: electricity', ar: 'تحذير: كهرباء', draw: drawBolt },
  W027: { kind: 'warning', en: 'Warning: optical radiation', ar: 'تحذير: إشعاع ضوئي', draw: drawRays },
  W017: { kind: 'warning', en: 'Warning: hot surface', ar: 'تحذير: سطح ساخن', draw: drawHot },
  W021: { kind: 'warning', en: 'Warning: flammable material', ar: 'تحذير: مواد قابلة للاشتعال', draw: drawFlame },
  W029: { kind: 'warning', en: 'Warning: pressurized cylinder', ar: 'تحذير: أسطوانة مضغوطة', draw: drawCylinder },
  F001: { kind: 'fire', en: 'Fire extinguisher', ar: 'طفاية حريق', draw: drawExtinguisher },
  E003: { kind: 'safe', en: 'First aid', ar: 'إسعافات أولية', draw: drawCross },
  P002: { kind: 'prohibition', en: 'No smoking', ar: 'ممنوع التدخين', draw: drawCigarette },
};

const cache = new Map();

// Texture of one sign with its code-free bilingual caption below.
export function signTexture(code) {
  if (cache.has(code)) return cache.get(code);
  const s = SIGNS[code];
  const W = 256, H = 344;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, 124);
  shape(ctx, s.kind);
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, 124);
  const fg = s.kind === 'warning' ? '#111' : '#fff';
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  s.draw(ctx, s.kind === 'warning' ? 0.78 : 1);
  ctx.restore();
  if (s.kind === 'prohibition') {
    ctx.save();
    ctx.translate(W / 2, 124);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(-74, -74);
    ctx.lineTo(74, 74);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#16191d';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillText(s.en, W / 2, 268, W - 16);
  ctx.font = 'bold 24px "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.direction = 'rtl';
  ctx.fillText(s.ar, W / 2, 312, W - 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(code, t);
  return t;
}

// A sign plate (metres). The texture aspect is 256 x 344.
export function signMesh(code, width = 0.2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * 344) / 256), new THREE.MeshStandardMaterial({ map: signTexture(code), roughness: 0.55, metalness: 0 }));
  m.name = `sign:${code}`;
  return m;
}

function shape(ctx, kind) {
  if (kind === 'mandatory') {
    ctx.fillStyle = BLUE;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'warning') {
    ctx.fillStyle = '#111';
    tri(ctx, 116);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    tri(ctx, 98);
    ctx.fill();
  } else if (kind === 'fire' || kind === 'safe') {
    ctx.fillStyle = kind === 'fire' ? RED : GREEN;
    ctx.fillRect(-100, -100, 200, 200);
  } else if (kind === 'prohibition') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function tri(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.98, r * 0.72);
  ctx.lineTo(-r * 0.98, r * 0.72);
  ctx.closePath();
}

function head(ctx) {
  ctx.beginPath();
  ctx.ellipse(-6, -10, 34, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-26, 26, 34, 30); // neck
  ctx.beginPath();
  ctx.ellipse(-8, 76, 58, 22, 0, Math.PI, 0); // shoulders
  ctx.fill();
}

function drawWeldMask(ctx) {
  head(ctx);
  // helmet shell in front of the face with a dark window
  ctx.beginPath();
  ctx.moveTo(14, -52);
  ctx.quadraticCurveTo(58, -46, 56, 2);
  ctx.lineTo(50, 40);
  ctx.quadraticCurveTo(28, 50, 10, 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillRect(26, -24, 22, 14);
}

function drawGlasses(ctx) {
  head(ctx);
  ctx.fillStyle = BLUE;
  ctx.fillRect(4, -22, 34, 14);
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, -24, 40, 4);
}

function drawMuffs(ctx) {
  head(ctx);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(-6, -10, 46, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.ellipse(-12, -2, 13, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-12, -2, 9, 16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGlove(ctx) {
  // gauntlet glove: cuff and hand with thumb and four fingers
  ctx.beginPath();
  ctx.moveTo(-34, 78);
  ctx.lineTo(-40, 26);
  ctx.lineTo(36, 26);
  ctx.lineTo(30, 78);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-30, -22, 58, 52);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.roundRect(-30 + k * 15, -72 + Math.abs(k - 1.5) * 8, 13, 56, 6);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(24, -20, 34, 13, 6);
  ctx.fill();
}

function drawCoat(ctx) {
  ctx.beginPath();
  ctx.moveTo(-28, -70);
  ctx.lineTo(28, -70);
  ctx.lineTo(70, -40);
  ctx.lineTo(62, 30);
  ctx.lineTo(44, 30);
  ctx.lineTo(42, -10);
  ctx.lineTo(40, 76);
  ctx.lineTo(-40, 76);
  ctx.lineTo(-42, -10);
  ctx.lineTo(-44, 30);
  ctx.lineTo(-62, 30);
  ctx.lineTo(-70, -40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillRect(-2, -64, 4, 136);
}

function drawBoot(ctx) {
  ctx.beginPath();
  ctx.moveTo(-40, -70);
  ctx.lineTo(10, -70);
  ctx.lineTo(10, 10);
  ctx.quadraticCurveTo(70, 18, 72, 48);
  ctx.lineTo(72, 64);
  ctx.lineTo(-44, 64);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillRect(-44, 50, 116, 5);
}

function drawBolt(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(10, -70);
  ctx.lineTo(-26, 6);
  ctx.lineTo(2, 6);
  ctx.lineTo(-14, 64);
  ctx.lineTo(30, -14);
  ctx.lineTo(2, -14);
  ctx.lineTo(22, -70);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRays(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(0, 12);
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
    ctx.lineTo(Math.cos(a) * (k % 2 ? 44 : 54), Math.sin(a) * (k % 2 ? 44 : 54));
    ctx.stroke();
  }
  ctx.restore();
}

function drawHot(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.fillRect(-50, 40, 100, 10);
  ctx.lineWidth = 7;
  for (const x of [-26, 0, 26]) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.bezierCurveTo(x - 12, 10, x + 12, -6, x, -26);
    ctx.bezierCurveTo(x - 10, -40, x + 8, -50, x, -60);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlame(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -66);
  ctx.bezierCurveTo(30, -30, 46, 0, 34, 30);
  ctx.bezierCurveTo(26, 52, -26, 52, -34, 30);
  ctx.bezierCurveTo(-44, 6, -20, -10, -10, -30);
  ctx.bezierCurveTo(-4, -16, 6, -24, 0, -66);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-46, 52, 92, 9);
  ctx.restore();
}

function drawCylinder(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.roundRect(-20, -46, 40, 104, 14);
  ctx.fill();
  ctx.fillRect(-8, -62, 16, 18);
  ctx.fillRect(-16, -68, 32, 8);
  ctx.restore();
}

function drawExtinguisher(ctx) {
  ctx.beginPath();
  ctx.roundRect(-22, -44, 44, 112, 12);
  ctx.fill();
  ctx.fillRect(-8, -62, 16, 20);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(8, -58);
  ctx.quadraticCurveTo(52, -58, 46, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -64);
  ctx.lineTo(-34, -72);
  ctx.stroke();
}

function drawCross(ctx) {
  ctx.fillRect(-18, -62, 36, 124);
  ctx.fillRect(-62, -18, 124, 36);
}

function drawCigarette(ctx) {
  ctx.fillStyle = '#111';
  ctx.fillRect(-60, 0, 96, 20);
  ctx.fillStyle = '#999';
  ctx.fillRect(36, 0, 18, 20);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(48, -6);
  ctx.bezierCurveTo(40, -24, 60, -36, 50, -56);
  ctx.stroke();
}
