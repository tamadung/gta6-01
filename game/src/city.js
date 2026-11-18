// The city of Solmara, built once from the seed: its roads, blocks, buildings,
// parks, beach and docks, plus the queries the sim and the renderer ask of it
// (is this point on a road, where is the nearest road, what blocks a car).
// Nothing here moves; the world is the thing that changes.
import { AVENUES, BEACH, DOCKS, PAL, ROAD_W, SIDEWALK_W, STREETS, WORLD } from './config.js';
import { int, pick, range } from './random.js';

const ROOFS = [PAL.roofA, PAL.roofB, PAL.roofC, PAL.roofD, PAL.roofE];

/** True when the point is on asphalt (a road), not a sidewalk or a block. */
export function onRoad(x, y) {
  const half = ROAD_W / 2;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
  return false;
}

/** True when the point is on a sidewalk (just outside a road, inside a block edge). */
export function onSidewalk(x, y) {
  const half = ROAD_W / 2 + SIDEWALK_W;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half && Math.abs(x - ax) > ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half && Math.abs(y - sy) > ROAD_W / 2) return true;
  return false;
}

/** The nearest avenue or street centre line to a point (for lane driving). */
export function nearestRoadAxis(x, y) {
  let best = { axis: 'v', line: AVENUES[0], d: Math.abs(x - AVENUES[0]) };
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < best.d) best = { axis: 'v', line: ax, d };
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < best.d) best = { axis: 'h', line: sy, d };
  }
  return best;
}

/** A random point on a road, biased toward the city centre, for traffic spawns. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const ax = pick(random, AVENUES);
    const sy = pick(random, STREETS);
    return { x: ax + range(random, -ROAD_W / 2 + 12, ROAD_W / 2 - 12), y: sy };
  }
  const ax = pick(random, AVENUES);
  const sy = pick(random, STREETS);
  return { x: ax, y: sy + range(random, -ROAD_W / 2 + 12, ROAD_W / 2 - 12) };
}

/** A random point on a sidewalk near a road, for pedestrian spawns. */
export function randomSidewalkPoint(random) {
  const ax = pick(random, AVENUES);
  const sy = pick(random, STREETS);
  const side = random() < 0.5 ? 1 : -1;
  if (random() < 0.5) return { x: ax + side * (ROAD_W / 2 + SIDEWALK_W / 2), y: range(random, 80, WORLD.height - 160) };
  return { x: range(random, 80, WORLD.width - 160), y: sy + side * (ROAD_W / 2 + SIDEWALK_W / 2) };
}

/**
 * Build the city: buildings per block (a few per block, skipped where a park,
 * the plaza or the docks sit), trees, and the named districts. Downtown blocks
 * (around 1200-2200, 600-1400) get taller buildings.
 */
export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  // The plaza is a paved square at the crossing of 1200 / 1000.
  const plaza = { x: 1200, y: 1000, w: 260, h: 220 };
  // A park with trees at 2200 / 600.
  parks.push({ x: 2200, y: 600, w: 300, h: 240 });

  const half = ROAD_W / 2 + SIDEWALK_W;
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const x0 = AVENUES[ai] + half;
      const x1 = AVENUES[ai + 1] - half;
      const y0 = STREETS[si] + half;
      const y1 = STREETS[si + 1] - half;
      // Skip the block the plaza occupies and the park block.
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (Math.abs(cx - plaza.x) < 200 && Math.abs(cy - plaza.y) < 180) continue;
      if (Math.abs(cx - 2200) < 200 && Math.abs(cy - 600) < 180) continue;
      // Skip blocks east of the docks line (warehouses are drawn separately).
      if (x0 > DOCKS.x - 40) continue;
      // Skip the beach strip.
      if (y0 > BEACH.y - 40) continue;
      const downtown = cx > 1100 && cx < 2300 && cy > 500 && cy < 1500;
      const count = downtown ? int(random, 2, 3) : int(random, 1, 3);
      for (let b = 0; b < count; b += 1) {
        const bw = range(random, 90, Math.min(200, (x1 - x0) * 0.55));
        const bh = range(random, 80, Math.min(170, (y1 - y0) * 0.55));
        const bx = range(random, x0 + 14, x1 - 14 - bw);
        const by = range(random, y0 + 14, y1 - 14 - bh);
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof: pick(random, ROOFS),
          tall: downtown ? range(random, 14, 30) : range(random, 6, 14),
        });
      }
      // A couple of street trees per block edge.
      for (let t = 0; t < 3; t += 1) {
        trees.push({
          x: range(random, x0 + 10, x1 - 10),
          y: random() < 0.5 ? y0 + 8 : y1 - 8,
          r: range(random, 9, 15),
        });
      }
    }
  }
  // Park trees.
  for (let t = 0; t < 14; t += 1) {
    trees.push({ x: range(random, 2080, 2320), y: range(random, 500, 700), r: range(random, 10, 18) });
  }
  // Palm trees along the beach road.
  for (let x = 160; x < WORLD.width - 120; x += 130) {
    trees.push({ x: x + range(random, -20, 20), y: BEACH.y - 30, r: range(random, 11, 15), palm: true });
  }
  // Warehouse sheds on the docks.
  const sheds = [];
  for (let y = 300; y < 2000; y += 320) {
    sheds.push({ x: 2960, y, w: 190, h: 150, roof: PAL.roofD, tall: 10 });
  }
  return { buildings, trees, parks, plaza, sheds };
}

/** True when a circle (x, y, r) overlaps any building or shed. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  for (const s of city.sheds) {
    if (x + r > s.x && x - r < s.x + s.w && y + r > s.y && y - r < s.y + s.h) return true;
  }
  return false;
}

/** Push a circle out of buildings (simple axis-separated resolve, returns the fixed point). */
export function resolveBuildings(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings.concat(city.sheds)) {
    if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
      const pushLeft = nx + r - b.x;
      const pushRight = b.x + b.w - (nx - r);
      const pushUp = ny + r - b.y;
      const pushDown = b.y + b.h - (ny - r);
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) nx = b.x - r;
      else if (min === pushRight) nx = b.x + b.w + r;
      else if (min === pushUp) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return { x: nx, y: ny };
}

/** Clamp a point inside the world (the beach water is the south wall, the docks the east). */
export function clampWorld(x, y, r) {
  return {
    x: Math.max(r, Math.min(WORLD.width - r, x)),
    y: Math.max(r, Math.min(WORLD.height - r, y)),
  };
}
