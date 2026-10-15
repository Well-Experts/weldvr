// Small math helpers shared by the simulation core (no three.js dependency).

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

// Deterministic PRNG (mulberry32). Every attempt carries a seed so that a test
// weld can be replayed and re-scored identically.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash two integers into a seed (for per-sample random streams).
export function hashSeed(a, b, c = 0) {
  let h = 2166136261 >>> 0;
  for (const v of [a, b, c]) {
    h ^= v & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Poisson sample (Knuth) for small lambda.
export function poisson(rand, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

export function gauss(rand) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 1-D smooth value noise along the weld (used to vary imperfection size along the length).
export function valueNoise1D(seed, spacing) {
  const cache = new Map();
  const at = (i) => {
    if (!cache.has(i)) cache.set(i, rng(hashSeed(seed, i, 7))());
    return cache.get(i);
  };
  return (x) => {
    const f = x / spacing;
    const i = Math.floor(f);
    const t = f - i;
    const w = (1 - Math.cos(t * Math.PI)) / 2;
    return lerp(at(i), at(i + 1), w);
  };
}

export function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xa, ya] = table[table.length - 2];
  const [xb, yb] = table[table.length - 1];
  return yb + ((yb - ya) * (x - xb)) / (xb - xa);
}

export const round = (x, d = 1) => {
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
};
