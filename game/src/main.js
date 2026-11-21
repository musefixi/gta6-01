// Neon Harbor: Vice Run — boot and the one loop. Builds the world (seeded city, parked
// cars, the player, the police, Dee's mission board), then runs the simulation in fixed
// 1/60 s steps behind a screen state machine: title, play, paused, wasted, busted.
// The renderer paints the world and HUD every frame; sound follows the player's car
// and the nearest siren.
//
// ?seed=N fixes the city and traffic. ?shot=<scene>&seed=N stages a screenshot scene
// instead of running the loop (see shots.js) and sets window.__shotReady when painted.
import { DAY, STEP, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput, ACTION } from './input.js';
import { createRenderer } from './render.js';
import { createPlayer, updatePlayer, hurtPlayer, carInReach, startReload } from './player.js';
import { seedParkedCars, updateVehicles, hitCar } from './vehicles.js';
import { updatePedestrians, hitPed, scareNear } from './pedestrians.js';
import { createPolice, updatePolice, reportCrime, clearPolice } from './police.js';
import { createMissions, interact } from './missions.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { drawHud, drawScreen } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

const random = createRandom(seed);
const city = createCity(createRandom(seed ^ 0x9e3779b9));
const effects = createEffects();
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas, city);

function announce(message) {
  status.textContent = message;
}

function makeGame(save) {
  const game = {
    city, random, effects, audio, input, renderer,
    cars: [], peds: [], cashDrops: [],
    police: createPolice(),
    missions: null,
    player: null,
    money: 120,
    stats: { earned: 0, fares: 0, racesWon: 0, bestRace: 0 },
    time: 0, hour: DAY.startHour, hourOverride: null,
    screen: 'title', endReason: '',
    banner: null, prompt: null, objective: null,
    camera: { x: WORLD.width / 2, y: WORLD.height / 2, zoom: 1 },
    hasSave: Boolean(save),
    // Cross-module helpers, wired once here so the systems stay decoupled.
    reportCrime(kind, x, y) { reportCrime(game, kind, x, y); },
    hitPed(ped, damage, angle, cause, byCar) { hitPed(game, ped, damage, angle, cause, byCar); },
    hitCar(car, amount, cause) { hitCar(game, car, amount, cause); },
    hurtPlayer(amount) { return hurtPlayer(game, amount); },
    scareNear(x, y, radius) { scareNear(game, x, y, radius); },
    carInReach() { return carInReach(game); },
    addMoney(amount, x, y) {
      game.money += amount;
      if (amount > 0) {
        game.stats.earned += amount;
        effects.text(x, y, `+$${amount}`, '#7fe08a');
        audio.cash();
      }
    },
    spendMoney(amount) { game.money -= amount; },
    setBanner(title, sub, seconds = 4) {
      game.banner = { title, sub, timer: seconds };
      announce(`${title}. ${sub}`);
    },
    saveGame() { storeSave(game); game.hasSave = true; },
    onWasted() {
      if (game.screen !== 'play') return;
      game.screen = 'wasted';
      const fine = Math.min(game.money, 100 + Math.round(game.money * 0.05));
      game.endReason = `The city chewed you up. Hospital bill: $${fine}.`;
      game.pendingFine = fine;
      clearPolice(game);
      audio.missionFail();
      announce('Wasted. Press Enter to wake up at the hospital.');
    },
    onBusted() {
      if (game.screen !== 'play') return;
      game.screen = 'busted';
      const fine = Math.min(game.money, Math.round(game.money * 0.15));
      game.endReason = `Port Azura PD takes a $${fine} fine and your afternoon.`;
      game.pendingFine = fine;
      if (game.player.car) {
        game.player.car.driver = 'parked';
        game.player.car = null;
      }
      clearPolice(game);
      audio.missionFail();
      announce('Busted. Press Enter to leave the station.');
    },
    onCarWrecked(car) {
      const player = game.player;
      player.car = null;
      player.x = car.x + 44;
      player.y = car.y + 20;
      hurtPlayer(game, 10);
      game.setBanner('Wrecked', 'Your ride is done. Find another.', 3);
    },
  };
  const safehouse = city.place('safehouse');
  game.player = createPlayer({ x: safehouse.x + 30, y: safehouse.y + 26 });
  game.missions = createMissions(game);
  seedParkedCars(game);
  if (save) applySave(game, save);
  return game;
}

function applySave(game, save) {
  const player = game.player;
  game.money = save.money;
  game.missions.storyIndex = Math.min(save.storyIndex ?? 0, 6);
  game.missions.storyDone = game.missions.storyIndex >= 6;
  for (const pack of game.missions.packages) {
    if ((save.packages ?? []).includes(pack.id)) {
      pack.taken = true;
      game.missions.packagesFound += 1;
    }
  }
  player.hasPistol = Boolean(save.hasPistol);
  player.ammoInMag = save.ammoInMag ?? 12;
  player.reserveAmmo = save.reserveAmmo ?? 0;
  player.armor = save.armor ?? 0;
  game.stats = { earned: 0, fares: 0, racesWon: 0, bestRace: 0, ...(save.stats ?? {}) };
  if (Number.isFinite(save.x) && Number.isFinite(save.y)) {
    player.x = save.x;
    player.y = save.y;
  }
}

let game = makeGame(loadSave());

function resetTo(save) {
  const fresh = makeGame(save);
  game.player = fresh.player;
  game.cars = fresh.cars;
  game.peds = fresh.peds;
  game.cashDrops = fresh.cashDrops;
  game.police = fresh.police;
  game.missions = fresh.missions;
  game.money = fresh.money;
  game.stats = fresh.stats;
  game.banner = null;
  game.objective = null;
  game.prompt = null;
  game.hasSave = Boolean(save);
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
}

function enterExitCar() {
  const player = game.player;
  if (player.car) {
    const car = player.car;
    car.driver = car.driver === 'player' ? 'parked' : car.driver;
    player.car = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.width / 2 + 18);
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.width / 2 + 18);
    audio.door();
    return;
  }
  const car = carInReach(game);
  if (!car || Math.abs(car.speed) > 24) return;
  const wasParked = car.driver === 'parked';
  const wasMission = car.driver === 'mission';
  car.driver = 'player';
  player.car = car;
  audio.door();
  if (wasParked && car.kind !== 'cop') game.reportCrime('theft', car.x, car.y);
  if (car.kind === 'cop') game.reportCrime('hitCop', car.x, car.y);
  void wasMission;
}

function respawn() {
  const player = game.player;
  game.money -= game.pendingFine ?? 0;
  game.pendingFine = 0;
  const spot = game.screen === 'wasted' ? city.place('hospital') : city.place('police');
  player.health = 100;
  player.armor = 0;
  player.car = null;
  player.x = spot.x;
  player.y = spot.y + 24;
  player.graceTimer = 3;
  game.camera.x = player.x;
  game.camera.y = player.y;
  game.screen = 'play';
  game.saveGame();
  announce('Back on the street.');
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION.mute) {
    const mutedNow = audio.toggleMute();
    game.setBanner(mutedNow ? 'Sound off' : 'Sound on', '', 1.2);
  }
  if (game.screen === 'title') {
    if (actions & ACTION.confirm) {
      audio.unlock();
      game.screen = 'play';
      game.camera.x = game.player.x;
      game.camera.y = game.player.y;
      if (!game.missions.active && game.missions.storyIndex === 0 && !game.introShown) {
        game.introShown = true;
        game.setBanner('Neon Harbor: Vice Run', 'Dee Fontaine is waiting at Shine Auto Body — follow the gold marker.', 6);
      }
      announce('Playing.');
    }
    if (input.down('KeyN') && game.hasSave) {
      clearSave();
      resetTo(null);
      game.hasSave = false;
      game.setBanner('New game', 'A fresh start in Port Azura.', 3);
    }
    return;
  }
  if (game.screen === 'wasted' || game.screen === 'busted') {
    if (actions & ACTION.confirm) respawn();
    return;
  }
  if (actions & ACTION.pause) {
    game.screen = game.screen === 'paused' ? 'play' : 'paused';
    announce(game.screen === 'paused' ? 'Paused.' : 'Playing.');
    return;
  }
  if (game.screen !== 'play') return;
  if (actions & ACTION.enterCar) enterExitCar();
  if (actions & ACTION.interact) interact(game);
  if (actions & ACTION.reload) startReload(game);
  if (actions & ACTION.weapon) {
    // Q taps a quick punch when armed, for close quarters.
    if (game.player.hasPistol && !game.player.car) game.player.weaponOut = true;
  }
}

function stepWorld(dt) {
  game.time += dt;
  if (game.hourOverride === null) {
    game.hour = (DAY.startHour + (game.time * 24) / DAY.cycleSeconds) % 24;
  } else {
    game.hour = game.hourOverride;
  }
  if (game.banner) {
    game.banner.timer -= dt;
    if (game.banner.timer <= 0) game.banner = null;
  }
  if (game.screen === 'title') {
    // The city lives behind the title: traffic and walkers, a slow marina pan.
    updateVehicles(game, dt);
    updatePedestrians(game, dt);
    const t = game.time * 0.05;
    game.camera.x = WORLD.width * 0.68 + Math.cos(t) * 330;
    game.camera.y = WORLD.height * 0.44 + Math.sin(t * 0.8) * 210;
    game.camera.zoom = 0.92;
    return;
  }
  if (game.screen !== 'play') return;
  updateVehicles(game, dt);
  updatePlayer(game, dt);
  updatePedestrians(game, dt);
  updatePolice(game, dt);
  game.missions.update(dt);
  // Camera: follow with velocity lookahead, breathing out as the car speeds up.
  const focus = game.player.car ?? game.player;
  const lead = game.player.car ? Math.min(130, Math.abs(game.player.car.speed) * 0.22) : 26;
  const tx = focus.x + Math.cos(focus.angle) * lead;
  const ty = focus.y + Math.sin(focus.angle) * lead;
  game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 5);
  game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 5);
  const targetZoom = game.player.car
    ? 1.04 - Math.min(1, Math.abs(game.player.car.speed) / 615) * 0.26
    : 1.06;
  game.camera.zoom += (targetZoom - game.camera.zoom) * Math.min(1, dt * 2.4);
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleActions();
  if (game.screen !== 'paused') {
    while (accumulator >= STEP) {
      stepWorld(STEP);
      effects.update(STEP);
      accumulator -= STEP;
      if (game.screen === 'paused') { accumulator = 0; break; }
    }
  } else {
    accumulator = 0;
  }
  // Sound follows the action.
  const player = game.player;
  let sirenDistance = null;
  for (const car of game.cars) {
    if (car.kind !== 'cop' || car.dead) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (sirenDistance === null || d < sirenDistance) sirenDistance = d;
  }
  const engineRatio = player.car && game.screen === 'play'
    ? Math.min(1, Math.abs(player.car.speed) / 615)
    : null;
  audio.update(STEP, engineRatio, game.screen === 'play' ? sirenDistance : null);

  renderer.draw({
    camera: game.camera,
    player: game.player,
    cars: game.cars,
    peds: game.peds,
    effects,
    hour: game.hour,
    objective: game.screen === 'play' || game.screen === 'title' ? game.objective : null,
    packages: game.missions.packages,
    cashDrops: game.cashDrops,
    time: game.time,
  });
  const view = { w: window.innerWidth, h: window.innerHeight };
  const ctx = canvas.getContext('2d');
  const dpr = canvas.width / Math.max(1, window.innerWidth);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game.screen === 'play' || game.screen === 'paused') drawHud(ctx, game, view);
  drawScreen(ctx, game, view);
}

let accumulator = 0;
let last = performance.now();

if (shot) {
  const scene = stageShot(shot, game);
  if (game.hourOverride !== null) game.hour = game.hourOverride;
  if (scene.objective) game.objective = scene.objective;
  let painted = 0;
  const paint = () => {
    renderer.draw({
      camera: game.camera, player: game.player, cars: game.cars, peds: game.peds,
      effects, hour: game.hour, objective: scene.objective ?? game.objective,
      packages: game.missions.packages, cashDrops: game.cashDrops, time: game.time,
    });
    const view = { w: window.innerWidth, h: window.innerHeight };
    const ctx = canvas.getContext('2d');
    if (scene.hud !== false) drawHud(ctx, game, view);
    if (scene.screen) {
      game.screen = scene.screen;
      drawScreen(ctx, game, view);
    }
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = `shot:${shot} ready ${JSON.stringify(scene.report ?? {})}`;
    }
  };
  requestAnimationFrame(paint);
} else {
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  announce('Neon Harbor: Vice Run. Press Enter to play.');
  requestAnimationFrame(frame);
}

// A handle for scripted play-tests (harmless in normal play).
window.__NH = { game: () => game, seed };
