// The renderer: paints Port Azura and everything in it onto the canvas each frame. The
// static ground (water, sand, roads, sidewalks, block grounds, docks) is painted once
// into offscreen tiles and blitted — only the visible tiles — while buildings, vehicles,
// people, effects and the day/night lighting are drawn live, culled to the camera view.
// It also paints the minimap's base map once for the HUD.
import { CITY, PALETTE, WORLD } from './config.js';
import { blockKind, blockRect, roadCenterX, roadCenterY } from './city.js';
import { createRandom } from './random.js';

const TILE = 1024;

/** 0 in full day, 1 in full night, easing through dawn and dusk. */
export function nightFactor(hour) {
  if (hour >= 20.5 || hour < 4.5) return 1;
  if (hour < 7) return 1 - (hour - 4.5) / 2.5;
  if (hour > 18) return (hour - 18) / 2.5;
  return 0;
}

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paintGroundTile(ctx, city, ox, oy) {
  const decor = createRandom(9100 + ox * 31 + oy * 57);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(ox, oy, TILE, TILE);
  // Water sparkle and depth patches.
  for (let i = 0; i < 130; i += 1) {
    ctx.fillStyle = decor.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,60,0.07)';
    ctx.fillRect(ox + decor.range(0, TILE), oy + decor.range(0, TILE), decor.range(8, 42), 2);
  }
  // The island: sand with a darker wet rim.
  const m = CITY.islandMargin;
  ctx.fillStyle = PALETTE.sandDark;
  roundRect(ctx, m - 14 - ox + ox, m - 14, WORLD.width - m * 2 + 28, WORLD.height - m * 2 + 28, 60);
  ctx.fill();
  ctx.fillStyle = PALETTE.sand;
  roundRect(ctx, m, m, WORLD.width - m * 2, WORLD.height - m * 2, 52);
  ctx.fill();
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = 'rgba(160, 130, 80, 0.10)';
    ctx.fillRect(decor.range(m, WORLD.width - m), decor.range(m, WORLD.height - m), decor.range(2, 6), decor.range(2, 5));
  }
  // City base: grass verges under the grid.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(CITY.gridX - 60, CITY.gridY - 60, WORLD.width - CITY.gridX * 2 + 120, WORLD.height - CITY.gridY * 2 + 120);
  // Block grounds.
  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const rect = blockRect(col, row);
      const kind = blockKind(col, row);
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = kind === 'park' ? PALETTE.grassDark
        : kind === 'parking' ? PALETTE.parking : '#cfc4ae';
      ctx.fillRect(rect.x + 17, rect.y + 17, rect.w - 34, rect.h - 34);
      if (kind === 'park') {
        ctx.strokeStyle = PALETTE.parkPath;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(rect.x + 20, rect.y + rect.h - 20);
        ctx.quadraticCurveTo(rect.x + rect.w / 2, rect.y + 30, rect.x + rect.w - 20, rect.y + rect.h - 26);
        ctx.stroke();
      }
      if (kind === 'parking') {
        ctx.strokeStyle = 'rgba(240,240,230,0.5)';
        ctx.lineWidth = 2;
        for (let sx = 0; sx < 3; sx += 1) {
          for (let sy = 0; sy < 3; sy += 1) {
            ctx.strokeRect(rect.x + 22 + sx * 74, rect.y + 20 + sy * 74, 58, 56);
          }
        }
      }
    }
  }
  // Roads: asphalt, edge lines, lane dashes.
  ctx.fillStyle = PALETTE.road;
  for (let i = 0; i <= CITY.cols; i += 1) {
    ctx.fillRect(roadCenterX(i) - CITY.road / 2, CITY.gridY, CITY.road, WORLD.height - CITY.gridY * 2);
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    ctx.fillRect(CITY.gridX, roadCenterY(j) - CITY.road / 2, WORLD.width - CITY.gridX * 2, CITY.road);
  }
  ctx.strokeStyle = 'rgba(240,238,225,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 20]);
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (const off of [-CITY.road / 4, CITY.road / 4]) {
      ctx.beginPath();
      ctx.moveTo(roadCenterX(i) + off, CITY.gridY);
      ctx.lineTo(roadCenterX(i) + off, WORLD.height - CITY.gridY);
      ctx.stroke();
    }
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    for (const off of [-CITY.road / 4, CITY.road / 4]) {
      ctx.beginPath();
      ctx.moveTo(CITY.gridX, roadCenterY(j) + off);
      ctx.lineTo(WORLD.width - CITY.gridX, roadCenterY(j) + off);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = '#e9b949';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (let i = 0; i <= CITY.cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(roadCenterX(i), CITY.gridY);
    ctx.lineTo(roadCenterX(i), WORLD.height - CITY.gridY);
    ctx.stroke();
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    ctx.beginPath();
    ctx.moveTo(CITY.gridX, roadCenterY(j));
    ctx.lineTo(WORLD.width - CITY.gridX, roadCenterY(j));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = PALETTE.crosswalk;
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j <= CITY.rows; j += 1) {
      const cx = roadCenterX(i);
      const cy = roadCenterY(j);
      for (let s = -2; s <= 2; s += 1) {
        ctx.fillRect(cx - CITY.road / 2 - 12, cy + s * 11 - 3, 9, 6);
        ctx.fillRect(cx + CITY.road / 2 + 3, cy + s * 11 - 3, 9, 6);
        ctx.fillRect(cx + s * 11 - 3, cy - CITY.road / 2 - 12, 6, 9);
        ctx.fillRect(cx + s * 11 - 3, cy + CITY.road / 2 + 3, 6, 9);
      }
    }
  }
  // Marina docks: wooden piers over the water.
  for (const dock of city.docks) {
    ctx.fillStyle = '#9a7a52';
    ctx.fillRect(dock.x, dock.y, dock.w, dock.h);
    ctx.strokeStyle = 'rgba(70, 50, 26, 0.5)';
    ctx.lineWidth = 1;
    for (let px = dock.x + 12; px < dock.x + dock.w; px += 16) {
      ctx.beginPath();
      ctx.moveTo(px, dock.y + 2);
      ctx.lineTo(px, dock.y + dock.h - 2);
      ctx.stroke();
    }
  }
}

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d');
  const tiles = [];
  const tilesX = Math.ceil(WORLD.width / TILE);
  const tilesY = Math.ceil(WORLD.height / TILE);
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const tile = document.createElement('canvas');
      tile.width = TILE;
      tile.height = TILE;
      const tctx = tile.getContext('2d');
      tctx.save();
      tctx.translate(-tx * TILE, -ty * TILE);
      tctx.beginPath();
      tctx.rect(tx * TILE, ty * TILE, TILE, TILE);
      tctx.clip();
      paintGroundTile(tctx, city, tx * TILE, ty * TILE);
      tctx.restore();
      tiles.push({ x: tx * TILE, y: ty * TILE, canvas: tile });
    }
  }
  // The minimap base: the whole island squeezed onto one small canvas.
  const minimap = document.createElement('canvas');
  const MAP_SCALE = 0.052;
  minimap.width = Math.ceil(WORLD.width * MAP_SCALE);
  minimap.height = Math.ceil(WORLD.height * MAP_SCALE);
  const mctx = minimap.getContext('2d');
  mctx.fillStyle = PALETTE.water;
  mctx.fillRect(0, 0, minimap.width, minimap.height);
  for (const tile of tiles) mctx.drawImage(tile.canvas, tile.x * MAP_SCALE, tile.y * MAP_SCALE, TILE * MAP_SCALE, TILE * MAP_SCALE);

  let view = { w: 1280, h: 720, dpr: 1 };
  const camera = { x: WORLD.width / 2, y: WORLD.height / 2, zoom: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    view = { w, h, dpr };
  }

  function screenToWorld(sx, sy) {
    return {
      x: camera.x + (sx - view.w / 2) / camera.zoom,
      y: camera.y + (sy - view.h / 2) / camera.zoom,
    };
  }

  function visibleRect(margin = 90) {
    const hw = view.w / 2 / camera.zoom + margin;
    const hh = view.h / 2 / camera.zoom + margin;
    return { x: camera.x - hw, y: camera.y - hh, w: hw * 2, h: hh * 2 };
  }

  function inView(x, y, rect, pad = 0) {
    return x >= rect.x - pad && x <= rect.x + rect.w + pad && y >= rect.y - pad && y <= rect.y + rect.h + pad;
  }

  function drawBuilding(b, night) {
    const h = b.height;
    ctx.fillStyle = PALETTE.roofShadow;
    ctx.fillRect(b.x + 7 + h * 0.30, b.y + 6 + h * 0.22, b.w, b.h);
    ctx.fillStyle = shade(b.color, -34);
    ctx.fillRect(b.x, b.y + h * 0.16, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(60, 45, 30, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(90, 80, 70, 0.35)';
    for (const d of b.details) ctx.fillRect(d.x, d.y, d.w, d.h);
    if (b.name) {
      const landmark = b.kind !== 'block';
      ctx.font = `600 ${landmark ? 13 : 10}px ${'"Segoe UI", system-ui, sans-serif'}`;
      const tw = ctx.measureText(b.name).width + 14;
      const sx = b.x + b.w / 2 - tw / 2;
      const sy = b.y + b.h + h * 0.16 - 19;
      ctx.fillStyle = landmark ? '#123c46' : 'rgba(20, 26, 34, 0.72)';
      roundRect(ctx, sx, sy, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = night > 0.4 && landmark ? '#7df9ff' : '#f5f2e8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name, b.x + b.w / 2, sy + 8.5);
    }
  }

  function drawPalm(palm) {
    const { x, y, s } = palm;
    ctx.strokeStyle = PALETTE.palmTrunk;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 3 * s, y - 7 * s, x + 6 * s, y - 12 * s);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.palmLeaf;
    ctx.lineWidth = 2.6 * s;
    const phase = ((x * 31 + y * 17) % 628) / 100;
    for (let i = 0; i < 6; i += 1) {
      const a = phase + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + 6 * s, y - 12 * s);
      ctx.quadraticCurveTo(
        x + 6 * s + Math.cos(a) * 11 * s, y - 12 * s + Math.sin(a) * 7 * s - 3 * s,
        x + 6 * s + Math.cos(a) * 17 * s, y - 12 * s + Math.sin(a) * 10 * s + 4 * s,
      );
      ctx.stroke();
    }
  }

  function drawPerson(person, isPlayer, time) {
    const bob = person.moving ? Math.sin(time * 13 + person.walkPhase) * 2.2 : 0;
    ctx.fillStyle = 'rgba(20, 26, 34, 0.30)';
    ctx.beginPath();
    ctx.ellipse(person.x, person.y + 9, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(person.x, person.y);
    ctx.rotate(person.angle + Math.PI / 2);
    // Legs.
    ctx.fillStyle = person.pants;
    ctx.fillRect(-6, 2 + bob, 5, 9);
    ctx.fillRect(1, 2 - bob, 5, 9);
    // Body.
    ctx.fillStyle = person.shirt;
    roundRect(ctx, -8, -7, 16, 14, 6);
    ctx.fill();
    ctx.restore();
    // Head (kept unrotated so faces read at any angle).
    ctx.fillStyle = person.skin;
    ctx.beginPath();
    ctx.arc(person.x, person.y - 1, 6.4, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = '#123c46';
      ctx.beginPath();
      ctx.arc(person.x, person.y - 2.5, 6.4, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCarBody(car, time, night) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(20, 26, 34, 0.32)';
    ctx.beginPath();
    ctx.ellipse(3, 5, car.length * 0.55, car.width * 0.62, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    const L = car.length;
    const W = car.width;
    // Wheels.
    ctx.fillStyle = '#14171c';
    const wy = W / 2 - 2;
    ctx.fillRect(-L / 2 + 5, -wy - 2, 11, 4.5);
    ctx.fillRect(-L / 2 + 5, wy - 2.5, 11, 4.5);
    ctx.save();
    ctx.translate(L / 2 - 14, -wy);
    ctx.rotate(car.steerVis ?? 0);
    ctx.fillRect(-5.5, -2.2, 11, 4.5);
    ctx.restore();
    ctx.save();
    ctx.translate(L / 2 - 14, wy);
    ctx.rotate(car.steerVis ?? 0);
    ctx.fillRect(-5.5, -2.2, 11, 4.5);
    ctx.restore();
    // Body and cabin.
    ctx.fillStyle = car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (car.kind === 'cop') {
      ctx.fillStyle = PALETTE.copCarTrim;
      ctx.fillRect(-L * 0.18, -W / 2, L * 0.3, W);
    }
    ctx.fillStyle = 'rgba(24, 34, 46, 0.88)';
    roundRect(ctx, -L * 0.16, -W / 2 + 3.4, L * 0.34, W - 6.8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(168, 216, 234, 0.75)';
    ctx.fillRect(L * 0.13, -W / 2 + 4.4, 4.6, W - 8.8);
    ctx.fillRect(-L * 0.24, -W / 2 + 4.4, 3.6, W - 8.8);
    // Damage: dark scorch patches as health falls.
    if (car.health < 55) {
      ctx.fillStyle = 'rgba(30, 28, 28, 0.45)';
      ctx.fillRect(L * 0.28, -W * 0.3, 9, 8);
      if (car.health < 28) ctx.fillRect(-L * 0.4, W * 0.12, 10, 8);
    }
    // Lights.
    ctx.fillStyle = night > 0.25 ? '#fff6c9' : '#e8e4cd';
    ctx.fillRect(L / 2 - 2.4, -W / 2 + 2.6, 2.6, 5);
    ctx.fillRect(L / 2 - 2.4, W / 2 - 7.6, 2.6, 5);
    ctx.fillStyle = '#d64541';
    ctx.fillRect(-L / 2 - 0.2, -W / 2 + 2.6, 2.4, 5);
    ctx.fillRect(-L / 2 - 0.2, W / 2 - 7.6, 2.4, 5);
    if (car.kind === 'cop') {
      const phase = Math.floor(time * 2.6 + (car.sirenPhase ?? 0)) % 2;
      ctx.fillStyle = phase === 0 ? '#ff4040' : '#7a1616';
      ctx.fillRect(-6, -W / 2 + 3, 6, W / 2 - 3);
      ctx.fillStyle = phase === 1 ? '#3f8cff' : '#173a66';
      ctx.fillRect(0, 0, 6, W / 2 - 3);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(-5, -4.5, 10, 9);
      ctx.fillStyle = '#22242a';
      ctx.font = '700 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, 0.5);
    }
    ctx.restore();
  }

  function draw(frame) {
    resize();
    const { player, cars, peds, effects, hour, objective, packages, time } = frame;
    const night = nightFactor(hour);
    camera.x = frame.camera.x;
    camera.y = frame.camera.y;
    camera.zoom = frame.camera.zoom;
    const rect = visibleRect();
    const shake = effects.shakeOffset();

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.w / 2 + shake.x, view.h / 2 + shake.y);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    for (const tile of tiles) {
      if (tile.x + TILE < rect.x || tile.y + TILE < rect.y || tile.x > rect.x + rect.w || tile.y > rect.y + rect.h) continue;
      ctx.drawImage(tile.canvas, tile.x, tile.y);
    }
    // Skid marks under everything mobile.
    for (const skid of effects.skids) {
      if (!inView(skid.x, skid.y, rect)) continue;
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.fillStyle = `rgba(22, 22, 26, ${0.34 * (skid.life / skid.maxLife)})`;
      ctx.fillRect(-7, -2.4, 14, 4.8);
      ctx.restore();
    }
    // Boats bobbing at the marina.
    for (const boat of city.boats) {
      if (!inView(boat.x, boat.y, rect, 60)) continue;
      ctx.save();
      ctx.translate(boat.x, boat.y + Math.sin(time * 1.3 + boat.x) * 1.6);
      ctx.rotate(boat.angle);
      ctx.fillStyle = boat.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 21, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-5, -3.4, 11, 6.8);
      ctx.restore();
    }
    for (const palm of city.palms) {
      if (inView(palm.x, palm.y, rect, 40)) drawPalm(palm);
    }
    // Hidden packages: a glowing satchel.
    if (packages) {
      for (const pack of packages) {
        if (pack.taken || !inView(pack.x, pack.y, rect, 40)) continue;
        const pulse = 0.75 + Math.sin(time * 4 + pack.x) * 0.25;
        ctx.fillStyle = `rgba(255, 217, 77, ${0.30 * pulse})`;
        ctx.beginPath();
        ctx.arc(pack.x, pack.y, 17 * pulse + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(pack.x, pack.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#c9922e';
        ctx.fillRect(-6.4, -6.4, 12.8, 12.8);
        ctx.fillStyle = '#ffd94d';
        ctx.fillRect(-4.4, -4.4, 8.8, 8.8);
        ctx.restore();
      }
    }
    // Objective beacon: a pillar of light and a pulsing ring on the ground.
    if (objective) {
      const pulse = 0.7 + Math.sin(time * 3.4) * 0.3;
      const grad = ctx.createLinearGradient(0, objective.y - 340, 0, objective.y);
      grad.addColorStop(0, 'rgba(255, 217, 77, 0)');
      grad.addColorStop(1, `rgba(255, 217, 77, ${0.34 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(objective.x - 13, objective.y - 340, 26, 340);
      ctx.strokeStyle = `rgba(255, 217, 77, ${0.85 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(objective.x, objective.y, 20 + Math.sin(time * 3.4) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of city.buildings) {
      if (inView(b.x + b.w / 2, b.y + b.h / 2, rect, Math.max(b.w, b.h))) drawBuilding(b, night);
    }
    for (const car of cars) {
      if (!car.dead && inView(car.x, car.y, rect, 90)) drawCarBody(car, time, night);
    }
    for (const ped of peds) {
      if (ped.state !== 'gone' && inView(ped.x, ped.y, rect, 40)) drawPerson(ped, false, time);
    }
    if (!player.car && player.health > 0) {
      drawPerson(player, true, time);
      if (player.weaponOut) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.aimAngle);
        ctx.fillStyle = '#1d2126';
        ctx.fillRect(8, -1.8, 13, 3.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(74, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Effects: tracers, then particles, then floating text.
    for (const tracer of effects.tracers) {
      ctx.strokeStyle = `rgba(255, 226, 140, ${0.75 * (tracer.life / tracer.maxLife)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tracer.x1, tracer.y1);
      ctx.lineTo(tracer.x2, tracer.y2);
      ctx.stroke();
    }
    for (const p of effects.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife + 0.25));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of effects.texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / t.maxLife + 0.2));
      ctx.fillStyle = t.color;
      ctx.fillText(t.value, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Lighting: dusk warmth, then the night overlay and its light pools.
    const dusk = (hour > 16.8 && hour < 19.6) || (hour > 5 && hour < 7.4);
    if (dusk && night < 0.85) {
      ctx.fillStyle = 'rgba(255, 138, 66, 0.10)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (night > 0.02) {
      ctx.fillStyle = `rgba(9, 14, 38, ${0.40 * night})`;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.save();
      ctx.translate(view.w / 2 + shake.x, view.h / 2 + shake.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      ctx.globalCompositeOperation = 'lighter';
      const pool = (x, y, r, color, alpha) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color.replace('A', String(alpha * night)));
        g.addColorStop(1, color.replace('A', '0'));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      for (let i = 0; i <= CITY.cols; i += 1) {
        for (let j = 0; j <= CITY.rows; j += 1) {
          const lx = roadCenterX(i);
          const ly = roadCenterY(j);
          if (inView(lx, ly, rect, 60)) pool(lx, ly, 86, 'rgba(255, 196, 110, A)', 0.16);
        }
      }
      for (const car of cars) {
        if (car.dead || !inView(car.x, car.y, rect, 200)) continue;
        const hx = car.x + Math.cos(car.angle) * (car.length / 2 + 44);
        const hy = car.y + Math.sin(car.angle) * (car.length / 2 + 44);
        pool(hx, hy, 74, 'rgba(255, 240, 190, A)', 0.20);
        if (car.kind === 'cop') {
          const phase = Math.floor(time * 2.6 + (car.sirenPhase ?? 0)) % 2;
          pool(car.x, car.y, 95, phase === 0 ? 'rgba(255, 70, 70, A)' : 'rgba(80, 140, 255, A)', 0.22);
        }
      }
      if (!player.car) pool(player.x, player.y, 60, 'rgba(255, 240, 200, A)', 0.10);
      if (objective) pool(objective.x, objective.y, 90, 'rgba(255, 217, 77, A)', 0.25);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    // A soft vignette to finish.
    const vg = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.42, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4, 8, 16, 0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  return { draw, screenToWorld, minimap, mapScale: MAP_SCALE, camera };
}
