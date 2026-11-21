// Port Azura, generated once from a seed: a grid of city blocks between two-way roads on
// a sandy island, ringed by water. This module is pure data and geometry — the block
// layout, building footprints (which are also the collision solids), the named places
// missions and shops hang off, the road-lane graph traffic drives on, and the surface
// lookup (road, sidewalk, grass, sand, water…) the rest of the game asks about.
import { CITY, PALETTE, ROOF_COLORS, WORLD } from './config.js';

export const SURFACE = {
  road: 'road',
  sidewalk: 'sidewalk',
  grass: 'grass',
  sand: 'sand',
  water: 'water',
  parking: 'parking',
  dock: 'dock',
  building: 'building',
};

/** Centre line x of vertical road i (0..cols), and y of horizontal road j (0..rows). */
export function roadCenterX(i) {
  return CITY.gridX + i * CITY.pitch + CITY.road / 2;
}
export function roadCenterY(j) {
  return CITY.gridY + j * CITY.pitch + CITY.road / 2;
}

/** The rectangle of block (col, row): the land between the roads around it. */
export function blockRect(col, row) {
  return {
    x: CITY.gridX + col * CITY.pitch + CITY.road,
    y: CITY.gridY + row * CITY.pitch + CITY.road,
    w: CITY.block,
    h: CITY.block,
  };
}

const SHOP_NAMES = [
  'Café Brisa', 'Taco Fuego', 'Neon Nights Club', 'Surf Shop Ola', 'Palm Court',
  'Azura Realty', 'Diner Sol', 'Pharmacy Vida', 'Gym Titanes', 'Bar El Faro',
  'Bookshop Marea', 'Jewels Oro', 'Cinema Lux', 'Bakery Sol', 'Tattoo Marea',
  'Casino Azul', 'Hotel Marisol', 'Club Vela', 'Laundromat Luna', 'Solana Suites',
];

/** Blocks with a fixed job, keyed "col,row"; everything else is generated. */
const SPECIAL_BLOCKS = {
  '2,1': 'police',
  '7,5': 'hospital',
  '1,5': 'safehouse',
  '5,2': 'gunshop',
  '8,3': 'spray',
  '9,0': 'hotel',
  '6,1': 'arena',
  '4,6': 'bank',
  '4,4': 'park',
  '3,6': 'parking',
  '8,6': 'parking',
};

/** The fixed job of block (col, row), or 'beachfront' / 'city' for generated blocks. */
export function blockKind(col, row) {
  return SPECIAL_BLOCKS[`${col},${row}`] ?? (col === CITY.cols - 1 ? 'beachfront' : 'city');
}

export function createCity(random) {
  const buildings = [];
  const colliders = [];
  const places = [];
  const palms = [];
  const docks = [];
  const boats = [];
  const parkingSpots = [];

  function addBuilding(rect, options = {}) {
    const building = {
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      height: options.height ?? random.range(16, 54),
      color: options.color ?? random.pick(ROOF_COLORS),
      name: options.name ?? null,
      kind: options.kind ?? 'block',
      details: [],
    };
    const detailCount = random.int(1, 3);
    for (let i = 0; i < detailCount; i += 1) {
      const dw = random.range(14, Math.min(44, rect.w * 0.3));
      const dh = random.range(12, Math.min(36, rect.h * 0.3));
      building.details.push({
        x: rect.x + random.range(6, Math.max(7, rect.w - dw - 6)),
        y: rect.y + random.range(6, Math.max(7, rect.h - dh - 6)),
        w: dw, h: dh,
      });
    }
    buildings.push(building);
    colliders.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    return building;
  }

  function addPlace(id, name, building, door) {
    places.push({ id, name, x: door.x, y: door.y, building });
  }

  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const rect = blockRect(col, row);
      const kind = SPECIAL_BLOCKS[`${col},${row}`] ?? (col === CITY.cols - 1 ? 'beachfront' : 'city');
      const inner = { x: rect.x + 17, y: rect.y + 17, w: rect.w - 34, h: rect.h - 34 };
      if (kind === 'park') {
        const treeCount = random.int(7, 11);
        for (let i = 0; i < treeCount; i += 1) {
          palms.push({ x: rect.x + random.range(26, rect.w - 26), y: rect.y + random.range(26, rect.h - 26), s: random.range(0.8, 1.25) });
        }
        places.push({ id: 'park', name: 'Palmetto Park', x: rect.x + rect.w / 2, y: rect.y + rect.h - 8, building: null });
        continue;
      }
      if (kind === 'parking') {
        for (let sx = 0; sx < 3; sx += 1) {
          for (let sy = 0; sy < 3; sy += 1) {
            parkingSpots.push({
              x: rect.x + 44 + sx * 74,
              y: rect.y + 42 + sy * 74,
              angle: Math.PI / 2,
              taken: false,
            });
          }
        }
        continue;
      }
      if (kind === 'police' || kind === 'hospital' || kind === 'arena' || kind === 'bank' || kind === 'hotel') {
        const names = {
          police: 'Port Azura PD',
          hospital: 'St. Solana General',
          arena: 'Azura Dome',
          bank: 'Banco del Sol',
          hotel: 'Hotel Coralina',
        };
        const heights = { police: 30, hospital: 44, arena: 26, bank: 38, hotel: 78 };
        const building = addBuilding(
          { x: inner.x + 12, y: inner.y + 8, w: inner.w - 24, h: inner.h - 52 },
          { height: heights[kind], name: names[kind], kind },
        );
        addPlace(kind, names[kind], building, { x: rect.x + rect.w / 2, y: rect.y + rect.h - 12 });
        continue;
      }
      if (kind === 'safehouse' || kind === 'gunshop' || kind === 'spray') {
        const names = { safehouse: 'Marlowe Safehouse', gunshop: 'Harbor Arms', spray: 'Shine Auto Body' };
        const building = addBuilding(
          { x: inner.x + 30, y: inner.y + 16, w: inner.w - 60, h: inner.h - 74 },
          { height: kind === 'spray' ? 20 : 24, name: names[kind], kind },
        );
        addPlace(kind, names[kind], building, { x: rect.x + rect.w / 2, y: rect.y + rect.h - 12 });
        continue;
      }
      // Ordinary city and beachfront blocks: one, two or four buildings with alleys.
      const layout = random.pick([1, 2, 2, 4]);
      const gap = 14;
      const cells = [];
      if (layout === 1) cells.push(inner);
      if (layout === 2) {
        const hw = (inner.w - gap) / 2;
        cells.push({ x: inner.x, y: inner.y, w: hw, h: inner.h }, { x: inner.x + hw + gap, y: inner.y, w: hw, h: inner.h });
      }
      if (layout === 4) {
        const hw = (inner.w - gap) / 2;
        const hh = (inner.h - gap) / 2;
        cells.push(
          { x: inner.x, y: inner.y, w: hw, h: hh },
          { x: inner.x + hw + gap, y: inner.y, w: hw, h: hh },
          { x: inner.x, y: inner.y + hh + gap, w: hw, h: hh },
          { x: inner.x + hw + gap, y: inner.y + hh + gap, w: hw, h: hh },
        );
      }
      for (const cell of cells) {
        const named = random.chance(kind === 'beachfront' ? 0.55 : 0.34);
        addBuilding(cell, {
          height: kind === 'beachfront' ? random.range(30, 66) : random.range(16, 54),
          name: named ? random.pick(SHOP_NAMES) : null,
        });
      }
    }
  }

  // Street palms along the beachfront and scattered on grass verges.
  for (let i = 0; i < 46; i += 1) {
    const side = random.int(0, 3);
    const along = random.range(CITY.islandMargin, (side % 2 === 0 ? WORLD.width : WORLD.height) - CITY.islandMargin);
    const across = random.range(CITY.islandMargin - 66, CITY.islandMargin - 18);
    const spot = [
      { x: along, y: across },
      { x: along, y: WORLD.height - across },
      { x: across, y: along },
      { x: WORLD.width - across, y: along },
    ][side];
    palms.push({ x: spot.x, y: spot.y, s: random.range(0.85, 1.3) });
  }

  // The marina: three piers off the east beach, with moored boats between them.
  const islandEast = WORLD.width - CITY.islandMargin;
  for (let i = 0; i < 3; i += 1) {
    const y = roadCenterY(2 + i) - 13;
    docks.push({ x: islandEast - 30, y, w: 250, h: 26 });
    for (let b = 0; b < 3; b += 1) {
      boats.push({
        x: islandEast + 44 + b * 62,
        y: y + (b % 2 === 0 ? -34 : 44),
        angle: random.range(-0.2, 0.2),
        color: random.pick(['#f4f6f7', '#e74c3c', '#5dade2', '#f7dc6f']),
      });
    }
  }
  places.push({ id: 'marina', name: 'Azura Marina', x: islandEast - 44, y: roadCenterY(3), building: null });

  /** The named place with this id (police, hospital, safehouse, gunshop, spray, …). */
  function place(id) {
    return places.find((entry) => entry.id === id) ?? null;
  }

  /** Which surface a point stands on; buildings win over everything, then roads. */
  function surfaceAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD.width || y >= WORLD.height) return SURFACE.water;
    for (const dock of docks) {
      if (x >= dock.x && x < dock.x + dock.w && y >= dock.y && y < dock.y + dock.h) return SURFACE.dock;
    }
    const gx = x - CITY.gridX;
    const gy = y - CITY.gridY;
    const inGridX = gx >= 0 && gx < CITY.cols * CITY.pitch + CITY.road;
    const inGridY = gy >= 0 && gy < CITY.rows * CITY.pitch + CITY.road;
    if (inGridX && inGridY) {
      const lx = gx % CITY.pitch;
      const ly = gy % CITY.pitch;
      const col = Math.floor((x - CITY.gridX) / CITY.pitch);
      const row = Math.floor((y - CITY.gridY) / CITY.pitch);
      if (lx < CITY.road || ly < CITY.road) return SURFACE.road;
      if (col >= 0 && col < CITY.cols && row >= 0 && row < CITY.rows) {
        const kind = SPECIAL_BLOCKS[`${col},${row}`];
        if (kind === 'park') return SURFACE.grass;
        if (kind === 'parking') return SURFACE.parking;
        const bx = lx - CITY.road;
        const by = ly - CITY.road;
        if (bx < 17 || by < 17 || bx >= CITY.block - 17 || by >= CITY.block - 17) return SURFACE.sidewalk;
        return SURFACE.grass;
      }
      return SURFACE.road;
    }
    const onIsland = x >= CITY.islandMargin && x < WORLD.width - CITY.islandMargin
      && y >= CITY.islandMargin && y < WORLD.height - CITY.islandMargin;
    return onIsland ? SURFACE.sand : SURFACE.water;
  }

  /** True when the point is on a road (or close enough to count as the road network). */
  function onRoad(x, y) {
    return surfaceAt(x, y) === SURFACE.road;
  }

  return {
    buildings, colliders, places, palms, docks, boats, parkingSpots,
    place, surfaceAt, onRoad,
    palette: PALETTE,
  };
}

/** Does the circle at (x, y) with radius r overlap any solid rect? Returns the rect or null. */
export function circleHitsRects(x, y, r, rects) {
  for (const rect of rects) {
    const nearX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const nearY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dx = x - nearX;
    const dy = y - nearY;
    if (dx * dx + dy * dy < r * r) return rect;
  }
  return null;
}

/** Push a circle out of every rect it overlaps; mutates and returns the position object. */
export function pushCircleOutOfRects(pos, r, rects) {
  for (const rect of rects) {
    const nearX = Math.max(rect.x, Math.min(pos.x, rect.x + rect.w));
    const nearY = Math.max(rect.y, Math.min(pos.y, rect.y + rect.h));
    let dx = pos.x - nearX;
    let dy = pos.y - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= r * r) continue;
    if (distSq === 0) {
      // Centre inside the rect: leave by the shortest side.
      const left = pos.x - rect.x;
      const right = rect.x + rect.w - pos.x;
      const top = pos.y - rect.y;
      const bottom = rect.y + rect.h - pos.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = rect.x - r;
      else if (min === right) pos.x = rect.x + rect.w + r;
      else if (min === top) pos.y = rect.y - r;
      else pos.y = rect.y + rect.h + r;
      continue;
    }
    const dist = Math.sqrt(distSq);
    dx /= dist;
    dy /= dist;
    pos.x = nearX + dx * r;
    pos.y = nearY + dy * r;
  }
  return pos;
}
