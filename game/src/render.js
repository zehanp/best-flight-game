// Langit Biru — rendering: the chase-view camera and every pixel on the canvas.
// One job: turn the game state into a picture. No game logic lives here.
import { COLORS, RUNWAY, VIEW, WORLD } from './config.js';
import { isWater, terrainHeight } from './world.js';
import { noise1, noise2 } from './random.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Mix a '#rrggbb' color toward another by t (0..1).
function mix(hexA, hexB, t) {
  const pa = [1, 3, 5].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// --- camera ---
function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross3(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

// A look-at camera: position plus an orthonormal basis (right, up, forward).
function makeCamera(G) {
  const p = G.plane;
  let pos, target;
  if (G.state === 'title') {
    const a = G.time * 0.07;
    pos = { x: Math.sin(a) * 150, y: 55, z: -120 + Math.cos(a) * 150 };
    target = { x: 0, y: 25, z: 60 };
  } else {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    pos = { x: p.x - fx * 34, y: p.y + 11, z: p.z - fz * 34 };
    target = { x: p.x + fx * 70, y: p.y + Math.sin(p.pitch) * 40, z: p.z + fz * 70 };
  }
  const f = norm3({ x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z });
  const r = norm3(cross3(f, { x: 0, y: 1, z: 0 }));
  const u = cross3(r, f);
  return { ...pos, f, r, u };
}

// Project a world point to screen space; null when behind the camera.
function project(cam, p) {
  const v = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  const d = dot3(v, cam.f);
  if (d < 1.5) return null;
  return {
    x: VIEW.width / 2 + (dot3(v, cam.r) / d) * VIEW.focal,
    y: VIEW.height / 2 - (dot3(v, cam.u) / d) * VIEW.focal,
    d,
  };
}

// --- sky ---
function drawSky(ctx, G, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.55, COLORS.skyMid);
  g.addColorStop(0.75, COLORS.skyHorizon);
  g.addColorStop(1, '#cfe3ee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const sunDir = norm3({ x: -0.55, y: 0.62, z: -0.45 });
  const sp = project(cam, { x: cam.x + sunDir.x * 800, y: cam.y + sunDir.y * 800, z: cam.z + sunDir.z * 800 });
  if (sp) {
    const glow = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 130);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,243,196,0.55)');
    glow.addColorStop(1, 'rgba(255,243,196,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - 140, sp.y - 140, 280, 280);
    ctx.fillStyle = COLORS.sun;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A jagged mountain silhouette along the horizon, sampled by view direction.
function drawRidge(ctx, G, cam) {
  const hp = project(cam, { x: cam.x + cam.f.x * 1000, y: cam.y, z: cam.z + cam.f.z * 1000 });
  const horizonY = hp ? hp.y : VIEW.height * 0.62;
  ctx.beginPath();
  ctx.moveTo(0, VIEW.height);
  for (let sx = 0; sx <= VIEW.width; sx += 16) {
    const ang = Math.atan2((sx - VIEW.width / 2) / VIEW.focal, 1) + Math.atan2(cam.f.x, cam.f.z);
    const h = 30 + 95 * (0.5 + 0.5 * noise1(G.seed, ang * 2.2 + 40));
    ctx.lineTo(sx, horizonY - h);
  }
  ctx.lineTo(VIEW.width, VIEW.height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(125,155,181,0.55)';
  ctx.fill();
}

function drawClouds(ctx, G, cam) {
  for (const c of G.clouds) {
    const s = project(cam, c);
    if (!s || s.d < 10 || s.d > 1600) continue;
    const w = (c.s * VIEW.focal) / s.d;
    const h = w * 0.42;
    ctx.fillStyle = `rgba(255,255,255,${c.o * 0.85})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x - w * 0.28, s.y + h * 0.12, w * 0.32, h * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x + w * 0.28, s.y + h * 0.14, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- terrain ---
function groundColor(G, x, z, h) {
  if (h < WORLD.seaLevel) return COLORS.sea;
  const patch = noise2(G.seed + 3, x * 0.02, z * 0.02) * 0.5 + 0.5;
  if (h < 6) return mix(COLORS.sand, COLORS.grass, patch * 0.6);
  if (h < 26) return mix(COLORS.grass, COLORS.forest, patch * 0.55);
  if (h < 48) return mix(COLORS.forest, COLORS.rock, patch * 0.5);
  if (h < 58) return COLORS.rock;
  return COLORS.snow;
}

function drawTerrain(ctx, G, cam) {
  const rows = WORLD.terrainRows;
  const cols = WORLD.terrainCols;
  const depths = [];
  for (let i = 0; i <= rows; i++) depths.push(12 * Math.pow(1.102, i));
  const pts = [];
  for (let i = rows; i >= 0; i--) {
    const d = depths[i];
    const cx = cam.x + cam.f.x * d;
    const cz = cam.z + cam.f.z * d;
    const halfW = (d * (VIEW.width / 2) / VIEW.focal) * 1.12;
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const L = -halfW + (2 * halfW * j) / cols;
      const wx = cx + cam.r.x * L;
      const wz = cz + cam.r.z * L;
      const h = terrainHeight(G.seed, wx, wz);
      row.push({ p: project(cam, { x: wx, y: h, z: wz }), h, x: wx, z: wz });
    }
    pts.push(row);
  }
  for (let k = 0; k < rows; k++) {
    const far = pts[k];
    const near = pts[k + 1];
    ctx.beginPath();
    let started = false;
    for (const q of far) {
      if (q.p) {
        if (!started) { ctx.moveTo(q.p.x, q.p.y); started = true; }
        else ctx.lineTo(q.p.x, q.p.y);
      }
    }
    for (let j = near.length - 1; j >= 0; j--) {
      const q = near[j];
      if (q.p) ctx.lineTo(q.p.x, q.p.y);
    }
    ctx.closePath();
    let sum = 0;
    for (const q of near) sum += q.h;
    const mh = sum / Math.max(1, near.length);
    const dMid = (depths[rows - k] + depths[rows - k - 1]) / 2;
    const mid = near[Math.floor(near.length / 2)];
    let col = groundColor(G, mid.x, mid.z, mh);
    col = mix(col, COLORS.skyHorizon, clamp(dMid / WORLD.viewDistance, 0, 0.75) * 0.8);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

// --- runway ---
function drawRunway(ctx, G, cam) {
  for (let z = RUNWAY.zMin; z < RUNWAY.zMax; z += 10) {
    const a = project(cam, { x: -RUNWAY.halfWidth, y: 0.4, z });
    const b = project(cam, { x: RUNWAY.halfWidth, y: 0.4, z });
    const c = project(cam, { x: RUNWAY.halfWidth, y: 0.4, z: z + 10 });
    const d = project(cam, { x: -RUNWAY.halfWidth, y: 0.4, z: z + 10 });
    if (!a || !b || !c || !d) continue;
    ctx.fillStyle = COLORS.asphalt;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    if ((z / 10) % 2 === 0) {
      const m1 = project(cam, { x: -1.2, y: 0.5, z: z + 1 });
      const m2 = project(cam, { x: 1.2, y: 0.5, z: z + 1 });
      const m3 = project(cam, { x: 1.2, y: 0.5, z: z + 9 });
      const m4 = project(cam, { x: -1.2, y: 0.5, z: z + 9 });
      if (m1 && m2 && m3 && m4) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.lineTo(m3.x, m3.y); ctx.lineTo(m4.x, m4.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  for (const zend of [RUNWAY.zMin + 6, RUNWAY.zMax - 10]) {
    const a = project(cam, { x: -10, y: 0.5, z: zend });
    const b = project(cam, { x: 10, y: 0.5, z: zend });
    const c = project(cam, { x: 10, y: 0.5, z: zend + 4 });
    const d = project(cam, { x: -10, y: 0.5, z: zend + 4 });
    if (!a || !b || !c || !d) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
}

// --- rings ---
function nextRingIndex(G) {
  return G.course.rings.findIndex((r) => !r.done);
}

function drawRings(ctx, G, cam) {
  const next = nextRingIndex(G);
  G.course.rings.forEach((ring, i) => {
    const s = project(cam, ring);
    if (!s || s.d < 6 || s.d > 980) return;
    const done = ring.done;
    const isNext = i === next;
    const col = done ? COLORS.ringDone : isNext ? COLORS.ringNext : 'rgba(255,255,255,0.75)';
    const side = { x: Math.cos(ring.heading), z: -Math.sin(ring.heading) };
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const q = project(cam, {
        x: ring.x + side.x * Math.cos(a) * ring.r,
        y: ring.y + Math.sin(a) * ring.r,
        z: ring.z + side.z * Math.cos(a) * ring.r,
      });
      if (q) pts.push(q);
    }
    if (pts.length < 4) return;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = clamp(300 / s.d, 2, 9);
    if (isNext) { ctx.shadowColor = COLORS.ringNext; ctx.shadowBlur = 18; }
    ctx.globalAlpha = done ? 0.55 : isNext ? 1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    const g = project(cam, { x: ring.x, y: terrainHeight(G.seed, ring.x, ring.z), z: ring.z });
    if (g) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
      ctx.restore();
    }
    if (isNext) {
      ctx.save();
      ctx.fillStyle = COLORS.ringNext;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}`, s.x, s.y - (ring.r * VIEW.focal) / s.d - 14);
      ctx.restore();
    }
  });
}

// --- the aircraft (chase view) ---
function drawPlane(ctx, G, cam) {
  const p = G.plane;
  const sp = project(cam, p);
  if (!sp) return;
  const groundY = terrainHeight(G.seed, p.x, p.z);
  const gp = project(cam, { x: p.x, y: groundY + 0.5, z: p.z });
  if (gp && p.y - groundY < 220) {
    const sh = clamp(1 - (p.y - groundY) / 220, 0.15, 0.8);
    ctx.save();
    ctx.fillStyle = `rgba(10,25,35,${0.35 * sh})`;
    ctx.beginPath();
    ctx.ellipse(gp.x, gp.y, 46 * sh + 14, 12 * sh + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(sp.x, sp.y + 26);
  ctx.rotate(-p.roll);
  // Propeller disc at the nose.
  ctx.save();
  ctx.translate(0, -78);
  ctx.rotate((G.time * 40) % Math.PI);
  ctx.fillStyle = 'rgba(40,40,50,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f2f5f7';
  ctx.strokeStyle = '#5b6b78';
  ctx.lineWidth = 1.5;
  // Main wings.
  ctx.beginPath();
  ctx.moveTo(-10, -14); ctx.lineTo(-98, -30); ctx.lineTo(-98, -6); ctx.lineTo(-10, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, -14); ctx.lineTo(98, -30); ctx.lineTo(98, -6); ctx.lineTo(10, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Horizontal stabilizer.
  ctx.beginPath();
  ctx.moveTo(-8, 40); ctx.lineTo(-42, 30); ctx.lineTo(-42, 44); ctx.lineTo(-8, 52);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, 40); ctx.lineTo(42, 30); ctx.lineTo(42, 44); ctx.lineTo(8, 52);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Fuselage: nose at the top, tail at the bottom.
  ctx.beginPath();
  ctx.moveTo(0, -80);
  ctx.lineTo(9, -44); ctx.lineTo(13, 0); ctx.lineTo(10, 48); ctx.lineTo(6, 58);
  ctx.lineTo(-6, 58); ctx.lineTo(-10, 48); ctx.lineTo(-13, 0); ctx.lineTo(-9, -44);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Blue cheatline stripe along the fuselage.
  ctx.strokeStyle = '#1d5fa8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-8, -30); ctx.lineTo(-11, 30);
  ctx.moveTo(8, -30); ctx.lineTo(11, 30);
  ctx.stroke();
  // Canopy.
  ctx.fillStyle = '#9fd4ef';
  ctx.beginPath();
  ctx.ellipse(0, -38, 6.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Vertical fin (red tip on the tail).
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-7, 46); ctx.lineTo(7, 46); ctx.lineTo(0, 66);
  ctx.closePath();
  ctx.fill();
  // Navigation lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath(); ctx.arc(-98, -18, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath(); ctx.arc(98, -18, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, 60, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// --- particles ---
function drawParticles(ctx, G, cam) {
  for (const pt of G.particles) {
    const s = project(cam, pt);
    if (!s || s.d < 2) continue;
    ctx.save();
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, clamp(pt.size * VIEW.focal / s.d / 10, 1, 26), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- HUD ---
function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,20,30,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx, G) {
  const p = G.plane;
  const speedKmh = Math.round(p.speed * 3.6);
  const hdg = ((Math.round(((-p.heading * 180) / Math.PI) % 360) + 360) % 360);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  // Top-left: speed, altitude, heading.
  panel(ctx, 16, 16, 252, 96);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`${speedKmh}`, 32, 50);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#bcd8e8';
  ctx.fillText('km/h', 92, 50);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(`ALT ${Math.max(0, Math.round(p.y))} m`, 32, 80);
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, 150, 80);
  // Compass strip, top centre.
  panel(ctx, 430, 16, 420, 34);
  ctx.save();
  ctx.beginPath();
  ctx.rect(430, 16, 420, 34);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const a = hdg + d;
    const x = 640 + d * 3.2;
    const norm = ((a % 360) + 360) % 360;
    ctx.fillRect(x - 1, 24, 2, d % 45 === 0 ? 12 : 6);
    if (d % 45 === 0) {
      const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm);
      ctx.fillText(label, x, 46);
    }
  }
  ctx.fillStyle = '#ffc233';
  ctx.beginPath();
  ctx.moveTo(640, 16); ctx.lineTo(634, 26); ctx.lineTo(646, 26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Top-right: score, rings, fuel, lives.
  panel(ctx, 1012, 16, 252, 96);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(`SCORE ${G.score}`, 1028, 44);
  const done = G.course.rings.filter((r) => r.done).length;
  ctx.fillText(`RINGS ${done}/${G.course.rings.length}`, 1028, 72);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#bcd8e8';
  ctx.fillText('FUEL', 1028, 100);
  const fw = 150;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(1078, 90, fw, 11);
  ctx.fillStyle = G.fuel > 35 ? '#34c759' : G.fuel > 18 ? '#ffc233' : '#ff3b30';
  ctx.fillRect(1078, 90, fw * clamp(G.fuel / 100, 0, 1), 11);
  for (let i = 0; i < G.lives; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(1200 + i * 20, 92); ctx.lineTo(1194 + i * 20, 102); ctx.lineTo(1206 + i * 20, 102);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#bcd8e8';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`COURSE ${G.courseNumber}`, 1150, 44);
  // Artificial horizon, bottom-left.
  const hx = 86, hy = 634, hr = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-p.roll);
  ctx.translate(0, p.pitch * 70);
  ctx.fillStyle = '#79b5d9';
  ctx.fillRect(-hr - 4, -hr - 60, hr * 2 + 8, hr + 60);
  ctx.fillStyle = '#8a6b48';
  ctx.fillRect(-hr - 4, 0, hr * 2 + 8, hr + 60);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-hr, 0); ctx.lineTo(hr, 0); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffc233';
  ctx.beginPath();
  ctx.moveTo(hx, hy - 5); ctx.lineTo(hx - 12, hy + 6); ctx.lineTo(hx + 12, hy + 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Throttle bar, bottom-centre.
  panel(ctx, 520, 676, 240, 28);
  ctx.fillStyle = '#bcd8e8';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THR', 534, 695);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(576, 684, 170, 11);
  ctx.fillStyle = '#7fe3ff';
  ctx.fillRect(576, 684, 170 * clamp(p.throttle, 0, 1), 11);
  // Wind.
  if (G.course.wind.speed > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const wdir = Math.round((G.course.wind.dir * 180) / Math.PI);
    ctx.fillText(`WIND ${Math.round(G.course.wind.speed)} m/s · ${wdir}°`, 1264, 640);
  }
  // Next-ring edge arrow when the ring is off screen.
  const next = G.course.rings.find((r) => !r.done);
  if (next && G.state === 'playing') {
    const s = project({ x: G.plane.x, y: G.plane.y, z: G.plane.z, f: { x: Math.sin(G.plane.heading), y: 0, z: Math.cos(G.plane.heading) }, r: { x: Math.cos(G.plane.heading), y: 0, z: -Math.sin(G.plane.heading) }, u: { x: 0, y: 1, z: 0 } }, next);
    if (s && (s.x < 40 || s.x > VIEW.width - 40 || s.y < 40 || s.y > VIEW.height - 40)) {
      const ax = clamp(s.x, 60, VIEW.width - 60);
      const ay = clamp(s.y, 60, VIEW.height - 60);
      const ang = Math.atan2(s.y - VIEW.height / 2, s.x - VIEW.width / 2);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = COLORS.ringNext;
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = COLORS.ringNext;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(s.d)} m`, ax, ay + 30);
      ctx.restore();
    }
  }
  // Centre message.
  if (G.message && G.time < G.message.until) {
    ctx.save();
    ctx.globalAlpha = clamp((G.message.until - G.time) / 0.6, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(G.message.text, VIEW.width / 2, 200);
    ctx.restore();
  }
  if (G.fuel < 20 && G.state === 'playing') {
    const blink = Math.floor(G.time * 4) % 2 === 0;
    if (blink) {
      ctx.save();
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL — LAND OR FIND A RING', VIEW.width / 2, 250);
      ctx.restore();
    }
  }
  if (p.grounded && G.state === 'playing') {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ON THE RUNWAY — hold W to take off', VIEW.width / 2, 640);
    ctx.restore();
  }
  ctx.restore();
}

// --- overlays ---
function overlayPanel(ctx, title, lines, foot) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,16,26,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = 'rgba(10,28,42,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(340, 150, 600, 400, 16);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(title, VIEW.width / 2, 220);
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillStyle = '#d5e7f2';
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 275 + i * 32));
  if (foot) {
    ctx.fillStyle = '#ffc233';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(foot, VIEW.width / 2, 500);
  }
  ctx.restore();
}

function drawOverlay(ctx, G) {
  if (G.state === 'title') {
    ctx.save();
    ctx.fillStyle = 'rgba(6,16,26,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 16;
    ctx.fillText('LANGIT BIRU', VIEW.width / 2, 250);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = '#d5e7f2';
    ctx.fillText('Fly the rings. Mind the fuel. Land it on the runway.', VIEW.width / 2, 295);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Arrows steer · W / S throttle · drag with the mouse · P pause · M mute · C screenshot', VIEW.width / 2, 345);
    ctx.fillText(`Course ${G.courseNumber}: ${G.course.rings.length} rings, then land on the runway.`, VIEW.width / 2, 380);
    if (G.best > 0) ctx.fillText(`Best score: ${G.best}`, VIEW.width / 2, 415);
    ctx.fillStyle = '#ffc233';
    ctx.font = 'bold 26px system-ui, sans-serif';
    if (Math.floor(G.time * 1.6) % 2 === 0) ctx.fillText('Press ENTER to fly', VIEW.width / 2, 480);
    ctx.restore();
    return;
  }
  if (G.state === 'paused') {
    overlayPanel(ctx, 'PAUSED', ['Take a breath. The sky will wait.', '', 'P / Esc — resume', 'M — mute · C — screenshot'], 'Press P to resume');
    return;
  }
  if (G.state === 'crashed') {
    overlayPanel(ctx, 'CRASHED!', [G.crashReason || 'The ground came up too fast.', `Lives left: ${G.lives}`, ''], G.lives > 0 ? 'Press R to fly again' : 'Press ENTER for a new course');
    return;
  }
  if (G.state === 'complete') {
    const s = G.finalStats || {};
    overlayPanel(ctx, 'COURSE COMPLETE!', [
      `Rings: ${s.rings || 0} × 100 = ${(s.rings || 0) * 100}`,
      `Landing bonus: +${s.landing || 0}`,
      `Time bonus: +${s.timeBonus || 0}`,
      `Course score: ${s.courseScore || 0}`,
      `Total score: ${G.score}`,
    ], `Press ENTER for Course ${G.courseNumber + 1}`);
    return;
  }
  if (G.state === 'gameover') {
    overlayPanel(ctx, 'OUT OF PLANES', [`Final score: ${G.score}`, `Best score: ${G.best}`, ''], 'Press ENTER to fly again');
  }
}

// --- frame ---
export function drawFrame(ctx, G) {
  const cam = makeCamera(G);
  drawSky(ctx, G, cam);
  drawRidge(ctx, G, cam);
  drawClouds(ctx, G, cam);
  drawTerrain(ctx, G, cam);
  drawRunway(ctx, G, cam);
  drawRings(ctx, G, cam);
  drawParticles(ctx, G, cam);
  drawPlane(ctx, G, cam);
  if (G.state !== 'title') drawHud(ctx, G);
  drawOverlay(ctx, G);
  const vg = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

// Save the canvas as a JPEG file (used by the screenshot button and the C key).
export function saveShot(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/jpeg', 0.88);
}
