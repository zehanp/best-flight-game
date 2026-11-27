// Langit Biru — deterministic randomness: one seeded generator for the whole game.
// One job: every "random" thing in the game comes from here, so ?seed=N replays the same world.

// mulberry32: small, fast, good-enough seeded PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + (max - min) * next(); },
    int(min, max) { return Math.floor(min + (max - min + 1) * next()); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    sign() { return next() < 0.5 ? -1 : 1; },
  };
}

// Smooth 1D value noise in [-1, 1] from a seed.
function hash1(seed, i) {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(seed, i);
  const b = hash1(seed, i + 1);
  const t = f * f * (3 - 2 * f);
  return (a + (b - a) * t) * 2 - 1;
}

// Smooth 2D value noise in [-1, 1].
function hash2(seed, x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise2(seed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(seed, xi, yi);
  const b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1);
  const d = hash2(seed, xi + 1, yi + 1);
  return ((a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v) * 2 - 1;
}
