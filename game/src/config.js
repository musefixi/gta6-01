// Every tuning number and colour for Neon Harbor: Vice Run in one place. The world is a
// fixed pixel space (the city of Port Azura, WORLD wide by WORLD tall); the renderer fits
// the camera view to the window, so no rule below depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/**
 * City geometry. Blocks of BLOCK pixels are separated by roads of ROAD pixels, so roads
 * and blocks alternate on a PITCH grid that starts at GRID_X / GRID_Y. The island the city
 * stands on is ringed by ISLAND_MARGIN pixels of beach and then open water.
 */
export const CITY = {
  gridX: 340,
  gridY: 340,
  block: 236,
  road: 104,
  pitch: 340,
  cols: 10,
  rows: 7,
  islandMargin: 190,
};
export const WORLD = {
  width: CITY.gridX * 2 + CITY.cols * CITY.block + (CITY.cols + 1) * CITY.road,
  height: CITY.gridY * 2 + CITY.rows * CITY.block + (CITY.rows + 1) * CITY.road,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 272,
  maxHealth: 100,
  maxArmor: 100,
  punchRange: 34,
  punchDamage: 12,
  enterRange: 58,
};

export const PISTOL = {
  damage: 34,
  range: 560,
  cooldown: 0.19,
  magazine: 12,
  reloadTime: 1.1,
  spread: 0.035,
  price: 300,
  ammoPrice: 40,
  ammoPack: 48,
};

export const CAR = {
  length: 54,
  width: 27,
  accel: 400,
  brake: 760,
  reverseMax: 190,
  drag: 0.55,
  grip: 9.5,
  steerRate: 2.6,
  maxHealth: 100,
};

/** Wanted heat: crimes add heat, stars are read off the bands, heat drains unseen. */
export const WANTED = {
  bands: [1, 30, 70, 130, 200],
  drainPerSecond: 1.35,
  drainHiddenBonus: 2.4,
  copCounts: [0, 2, 3, 5, 7, 9],
  crimeTheftSeen: 26,
  crimeTheftUnseen: 8,
  crimeHitPed: 42,
  crimeHitCar: 10,
  crimeHitCop: 55,
  crimeShotNearCop: 16,
  crimeDownCop: 65,
  crimeDownPed: 30,
};

export const DAY = { cycleSeconds: 260, startHour: 10.2 };

export const SAVE_KEY = 'neon-harbor-vice-run.save.v1';

export const PALETTE = {
  waterDeep: '#14607f',
  water: '#1d7f9e',
  waterLight: '#3aa7bd',
  sand: '#ecd29a',
  sandDark: '#dec184',
  grass: '#58a86f',
  grassDark: '#4b9963',
  parkPath: '#d9c491',
  road: '#3b404a',
  roadEdge: '#2f333c',
  sidewalk: '#b9b2a4',
  sidewalkEdge: '#a29a89',
  laneMark: '#f5efdc',
  crosswalk: '#e8e2d2',
  parking: '#565d68',
  roofShadow: 'rgba(23, 32, 44, 0.35)',
  palmTrunk: '#8a6b48',
  palmLeaf: '#2f8f57',
  playerShirt: '#19b3a6',
  playerSkin: '#e8b08a',
  playerPants: '#2c3e57',
  copCarBody: '#eef1f4',
  copCarTrim: '#232a33',
  hudText: '#ffffff',
  hudShadow: 'rgba(8, 12, 20, 0.55)',
  money: '#7fe08a',
  health: '#ef596f',
  armor: '#6ec1e4',
  starOn: '#ffd94d',
  starOff: 'rgba(255,255,255,0.25)',
  marker: '#ffd94d',
  markerAlt: '#ff5d8f',
};

/** Building roof colours: sun-bleached pastels, picked per building by the city seed. */
export const ROOF_COLORS = [
  '#f2d5a0', '#eeb49a', '#e79fb0', '#a8d5ba', '#9fc6d8', '#d9c7e7',
  '#f6e7c1', '#e8a58c', '#b5d99c', '#f0b7c8', '#a3c8e8', '#e6d3a3',
];

/** Civilian car paint jobs. */
export const CAR_COLORS = [
  '#e74c3c', '#f39c4d', '#f7dc6f', '#58d68d', '#5dade2', '#af7ac5',
  '#ecf0f1', '#f1948a', '#76d7c4', '#f0b27a', '#85929e', '#ff8fab',
];

/** The font stack every canvas text uses: system faces only, nothing is fetched. */
export const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';
