// Langit Biru — screenshot staging: put the game into a fixed, photogenic state
// for ?shot=start|play|end|action (with ?seed=N). One job: deterministic tableaus.
// The main loop freezes in shot mode, so the staged frame is what gets captured.
import { makeCourse } from './world.js';

export function stageShot(G) {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot') || 'play';
  if (shot === 'start') {
    G.state = 'title';
    G.time = 8;
    G.plane = { x: 0, y: 2, z: -120, heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0, grounded: true };
    return;
  }
  if (shot === 'play') {
    G.state = 'playing';
    G.course = makeCourse(G.seed, 1);
    G.course.rings[0].done = true;
    G.course.rings[1].done = true;
    const r = G.course.rings[2];
    const back = 260;
    G.plane = {
      x: r.x - Math.sin(r.heading) * back,
      y: r.y - 8,
      z: r.z - Math.cos(r.heading) * back,
      heading: r.heading, pitch: 0.05, roll: 0.12,
      speed: 68, throttle: 0.72, grounded: false,
    };
    G.score = 200;
    G.fuel = 78;
    G.elapsed = 96;
    G.time = 96;
    G.message = { text: 'Ring 3 — thread the needle!', until: 9999 };
    return;
  }
  if (shot === 'end') {
    G.state = 'complete';
    G.course = makeCourse(G.seed, 1);
    G.course.rings.forEach((ring) => { ring.done = true; });
    G.plane = { x: 0, y: 2, z: 40, heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0, grounded: true };
    G.score = 1420;
    G.fuel = 34;
    G.elapsed = 154;
    G.time = 154;
    G.finalStats = { rings: 8, landing: 568, timeBonus: 292, courseScore: 860 };
    return;
  }
  // action: the plane threading a ring right now, sparkles and all.
  G.state = 'playing';
  G.course = makeCourse(G.seed, 1);
  G.course.rings[0].done = true;
  const r = G.course.rings[1];
  const back = 40;
  G.plane = {
    x: r.x - Math.sin(r.heading) * back,
    y: r.y + 2,
    z: r.z - Math.cos(r.heading) * back,
    heading: r.heading, pitch: 0, roll: -0.35,
    speed: 82, throttle: 0.9, grounded: false,
  };
  G.score = 100;
  G.fuel = 88;
  G.elapsed = 48;
  G.time = 48;
  G.message = { text: 'Ring 2 — +100', until: 9999 };
  G.particles = [
    { x: r.x - 10, y: r.y + 6, z: r.z, vx: 0, vy: 0, vz: 0, life: 0.8, maxLife: 0.8, size: 4, color: '#ffc233' },
    { x: r.x + 11, y: r.y - 4, z: r.z, vx: 0, vy: 0, vz: 0, life: 0.8, maxLife: 0.8, size: 3, color: '#fff3c4' },
    { x: r.x, y: r.y + 12, z: r.z, vx: 0, vy: 0, vz: 0, life: 0.8, maxLife: 0.8, size: 3, color: '#7fe3ff' },
    { x: r.x - 4, y: r.y - 11, z: r.z, vx: 0, vy: 0, vz: 0, life: 0.8, maxLife: 0.8, size: 4, color: '#ffc233' },
    { x: r.x + 7, y: r.y + 9, z: r.z, vx: 0, vy: 0, vz: 0, life: 0.8, maxLife: 0.8, size: 2, color: '#fff3c4' },
  ];
}
