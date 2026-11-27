// Langit Biru — game loop and rules: states, physics, scoring, sound.
// One job: advance the game one step at a time and hand the state to the renderer.
import { COURSE, KEYS, PHYSICS, RUNWAY } from './config.js';
import { createInput } from './input.js';
import { drawFrame, saveShot } from './render.js';
import { stageShot } from './shots.js';
import { isOnRunway, makeClouds, makeCourse, terrainHeight } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot') || '';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function loadBest() {
  try { return parseInt(localStorage.getItem('langit-biru-best') || '0', 10) || 0; } catch { return 0; }
}
function storeBest(v) {
  try { localStorage.setItem('langit-biru-best', String(v)); } catch { /* private mode */ }
}

// --- audio: everything synthesized, no files ---
let audio = null;
function ensureAudio() {
  if (audio) return audio;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const actx = new AC();
    const master = actx.createGain();
    master.gain.value = 0.16;
    master.connect(actx.destination);
    const eng = actx.createOscillator();
    eng.type = 'sawtooth';
    eng.frequency.value = 70;
    const engFilter = actx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 420;
    const engGain = actx.createGain();
    engGain.gain.value = 0;
    eng.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(master);
    eng.start();
    const len = actx.sampleRate;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = actx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = actx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    const windGain = actx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();
    audio = { ctx: actx, master, eng, engGain, windGain, muted: false };
  } catch {
    audio = { muted: true };
  }
  return audio;
}
function beep(freq, dur, type = 'sine', vol = 0.5, when = 0) {
  if (!audio || audio.muted || !audio.ctx) return;
  const t = audio.ctx.currentTime + when;
  const o = audio.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(audio.master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function ringChime() { beep(880, 0.18); beep(1318, 0.28, 'sine', 0.5, 0.09); }
function crashSound() { beep(90, 0.5, 'sawtooth', 0.7); beep(55, 0.7, 'triangle', 0.6, 0.05); }
function landChime() { beep(523, 0.2); beep(659, 0.2, 'sine', 0.5, 0.12); beep(784, 0.35, 'sine', 0.5, 0.24); }

// --- state ---
const G = {
  seed,
  time: 0,
  state: 'title',
  plane: { x: 0, y: 2, z: -120, heading: RUNWAY.heading, pitch: 0, roll: 0, speed: 0, throttle: 0, grounded: true },
  course: null,
  clouds: makeClouds(seed),
  score: 0,
  fuel: 100,
  lives: COURSE.lives,
  courseNumber: 1,
  elapsed: 0,
  message: null,
  particles: [],
  best: loadBest(),
  muted: false,
  crashReason: '',
  finalStats: null,
  shotMode: shot !== '',
  frames: 0,
};
G.course = makeCourse(seed, 1);

const input = createInput(canvas);

function setMessage(text, dur = 2.4) {
  G.message = { text, until: G.time + dur };
}

function burst(x, y, z, colors, n) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x, y, z,
      vx: (Math.random() - 0.5) * 36,
      vy: Math.random() * 22,
      vz: (Math.random() - 0.5) * 36,
      life: 0.6 + Math.random() * 0.9,
      maxLife: 1.5,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function resetPlane() {
  G.plane = { x: 0, y: 2, z: -120, heading: RUNWAY.heading, pitch: 0, roll: 0, speed: 0, throttle: 0, grounded: true };
}

function startCourse(n) {
  G.courseNumber = n;
  G.course = makeCourse(G.seed, n);
  resetPlane();
  G.fuel = 100;
  G.elapsed = 0;
  G.particles = [];
  G.finalStats = null;
  G.crashReason = '';
  G.state = 'playing';
  setMessage(`Course ${n} — fly the rings, then land!`);
}

function respawn() {
  resetPlane();
  G.fuel = 100;
  G.particles = [];
  G.state = 'playing';
  setMessage('Back in the air — mind the hills!');
}

function newGame() {
  G.score = 0;
  G.lives = COURSE.lives;
  startCourse(1);
}

function crash(reason) {
  G.lives -= 1;
  G.crashReason = reason;
  crashSound();
  burst(G.plane.x, G.plane.y, G.plane.z, ['#ff9f1c', '#ff3b30', '#5b6b78'], 26);
  if (G.lives <= 0) {
    G.state = 'gameover';
    if (G.score > G.best) { G.best = G.score; storeBest(G.best); }
  } else {
    G.state = 'crashed';
  }
}

function completeCourse() {
  const rings = G.course.rings.length;
  const landing = 500 + Math.round(G.fuel) * 2;
  const timeBonus = Math.max(0, Math.round(600 - G.elapsed * 2));
  G.score += landing + timeBonus;
  G.finalStats = { rings, landing, timeBonus, courseScore: landing + timeBonus };
  if (G.score > G.best) { G.best = G.score; storeBest(G.best); }
  landChime();
  G.state = 'complete';
}

function updateAudio() {
  if (!audio || audio.muted || !audio.ctx) return;
  const p = G.plane;
  const t = audio.ctx.currentTime;
  audio.eng.frequency.setTargetAtTime(55 + p.throttle * 95 + p.speed * 0.35, t, 0.1);
  audio.engGain.gain.setTargetAtTime(G.state === 'playing' ? 0.05 + p.throttle * 0.06 : 0, t, 0.2);
  audio.windGain.gain.setTargetAtTime(G.state === 'playing' ? clamp(p.speed / PHYSICS.maxSpeed, 0, 1) * 0.05 : 0, t, 0.2);
}

// --- one physics step while flying ---
function stepPlaying(dt) {
  const p = G.plane;
  if (input.throttleUp) p.throttle = clamp(p.throttle + dt * 0.6, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - dt * 0.8, 0, 1);
  const pitchTarget = clamp(input.pitch, -1, 1) * PHYSICS.maxPitch;
  const rollTarget = clamp(input.roll, -1, 1) * PHYSICS.maxRoll;
  p.pitch += clamp(pitchTarget - p.pitch, -PHYSICS.pitchRate * dt, PHYSICS.pitchRate * dt);
  p.roll += clamp(rollTarget - p.roll, -PHYSICS.rollRate * dt, PHYSICS.rollRate * dt);
  p.heading += -Math.sin(p.roll) * PHYSICS.turnFactor * (p.speed / 60) * dt;
  const targetSpeed = 40 + p.throttle * 95;
  p.speed += (targetSpeed - p.speed) * (1 - Math.exp(-0.35 * dt));
  p.speed += -Math.sin(p.pitch) * 16 * dt;
  p.speed = clamp(p.speed, 0, PHYSICS.maxSpeed);
  const w = G.course.wind;
  const wx = Math.sin(w.dir) * w.speed;
  const wz = Math.cos(w.dir) * w.speed;
  if (!p.grounded) {
    const vy = p.speed * Math.sin(p.pitch) - (p.speed < PHYSICS.minSpeed ? (PHYSICS.minSpeed - p.speed) * PHYSICS.stallSink : 0);
    p.y += vy * dt;
    p.x += (Math.sin(p.heading) * p.speed * Math.cos(p.pitch) + wx) * dt;
    p.z += (Math.cos(p.heading) * p.speed * Math.cos(p.pitch) + wz) * dt;
    if (p.y > 420) p.y = 420;
  } else {
    p.y = terrainHeight(G.seed, p.x, p.z) + 1.2;
    p.x += (Math.sin(p.heading) * p.speed + wx * 0.3) * dt;
    p.z += (Math.cos(p.heading) * p.speed + wz * 0.3) * dt;
    p.pitch = 0;
    p.roll *= 0.8;
    if (p.speed > 55 && input.pitch > 0.2) {
      p.grounded = false;
      setMessage('Airborne!');
      beep(660, 0.15);
    }
    if (p.speed < 5) G.fuel = clamp(G.fuel + 10 * dt, 0, 100);
  }
  if (!p.grounded) G.fuel = clamp(G.fuel - PHYSICS.fuelDrain * p.throttle * dt, 0, 100);
  if (G.fuel <= 0) p.throttle = 0;
  const next = G.course.rings.find((r) => !r.done);
  if (next) {
    const dx = p.x - next.x;
    const dy = p.y - next.y;
    const dz = p.z - next.z;
    if (Math.hypot(dx, dy, dz) < next.r * 0.85) {
      next.done = true;
      G.score += 100;
      G.fuel = clamp(G.fuel + PHYSICS.ringFuel, 0, 100);
      ringChime();
      burst(next.x, next.y, next.z, ['#ffc233', '#fff3c4', '#7fe3ff'], 18);
      const doneCount = G.course.rings.filter((r) => r.done).length;
      setMessage(doneCount === G.course.rings.length ? 'All rings! Land on the runway!' : `Ring ${doneCount} — +100`);
    }
  }
  if (!p.grounded) {
    const gy = terrainHeight(G.seed, p.x, p.z);
    if (p.y <= gy + 1.2) {
      const vy = p.speed * Math.sin(p.pitch);
      const allDone = G.course.rings.every((r) => r.done);
      if (isOnRunway(p.x, p.z) && p.speed < 50 && Math.abs(p.pitch) < 0.18 && Math.abs(p.roll) < 0.25 && vy > -6) {
        if (allDone) { completeCourse(); return; }
        p.grounded = true;
        p.y = gy + 1.2;
        p.speed *= 0.55;
        p.pitch = 0;
        p.roll = 0;
        G.fuel = 100;
        landChime();
        setMessage('Touchdown — refuelled. Hold W to take off!');
      } else {
        crash(isOnRunway(p.x, p.z) ? 'Too fast or too steep for the runway.' : 'You flew into the terrain.');
        return;
      }
    }
  }
  G.elapsed += dt;
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z += pt.vz * dt;
    pt.vy -= 4 * dt;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  updateAudio();
}

function update(dt) {
  if (input.pressedAny(KEYS.mute)) {
    G.muted = !G.muted;
    if (audio && audio.master) audio.master.gain.value = G.muted ? 0 : 0.16;
  }
  if (G.state === 'title') {
    if (input.pressedAny(KEYS.start)) { ensureAudio(); startCourse(1); }
  } else if (G.state === 'playing') {
    if (input.pressedAny(KEYS.pause)) { G.state = 'paused'; return; }
    stepPlaying(dt);
  } else if (G.state === 'paused') {
    if (input.pressedAny(KEYS.pause) || input.pressedAny(KEYS.start)) G.state = 'playing';
  } else if (G.state === 'crashed') {
    if (input.pressedAny(KEYS.restart) && G.lives > 0) respawn();
    else if (input.pressedAny(KEYS.start) && G.lives <= 0) newGame();
  } else if (G.state === 'complete') {
    if (input.pressedAny(KEYS.start)) startCourse(G.courseNumber + 1);
  } else if (G.state === 'gameover') {
    if (input.pressedAny(KEYS.start)) newGame();
  }
}

// --- boot and frame loop ---
function shotFileName() {
  const map = { start: '1-start.jpg', play: '2-play.jpg', end: '3-end.jpg', action: '4-action.jpg' };
  return map[shot] || 'langit-biru.jpg';
}

document.getElementById('shotBtn').addEventListener('click', () => {
  ensureAudio();
  saveShot(canvas, shotFileName());
});

if (shot) stageShot(G);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.shotMode) {
    G.time += dt;
    update(dt);
  }
  if (input.pressed('KeyC')) saveShot(canvas, shotFileName());
  drawFrame(ctx, G);
  input.consume();
  G.frames++;
  if (G.shotMode && G.frames >= 3) window.__shotReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
