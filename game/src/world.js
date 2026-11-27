// Langit Biru — the world: terrain height, the runway, the ring course and the clouds.
// One job: answer "what is the world like at (x, z)" and "where does the course go".
import { COURSE, RUNWAY, WORLD } from './config.js';
import { makeRng, noise2 } from './random.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// How flat the ground is here: 0 on the runway strip, 1 far away.
function runwayFlatten(x, z) {
  const dx = Math.max(0, Math.abs(x - RUNWAY.x) - RUNWAY.halfWidth - 18) / 90;
  const dz = Math.max(0, Math.max(RUNWAY.zMin - z, z - RUNWAY.zMax) - 30) / 120;
  const d = Math.max(dx, dz);
  return smoothstep(0, 1, Math.min(1, d));
}

// Rolling hills from layered sine waves plus seeded value noise, flattened near
// the runway and capped so no hill swallows the course. Deterministic for a seed.
export function terrainHeight(seed, x, z) {
  const s = seed;
  let h = 16 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.009 + 0.6)
    + 24 * Math.sin(x * 0.004 - 0.8 + s * 0.7) * Math.sin(z * 0.006 + 2.1)
    + 9 * Math.sin(x * 0.021 + 4.0) * Math.cos(z * 0.017 + 1.2)
    + 30 * noise2(s, x * 0.004, z * 0.004)
    + 12 * noise2(s + 7, x * 0.013, z * 0.013);
  // A mountain ridge far from the start area, for the horizon.
  const r = Math.hypot(x, z - 400);
  h += 48 * Math.max(0, noise2(s + 13, x * 0.002 + 9, z * 0.002)) * smoothstep(500, 1100, r);
  h *= runwayFlatten(x, z);
  h += 14; // lift the land
  return 62 * Math.tanh(h / 62);
}

export function isWater(seed, x, z) {
  return terrainHeight(seed, x, z) < WORLD.seaLevel;
}

export function isOnRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.halfWidth && z >= RUNWAY.zMin && z <= RUNWAY.zMax;
}

// A course is a winding chain of rings over the terrain, then a landing back home.
// Ring altitudes are always kept well above the ground beneath them.
export function makeCourse(seed, courseNumber) {
  const rng = makeRng(seed * 1000 + courseNumber * 77 + 5);
  const ringCount = COURSE.rings + (courseNumber - 1) * 2;
  const rings = [];
  let x = 0;
  let z = 200;
  let heading = 0;
  let alt = 110;
  for (let i = 0; i < ringCount; i++) {
    heading += rng.range(-0.5, 0.5);
    const step = COURSE.ringSpacing * rng.range(0.9, 1.15);
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    alt = clamp(alt + rng.range(-35, 35), 55, 190);
    const ground = terrainHeight(seed, x, z);
    rings.push({ x, y: Math.max(alt, ground + 32), z, r: COURSE.ringRadius, heading, done: false });
  }
  const wind = courseNumber > 1
    ? { speed: 5 + courseNumber * 3, dir: rng.range(0, Math.PI * 2) }
    : { speed: 0, dir: 0 };
  return { rings, wind, ringCount };
}

// Puffy clouds scattered over the flying area.
export function makeClouds(seed, count = 26) {
  const rng = makeRng(seed * 31 + 11);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: rng.range(-1400, 1400),
      y: rng.range(190, 320),
      z: rng.range(-600, 2200),
      s: rng.range(60, 170),
      o: rng.range(0.5, 0.9),
    });
  }
  return clouds;
}
