// Langit Biru — input: keyboard and pointer steering, with edge-triggered actions.
// One job: turn raw device events into a tidy per-frame control state.
import { KEYS } from './config.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function createInput(canvas) {
  const keys = new Set();
  const queued = new Set(); // codes pressed since the last frame (edge-triggered)
  const pointer = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) queued.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onPointerDown(e) {
    pointer.active = true;
    pointer.startX = e.clientX;
    pointer.startY = e.clientY;
    pointer.dx = 0;
    pointer.dy = 0;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!pointer.active) return;
    pointer.dx = e.clientX - pointer.startX;
    pointer.dy = e.clientY - pointer.startY;
  }
  function onPointerUp() {
    pointer.active = false;
    pointer.dx = 0;
    pointer.dy = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('blur', () => { keys.clear(); pointer.active = false; });

  const has = (list) => list.some((c) => keys.has(c));

  return {
    // Pitch: +1 climbs, -1 descends. ArrowUp climbs (arcade style).
    get pitch() {
      let v = 0;
      if (has(KEYS.pitchUp)) v += 1;
      if (has(KEYS.pitchDown)) v -= 1;
      if (pointer.active) v += clamp(-pointer.dy / 160, -1, 1);
      return clamp(v, -1, 1);
    },
    // Roll: +1 banks right, -1 banks left.
    get roll() {
      let v = 0;
      if (has(KEYS.rollRight)) v += 1;
      if (has(KEYS.rollLeft)) v -= 1;
      if (pointer.active) v += clamp(pointer.dx / 160, -1, 1);
      return clamp(v, -1, 1);
    },
    get throttleUp() { return has(KEYS.throttleUp); },
    get throttleDown() { return has(KEYS.throttleDown); },
    // True when the key was pressed since the last frame; call consume() once per frame.
    pressed(code) { return queued.has(code); },
    pressedAny(list) { return list.some((c) => queued.has(c)); },
    consume() { queued.clear(); },
    get pointerActive() { return pointer.active; },
  };
}
