// The story and the side work: five missions in order, each a small chain of
// objectives (go here, do that, go there), plus taxi fares and hidden packages.
// A mission is data (from config) plus live progress; this file owns both.
import { ECONOMY, MISSIONS, PLACES } from './config.js';
import { dist, pick, range } from './random.js';

export const MISSION_NONE = 'none';
export const MISSION_DONE = 'done';

/** Fresh mission progress: which mission is active and where it is in its chain. */
export function createMissions() {
  return {
    index: 0, // which MISSIONS entry is active (0..4), 5 when the story is done
    stage: 0, // objective inside the mission
    holdTimer: 0, // seconds left holding E on a hold objective
    collected: 0, // debtors collected in mission 3
    startedWanted: 0, // wanted when mission 4 began
    taxi: null, // active fare { px, py, dx, dy, reward } or null
    taxiTimer: 0,
    packagesFound: 0,
    packageSpots: [], // { x, y, found } — filled by the world at reset
  };
}

/** The active mission definition, or null when the story is finished. */
export function activeMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

/** Where the mission marker (yellow blip) should point right now, or null. */
export function missionTarget(missions, world) {
  const m = activeMission(missions);
  if (!m) return null;
  if (m.id === 'pickup') return missions.stage === 0 ? PLACES.docks : PLACES.garage;
  if (m.id === 'getaway') return missions.stage === 0 ? PLACES.plaza : PLACES.hideout;
  if (m.id === 'collect') {
    const debtors = world.debtors;
    for (const d of debtors) if (!d.paid) return { x: d.x, y: d.y, label: 'Debtor' };
    return PLACES.garage;
  }
  if (m.id === 'heat') return missions.stage === 0 ? null : PLACES.spray;
  if (m.id === 'bigone') return missions.stage === 0 ? PLACES.bank : PLACES.beachHouse;
  return null;
}

/** One line of objective text for the HUD. */
export function missionObjective(missions, world) {
  const m = activeMission(missions);
  if (!m) return 'Story complete — free roam. Find the 10 hidden packages.';
  if (m.id === 'pickup') return missions.stage === 0 ? 'Pick up the package at the East Docks' : 'Deliver it to the garage';
  if (m.id === 'getaway') return missions.stage === 0 ? 'Steal the yellow Veloce at the plaza' : 'Reach the hideout on Coral St';
  if (m.id === 'collect') return `Collect the debts (${missions.collected}/3)`;
  if (m.id === 'heat') {
    return missions.stage === 0
      ? `Raise your wanted level to 3 stars (${world.wanted}/3)`
      : 'Lose the heat — hide or get a respray';
  }
  if (m.id === 'bigone') return missions.stage === 0 ? 'Hold E at the bank to rob it' : 'Escape to the beach house with the loot';
  return m.brief;
}

/**
 * Advance the active mission by what the player just did. `event` is one of:
 * reached (arrived at the current target), stole (took the Veloce), paid (a debtor
 * paid up), robbed (bank hold finished), wanted (wanted level changed).
 * Returns the cash reward when a mission completes, else 0.
 */
export function missionEvent(missions, event, world) {
  const m = activeMission(missions);
  if (!m) return 0;
  if (m.id === 'pickup') {
    if (event === 'reached') {
      missions.stage = 1;
      return 0;
    }
    if (event === 'delivered') return completeMission(missions);
  }
  if (m.id === 'getaway') {
    if (event === 'stole') {
      missions.stage = 1;
      return 0;
    }
    if (event === 'reached') return completeMission(missions);
  }
  if (m.id === 'collect') {
    if (event === 'paid') {
      missions.collected += 1;
      if (missions.collected >= 3) return completeMission(missions);
    }
  }
  if (m.id === 'heat') {
    if (event === 'wanted' && missions.stage === 0 && world.wanted >= 3) missions.stage = 1;
    if (event === 'clean' && missions.stage === 1) return completeMission(missions);
  }
  if (m.id === 'bigone') {
    if (event === 'robbed') {
      missions.stage = 1;
      return 0;
    }
    if (event === 'reached') return completeMission(missions);
  }
  return 0;
}

function completeMission(missions) {
  const m = MISSIONS[missions.index];
  missions.index += 1;
  missions.stage = 0;
  missions.collected = 0;
  missions.holdTimer = 0;
  return m.reward;
}

/** Start a taxi fare: a pedestrian nearby wants a ride to a random road point. */
export function startTaxi(missions, random, fromX, fromY) {
  const dest = { x: pick(random, [200, 700, 1200, 1700, 2200, 2700]), y: pick(random, [200, 600, 1000, 1400, 1800, 2200]) };
  const reward = Math.round(range(random, ECONOMY.taxiFareMin, ECONOMY.taxiFareMax) / 10) * 10;
  missions.taxi = { px: fromX, py: fromY, dx: dest.x, dy: dest.y, reward, pickedUp: false };
  missions.taxiTimer = 0;
  return missions.taxi;
}

/** The fare's current target (pickup, then destination), or null. */
export function taxiTarget(missions) {
  if (!missions.taxi) return null;
  return missions.taxi.pickedUp
    ? { x: missions.taxi.dx, y: missions.taxi.dy, label: 'Fare' }
    : { x: missions.taxi.px, y: missions.taxi.py, label: 'Passenger' };
}

/** Scatter the hidden packages around the city (seeded, fixed spots per reset). */
export function scatterPackages(random) {
  const spots = [];
  const xs = [200, 700, 1200, 1700, 2200, 2700];
  const ys = [200, 600, 1000, 1400, 1800, 2200];
  const used = new Set();
  while (spots.length < ECONOMY.packages) {
    const x = pick(random, xs) + range(random, -160, 160);
    const y = pick(random, ys) + range(random, -160, 160);
    const key = `${Math.round(x / 100)}:${Math.round(y / 100)}`;
    if (used.has(key)) continue;
    used.add(key);
    spots.push({ x, y, found: false });
  }
  return spots;
}

/** The nearest unfound package within range, for the pickup prompt. */
export function nearPackage(missions, x, y, range_) {
  for (const p of missions.packageSpots) {
    if (!p.found && dist(x, y, p.x, p.y) < range_) return p;
  }
  return null;
}

/** How far the player is from finishing the story (0..1), for the progress bar. */
export function storyProgress(missions) {
  return missions.index / MISSIONS.length;
}
