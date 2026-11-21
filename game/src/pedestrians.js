// Pedestrians: Port Azura's walkers. They stroll the sidewalk ring around each block,
// cross to neighbouring blocks, flee from gunfire, crashes and speeding cars, hail
// taxis, fall when hit (and drop cash when they were carrying any), and keep their
// numbers up around the player by recycling from off-screen. Police officers are
// pedestrians too — flagged, and driven by the police module instead of this one.
import { CITY } from './config.js';
import { SURFACE, blockRect, pushCircleOutOfRects } from './city.js';

const PED_TARGET = 32;
const SHIRTS = ['#f2f0eb', '#e8836b', '#7fb3d5', '#f7dc6f', '#abebc6', '#f5b7d0', '#f39c6c', '#aed6f1', '#e6e6e6', '#82e0aa'];
const PANTS = ['#34495e', '#5d6d7e', '#7d6608', '#6c3483', '#935116', '#2e4053', '#a04038'];
const SKINS = ['#f2c79b', '#e8b08a', '#c68863', '#a06844', '#8d5524', '#ffdbac'];

export function createPed(random, x, y, options = {}) {
  return {
    x, y, angle: random.range(0, Math.PI * 2),
    moving: false, walkPhase: random.range(0, 6),
    shirt: options.shirt ?? random.pick(SHIRTS),
    pants: random.pick(PANTS), skin: random.pick(SKINS),
    state: options.state ?? 'walk',
    hp: 26,
    waypoint: null, speed: random.range(52, 84),
    fleeTimer: 0, fleeFrom: null, downTimer: 0, idleTimer: 0,
    officer: options.officer ?? false,
    hailing: options.hailing ?? false,
    fireTimer: 0, strafeDir: 1,
    radius: 12,
  };
}

function sidewalkPoint(game, nearX, nearY, spread) {
  const { random, city } = game;
  for (let tries = 0; tries < 12; tries += 1) {
    const col = Math.max(0, Math.min(CITY.cols - 1, Math.floor((nearX - CITY.gridX) / CITY.pitch) + random.int(-spread, spread)));
    const row = Math.max(0, Math.min(CITY.rows - 1, Math.floor((nearY - CITY.gridY) / CITY.pitch) + random.int(-spread, spread)));
    const rect = blockRect(col, row);
    const side = random.int(0, 3);
    const t = random.range(0.06, 0.94);
    const inset = 8;
    const point = [
      { x: rect.x + t * rect.w, y: rect.y + inset },
      { x: rect.x + t * rect.w, y: rect.y + rect.h - inset },
      { x: rect.x + inset, y: rect.y + t * rect.h },
      { x: rect.x + rect.w - inset, y: rect.y + t * rect.h },
    ][side];
    if (city.surfaceAt(point.x, point.y) !== SURFACE.water) return point;
  }
  return { x: nearX, y: nearY };
}

/** Hurt a pedestrian: knockback, panic, falling, cash. Causes: punch, shot, car, explosion. */
export function hitPed(game, ped, damage, angle, cause, byCar = null) {
  if (ped.state === 'down' || ped.state === 'gone') return;
  ped.hp -= damage;
  ped.x += Math.cos(angle) * 9;
  ped.y += Math.sin(angle) * 9;
  if (cause === 'car' || cause === 'explosion' || ped.hp <= 0) {
    ped.state = 'down';
    ped.downTimer = 7;
    game.audio.thud();
    // Only the player's own driving is a crime; traffic accidents are not Jax's heat.
    if (cause === 'car' && byCar && byCar.driver === 'player') {
      game.reportCrime(ped.officer ? 'hitCop' : 'hitPed', ped.x, ped.y);
    }
    if (cause === 'shot' || cause === 'punch') game.reportCrime(ped.officer ? 'downCop' : 'downPed', ped.x, ped.y);
    if (!ped.officer && game.random.chance(0.65)) {
      game.cashDrops.push({ x: ped.x, y: ped.y, amount: game.random.int(4, 26), life: 14 });
    }
    game.effects.burst(ped.x, ped.y, { count: 5, color: '#e8e2d2', speed: 90, life: 0.35, size: 2.4 });
  } else {
    ped.state = 'flee';
    ped.fleeTimer = 3.2;
    ped.fleeFrom = { x: ped.x - Math.cos(angle) * 60, y: ped.y - Math.sin(angle) * 60 };
    if (cause === 'punch') game.reportCrime('assault', ped.x, ped.y);
  }
}

/** Send every nearby walker running from a frightening point. */
export function scareNear(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.officer || ped.state === 'down' || ped.state === 'gone') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = Math.max(ped.fleeTimer, 2.6);
      ped.fleeFrom = { x, y };
    }
  }
}

function carThreatens(game, ped) {
  for (const car of game.cars) {
    if (car.dead || Math.abs(car.speed) < 55) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const lateral = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
    if (along > -6 && along < car.length / 2 + 16 && Math.abs(lateral) < car.width / 2 + 9) {
      return car;
    }
  }
  return null;
}

export function updatePedestrians(game, dt) {
  const { player, random } = game;
  // Population control: recycle walkers who drifted too far, top up near the player.
  let walkers = 0;
  for (const ped of game.peds) {
    if (ped.officer) continue;
    walkers += 1;
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (d > 1250 && ped.state !== 'down') {
      const spot = sidewalkPoint(game, player.x, player.y, 3);
      if (Math.hypot(spot.x - player.x, spot.y - player.y) > 560) {
        ped.x = spot.x; ped.y = spot.y;
        ped.state = ped.hailing ? 'hail' : 'walk';
        ped.waypoint = null;
        ped.hp = 26;
      }
    }
  }
  for (let attempt = 0; attempt < 10 && walkers < PED_TARGET; attempt += 1) {
    const spot = sidewalkPoint(game, player.x, player.y, 3);
    const d = Math.hypot(spot.x - player.x, spot.y - player.y);
    if (d < 470 || d > 1300) continue;
    const ped = createPed(random, spot.x, spot.y, { hailing: random.chance(0.13) });
    if (ped.hailing) ped.state = 'hail';
    game.peds.push(ped);
    walkers += 1;
  }
  // Cash drops drift to the player and pay out.
  for (let i = game.cashDrops.length - 1; i >= 0; i -= 1) {
    const drop = game.cashDrops[i];
    drop.life -= dt;
    const d = Math.hypot(player.x - drop.x, player.y - drop.y);
    if (d < 130) {
      drop.x += ((player.x - drop.x) / (d || 1)) * 260 * dt;
      drop.y += ((player.y - drop.y) / (d || 1)) * 260 * dt;
    }
    if (d < 24) {
      game.addMoney(drop.amount, drop.x, drop.y);
      game.cashDrops.splice(i, 1);
    } else if (drop.life <= 0) game.cashDrops.splice(i, 1);
  }

  for (const ped of game.peds) {
    if (ped.officer) continue; // Officers are driven by the police module.
    if (ped.state === 'gone') continue;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.state = 'gone';
      continue;
    }
    const threat = carThreatens(game, ped);
    if (threat) {
      const dx = ped.x - threat.x;
      const dy = ped.y - threat.y;
      const along = dx * Math.cos(threat.angle) + dy * Math.sin(threat.angle);
      if (along > 26 && ped.state !== 'flee') {
        // Seen it coming: dive out of the lane rather than be collected by it.
        ped.state = 'flee';
        ped.fleeTimer = 1.1;
        ped.fleeFrom = { x: threat.x, y: threat.y };
      } else if (along <= 26) {
        hitPed(game, ped, Math.min(64, Math.abs(threat.speed) * 0.24), threat.angle, 'car', threat);
        threat.speed *= 0.8;
        game.audio.crash(0.25);
        game.effects.addShake(2);
        continue;
      }
    }
    if (ped.state === 'hail') {
      ped.moving = false;
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
      ped.angle = away;
      ped.x += Math.cos(away) * 205 * dt;
      ped.y += Math.sin(away) * 205 * dt;
      ped.moving = true;
      ped.walkPhase += dt * 1.7;
      if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.waypoint = null; }
    } else {
      if (!ped.waypoint || Math.hypot(ped.waypoint.x - ped.x, ped.waypoint.y - ped.y) < 16) {
        ped.idleTimer -= dt;
        ped.moving = false;
        if (ped.idleTimer <= 0) {
          ped.waypoint = sidewalkPoint(game, ped.x, ped.y, 1);
          ped.idleTimer = random.range(0, 2.4);
        }
        continue;
      }
      const angle = Math.atan2(ped.waypoint.y - ped.y, ped.waypoint.x - ped.x);
      ped.angle = angle;
      ped.x += Math.cos(angle) * ped.speed * dt;
      ped.y += Math.sin(angle) * ped.speed * dt;
      ped.moving = true;
      ped.walkPhase += dt;
    }
    // Keep walkers out of buildings and the sea.
    pushCircleOutOfRects(ped, ped.radius, game.city.colliders);
    if (game.city.surfaceAt(ped.x, ped.y) === SURFACE.water) {
      ped.x -= Math.cos(ped.angle) * 30 * dt * 10;
      ped.y -= Math.sin(ped.angle) * 30 * dt * 10;
      ped.waypoint = null;
    }
  }
}
