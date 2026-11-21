// The screenshot scenes behind ?shot=title|chase|mission|night, plus a scripted
// playtest. Each scene arranges the real game — the player's car, the police, a live
// objective — and steps the real simulation forward, so the frame is a moment the game
// itself produced, identical for a given seed. main.js paints it and sets
// window.__shotReady; the playtest scene instead reports the state it reached in the
// page title, where a headless browser can read it back.
import { STEP } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';
import { createCar, steerToward, updateVehicles } from './vehicles.js';
import { updatePedestrians } from './pedestrians.js';
import { updatePolice, setWanted } from './police.js';

function stepWorld(game, seconds, drivePlayer) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (drivePlayer) drivePlayer(STEP);
    updateVehicles(game, STEP);
    updatePedestrians(game, STEP);
    updatePolice(game, STEP);
    game.effects.update(STEP);
    game.time += STEP;
  }
}

function putPlayerInCar(game, x, y, angle, color) {
  // 'mission' while staging (so the vehicle system leaves it to the scene's own
  // steering); the scene flips it to 'player' before the frame is painted.
  const car = createCar(game.random, x, y, angle, { driver: 'mission', color });
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

function addCop(game, x, y, angle) {
  const cop = createCar(game.random, x, y, angle, { driver: 'cop', kind: 'cop' });
  game.cars.push(cop);
  return cop;
}

function stageTitle(game) {
  game.hourOverride = 18.4;
  game.screen = 'title';
  stepWorld(game, 4, null);
  game.camera.x = game.city.place('marina').x - 260;
  game.camera.y = game.city.place('marina').y - 60;
  game.camera.zoom = 0.9;
  return { screen: 'title', hud: false };
}

function stageChase(game) {
  game.hourOverride = 17.7;
  game.screen = 'play';
  game.money = 2450;
  game.player.health = 82;
  game.player.armor = 40;
  const avenueX = roadCenterX(9) + 26;
  const startY = roadCenterY(5) + 260;
  const car = putPlayerInCar(game, avenueX, startY, -Math.PI / 2, '#e74c3c');
  car.speed = 330;
  addCop(game, avenueX - 30, startY + 175, -Math.PI / 2).speed = 335;
  addCop(game, avenueX + 26, startY + 305, -Math.PI / 2).speed = 340;
  addCop(game, avenueX - 6, startY + 445, -Math.PI / 2).speed = 330;
  // Oncoming traffic in the far lane only — the player's lane stays clear to run.
  const traffic = createCar(game.random, avenueX - 52, startY - 520, Math.PI / 2, { driver: 'traffic', color: '#5dade2' });
  game.cars.push(traffic);
  setWanted(game, 3);
  const ahead = { x: avenueX, y: roadCenterY(1) };
  stepWorld(game, 1.7, (dt) => {
    steerToward(game, car, ahead.x, ahead.y, dt, 445, { avoid: false, accel: 430 });
  });
  car.driver = 'player';
  car.health = 100;
  game.screen = 'play';
  game.camera.x = car.x + 14;
  game.camera.y = car.y + 128;
  game.camera.zoom = 0.97;
  game.setBanner('Dockside Heat', 'Two stars became three — shake them off!', 99);
  return {
    objective: { x: game.city.place('safehouse').x, y: game.city.place('safehouse').y, label: 'Lose the police — then reach the safehouse' },
    report: { stars: game.police.stars, cops: game.cars.filter((c) => c.kind === 'cop').length, speed: Math.round(car.speed) },
  };
}

function stageMission(game) {
  game.hourOverride = 11.4;
  game.screen = 'play';
  game.money = 640;
  game.player.hasPistol = true;
  game.player.ammoInMag = 9;
  game.player.reserveAmmo = 36;
  const spray = game.city.place('spray');
  game.player.x = spray.x - 40;
  game.player.y = spray.y + 64;
  game.player.angle = 0.4;
  game.player.aimAngle = 0.4;
  game.player.weaponOut = true;
  stepWorld(game, 5, null);
  game.camera.x = game.player.x + 60;
  game.camera.y = game.player.y + 30;
  game.camera.zoom = 1.05;
  game.setBanner('Tail Lights', 'Dee: "Follow the courier — close enough to watch, far enough to breathe."', 99);
  return {
    objective: { x: spray.x, y: spray.y, label: 'Start "Tail Lights" at Shine Auto Body (F)' },
    report: { peds: game.peds.length },
  };
}

function stageNight(game) {
  game.hourOverride = 22.3;
  game.screen = 'play';
  game.money = 3110;
  game.player.health = 96;
  const avenueX = roadCenterX(10) - 26;
  const startY = roadCenterY(2) - 260;
  const car = putPlayerInCar(game, avenueX, startY, Math.PI / 2, '#19b3a6');
  car.speed = 260;
  // A taxi in the oncoming lane, passing in the night — never in the player's path.
  const taxi = createCar(game.random, avenueX + 52, startY + 420, -Math.PI / 2, { driver: 'traffic', kind: 'taxi' });
  game.cars.push(taxi);
  const ahead = { x: avenueX, y: roadCenterY(5) };
  stepWorld(game, 2.2, (dt) => {
    steerToward(game, car, ahead.x, ahead.y, dt, 380, { avoid: false, accel: 400 });
  });
  car.driver = 'player';
  game.screen = 'play';
  game.camera.x = car.x - 20;
  game.camera.y = car.y - 70;
  game.camera.zoom = 0.96;
  return {
    objective: { x: roadCenterX(9), y: roadCenterY(5), label: 'Checkpoint 4/8 — marina street race' },
    report: { speed: Math.round(car.speed) },
  };
}

/**
 * The core loop, scripted: walk, steal the nearest parked car, drive it, draw heat,
 * and report where things stand. Not a screenshot — a smoke test with a paper trail.
 */
function stagePlaytest(game) {
  game.hourOverride = 12;
  game.screen = 'play';
  const report = { steps: [] };
  const player = game.player;
  report.spawn = { x: Math.round(player.x), y: Math.round(player.y) };
  // Walk north for a second (straight into the world update, no input system).
  for (let i = 0; i < 60; i += 1) {
    player.y -= 2.4;
    updateVehicles(game, STEP);
    updatePedestrians(game, STEP);
    game.effects.update(STEP);
  }
  report.walked = { x: Math.round(player.x), y: Math.round(player.y), peds: game.peds.length, cars: game.cars.length };
  // Steal the nearest parked car the way the E key does.
  let target = null;
  let best = Infinity;
  for (const car of game.cars) {
    if (car.driver !== 'parked') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < best) { best = d; target = car; }
  }
  report.nearestParked = Math.round(best);
  if (target) {
    player.x = target.x;
    player.y = target.y;
    target.driver = 'target'; // steered by hand below, like the E key handed it over
    player.car = target;
    game.reportCrime('theft', target.x, target.y);
    // Drive it: three seconds of steering toward a point up the road.
    const goal = { x: target.x, y: target.y - 700 };
    for (let i = 0; i < 180; i += 1) {
      steerToward(game, target, goal.x, goal.y, STEP, 430, { avoid: false, accel: 420 });
      updateVehicles(game, STEP);
      updatePedestrians(game, STEP);
      updatePolice(game, STEP);
      game.effects.update(STEP);
    }
    report.drove = {
      x: Math.round(target.x), y: Math.round(target.y),
      speed: Math.round(target.speed), health: Math.round(target.health),
      dist: Math.round(Math.hypot(target.x - goal.x, target.y - goal.y)),
    };
    // Draw two stars of heat and let the PD respond for three seconds.
    setWanted(game, 2);
    for (let i = 0; i < 180; i += 1) {
      steerToward(game, target, goal.x, goal.y - 500, STEP, 430, { avoid: false, accel: 420 });
      updateVehicles(game, STEP);
      updatePedestrians(game, STEP);
      updatePolice(game, STEP);
      game.effects.update(STEP);
    }
    report.chase = {
      stars: game.police.stars,
      copCars: game.cars.filter((c) => c.kind === 'cop').length,
      playerHealth: Math.round(player.health),
      screen: game.screen,
    };
    // Fire the pistol dry (no gun yet in a fresh game: buy state forced for the test).
    player.hasPistol = true;
    player.car = null;
    target.driver = 'parked';
    report.exited = { inCar: Boolean(player.car) };
  }
  game.camera.x = player.x;
  game.camera.y = player.y;
  game.camera.zoom = 1;
  return { report };
}

export function stageShot(name, game) {
  switch (name) {
    case 'chase': return stageChase(game);
    case 'mission': return stageMission(game);
    case 'night': return stageNight(game);
    case 'playtest': return stagePlaytest(game);
    case 'title':
    default: return stageTitle(game);
  }
}
