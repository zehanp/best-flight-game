// Langit Biru — shared constants: canvas, physics, course and presentation.
// One job: every number the other modules agree on lives here.

export const VIEW = { width: 1280, height: 720, focal: 820, horizon: 330 };

export const PHYSICS = {
  minSpeed: 38, // m/s: below this the wing stops flying and the plane sinks
  maxSpeed: 135,
  cruiseSpeed: 62,
  throttleAccel: 26, // m/s gained per second at full throttle
  drag: 0.14, // 1/s: how fast speed settles toward its target
  pitchRate: 0.85, // rad/s at full elevator
  rollRate: 1.9, // rad/s at full aileron
  maxPitch: 0.62,
  maxRoll: 1.05,
  turnFactor: 0.55, // heading change per radian of bank, scaled by speed
  climbPenalty: 14, // m/s lost per radian of nose-up pitch
  diveBonus: 20, // m/s gained per radian of nose-down pitch
  stallSink: 0.5, // extra m/s of sink per m/s below minSpeed
  fuelDrain: 0.55, // %/s at full throttle
  ringFuel: 14, // % of fuel a ring gives back
};

export const COURSE = {
  rings: 8, // rings per course (course 2 adds 2 more)
  ringRadius: 15, // metres
  ringSpacing: 330, // metres between rings along the course
  startAltitude: 120,
  startSpeed: 55,
  lives: 3,
};

export const RUNWAY = {
  x: 0, // centreline
  zMin: -160,
  zMax: 160,
  halfWidth: 12,
  heading: 0, // flying +z on takeoff
};

export const WORLD = {
  seaLevel: -12, // terrain below this is water
  viewDistance: 950, // metres of terrain drawn ahead
  terrainRows: 46, // depth strips in the terrain renderer
  terrainCols: 56, // samples across each strip
};

export const COLORS = {
  skyTop: '#2f6fb4',
  skyMid: '#79b5d9',
  skyHorizon: '#dceef7',
  sun: '#fff3c4',
  sea: '#2e7fa8',
  sand: '#d9c48a',
  grass: '#69a84f',
  forest: '#3e7d32',
  rock: '#8d7d6b',
  snow: '#f4f7f8',
  asphalt: '#4a4d52',
  ringNext: '#ffc233',
  ringDone: '#7fe3ff',
};

export const KEYS = {
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  screenshot: ['KeyC'],
  restart: ['KeyR'],
  start: ['Enter', 'Space'],
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
};
