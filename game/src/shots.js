// The screenshot scenes behind ?shot=chase|street|heist|beach. Each one sets up
// a real situation (a chase, a street walk, a heist escape, a beach drive) and
// then plays the real rules forward for a fixed number of steps, steered by a
// simple autopilot that follows road waypoints, so the frame is what a short
// game really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';
import { dist, wrapAngle } from './random.js';

const SAMPLE = STEP;

/** Drive input that steers the player's car toward (tx, ty). */
function driveToward(world, tx, ty) {
  const p = world.state.player;
  const car = p.inCar;
  const input = { up: true, down: false, left: false, right: false, run: false, handbrake: false, interact: false, interactHeld: false, punch: false, shoot: false, honk: false, aimX: tx, aimY: ty };
  if (!car) return input;
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(want - car.angle);
  if (diff > 0.08) input.left = true;
  else if (diff < -0.08) input.right = true;
  // Brake if a building is right ahead.
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  if (hitsAhead(world, aheadX, aheadY)) {
    input.up = false;
    input.down = true;
  }
  return input;
}

function hitsAhead(world, x, y) {
  // A cheap building test at a point ahead of the car.
  for (const b of world.city.buildings) {
    if (x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10) return true;
  }
  return false;
}

/** Walk input that moves the player on foot toward (tx, ty). */
function walkToward(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  return {
    up: dy < -20, down: dy > 20, left: dx < -20, right: dx > 20,
    run: false, handbrake: false, interact: false, interactHeld: false,
    punch: false, shoot: false, honk: false, aimX: tx, aimY: ty,
  };
}

/** Step the sim for `seconds`, steering with `pilot` (a function of the world). */
function playFor(world, seconds, pilot) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    world.step(SAMPLE, pilot(world));
  }
}

/** Put the player in a car (as if they had just taken it). */
function putInCar(world, car) {
  const p = world.state.player;
  car.kind = 'player';
  car.speed = 0;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any unknown name is the chase (the cover).
 */
export function stageShot(name, world) {
  world.reset();
  const st = world.state;
  const missions = world.missions;

  if (name === 'street') {
    // On foot in the market street: traffic, pedestrians, one star.
    st.player.x = 700;
    st.player.y = 1000;
    st.player.angle = 0;
    st.wanted = 1;
    st.lastCrime = 0;
    world.spawnCopCar(700, 760, Math.PI / 2);
    playFor(world, 3.5, (w) => walkToward(w, 1150, 1000));
    return { screen: SCREEN_PLAY };
  }

  if (name === 'heist') {
    // The Big One, mid-escape: four stars, the loot, cops on the tail.
    // The escape route follows roads only (intersections), never across blocks.
    missions.index = 4;
    missions.stage = 1;
    st.wanted = 4;
    st.lastCrime = 0;
    const car = world.spawnParkedCar('coupe', 1700, 1120, -Math.PI / 2);
    putInCar(world, car);
    world.spawnCopCar(1700, 820, Math.PI / 2);
    world.spawnCopCar(1500, 1000, 0);
    world.spawnCopCar(1900, 1000, Math.PI);
    const route = [
      [1700, 1000], [1200, 1000], [1200, 1400], [700, 1400], [700, 1800],
    ];
    let leg = 0;
    playFor(world, 4.5, (w) => {
      const p = w.state.player;
      while (leg < route.length && dist(p.x, p.y, route[leg][0], route[leg][1]) < 90) leg += 1;
      const target = route[Math.min(leg, route.length - 1)];
      return driveToward(w, target[0], target[1]);
    });
    return { screen: SCREEN_PLAY };
  }

  if (name === 'beach') {
    // A cruise down the beach road (the 2200 street): palms, water, one cop in the mirror.
    st.wanted = 1;
    st.lastCrime = 0;
    const car = world.spawnParkedCar('sports', 400, 2200, 0);
    putInCar(world, car);
    world.spawnCopCar(220, 2200, 0);
    playFor(world, 4.0, (w) => driveToward(w, 2800, 2200));
    return { screen: SCREEN_PLAY };
  }

  // chase (the cover): the getaway, three stars, downtown, cops behind.
  missions.index = 1;
  missions.stage = 1;
  st.wanted = 3;
  st.lastCrime = 0;
  const veloce = st.veloce;
  veloce.x = 1700;
  veloce.y = 420;
  veloce.angle = Math.PI / 2;
  putInCar(world, veloce);
  world.spawnCopCar(1700, 240, Math.PI / 2);
  world.spawnCopCar(1560, 300, Math.PI / 2);
  const route = [
    [1700, 600], [1700, 1000], [1200, 1000], [1200, 1400], [1700, 1400], [1700, 1800],
  ];
  let leg = 0;
  playFor(world, 4.5, (w) => {
    const p = w.state.player;
    while (leg < route.length && dist(p.x, p.y, route[leg][0], route[leg][1]) < 90) leg += 1;
    const target = route[Math.min(leg, route.length - 1)];
    return driveToward(w, target[0], target[1]);
  });
  return { screen: SCREEN_PLAY };
}
