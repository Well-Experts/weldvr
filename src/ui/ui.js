// Canvas-texture UI panels for VR and desktop, drawn in immediate mode.
// Each panel redraws only when invalidated (state change or hover change), so text costs nothing
// on frames where nothing changes. Right-to-left layouts mirror every rectangle horizontally and
// draw text with direction 'rtl'; the browser's text shaping handles Arabic glyph joining.

import * as THREE from 'three';

export const COLORS = {
  bg: 'rgba(14,19,26,0.94)',
  bg2: '#18212c',
  bg3: '#223040',
  line: '#2e3d4f',
  text: '#e9eef4',
  dim: '#9aabbd',
  faint: '#6b7c8f',
  accent: '#f2b51c',
  accentDark: '#3a2c06',
  ok: '#3fcf7f',
  okDark: '#0f3321',
  bad: '#ff5d52',
  badDark: '#3d1210',
  warn: '#ffb347',
  info: '#6cb6ff',
};

export const FONT = '"Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, Arial, sans-serif';

function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + q);
  ctx.lineTo(x + w, y + h - q);
  ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  ctx.lineTo(x + q, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - q);
  ctx.lineTo(x, y + q);
  ctx.quadraticCurveTo(x, y, x + q, y);
  ctx.closePath();
}

// Right-to-left text: keep each left-to-right run (numbers with their units, ranges, code names
// such as "ISO 5817", "6.0 mm/s", "15–20 mm", "O₂/C₂H₂ 1.14") together as one isolated run, so the Arabic reading
// order of the items is right to left while each value still reads left to right.
const LTR_RUN = /(?:[+−-](?=\d))?[A-Za-zØø0-9](?:[A-Za-zØø0-9₀-₉.,:%°×…–\-+−/²³ ]*[A-Za-zØø0-9₀-₉%°×²³])?/g;
export function isolateLTR(s) {
  return s.replace(LTR_RUN, (m) => `\u2066${m}\u2069`);
}

// Immediate-mode drawing context handed to a panel's draw function.
class UICtx {
  constructor(panel) {
    this.p = panel;
    this.ctx = panel.canvas.getContext('2d');
    this.W = panel.canvas.width;
    this.H = panel.canvas.height;
    this.rtl = false;
  }

  mx(x, w = 0) {
    return this.rtl ? this.W - x - w : x;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  background(color = COLORS.bg, radius = 28, border = COLORS.line) {
    const c = this.ctx;
    rr(c, 2, 2, this.W - 4, this.H - 4, radius);
    c.fillStyle = color;
    c.fill();
    if (border) {
      c.lineWidth = 3;
      c.strokeStyle = border;
      c.stroke();
    }
  }

  rect(x, y, w, h, color, radius = 0, stroke = null, lw = 2) {
    const c = this.ctx;
    const X = this.mx(x, w);
    if (radius > 0) rr(c, X, y, w, h, radius);
    else {
      c.beginPath();
      c.rect(X, y, w, h);
    }
    if (color) {
      c.fillStyle = color;
      c.fill();
    }
    if (stroke) {
      c.lineWidth = lw;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  line(x0, y0, x1, y1, color = COLORS.line, lw = 2) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(this.mx(x0), y0);
    c.lineTo(this.mx(x1), y1);
    c.lineWidth = lw;
    c.strokeStyle = color;
    c.stroke();
  }

  circle(x, y, r, color, stroke = null, lw = 2) {
    const c = this.ctx;
    c.beginPath();
    c.arc(this.mx(x), y, r, 0, Math.PI * 2);
    if (color) {
      c.fillStyle = color;
      c.fill();
    }
    if (stroke) {
      c.lineWidth = lw;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  font(size = 28, weight = 400) {
    return `${weight} ${size}px ${FONT}`;
  }

  // Text anchored at x (start edge in reading direction), baseline y.
  text(str, x, y, o = {}) {
    const c = this.ctx;
    const size = o.size || 28;
    c.font = this.font(size, o.weight || 400);
    c.fillStyle = o.color || COLORS.text;
    c.direction = this.rtl ? 'rtl' : 'ltr';
    const align = o.align || 'start';
    c.textAlign = align === 'center' ? 'center' : align === 'end' ? 'end' : 'start';
    c.textBaseline = o.baseline || 'alphabetic';
    let s = String(str);
    // right-to-left: Latin runs inside Arabic text, and text with no Arabic at all (code designations, ranges
    // such as "3 to 11.08" or "≥ 30.15"), are laid out left-to-right as isolated runs
    if (this.rtl) s = /[\u0600-\u06FF]/.test(s) ? isolateLTR(s) : `\u2066${s}\u2069`;
    if (o.maxW) s = this.fit(s, o.maxW);
    const X = align === 'center' ? this.mx(x) : this.mx(x);
    c.fillText(s, X, y);
    return c.measureText(s).width;
  }

  measure(str, size = 28, weight = 400) {
    const c = this.ctx;
    c.font = this.font(size, weight);
    return c.measureText(String(str)).width;
  }

  fit(s, maxW) {
    const c = this.ctx;
    if (c.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (c.measureText(s.slice(0, m) + '…').width <= maxW) lo = m;
      else hi = m - 1;
    }
    return s.slice(0, lo) + '…';
  }

  // Word-wrapped paragraph; returns the y after the last line.
  wrap(str, x, y, maxW, o = {}) {
    const size = o.size || 26;
    const lh = o.lineHeight || Math.round(size * 1.35);
    const c = this.ctx;
    c.font = this.font(size, o.weight || 400);
    const paras = String(str).split('\n');
    let yy = y;
    for (const para of paras) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (c.measureText(test).width > maxW && line) {
          this.text(line, x, yy, { ...o, size });
          yy += lh;
          if (o.maxLines && (yy - y) / lh >= o.maxLines) return yy;
          line = w;
        } else line = test;
      }
      if (line) {
        this.text(line, x, yy, { ...o, size });
        yy += lh;
      }
      if (!words.length) yy += lh * 0.5;
    }
    return yy;
  }

  // Clickable region; the callback runs on click.
  region(id, x, y, w, h, onClick, o = {}) {
    this.p.regions.push({ id, x: this.mx(x, w), y, w, h, onClick, disabled: !!o.disabled, scroll: o.scroll });
    return this.p.hover === id;
  }

  button(id, x, y, w, h, label, onClick, o = {}) {
    const hover = this.region(id, x, y, w, h, onClick, o);
    const pressed = this.p.pressedId === id;
    const sel = !!o.selected;
    let fill = o.fill || COLORS.bg3;
    let stroke = COLORS.line;
    let color = o.color || COLORS.text;
    if (o.style === 'primary') { fill = COLORS.accent; color = '#16110a'; stroke = COLORS.accent; }
    if (o.style === 'ok') { fill = COLORS.okDark; stroke = COLORS.ok; }
    if (o.style === 'bad') { fill = COLORS.badDark; stroke = COLORS.bad; }
    if (o.style === 'ghost') { fill = 'rgba(255,255,255,0.03)'; }
    if (sel) { fill = o.style === 'primary' ? COLORS.accent : '#3b3214'; stroke = COLORS.accent; }
    if (o.disabled) { fill = '#1a2129'; color = COLORS.faint; stroke = '#232d38'; }
    else if (hover) { stroke = COLORS.accent; if (o.style !== 'primary') fill = sel ? '#4a3e18' : '#2b3b4e'; }
    if (pressed && !o.disabled) fill = o.style === 'primary' ? '#d39b10' : '#36495f';
    this.rect(x, y, w, h, fill, o.radius ?? 14, stroke, hover ? 4 : 2);
    const size = o.size || Math.min(30, Math.round(h * 0.42));
    if (o.sub) {
      this.text(label, x + w / 2, y + h * 0.46, { size, weight: 600, color, align: 'center', maxW: w - 20 });
      const subColor = o.disabled ? COLORS.faint : o.style === 'primary' ? '#4a3a10' : COLORS.dim;
      this.text(o.sub, x + w / 2, y + h * 0.46 + size * 1.05, { size: Math.round(size * 0.68), color: subColor, align: 'center', maxW: w - 20 });
    } else {
      this.text(label, x + w / 2, y + h / 2 + size * 0.36, { size, weight: 600, color, align: 'center', maxW: w - 16 });
    }
    return hover;
  }

  // Segmented choice: options = [{value, label}]
  segmented(id, x, y, w, h, options, value, onPick, o = {}) {
    const n = options.length;
    const gap = 8;
    const bw = (w - gap * (n - 1)) / n;
    options.forEach((opt, k) => {
      this.button(`${id}:${opt.value}`, x + k * (bw + gap), y, bw, h, opt.label, () => onPick(opt.value), {
        selected: opt.value === value, size: o.size, disabled: opt.disabled, sub: opt.sub,
      });
    });
  }

  // Stepper: [-] value [+]
  // o: { disabled, warn, bw (button width, default h), lsize / vsize (label / value font size) }
  stepper(id, x, y, w, h, label, valueText, onStep, o = {}) {
    const bw = o.bw ?? h;
    const bs = Math.min(40, Math.round(bw * 0.7));
    this.button(`${id}:-`, x, y, bw, h, '−', () => onStep(-1), { size: bs, disabled: o.disabled });
    this.button(`${id}:+`, x + w - bw, y, bw, h, '+', () => onStep(1), { size: bs, disabled: o.disabled });
    const mw = w - 2 * bw - 16;
    this.rect(x + bw + 8, y, mw, h, COLORS.bg2, 12, o.warn ? COLORS.warn : COLORS.line);
    const fit = o.bw != null ? mw - 8 : undefined; // compact steppers keep their text inside the box
    if (label) this.text(label, x + w / 2, y + h * 0.36, { size: o.lsize ?? Math.round(h * 0.24), color: COLORS.dim, align: 'center', maxW: fit });
    this.text(valueText, x + w / 2, y + h * (label ? 0.8 : 0.66), { size: o.vsize ?? Math.round(h * (label ? 0.38 : 0.42)), weight: 700, align: 'center', color: o.warn ? COLORS.warn : COLORS.text, maxW: fit });
  }

  // Horizontal meter with a target window.
  meter(x, y, w, h, value, min, max, lo, hi, o = {}) {
    const f = (v) => x + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * w;
    this.rect(x, y, w, h, '#0c1218', h / 2, COLORS.line);
    if (lo != null && hi != null) {
      const a = f(lo), b = f(hi);
      this.rect(a, y + 2, Math.max(2, b - a), h - 4, 'rgba(63,207,127,0.35)', (h - 4) / 2);
    }
    if (value != null && Number.isFinite(value)) {
      const inWin = lo == null || (value >= lo && value <= hi);
      const X = f(value);
      this.rect(X - 4, y - 6, 8, h + 12, inWin ? COLORS.ok : COLORS.bad, 3);
    }
    if (o.label) this.text(o.label, x, y - 10, { size: o.size || 22, color: COLORS.dim });
  }

  badge(x, y, text, kind = 'info', size = 22) {
    const colors = { ok: [COLORS.okDark, COLORS.ok], bad: [COLORS.badDark, COLORS.bad], info: ['#10243a', COLORS.info], warn: ['#3a2a0c', COLORS.warn], accent: [COLORS.accentDark, COLORS.accent] };
    const [bg, fg] = colors[kind] || colors.info;
    const w = this.measure(text, size, 700) + size * 1.1;
    const h = size * 1.55;
    this.rect(x, y, w, h, bg, h / 2, fg, 2);
    this.text(text, x + size * 0.55, y + h * 0.7, { size, weight: 700, color: fg });
    return w;
  }
}

export class Panel {
  constructor({ name, width = 1024, height = 640, widthM = 0.5, draw, transparent = true }) {
    this.name = name;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.widthM = widthM;
    this.heightM = (widthM * height) / width;
    this.drawFn = draw;
    this.regions = [];
    this.hover = null;
    this.pressedId = null;
    this.dirty = true;
    this.ui = new UICtx(this);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    // panels write depth (transparent corners excluded by alphaTest) so that see-through scene parts
    // drawn after them, such as the welding curtain, do not cover a panel standing in front of them
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, transparent, depthWrite: true, alphaTest: transparent ? 0.02 : 0, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.widthM, this.heightM), this.material);
    this.mesh.name = `panel:${name}`;
    this.mesh.userData.panel = this;
    this.scrollY = 0;
    this.state = {};
    this.lastDraw = 0;
  }

  set visible(v) {
    this.mesh.visible = v;
  }

  get visible() {
    if (!this.mesh.visible) return false;
    let o = this.mesh.parent;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  invalidate() {
    this.dirty = true;
  }

  render(rtl = false) {
    if (!this.dirty) return;
    this.dirty = false;
    this.regions = [];
    this.ui.rtl = rtl;
    this.ui.clear();
    try {
      this.drawFn(this.ui, this);
    } catch (e) {
      console.error(`panel ${this.name}`, e);
    }
    this.tex.needsUpdate = true;
  }

  // uv from a raycast hit (0..1, origin bottom-left)
  regionAt(uv) {
    const px = uv.x * this.canvas.width;
    const py = (1 - uv.y) * this.canvas.height;
    for (let k = this.regions.length - 1; k >= 0; k--) {
      const r = this.regions[k];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
    }
    return null;
  }

  setHover(id) {
    if (id !== this.hover) {
      this.hover = id;
      this.invalidate();
    }
  }

  click(uv) {
    const r = this.regionAt(uv);
    if (r && !r.disabled && r.onClick) {
      this.pressedId = r.id;
      this.invalidate();
      setTimeout(() => {
        this.pressedId = null;
        this.invalidate();
      }, 120);
      r.onClick();
      return true;
    }
    return false;
  }

  scroll(uv, dy) {
    const r = uv ? this.regionAt(uv) : null;
    if (r && r.scroll) {
      r.scroll(dy);
      this.invalidate();
      return true;
    }
    return false;
  }
}

// Ray pointers (XR hands or desktop mouse) against the visible panels.
export class UIManager {
  constructor() {
    this.panels = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 4;
    this.rtl = false;
    this.onClick = null; // sound/haptic hook
  }

  add(panel) {
    if (!this.panels.includes(panel)) this.panels.push(panel);
    return panel;
  }

  remove(panel) {
    this.panels = this.panels.filter((p) => p !== panel);
  }

  invalidateAll() {
    for (const p of this.panels) p.invalidate();
  }

  render() {
    for (const p of this.panels) if (p.visible) p.render(this.rtl);
  }

  // Intersect a ray; returns {panel, uv, point, distance} or null.
  pick(origin, dir) {
    this.ray.set(origin, dir);
    const meshes = [];
    for (const p of this.panels) if (p.visible) meshes.push(p.mesh);
    if (!meshes.length) return null;
    const hits = this.ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { panel: h.object.userData.panel, uv: h.uv, point: h.point, distance: h.distance };
  }

  // pointers: [{ key, origin, dir, press (edge), scroll }]
  // Returns a map key -> hit (or null).
  update(pointers) {
    const hovered = new Map();
    const result = {};
    for (const ptr of pointers) {
      const hit = ptr.origin ? this.pick(ptr.origin, ptr.dir) : null;
      result[ptr.key] = hit;
      if (hit) {
        const r = hit.panel.regionAt(hit.uv);
        if (!hovered.has(hit.panel) || r) hovered.set(hit.panel, r ? r.id : null);
        if (ptr.press) {
          const clicked = hit.panel.click(hit.uv);
          if (clicked && this.onClick) this.onClick(ptr.key);
          hit.clicked = clicked;
        }
        if (ptr.scroll) hit.panel.scroll(hit.uv, ptr.scroll);
      }
    }
    for (const p of this.panels) p.setHover(hovered.has(p) ? hovered.get(p) : null);
    return result;
  }
}
