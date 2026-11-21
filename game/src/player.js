// The player character, Jax Marlowe: walking and sprinting on foot with building and
// car collision, mouse aim, fists and a pistol (hitscan with spread, magazines and
// reloads), taking damage through armour, and getting into and out of cars. While
// driving, this module hands the keys to the vehicle system and just rides along.
import { PISTOL, PLAYER, WORLD } from './config.js';
import { SURFACE, pushCircleOutOfRects } from './city.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y,
    angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
    moving: false, walkPhase: 0,
    shirt: '#19b3a6', pants: '#2c3e57', skin: '#e8b08a',
    health: PLAYER.maxHealth, armor: 0,
    car: null,
    hasPistol: false, weaponOut: false,
    ammoInMag: PISTOL.magazine, reserveAmmo: 0,
    fireTimer: 0, reloadTimer: 0, punchTimer: 0,
    bustedTimer: 0, graceTimer: 0,
    radius: PLAYER.radius,
  };
}

/** Damage the player: armour soaks 60% until it is gone. Returns true when it kills. */
export function hurtPlayer(game, amount) {
  const player = game.player;
  if (player.graceTimer > 0 || player.health <= 0) return false;
  const soaked = Math.min(player.armor, amount * 0.6);
  player.armor -= soaked;
  player.health -= amount - soaked;
  game.effects.addShake(Math.min(6, amount * 0.22));
  if (player.health <= 0) {
    player.health = 0;
    game.onWasted();
    return true;
  }
  return false;
}

function nearestCar(game, x, y, range) {
  let best = null;
  let bestDist = range;
  for (const car of game.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

/** The car the E key would use right now, or null. */
export function carInReach(game) {
  if (game.player.car) return game.player.car;
  return nearestCar(game, game.player.x, game.player.y, PLAYER.enterRange);
}

function shoot(game, dt) {
  const player = game.player;
  const { effects, audio } = game;
  if (player.reloadTimer > 0) return;
  if (player.ammoInMag <= 0) {
    audio.dryFire();
    player.fireTimer = 0.3;
    startReload(game);
    return;
  }
  player.ammoInMag -= 1;
  player.fireTimer = PISTOL.cooldown;
  const angle = player.aimAngle + (Math.random() - 0.5) * 2 * PISTOL.spread;
  const fromX = player.x + Math.cos(player.aimAngle) * 16;
  const fromY = player.y + Math.sin(player.aimAngle) * 16;
  let endX = player.x + Math.cos(angle) * PISTOL.range;
  let endY = player.y + Math.sin(angle) * PISTOL.range;
  let hitSomething = null;
  // Walk the ray in small steps; the first thing met (wall, person, car) takes the hit.
  const steps = Math.floor(PISTOL.range / 14);
  for (let i = 1; i <= steps; i += 1) {
    const px = player.x + Math.cos(angle) * i * 14;
    const py = player.y + Math.sin(angle) * i * 14;
    let stop = false;
    for (const rect of game.city.colliders) {
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) { stop = true; break; }
    }
    if (stop) { endX = px; endY = py; hitSomething = 'wall'; break; }
    for (const ped of game.peds) {
      if (ped.state === 'down' || ped.state === 'gone') continue;
      if (Math.hypot(ped.x - px, ped.y - py) < 15) { endX = px; endY = py; hitSomething = ped; stop = true; break; }
    }
    if (stop) break;
    for (const car of game.cars) {
      if (car.dead || car === player.car) continue;
      if (Math.hypot(car.x - px, car.y - py) < car.length * 0.46) { endX = px; endY = py; hitSomething = car; stop = true; break; }
    }
    if (stop) break;
  }
  effects.tracer(fromX, fromY, endX, endY);
  audio.gunshot();
  game.reportCrime('shot', player.x, player.y);
  if (hitSomething === 'wall') {
    effects.burst(endX, endY, { count: 4, color: '#d8cfb8', speed: 120, life: 0.3, size: 2.4 });
  } else if (hitSomething && hitSomething.shirt !== undefined) {
    game.hitPed(hitSomething, PISTOL.damage, angle, 'shot');
  } else if (hitSomething) {
    game.hitCar(hitSomething, PISTOL.damage * 0.5, 'shot');
    effects.burst(endX, endY, { count: 5, color: '#ffd94d', speed: 150, life: 0.3, size: 2.4 });
  }
  if (player.ammoInMag === 0) startReload(game);
}

export function startReload(game) {
  const player = game.player;
  if (player.reloadTimer > 0 || player.ammoInMag >= PISTOL.magazine || player.reserveAmmo <= 0) return;
  player.reloadTimer = PISTOL.reloadTime;
  game.audio.reload();
}

function punch(game) {
  const player = game.player;
  player.punchTimer = 0.32;
  game.audio.punch();
  const reachX = player.x + Math.cos(player.aimAngle) * PLAYER.punchRange;
  const reachY = player.y + Math.sin(player.aimAngle) * PLAYER.punchRange;
  for (const ped of game.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    if (Math.hypot(ped.x - reachX, ped.y - reachY) < 24) {
      game.hitPed(ped, PLAYER.punchDamage, player.aimAngle, 'punch');
      return;
    }
  }
  const car = nearestCar(game, reachX, reachY, 30);
  if (car) game.hitCar(car, 3, 'punch');
}

export function updatePlayer(game, dt) {
  const player = game.player;
  const { input, effects } = game;
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.graceTimer = Math.max(0, player.graceTimer - dt);
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      const take = Math.min(PISTOL.magazine - player.ammoInMag, player.reserveAmmo);
      player.ammoInMag += take;
      player.reserveAmmo -= take;
    }
  }

  if (player.car) {
    player.x = player.car.x;
    player.y = player.car.y;
    player.angle = player.car.angle;
    player.aimAngle = player.car.angle;
    player.moving = Math.abs(player.car.speed) > 12;
    return;
  }

  const axes = input.axes();
  const sprinting = input.down('ShiftLeft', 'ShiftRight') && !player.weaponOut;
  const speed = (sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed)
    * (game.city.surfaceAt(player.x, player.y) === SURFACE.sand ? 0.82 : 1);
  player.moving = axes.x !== 0 || axes.y !== 0;
  if (player.moving) {
    const len = Math.hypot(axes.x, axes.y) || 1;
    const vx = (axes.x / len) * speed;
    const vy = (axes.y / len) * speed;
    const nextX = player.x + vx * dt;
    const nextY = player.y + vy * dt;
    // Water is a wall for a walker (the docks are not): test each axis separately.
    if (game.city.surfaceAt(nextX, player.y) !== SURFACE.water) player.x = nextX;
    if (game.city.surfaceAt(player.x, nextY) !== SURFACE.water) player.y = nextY;
    player.angle = Math.atan2(vy, vx);
    player.walkPhase += dt * (sprinting ? 1.5 : 1);
  }
  player.x = Math.max(PLAYER.radius, Math.min(WORLD.width - PLAYER.radius, player.x));
  player.y = Math.max(PLAYER.radius, Math.min(WORLD.height - PLAYER.radius, player.y));
  pushCircleOutOfRects(player, PLAYER.radius, game.city.colliders);
  for (const car of game.cars) {
    if (car.dead) continue;
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    const min = car.length * 0.44 + PLAYER.radius;
    if (d > 0.01 && d < min) {
      player.x = car.x + ((player.x - car.x) / d) * min;
      player.y = car.y + ((player.y - car.y) / d) * min;
    }
  }

  // Aim at the mouse; the weapon is out whenever Jax has one and is not sprinting.
  const mouseWorld = game.renderer.screenToWorld(input.mouse.x, input.mouse.y);
  player.aimAngle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
  player.weaponOut = player.hasPistol && !sprinting;
  if (player.weaponOut && input.mouse.down && player.fireTimer <= 0) shoot(game, dt);
  if (!player.weaponOut && input.takeClick()) punch(game);
  void effects;
}
