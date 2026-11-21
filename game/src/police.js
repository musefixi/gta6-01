// The wanted system and the Port Azura PD. Crimes add heat when witnessed (a cop
// nearby, or a pedestrian close enough to call it in); heat reads as one to five stars
// off fixed bands and drains while no cop can see the player. Cop cars spawn out of
// sight and pursue with the shared steering brain, ramming to stop the player; at two
// stars and up, officers get out and chase on foot, and at three they shoot. Standing
// still next to a cop — on foot or in a stopped car — fills the busted meter.
import { WANTED } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';
import { createCar, steerToward, collideCarWithWorld } from './vehicles.js';
import { createPed } from './pedestrians.js';

export function createPolice() {
  return {
    heat: 0,
    stars: 0,
    unseenTimer: 0,
    bustedTimer: 0,
    spawnTimer: 0,
    shotsTimer: 0,
  };
}

function witnessed(game, x, y) {
  for (const car of game.cars) {
    if (car.kind === 'cop' && !car.dead && Math.hypot(car.x - x, car.y - y) < 470) return true;
  }
  for (const ped of game.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < (ped.officer ? 470 : 125)) return true;
  }
  return false;
}

function addHeat(game, amount) {
  const police = game.police;
  police.heat = Math.min(260, police.heat + amount);
  police.stars = WANTED.bands.filter((band) => police.heat >= band).length;
}

/** Force at least this many stars (missions use it for scripted heat). */
export function setWanted(game, stars) {
  if (stars <= 0) return;
  addHeat(game, Math.max(0, WANTED.bands[stars - 1] - game.police.heat + 1));
}

export function reportCrime(game, kind, x, y) {
  const police = game.police;
  const seen = witnessed(game, x, y);
  switch (kind) {
    case 'theft': addHeat(game, seen ? WANTED.crimeTheftSeen : WANTED.crimeTheftUnseen); break;
    case 'hitPed': addHeat(game, WANTED.crimeHitPed); break;
    case 'hitCop': addHeat(game, WANTED.crimeHitCop); break;
    case 'hitCar': if (seen) addHeat(game, WANTED.crimeHitCar); break;
    case 'downPed': addHeat(game, WANTED.crimeDownPed); break;
    case 'downCop': addHeat(game, WANTED.crimeDownCop); break;
    case 'assault': addHeat(game, seen ? 12 : 4); break;
    case 'carDestroyed': addHeat(game, seen ? 24 : 8); break;
    case 'shot':
      if (seen) addHeat(game, WANTED.crimeShotNearCop);
      game.scareNear(x, y, 300);
      break;
    default: break;
  }
  if (kind === 'hitPed' || kind === 'downPed' || kind === 'carDestroyed') game.scareNear(x, y, 260);
  void police;
}

/** Can any cop see the player right now? (Range plus a cheap building shadow test.) */
function playerSeen(game) {
  const player = game.player;
  const points = [];
  for (const car of game.cars) if (car.kind === 'cop' && !car.dead) points.push(car);
  for (const ped of game.peds) if (ped.officer && ped.state !== 'down' && ped.state !== 'gone') points.push(ped);
  for (const cop of points) {
    const d = Math.hypot(cop.x - player.x, cop.y - player.y);
    if (d > 460) continue;
    const midX = (cop.x + player.x) / 2;
    const midY = (cop.y + player.y) / 2;
    let blocked = false;
    for (const rect of game.city.colliders) {
      if (midX >= rect.x && midX <= rect.x + rect.w && midY >= rect.y && midY <= rect.y + rect.h) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

function spawnCopCar(game) {
  const player = game.player;
  for (let tries = 0; tries < 10; tries += 1) {
    const i = game.random.int(0, 10);
    const j = game.random.int(0, 7);
    const x = roadCenterX(i);
    const y = roadCenterY(j);
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 660 || d > 1250) continue;
    const car = createCar(game.random, x, y, game.random.range(0, Math.PI * 2), { driver: 'cop', kind: 'cop' });
    car.officersOut = false;
    game.cars.push(car);
    return;
  }
}

function copCruise(stars) {
  return [0, 452, 505, 552, 588, 622][stars] ?? 500;
}

function updateCopCar(game, car, dt) {
  const player = game.player;
  const police = game.police;
  const target = player.car ?? player;
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  if (!player.car && dist < 105 && police.stars >= 2 && !car.officersOut) {
    car.officersOut = true;
    for (let k = 0; k < 2; k += 1) {
      const officer = createPed(game.random, car.x + game.random.range(-16, 16), car.y + game.random.range(-16, 16), {
        officer: true, shirt: '#2c4a6b', state: 'chase',
      });
      officer.pants = '#1d2a3a';
      officer.carId = car.id;
      game.peds.push(officer);
    }
  }
  if (!player.car && dist < 120) {
    // On foot: pull up and hold position rather than running the suspect down.
    steerToward(game, car, target.x, target.y, dt, 150, { avoid: false });
    if (dist < 62) car.speed *= 0.8;
  } else {
    const lead = 0.32;
    steerToward(game, car,
      target.x + Math.cos(target.angle ?? 0) * (target.speed ?? 0) * lead,
      target.y + Math.sin(target.angle ?? 0) * (target.speed ?? 0) * lead,
      dt, copCruise(police.stars), { accel: 390, cornerSpeed: 240, avoid: false });
  }
  collideCarWithWorld(game, car, dt, false);
}

function updateOfficer(game, officer, dt) {
  const player = game.player;
  const police = game.police;
  if (officer.state === 'down' || officer.state === 'gone') return;
  const dist = Math.hypot(player.x - officer.x, player.y - officer.y);
  officer.angle = Math.atan2(player.y - officer.y, player.x - officer.x);
  if (police.stars === 0) {
    officer.state = 'gone'; // The heat is off: the officer leaves the story.
    return;
  }
  const wantDist = police.stars >= 3 ? 120 : 20;
  if (dist > wantDist) {
    officer.x += Math.cos(officer.angle) * 232 * dt;
    officer.y += Math.sin(officer.angle) * 232 * dt;
    officer.moving = true;
    officer.walkPhase += dt * 1.8;
  } else {
    officer.moving = false;
  }
  // Shooting at three stars and up, with distance-based accuracy.
  if (police.stars >= 3 && !player.car && dist < 330 && dist > 40) {
    officer.fireTimer -= dt;
    if (officer.fireTimer <= 0) {
      officer.fireTimer = game.random.range(0.9, 1.7);
      game.audio.gunshot(0.4);
      const spread = game.random.range(-0.09, 0.09);
      const ex = officer.x + Math.cos(officer.angle) * 14;
      const ey = officer.y + Math.sin(officer.angle) * 14;
      const tx = player.x + Math.cos(officer.angle + spread) * dist;
      const ty = player.y + Math.sin(officer.angle + spread) * dist;
      game.effects.tracer(ex, ey, tx, ty);
      if (Math.abs(spread) < 0.045 && game.random.chance(0.62)) game.hurtPlayer(game.random.range(5, 11));
    }
  }
  // In a car, officers fire from the passenger side at four stars.
  if (police.stars >= 4 && player.car && dist < 300) {
    officer.fireTimer -= dt;
    if (officer.fireTimer <= 0) {
      officer.fireTimer = game.random.range(1.2, 2.1);
      game.audio.gunshot(0.4);
      if (game.random.chance(0.5)) game.hitCar(game, player.car, 3.5, 'shot');
    }
  }
}

export function clearPolice(game) {
  game.police.heat = 0;
  game.police.stars = 0;
  game.police.bustedTimer = 0;
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    if (game.cars[i].kind === 'cop') game.cars.splice(i, 1);
  }
  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    if (game.peds[i].officer) game.peds.splice(i, 1);
  }
}

export function updatePolice(game, dt) {
  const police = game.police;
  const player = game.player;
  const seen = playerSeen(game);
  if (seen) police.unseenTimer = 0;
  else police.unseenTimer += dt;
  if (police.unseenTimer > 2.5 && police.heat > 0) {
    const drain = WANTED.drainPerSecond * (police.unseenTimer > 6 ? WANTED.drainHiddenBonus : 1);
    police.heat = Math.max(0, police.heat - drain * dt);
    police.stars = WANTED.bands.filter((band) => police.heat >= band).length;
  }

  // Fleet size follows the stars; extra cops peel off when the heat drops.
  const wanted = WANTED.copCounts[police.stars] ?? 0;
  let cops = game.cars.filter((car) => car.kind === 'cop' && !car.dead);
  police.spawnTimer -= dt;
  if (cops.length < wanted && police.spawnTimer <= 0) {
    spawnCopCar(game);
    police.spawnTimer = 1.6;
    cops = game.cars.filter((car) => car.kind === 'cop' && !car.dead);
  }
  if (police.stars === 0) {
    for (const car of cops) {
      if (Math.hypot(car.x - player.x, car.y - player.y) > 800) car.awayTimer = 99;
    }
    for (let i = game.cars.length - 1; i >= 0; i -= 1) {
      if (game.cars[i].kind === 'cop' && game.cars[i].awayTimer > 90) game.cars.splice(i, 1);
    }
  }
  for (const car of game.cars) {
    if (car.kind === 'cop' && !car.dead && car.driver === 'cop') updateCopCar(game, car, dt);
  }
  for (const ped of game.peds) {
    if (ped.officer) updateOfficer(game, ped, dt);
  }

  // The busted meter: a cop close by while the player is slow or on foot.
  let pressure = 0;
  if (player.health > 0) {
    for (const ped of game.peds) {
      if (ped.officer && ped.state !== 'down' && ped.state !== 'gone'
        && Math.hypot(ped.x - player.x, ped.y - player.y) < 34) pressure = Math.max(pressure, 1);
    }
    for (const car of game.cars) {
      if (car.kind !== 'cop' || car.dead) continue;
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (!player.car && d < 52) pressure = Math.max(pressure, 0.8);
      if (player.car && Math.abs(player.car.speed) < 26 && d < 78) pressure = Math.max(pressure, 0.65);
    }
  }
  if (pressure > 0 && police.stars > 0) {
    police.bustedTimer += dt * pressure;
    if (police.bustedTimer >= 1.5) {
      game.onBusted();
      return;
    }
  } else {
    police.bustedTimer = Math.max(0, police.bustedTimer - dt * 1.8);
  }
  player.bustedTimer = police.bustedTimer;
}
