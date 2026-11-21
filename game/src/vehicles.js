// Vehicles: the car factory, arcade driving physics for the player's car (throttle,
// brake, speed-sensitive steering, handbrake drift, surface grip, collision with
// buildings, cars and the water's edge), and the traffic system — civilian cars that
// follow Port Azura's lane grid, brake for obstacles, panic at gunfire and crashes,
// and recycle when they wander too far from the player.
import { CAR, CAR_COLORS, CITY, WORLD } from './config.js';
import { SURFACE, roadCenterX, roadCenterY } from './city.js';

const LANE = 26;
const TRAFFIC_TARGET = 15;

let nextCarId = 1;

export function createCar(random, x, y, angle, options = {}) {
  const kind = options.kind ?? 'car';
  const van = kind === 'van';
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0, steerVis: 0,
    length: van ? 68 : CAR.length + random.range(-4, 6),
    width: van ? 31 : CAR.width + random.range(-1.5, 2),
    color: options.color ?? (kind === 'cop' ? '#eef1f4' : kind === 'taxi' ? '#f7c948' : random.pick(CAR_COLORS)),
    kind,
    health: options.health ?? CAR.maxHealth,
    maxHealth: CAR.maxHealth,
    driver: options.driver ?? 'parked',
    cruise: random.range(200, 275),
    route: null,
    panic: 0, waitTimer: 0, honkTimer: random.range(2, 9),
    sirenPhase: random.range(0, 2),
    smokeTimer: 0, wreckTimer: 0,
    dead: false, burnt: false,
    awayTimer: 0,
  };
}

/** Parked cars for the lots and street parking, placed once when the city wakes. */
export function seedParkedCars(game) {
  const { city, random } = game;
  for (const spot of city.parkingSpots) {
    if (!random.chance(0.62)) continue;
    spot.taken = true;
    game.cars.push(createCar(random, spot.x, spot.y, spot.angle + random.range(-0.05, 0.05), { driver: 'parked' }));
  }
  // Two cars always wait on the streets by the safehouse, so a fresh game starts
  // a short walk from wheels.
  const home = city.place('safehouse');
  game.cars.push(createCar(random, home.x - 150, home.y - 60, Math.PI / 2, { driver: 'parked', color: '#5dade2' }));
  game.cars.push(createCar(random, home.x + 190, home.y - 30, -Math.PI / 2, { driver: 'parked', color: '#f39c4d' }));
  // Parallel parking along a few avenues.
  for (let n = 0; n < 22; n += 1) {
    const vertical = random.chance(0.5);
    const i = random.int(0, CITY.cols);
    const j = random.int(0, CITY.rows);
    const along = random.range(-CITY.block * 0.4, CITY.block * 0.4);
    const x = vertical ? roadCenterX(i) + (random.chance(0.5) ? -LANE - 12 : LANE + 12) : roadCenterX(i) + along;
    const y = vertical ? roadCenterY(j) + along : roadCenterY(j) + (random.chance(0.5) ? -LANE - 12 : LANE + 12);
    if (game.cars.some((car) => Math.hypot(car.x - x, car.y - y) < 70)) continue;
    game.cars.push(createCar(random, x, y, vertical ? Math.PI / 2 : 0, { driver: 'parked' }));
  }
}

function laneTarget(car) {
  const { ti, tj, dx, dy } = car.route;
  // Right-hand traffic: the target is the far intersection, offset into our lane.
  if (dx === 1) return { x: roadCenterX(ti), y: roadCenterY(tj) + LANE };
  if (dx === -1) return { x: roadCenterX(ti), y: roadCenterY(tj) - LANE };
  if (dy === 1) return { x: roadCenterX(ti) - LANE, y: roadCenterY(tj) };
  return { x: roadCenterX(ti) + LANE, y: roadCenterY(tj) };
}

/**
 * Steer a car toward a point and integrate its position: the shared driving brain the
 * police pursuit, the street racers and mission target cars all use, with their own
 * cruise speeds and aggression (topSpeed) — traffic uses the lane router instead.
 */
export function steerToward(game, car, tx, ty, dt, cruise, options = {}) {
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-1, Math.min(1, diff * (options.turnGain ?? 2.2)));
  car.steerVis = turn * 0.42;
  let wanted = cruise;
  if (Math.abs(diff) > 0.6) wanted = Math.min(wanted, options.cornerSpeed ?? 150);
  if (options.avoid !== false && obstacleAhead(game, car, 46 + Math.abs(car.speed) * 0.3)) wanted = Math.min(wanted, options.followSpeed ?? 90);
  const accel = wanted > car.speed ? (options.accel ?? 330) : 640;
  car.speed += Math.max(-accel * dt, Math.min(accel * dt, wanted - car.speed));
  car.angle += turn * Math.min(Math.abs(car.speed), 260) / 128 * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return Math.hypot(tx - car.x, ty - car.y);
}

function startRoute(random, car, i, j) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
    const ni = i + dx;
    const nj = j + dy;
    return ni >= 0 && ni <= CITY.cols && nj >= 0 && nj <= CITY.rows;
  });
  const [dx, dy] = random.pick(dirs);
  car.route = { ci: i, cj: j, ti: i + dx, tj: j + dy, dx, dy, laneSide: LANE };
  // Sit in the correct lane for the heading: right-hand traffic.
  if (dx === 1) car.y = roadCenterY(j) + LANE;
  if (dx === -1) car.y = roadCenterY(j) - LANE;
  if (dy === 1) car.x = roadCenterX(i) - LANE;
  if (dy === -1) car.x = roadCenterX(i) + LANE;
  car.angle = Math.atan2(dy, dx);
}

function advanceRoute(game, car) {
  const { random } = game;
  const r = car.route;
  const options = [[r.dx, r.dy], [r.dy, r.dx], [-r.dy, -r.dx]];
  const weights = car.panic > 0 ? [0.4, 0.3, 0.3] : [0.62, 0.19, 0.19];
  let choice = options[0];
  let roll = random.next();
  for (let k = 0; k < 3; k += 1) {
    if (roll < weights[k]) { choice = options[k]; break; }
    roll -= weights[k];
  }
  let [dx, dy] = choice;
  let ni = r.ti + dx;
  let nj = r.tj + dy;
  if (ni < 0 || ni > CITY.cols || nj < 0 || nj > CITY.rows) {
    dx = -r.dx; dy = -r.dy;
    ni = r.ti + dx; nj = r.tj + dy;
  }
  car.route = { ci: r.ti, cj: r.tj, ti: ni, tj: nj, dx, dy, laneSide: LANE };
}

function obstacleAhead(game, car, distance) {
  const probeX = car.x + Math.cos(car.angle) * distance;
  const probeY = car.y + Math.sin(car.angle) * distance;
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    if (Math.hypot(other.x - probeX, other.y - probeY) < 34) return other;
  }
  const player = game.player;
  if (!player.car && Math.hypot(player.x - probeX, player.y - probeY) < 26) return player;
  for (const ped of game.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    if (Math.hypot(ped.x - probeX, ped.y - probeY) < 24) return ped;
  }
  return null;
}

function driveAi(game, car, dt) {
  if (!car.route) {
    const i = Math.max(0, Math.min(CITY.cols, Math.round((car.x - CITY.gridX) / CITY.pitch - 0.5)));
    const j = Math.max(0, Math.min(CITY.rows, Math.round((car.y - CITY.gridY) / CITY.pitch - 0.5)));
    startRoute(game.random, car, i, j);
  }
  const target = laneTarget(car);
  const distToTarget = Math.hypot(target.x - car.x, target.y - car.y);
  if (distToTarget < 42) advanceRoute(game, car);
  const targetAngle = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-1, Math.min(1, diff * 2.4));
  car.steerVis = turn * 0.4;
  let wanted = car.panic > 0 ? car.cruise * 1.5 : car.cruise;
  if (Math.abs(diff) > 0.45) wanted = Math.min(wanted, 120);
  const blocked = obstacleAhead(game, car, 52 + Math.abs(car.speed) * 0.34);
  if (blocked) wanted = 0;
  const accel = wanted > car.speed ? 260 : 620;
  car.speed += Math.max(-accel * dt, Math.min(accel * dt, wanted - car.speed));
  car.angle += turn * Math.min(Math.abs(car.speed), 240) / 130 * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.panic = Math.max(0, car.panic - dt);
  car.honkTimer -= dt;
  if (blocked && car.honkTimer <= 0) {
    game.audio.honk();
    car.honkTimer = game.random.range(2.5, 7);
  }
}

/** Damage a car; at zero health it burns out and becomes a wreck. */
export function hitCar(game, car, amount, cause) {
  if (car.dead) return;
  car.health -= amount;
  if (car.driver === 'traffic') car.panic = Math.max(car.panic, 3);
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.burnt = true;
    car.wreckTimer = 7;
    car.color = '#2e2c2c';
    game.effects.burst(car.x, car.y, { count: 26, color: '#ff9a3c', speed: 300, life: 0.7, size: 4 });
    game.effects.burst(car.x, car.y, { count: 16, color: '#ffd94d', speed: 200, life: 0.5, size: 3 });
    game.effects.addShake(9);
    game.audio.explosion();
    if (cause === 'shot' || cause === 'ram') game.reportCrime('carDestroyed', car.x, car.y);
    // Splash damage to anyone standing close.
    for (const ped of game.peds) {
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 74 && ped.state !== 'down') game.hitPed(ped, 46, Math.atan2(ped.y - car.y, ped.x - car.x), 'explosion');
    }
    if (game.player.car === car) game.onCarWrecked(car);
    else if (!game.player.car && Math.hypot(game.player.x - car.x, game.player.y - car.y) < 74) game.hurtPlayer(30);
  }
}

/** Building and water collision for one car; exported for the police/mission drivers. */
export function collideCarWithWorld(game, car, dt, isPlayer) {
  // Buildings: test the car's corners; on a hit, stop dead and take impact damage.
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const hl = car.length / 2;
  const hw = car.width / 2;
  const corners = [
    [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw],
  ];
  for (const [cx, cy] of corners) {
    const wx = car.x + cx * cos - cy * sin;
    const wy = car.y + cx * sin + cy * cos;
    for (const rect of game.city.colliders) {
      if (wx >= rect.x && wx <= rect.x + rect.w && wy >= rect.y && wy <= rect.y + rect.h) {
        const impact = Math.abs(car.speed);
        car.x -= cos * Math.sign(car.speed || 1) * 6;
        car.y -= sin * Math.sign(car.speed || 1) * 6;
        car.speed = impact > 140 ? -car.speed * 0.22 : 0;
        if (impact > 130) {
          hitCar(game, car, impact * 0.055, 'crash');
          game.effects.burst(wx, wy, { count: 9, color: '#ffe9a8', speed: 210, life: 0.35, size: 2.6 });
          game.effects.addShake(isPlayer ? Math.min(8, impact * 0.02) : 0);
          game.audio.crash(Math.min(1, impact / 480));
          if (isPlayer) game.reportCrime('hitCar', car.x, car.y);
        }
        return;
      }
    }
  }
  // Water's edge: the sea is a wall too.
  const aheadX = car.x + cos * hl * Math.sign(car.speed || 1);
  const aheadY = car.y + sin * hl * Math.sign(car.speed || 1);
  if (game.city.surfaceAt(aheadX, aheadY) === SURFACE.water && game.city.surfaceAt(car.x, car.y) !== SURFACE.dock) {
    car.speed = 0;
  }
  car.x = Math.max(30, Math.min(WORLD.width - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD.height - 30, car.y));
}

function collideCars(game, dt) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.length + b.length) * 0.36;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      if (a.driver !== 'parked' || Math.abs(a.speed) > 4) { a.x -= nx * push; a.y -= ny * push; }
      if (b.driver !== 'parked' || Math.abs(b.speed) > 4) { b.x += nx * push; b.y += ny * push; }
      const closing = Math.abs(a.speed - b.speed);
      if (closing > 120) {
        hitCar(game, a, closing * 0.03, 'crash');
        hitCar(game, b, closing * 0.03, 'crash');
        game.audio.crash(Math.min(1, closing / 500));
        if (a.driver === 'player' || b.driver === 'player') {
          game.reportCrime(b.kind === 'cop' || a.kind === 'cop' ? 'hitCop' : 'hitCar', game.player.x, game.player.y);
          game.effects.addShake(3.5);
        }
        const fast = Math.abs(a.speed) > Math.abs(b.speed) ? a : b;
        const slow = fast === a ? b : a;
        slow.speed = fast.speed * 0.4;
        fast.speed *= 0.55;
      }
    }
  }
  void dt;
}

/** Drive the player's car from the keys: the arcade model the whole game is tuned on. */
export function updatePlayerCar(game, car, dt) {
  const { input } = game;
  const surface = game.city.surfaceAt(car.x, car.y);
  const offRoad = surface !== SURFACE.road && surface !== SURFACE.parking && surface !== SURFACE.dock;
  const topSpeed = (car.kind === 'van' ? 470 : 615) * (offRoad ? 0.55 : 1);
  const throttle = input.down('KeyW', 'ArrowUp') ? 1 : 0;
  const braking = input.down('KeyS', 'ArrowDown');
  const handbrake = input.down('Space');
  if (throttle) car.speed += CAR.accel * (offRoad ? 0.7 : 1) * dt;
  if (braking) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed - 240 * dt);
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * CAR.drag * dt * (handbrake ? 1.7 : 1);
  if (!throttle && !braking) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 60 * dt);
  car.speed = Math.max(-CAR.reverseMax, Math.min(topSpeed, car.speed));
  const steerInput = (input.down('KeyA', 'ArrowLeft') ? -1 : 0) + (input.down('KeyD', 'ArrowRight') ? 1 : 0);
  const speedRatio = Math.min(1, Math.abs(car.speed) / 340);
  const steerAngle = steerInput * 0.55 * (1 - speedRatio * 0.45);
  car.steerVis = steerAngle;
  const wheelbase = car.length * 0.62;
  if (car.speed !== 0) {
    car.angle += (car.speed / wheelbase) * Math.tan(steerAngle) * dt * (handbrake ? 1.45 : 1);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Drift smoke and skid marks.
  const drifting = handbrake && Math.abs(car.speed) > 200 && steerInput !== 0;
  if (drifting || (Math.abs(car.speed) > 380 && Math.abs(steerAngle) > 0.3)) {
    const rearX = car.x - Math.cos(car.angle) * car.length * 0.36;
    const rearY = car.y - Math.sin(car.angle) * car.length * 0.36;
    const sideX = Math.cos(car.angle + Math.PI / 2) * car.width * 0.4;
    const sideY = Math.sin(car.angle + Math.PI / 2) * car.width * 0.4;
    game.effects.skid(rearX + sideX, rearY + sideY, car.angle);
    game.effects.skid(rearX - sideX, rearY - sideY, car.angle);
    if (Math.random() < 0.5) game.effects.smoke(rearX, rearY, 0.4);
  }
  game.audio.setSkid(drifting);
  collideCarWithWorld(game, car, dt, true);
}

function maintainTraffic(game, dt) {
  const player = game.player;
  let moving = 0;
  for (const car of game.cars) {
    if (car.driver === 'traffic') {
      moving += 1;
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d > 1750) car.awayTimer += dt;
      else car.awayTimer = 0;
      if (car.awayTimer > 6) {
        // Recycle far-away traffic to a road near (but not visible to) the player.
        const i = game.random.int(0, CITY.cols);
        const j = game.random.int(0, CITY.rows);
        car.x = roadCenterX(i);
        car.y = roadCenterY(j);
        car.speed = 0;
        car.route = null;
        car.awayTimer = 0;
        if (Math.hypot(car.x - player.x, car.y - player.y) < 640) car.x += 900;
      }
    }
  }
  if (moving < TRAFFIC_TARGET) {
    const i = game.random.int(0, CITY.cols);
    const j = game.random.int(0, CITY.rows);
    const x = roadCenterX(i);
    const y = roadCenterY(j);
    if (Math.hypot(x - player.x, y - player.y) > 760) {
      const kind = game.random.chance(0.16) ? 'taxi' : 'car';
      const car = createCar(game.random, x, y, 0, { driver: 'traffic', kind });
      game.cars.push(car);
    }
  }
  // Keep the whole fleet bounded: wrecks and parked cars from long ago fade out.
  if (game.cars.length > 90) {
    const idx = game.cars.findIndex((car) => car.dead && car.wreckTimer <= 0 && Math.hypot(car.x - player.x, car.y - player.y) > 900);
    if (idx !== -1) game.cars.splice(idx, 1);
  }
}

export function updateVehicles(game, dt) {
  for (const car of game.cars) {
    if (car.dead) {
      car.wreckTimer = Math.max(0, car.wreckTimer - dt);
      car.speed = 0;
      if (car.wreckTimer > 0) {
        if (Math.random() < 0.35) game.effects.fire(car.x, car.y);
        if (Math.random() < 0.5) game.effects.smoke(car.x, car.y, 1.4);
      } else if (Math.random() < 0.05) {
        game.effects.smoke(car.x, car.y, 0.7);
      }
      continue;
    }
    if (car.health < 52) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        game.effects.smoke(car.x + Math.cos(car.angle) * car.length * 0.3, car.y + Math.sin(car.angle) * car.length * 0.3, car.health < 26 ? 1.3 : 0.7);
        car.smokeTimer = car.health < 26 ? 0.12 : 0.3;
      }
    }
    if (car.driver === 'traffic') {
      driveAi(game, car, dt);
      collideCarWithWorld(game, car, dt, false);
    } else if (car.driver === 'player') updatePlayerCar(game, car, dt);
    // Cop, racer and mission drivers are steered by their own modules after this pass,
    // and call collideCarWithWorld themselves once they have moved.
  }
  collideCars(game, dt);
  maintainTraffic(game, dt);
}

/** Panic every traffic driver near a point (gunfire, an explosion, a crash). */
export function panicNear(game, x, y, radius) {
  for (const car of game.cars) {
    if (car.driver === 'traffic' && Math.hypot(car.x - x, car.y - y) < radius) car.panic = Math.max(car.panic, 2.5);
  }
}
