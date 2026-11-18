// The game's rules and state, with no drawing and no browser in it: the player
// on foot or in a car, traffic and police cars, pedestrians, bullets, pickups,
// the wanted level, the missions and the cash. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react (sound,
// screens) without the world knowing about them. Nothing here allocates after
// createWorld returns, except the short-lived effects list.
import {
  AVENUES, BEACH, CAR_MODELS, COMBAT, DOCKS, ECONOMY, MISSIONS, PAL, PLACES,
  PLAYER, ROAD_W, STREETS, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { buildCity, clampWorld, hitsBuilding, onRoad, randomRoadPoint, randomSidewalkPoint, resolveBuildings } from './city.js';
import { clamp, dist, int, pick, range, shuffled, wrapAngle } from './random.js';
import { activeMission, createMissions, missionEvent, missionTarget, nearPackage, scatterPackages, startTaxi, taxiTarget } from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_COP_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_WANTED_UP = 16;
export const EVENT_WANTED_DOWN = 32;
export const EVENT_MISSION = 64;
export const EVENT_BUSTED = 128;
export const EVENT_WASTED = 256;
export const EVENT_STEAL = 512;
export const EVENT_HONK = 1024;
export const EVENT_ROB = 2048;

const PED_COLORS = ['#e8a0b0', '#a0c8e8', '#e8d0a0', '#b0e8a0', '#d0a0e8', '#e8e8e8', '#c0a080'];
const TRAFFIC_MODELS = ['sedan', 'sedan', 'taxi', 'coupe', 'truck', 'van', 'sedan', 'taxi'];

function makeCar(model, x, y, angle, kind) {
  const spec = CAR_MODELS[model];
  return {
    model, kind, x, y, angle, speed: 0,
    top: spec.top, accel: spec.accel, turn: spec.turn,
    len: spec.len, wid: spec.wid, color: spec.color,
    // Traffic AI state: which road it follows and where it is headed.
    axis: 'v', line: x, dir: 1, targetX: x, targetY: y,
    brake: 0, siren: 0, active: true,
  };
}

function makePed(random, x, y) {
  return {
    x, y, angle: range(random, 0, Math.PI * 2), speed: range(random, 40, 70),
    state: 'walk', // walk | flee | down | fare | debtor
    targetX: x, targetY: y, downTimer: 0, fare: false, debtor: false, paid: false,
    color: pick(random, PED_COLORS), phase: range(random, 0, Math.PI * 2),
  };
}

export function createWorld(random) {
  const city = buildCity(random);
  const missions = createMissions();
  const state = {
    time: 0,
    cash: ECONOMY.startCash,
    wanted: 0,
    wantedTimer: 0,
    lastCrime: -999,
    bustTimer: 0,
    busted: false,
    wasted: false,
    player: null,
    cars: [],
    peds: [],
    cops: [], // foot police
    bullets: [],
    pickups: [],
    effects: [],
    debtors: [],
    veloce: null, // the parked yellow sports car for mission 2
    camera: { x: 0, y: 0, zoom: 1, shake: 0 },
    prompt: '', // current context prompt for the HUD
    toast: '', toastTimer: 0,
    sirenTimer: 0,
    trafficTimer: 0,
    spawnDebtors: true,
    city, // the static map, so every step helper can reach it
  };

  function addEffect(x, y, kind, n) {
    for (let i = 0; i < (n || 1); i += 1) {
      state.effects.push({ x: x + range(random, -8, 8), y: y + range(random, -8, 8), kind, t: 0, life: range(random, 0.25, 0.6), vx: range(random, -60, 60), vy: range(random, -60, 60) });
    }
    if (state.effects.length > 220) state.effects.splice(0, state.effects.length - 220);
  }

  function addWanted(n) {
    if (state.wanted >= WANTED.max) return;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.lastCrime = state.time;
    state.wantedTimer = 0;
  }

  function reset() {
    state.time = 0;
    state.cash = ECONOMY.startCash;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.lastCrime = -999;
    state.bustTimer = 0;
    state.busted = false;
    state.wasted = false;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.bullets = [];
    state.effects = [];
    state.pickups = [];
    state.debtors = [];
    state.toast = '';
    state.toastTimer = 0;
    missions.index = 0;
    missions.stage = 0;
    missions.collected = 0;
    missions.holdTimer = 0;
    missions.taxi = null;
    missions.packagesFound = 0;
    missions.packageSpots = scatterPackages(random);
    // The player starts on foot by the garage.
    state.player = {
      x: PLACES.garage.x + 40, y: PLACES.garage.y + 40, angle: -Math.PI / 2,
      vx: 0, vy: 0, health: PLAYER.health, armor: 0, ammo: COMBAT.pistolAmmo,
      inCar: null, fireTimer: 0, punchTimer: 0, invuln: 0,
    };
    // Parked cars, including the yellow Veloce for mission 2.
    const parked = [
      { model: 'sedan', x: 660, y: 560, angle: 0 },
      { model: 'coupe', x: 1240, y: 960, angle: Math.PI / 2 },
      { model: 'van', x: 1740, y: 1360, angle: Math.PI },
      { model: 'sedan', x: 2240, y: 1760, angle: -Math.PI / 2 },
      { model: 'taxi', x: 740, y: 1040, angle: 0 },
    ];
    for (const p of parked) {
      const car = makeCar(p.model, p.x, p.y, p.angle, 'parked');
      car.axis = 'v';
      state.cars.push(car);
    }
    state.veloce = makeCar('sports', PLACES.plaza.x + 60, PLACES.plaza.y + 30, Math.PI / 2, 'parked');
    state.cars.push(state.veloce);
    // Ambient traffic.
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const pt = randomRoadPoint(random);
      const car = makeCar(pick(random, TRAFFIC_MODELS), pt.x, pt.y, range(random, 0, Math.PI * 2), 'traffic');
      car.axis = random() < 0.5 ? 'v' : 'h';
      car.line = car.axis === 'v' ? pt.x : pt.y;
      car.dir = random() < 0.5 ? 1 : -1;
      car.speed = range(random, 120, 220);
      state.cars.push(car);
    }
    // Ambient pedestrians on sidewalks.
    for (let i = 0; i < TRAFFIC.pedCount; i += 1) {
      const pt = randomSidewalkPoint(random);
      const ped = makePed(random, pt.x, pt.y);
      ped.targetX = pt.x + range(random, -200, 200);
      ped.targetY = pt.y + range(random, -200, 200);
      state.peds.push(ped);
    }
    // Three debtors stand at fixed spots for mission 3.
    const debtorSpots = [
      { x: 700, y: 1400 }, { x: 2200, y: 600 }, { x: 1200, y: 1800 },
    ];
    for (const s of debtorSpots) {
      const d = makePed(random, s.x, s.y);
      d.state = 'debtor';
      d.debtor = true;
      state.debtors.push(d);
      state.peds.push(d);
    }
    // A couple of fare pedestrians (waving) near the market and the plaza.
    for (const s of [{ x: 740, y: 1000 }, { x: 1240, y: 1040 }]) {
      const f = makePed(random, s.x, s.y);
      f.state = 'fare';
      f.fare = true;
      state.peds.push(f);
    }
    // Health and ammo pickups at fixed spots (they respawn).
    state.pickups = [
      { x: PLACES.gunshop.x + 60, y: PLACES.gunshop.y, kind: 'ammo', timer: 0, active: true },
      { x: PLACES.market.x - 60, y: PLACES.market.y + 40, kind: 'health', timer: 0, active: true },
      { x: PLACES.docks.x - 80, y: PLACES.docks.y + 60, kind: 'ammo', timer: 0, active: true },
      { x: PLACES.beachHouse.x + 80, y: PLACES.beachHouse.y - 40, kind: 'health', timer: 0, active: true },
    ];
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.camera.zoom = 1;
    state.camera.shake = 0;
  }

  // --- helpers ---------------------------------------------------------------
  function carRadius(car) { return Math.max(car.len, car.wid) * 0.5; }

  function nearestCar(x, y, maxDist, kinds) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestPed(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const d = dist(x, y, ped.x, ped.y);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function setToast(text) {
    state.toast = text;
    state.toastTimer = 3.2;
  }

  function missionReward(cash) {
    if (cash > 0) {
      state.cash += cash;
      setToast(`Mission complete — $${cash}`);
    }
  }

  // --- player ----------------------------------------------------------------
  function stepPlayer(dt, input) {
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.fireTimer > 0) p.fireTimer -= dt;
    if (p.punchTimer > 0) p.punchTimer -= dt;
    state.prompt = '';
    if (p.inCar) {
      stepDriving(dt, input);
      return;
    }
    // On foot: 8-way movement, run with Shift.
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.vx = mx * speed;
      p.vy = my * speed;
      p.angle = Math.atan2(my, mx);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const fixed = resolveBuildings(state.city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    const cw = clampWorld(p.x, p.y, PLAYER.radius);
    p.x = cw.x;
    p.y = cw.y;
    // Interact (E): enter a nearby car, or use a mission/shop prompt.
    if (input.interact) {
      const car = nearestCar(p.x, p.y, 56, ['parked', 'traffic']);
      if (car) {
        enterCar(car);
        return;
      }
      const debtor = state.debtors.find((d) => !d.paid && dist(p.x, p.y, d.x, d.y) < 48);
      if (debtor && activeMission(missions) && activeMission(missions).id === 'collect') {
        debtor.paid = true;
        debtor.state = 'walk';
        state.cash += 150;
        const reward = missionEvent(missions, 'paid', state);
        missionReward(reward);
        setToast('Debt collected — $150');
        return;
      }
      const fare = state.peds.find((pd) => pd.fare && pd.state === 'fare' && dist(p.x, p.y, pd.x, pd.y) < 48);
      if (fare && !missions.taxi) {
        startTaxi(missions, random, fare.x, fare.y);
        fare.state = 'walk';
        fare.fare = false;
        setToast('Fare picked up — drive to the marker');
        return;
      }
    }
    // Punch (F): melee in the facing direction.
    if (input.punch && p.punchTimer <= 0) {
      p.punchTimer = 0.35;
      const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
      const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
      let hit = false;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(px, py, ped.x, ped.y) < 26) {
          ped.state = 'down';
          ped.downTimer = 3;
          addEffect(ped.x, ped.y, 'hit', 3);
          hit = true;
        }
      }
      for (const cop of state.cops) {
        if (dist(px, py, cop.x, cop.y) < 26) {
          cop.health -= PLAYER.punchDamage;
          addEffect(cop.x, cop.y, 'hit', 3);
          hit = true;
        }
      }
      if (hit) addWanted(1); // beating someone up in public is a crime
    }
    // Shoot (mouse click): pistol toward the aim point.
    if (input.shoot && p.fireTimer <= 0 && p.ammo > 0) {
      p.fireTimer = COMBAT.pistolFireRate;
      p.ammo -= 1;
      const ang = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      p.angle = ang;
      state.bullets.push({
        x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * COMBAT.bulletSpeed, vy: Math.sin(ang) * COMBAT.bulletSpeed,
        from: 'player', damage: COMBAT.pistolDamage, life: 0.6,
      });
      addEffect(p.x + Math.cos(ang) * 22, p.y + Math.sin(ang) * 22, 'muzzle', 2);
      state.events |= EVENT_SHOT;
      // A gunshot in public is a crime.
      addWanted(1);
      // Peds nearby flee.
      for (const ped of state.peds) {
        if (ped.state !== 'down' && dist(p.x, p.y, ped.x, ped.y) < 420) ped.state = 'flee';
      }
    }
    // Pickups (walk over).
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.active = false;
        pk.timer = 30;
        if (pk.kind === 'health') {
          p.health = Math.min(PLAYER.health, p.health + 50);
          setToast('Health +50');
        } else {
          p.ammo += COMBAT.pistolAmmo;
          setToast(`Ammo +${COMBAT.pistolAmmo}`);
        }
        state.events |= EVENT_PICKUP;
      }
    }
    // Hidden packages.
    const pkg = nearPackage(missions, p.x, p.y, 34);
    if (pkg) {
      pkg.found = true;
      missions.packagesFound += 1;
      state.cash += ECONOMY.packageValue;
      setToast(`Hidden package — $${ECONOMY.packageValue} (${missions.packagesFound}/${ECONOMY.packages})`);
      state.events |= EVENT_PICKUP;
    }
    // Mission: hold-to-rob at the bank.
    const m = activeMission(missions);
    if (m && m.id === 'bigone' && missions.stage === 0 && dist(p.x, p.y, PLACES.bank.x, PLACES.bank.y) < 70) {
      state.prompt = 'Hold E to rob the bank';
      if (input.interactHeld) {
        missions.holdTimer += dt;
        if (missions.holdTimer >= 5) {
          missions.holdTimer = 0;
          missionEvent(missions, 'robbed', state);
          addWanted(4);
          state.events |= EVENT_ROB;
          setToast('Bank robbed — run to the beach house!');
        }
      } else {
        missions.holdTimer = 0;
      }
    }
    // Mission targets (arrive).
    checkMissionArrive();
    // Context prompt: nearest car to enter.
    if (!state.prompt) {
      const car = nearestCar(p.x, p.y, 56, ['parked', 'traffic']);
      if (car) state.prompt = car.kind === 'parked' ? 'E — take the car' : 'E — steal the car';
    }
  }

  function enterCar(car) {
    const p = state.player;
    p.inCar = car;
    car.kind = 'player';
    car.speed = 0;
    if (car === state.veloce && activeMission(missions) && activeMission(missions).id === 'getaway' && missions.stage === 0) {
      missionEvent(missions, 'stole', state);
      addWanted(2);
      setToast('You stole the Veloce — lose the cops at the hideout');
      state.events |= EVENT_STEAL;
    } else if (car.kind === 'player' && state.wanted < 2) {
      // Taking any car in public is a crime (unless the heat is already on).
      addWanted(1);
      state.events |= EVENT_STEAL;
    }
  }

  function exitCar() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    // Step out to the side of the car.
    const side = { x: car.x - Math.sin(car.angle) * 34, y: car.y + Math.cos(car.angle) * 34 };
    const fixed = resolveBuildings(state.city, side.x, side.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.inCar = null;
    p.vx = 0;
    p.vy = 0;
  }

  function stepDriving(dt, input) {
    const p = state.player;
    const car = p.inCar;
    const spec = CAR_MODELS[car.model];
    // Steering: A/D turn, scaled by speed so a stopped car cannot spin.
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const speedFactor = clamp(Math.abs(car.speed) / 120, 0, 1);
    car.angle += steer * spec.turn * speedFactor * dt * (car.speed < 0 ? -1 : 1);
    // Throttle / brake / reverse.
    if (input.up) car.speed += spec.accel * dt;
    else if (input.down) car.speed -= spec.accel * 0.9 * dt;
    else car.speed -= car.speed * 1.4 * dt; // coast drag
    if (input.handbrake) car.speed -= car.speed * 4 * dt;
    car.speed = clamp(car.speed, -spec.top * 0.45, spec.top);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Buildings stop a car (with a crash event and a bounce).
    const r = carRadius(car) * 0.8;
    if (hitsBuilding(state.city, nx, ny, r)) {
      if (Math.abs(car.speed) > 240) {
        addEffect(car.x, car.y, 'crash', 6);
        state.camera.shake = 0.5;
        state.events |= EVENT_CRASH;
        // A hard crash hurts the player a little.
        p.health -= 4;
        if (p.health <= 0) { state.wasted = true; state.events |= EVENT_WASTED; }
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    const cw = clampWorld(car.x, car.y, r);
    car.x = cw.x;
    car.y = cw.y;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Drive-by shooting (mouse click).
    if (input.shoot && p.fireTimer <= 0 && p.ammo > 0) {
      p.fireTimer = COMBAT.pistolFireRate;
      p.ammo -= 1;
      const ang = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      state.bullets.push({
        x: p.x + Math.cos(ang) * 24, y: p.y + Math.sin(ang) * 24,
        vx: Math.cos(ang) * COMBAT.bulletSpeed, vy: Math.sin(ang) * COMBAT.bulletSpeed,
        from: 'player', damage: COMBAT.pistolDamage, life: 0.6,
      });
      addEffect(p.x + Math.cos(ang) * 26, p.y + Math.sin(ang) * 26, 'muzzle', 2);
      state.events |= EVENT_SHOT;
      addWanted(1);
    }
    if (input.honk) state.events |= EVENT_HONK;
    if (input.interact) exitCar();
    // Hitting pedestrians while driving.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
        ped.state = 'down';
        ped.downTimer = 4;
        addEffect(ped.x, ped.y, 'hit', 4);
        addWanted(1);
        state.events |= EVENT_CRASH;
        state.camera.shake = 0.4;
      }
    }
    // Respray shop: drive in and press E.
    if (dist(car.x, car.y, PLACES.spray.x, PLACES.spray.y) < 70) {
      state.prompt = `E — respray $${ECONOMY.resprayCost} (lose wanted)`;
      if (input.interact && state.cash >= ECONOMY.resprayCost && state.wanted > 0) {
        state.cash -= ECONOMY.resprayCost;
        state.wanted = 0;
        state.wantedTimer = 0;
        setToast('Respray — you are clean');
        state.events |= EVENT_WANTED_DOWN;
        if (activeMission(missions) && activeMission(missions).id === 'heat' && missions.stage === 1) {
          const reward = missionEvent(missions, 'clean', state);
          missionReward(reward);
        }
      }
    }
    // Taxi fare: drive to the passenger, then to the destination.
    if (missions.taxi) {
      const t = taxiTarget(missions);
      if (t && dist(car.x, car.y, t.x, t.y) < 70) {
        if (!missions.taxi.pickedUp) {
          missions.taxi.pickedUp = true;
          setToast('Passenger aboard — drive to the marker');
        } else {
          state.cash += missions.taxi.reward;
          setToast(`Fare complete — $${missions.taxi.reward}`);
          state.events |= EVENT_PICKUP;
          missions.taxi = null;
        }
      }
    }
    checkMissionArrive();
  }

  function checkMissionArrive() {
    const p = state.player;
    const target = missionTarget(missions, state);
    if (!target) return;
    const m = activeMission(missions);
    if (!m) return;
    const d = dist(p.x, p.y, target.x, target.y);
    const radius = m.id === 'collect' ? 48 : 80;
    if (d < radius) {
      if (m.id === 'pickup' && missions.stage === 0) {
        missionEvent(missions, 'reached', state);
        setToast('Package picked up — back to the garage');
        state.events |= EVENT_MISSION;
      } else if (m.id === 'pickup' && missions.stage === 1) {
        const reward = missionEvent(missions, 'delivered', state);
        missionReward(reward);
        state.events |= EVENT_MISSION;
      } else if (m.id === 'getaway' && missions.stage === 1) {
        const reward = missionEvent(missions, 'reached', state);
        missionReward(reward);
        state.events |= EVENT_MISSION;
      } else if (m.id === 'bigone' && missions.stage === 1) {
        const reward = missionEvent(missions, 'reached', state);
        missionReward(reward);
        state.events |= EVENT_MISSION;
      }
    }
  }

  // --- traffic -----------------------------------------------------------------
  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      // Brake when a car is directly ahead.
      let ahead = false;
      for (const other of state.cars) {
        if (other === car || !other.active) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (forward > 0 && forward < 90 && side < 30) { ahead = true; break; }
      }
      // And when a pedestrian is in the road ahead.
      if (!ahead) {
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          const dx = ped.x - car.x;
          const dy = ped.y - car.y;
          const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
          const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
          if (forward > 0 && forward < 60 && side < 24) { ahead = true; break; }
        }
      }
      const target = ahead ? 0 : 200;
      car.speed += clamp(target - car.speed, -260 * dt, 200 * dt);
      // Steer along its road: keep to the lane, turn at the end or at random.
      const onV = Math.abs(car.x - car.line) < ROAD_W / 2 && car.axis === 'v';
      const onH = Math.abs(car.y - car.line) < ROAD_W / 2 && car.axis === 'h';
      if (car.axis === 'v' && onV) {
        const want = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 3 * dt);
        car.x += (car.line - car.x) * Math.min(1, 2 * dt);
        if ((car.dir > 0 && car.y > STREETS[STREETS.length - 1]) || (car.dir < 0 && car.y < STREETS[0])) {
          // Reached the end: turn onto a street.
          car.axis = 'h';
          car.line = car.y;
          car.dir = random() < 0.5 ? 1 : -1;
        } else if (random() < 0.002) {
          // Occasionally turn at an intersection.
          const near = STREETS.find((s) => Math.abs(car.y - s) < 60);
          if (near !== undefined) {
            car.axis = 'h';
            car.line = near;
            car.dir = random() < 0.5 ? 1 : -1;
          }
        }
      } else if (car.axis === 'h' && onH) {
        const want = car.dir > 0 ? 0 : Math.PI;
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 3 * dt);
        car.y += (car.line - car.y) * Math.min(1, 2 * dt);
        if ((car.dir > 0 && car.x > AVENUES[AVENUES.length - 1]) || (car.dir < 0 && car.x < AVENUES[0])) {
          car.axis = 'v';
          car.line = car.x;
          car.dir = random() < 0.5 ? 1 : -1;
        } else if (random() < 0.002) {
          const near = AVENUES.find((a) => Math.abs(car.x - a) < 60);
          if (near !== undefined) {
            car.axis = 'v';
            car.line = near;
            car.dir = random() < 0.5 ? 1 : -1;
          }
        }
      } else {
        // Off its lane (pushed): steer back toward it.
        const want = Math.atan2(car.axis === 'v' ? car.dir : 0, car.axis === 'v' ? 0 : car.dir);
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 2 * dt);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveBuildings(state.city, car.x, car.y, carRadius(car) * 0.75);
      car.x = fixed.x;
      car.y = fixed.y;
      const cw = clampWorld(car.x, car.y, carRadius(car));
      car.x = cw.x;
      car.y = cw.y;
    }
    // Respawn traffic that got too far from the player.
    state.trafficTimer += dt;
    if (state.trafficTimer > TRAFFIC.spawnGap) {
      state.trafficTimer = 0;
      const traffic = state.cars.filter((c) => c.kind === 'traffic');
      if (traffic.length < TRAFFIC.count) {
        const pt = randomRoadPoint(random);
        const car = makeCar(pick(random, TRAFFIC_MODELS), pt.x, pt.y, range(random, 0, Math.PI * 2), 'traffic');
        car.axis = random() < 0.5 ? 'v' : 'h';
        car.line = car.axis === 'v' ? pt.x : pt.y;
        car.dir = random() < 0.5 ? 1 : -1;
        car.speed = range(random, 120, 220);
        state.cars.push(car);
      }
    }
  }

  // --- police ------------------------------------------------------------------
  function stepPolice(dt) {
    const p = state.player;
    const wantCars = WANTED.copsPerStar[state.wanted];
    const wantFoot = WANTED.footPerStar[state.wanted];
    // Spawn cop cars until the wanted level's quota is met.
    const copCars = state.cars.filter((c) => c.kind === 'cop');
    if (copCars.length < wantCars) {
      const pt = randomRoadPoint(random);
      const car = makeCar('cop', pt.x, pt.y, range(random, 0, Math.PI * 2), 'cop');
      car.axis = 'v';
      car.line = pt.x;
      car.dir = 1;
      state.cars.push(car);
    }
    // Remove cop cars when the heat is off.
    if (state.wanted === 0) {
      state.cars = state.cars.filter((c) => c.kind !== 'cop');
      state.cops = [];
    }
    // Cop cars chase: drive along roads toward the intersection nearest the player.
    for (const car of state.cars) {
      if (car.kind !== 'cop') continue;
      car.siren = (car.siren + dt) % 1;
      const tx = AVENUES.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
      const ty = STREETS.reduce((a, b) => (Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a));
      // Choose the axis that closes the bigger gap first.
      const dx = tx - car.x;
      const dy = ty - car.y;
      let wantAxis;
      let wantLine;
      let wantDir;
      if (Math.abs(dx) > Math.abs(dy)) {
        wantAxis = 'h';
        wantLine = car.y;
        wantDir = dx > 0 ? 1 : -1;
      } else {
        wantAxis = 'v';
        wantLine = car.x;
        wantDir = dy > 0 ? 1 : -1;
      }
      // Snap to the nearest road line when close to an intersection.
      const nearAvenue = AVENUES.find((a) => Math.abs(car.x - a) < 70);
      const nearStreet = STREETS.find((s) => Math.abs(car.y - s) < 70);
      if (nearAvenue !== undefined && wantAxis === 'v') {
        car.axis = 'v';
        car.line = nearAvenue;
        car.dir = wantDir;
      } else if (nearStreet !== undefined && wantAxis === 'h') {
        car.axis = 'h';
        car.line = nearStreet;
        car.dir = wantDir;
      } else if (car.axis === 'v') {
        car.line = car.x;
        car.dir = wantDir;
      } else {
        car.line = car.y;
        car.dir = wantDir;
      }
      // Steer along the chosen axis.
      if (car.axis === 'v') {
        const want = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 4 * dt);
        car.x += (car.line - car.x) * Math.min(1, 3 * dt);
      } else {
        const want = car.dir > 0 ? 0 : Math.PI;
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 4 * dt);
        car.y += (car.line - car.y) * Math.min(1, 3 * dt);
      }
      // When close to the player, ram: steer straight at them.
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < 260) {
        const want = Math.atan2(p.y - car.y, p.x - car.x);
        car.angle += wrapAngle(want - car.angle) * Math.min(1, 5 * dt);
      }
      car.speed += clamp(CAR_MODELS.cop.top - car.speed, -500 * dt, 460 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveBuildings(state.city, car.x, car.y, carRadius(car) * 0.75);
      car.x = fixed.x;
      car.y = fixed.y;
      const cw = clampWorld(car.x, car.y, carRadius(car));
      car.x = cw.x;
      car.y = cw.y;
      // A cop car ramming the player's car damages it (and the player).
      if (p.inCar && dist(car.x, car.y, p.x, p.y) < 46) {
        p.health -= 6 * dt;
        if (p.health <= 0) { state.wasted = true; state.events |= EVENT_WASTED; }
        state.camera.shake = 0.4;
      }
      // A cop car touching a slow player on foot starts the bust.
      if (!p.inCar && d < WANTED.bustRadius && Math.hypot(p.vx, p.vy) < 120) {
        state.bustTimer += dt;
        if (state.bustTimer > WANTED.bustTime) {
          state.busted = true;
          state.events |= EVENT_BUSTED;
        }
      }
    }
    // Foot cops: spawn near the player, run at them, shoot at 3+ stars.
    if (state.cops.length < wantFoot && state.wanted > 0) {
      const ang = range(random, 0, Math.PI * 2);
      const cx = p.x + Math.cos(ang) * 420;
      const cy = p.y + Math.sin(ang) * 420;
      const fixed = resolveBuildings(state.city, clampWorld(cx, cy, 14).x, clampWorld(cx, cy, 14).y, 14);
      state.cops.push({ x: fixed.x, y: fixed.y, angle: 0, speed: 210, health: 50, fireTimer: range(random, 0, 0.8) });
    }
    for (const cop of state.cops) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      const want = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = want;
      if (d > 60) {
        cop.x += Math.cos(want) * cop.speed * dt;
        cop.y += Math.sin(want) * cop.speed * dt;
      }
      const fixed = resolveBuildings(state.city, cop.x, cop.y, 14);
      cop.x = fixed.x;
      cop.y = fixed.y;
      // Bust when a foot cop gets close to a slow player on foot.
      if (!p.inCar && d < WANTED.bustRadius && Math.hypot(p.vx, p.vy) < 120) {
        state.bustTimer += dt;
        if (state.bustTimer > WANTED.bustTime) {
          state.busted = true;
          state.events |= EVENT_BUSTED;
        }
      }
      // Shoot the player on foot at 3+ stars.
      if (state.wanted >= 3 && !p.inCar && d < COMBAT.copRange && d > 80) {
        cop.fireTimer -= dt;
        if (cop.fireTimer <= 0) {
          cop.fireTimer = COMBAT.copFireRate;
          const ang = Math.atan2(p.y - cop.y, p.x - cop.x) + range(random, -0.08, 0.08);
          state.bullets.push({
            x: cop.x + Math.cos(ang) * 18, y: cop.y + Math.sin(ang) * 18,
            vx: Math.cos(ang) * COMBAT.bulletSpeed, vy: Math.sin(ang) * COMBAT.bulletSpeed,
            from: 'cop', damage: COMBAT.copDamage, life: 0.6,
          });
          state.events |= EVENT_COP_SHOT;
        }
      }
    }
    // Remove dead foot cops.
    state.cops = state.cops.filter((c) => c.health > 0);
  }

  // --- pedestrians ---------------------------------------------------------------
  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.targetX = ped.x + range(random, -300, 300);
          ped.targetY = ped.y + range(random, -300, 300);
        }
        continue;
      }
      if (ped.state === 'debtor' || ped.state === 'fare') continue; // they wait
      const p = state.player;
      if (ped.state === 'flee') {
        // Run away from the player / the last scare.
        const away = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.angle = away;
        ped.x += Math.cos(away) * 170 * dt;
        ped.y += Math.sin(away) * 170 * dt;
        if (dist(ped.x, ped.y, p.x, p.y) > 500) ped.state = 'walk';
      } else {
        // Walk toward the target; pick a new one when close.
        const d = dist(ped.x, ped.y, ped.targetX, ped.targetY);
        if (d < 24) {
          // Wander along a sidewalk: pick a nearby road point.
          const pt = randomSidewalkPoint(random);
          ped.targetX = pt.x;
          ped.targetY = pt.y;
        }
        const ang = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
        ped.angle = ang;
        ped.x += Math.cos(ang) * ped.speed * dt;
        ped.y += Math.sin(ang) * ped.speed * dt;
      }
      const fixed = resolveBuildings(state.city, ped.x, ped.y, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      const cw = clampWorld(ped.x, ped.y, 10);
      ped.x = cw.x;
      ped.y = cw.y;
    }
  }

  // --- bullets ------------------------------------------------------------------
  function stepBullets(dt) {
    const p = state.player;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (hitsBuilding(state.city, b.x, b.y, 2)) {
        b.life = 0;
        addEffect(b.x, b.y, 'spark', 2);
        continue;
      }
      if (b.from === 'player') {
        // Hit a cop car, a traffic car, a ped or a foot cop.
        for (const car of state.cars) {
          if (car.kind === 'player') continue;
          if (dist(b.x, b.y, car.x, car.y) < carRadius(car)) {
            b.life = 0;
            addEffect(b.x, b.y, 'spark', 3);
            if (car.kind === 'cop') addWanted(1);
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 16) {
            b.life = 0;
            ped.state = 'down';
            ped.downTimer = 5;
            addEffect(ped.x, ped.y, 'hit', 4);
            addWanted(1);
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const cop of state.cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            b.life = 0;
            cop.health -= b.damage;
            addEffect(cop.x, cop.y, 'hit', 3);
            if (cop.health <= 0) addWanted(1);
            break;
          }
        }
      } else {
        // A cop bullet: only the player matters.
        if (!p.inCar && p.invuln <= 0 && dist(b.x, b.y, p.x, p.y) < 16) {
          b.life = 0;
          p.health -= b.damage;
          p.invuln = 0.4;
          addEffect(p.x, p.y, 'hit', 3);
          state.camera.shake = 0.4;
          if (p.health <= 0) { state.wasted = true; state.events |= EVENT_WASTED; }
        } else if (p.inCar && dist(b.x, b.y, p.x, p.y) < 26) {
          b.life = 0;
          addEffect(b.x, b.y, 'spark', 2);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  // --- wanted decay ---------------------------------------------------------------
  function stepWanted(dt) {
    if (state.wanted === 0) return;
    // Mission 4: reaching 3 stars advances it.
    const m = activeMission(missions);
    if (m && m.id === 'heat' && missions.stage === 0 && state.wanted >= 3) {
      missions.stage = 1;
      setToast('Three stars — now lose them');
      state.events |= EVENT_MISSION;
    }
    // Is any cop close enough to see the player?
    let seen = false;
    for (const car of state.cars) {
      if (car.kind === 'cop' && dist(car.x, car.y, state.player.x, state.player.y) < WANTED.sightRange) { seen = true; break; }
    }
    if (!seen) {
      for (const cop of state.cops) {
        if (dist(cop.x, cop.y, state.player.x, state.player.y) < WANTED.sightRange) { seen = true; break; }
      }
    }
    if (seen) {
      state.wantedTimer = 0;
      return;
    }
    if (state.time - state.lastCrime > WANTED.decayDelay) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decayEvery) {
        state.wantedTimer = 0;
        state.wanted -= 1;
        state.events |= EVENT_WANTED_DOWN;
        if (state.wanted === 0 && m && m.id === 'heat' && missions.stage === 1) {
          const reward = missionEvent(missions, 'clean', state);
          missionReward(reward);
        }
      }
    }
  }

  // --- camera & effects ------------------------------------------------------------
  function stepCamera(dt) {
    const p = state.player;
    const targetZoom = p.inCar ? 0.8 : 1.0;
    state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, 2 * dt);
    const look = p.inCar ? 0.25 : 0.12;
    const tx = p.x + (p.inCar ? Math.cos(p.angle) * 60 * look * 4 : 0);
    const ty = p.y + (p.inCar ? Math.sin(p.angle) * 60 * look * 4 : 0);
    state.camera.x += (tx - state.camera.x) * Math.min(1, 6 * dt);
    state.camera.y += (ty - state.camera.y) * Math.min(1, 6 * dt);
    if (state.camera.shake > 0) state.camera.shake = Math.max(0, state.camera.shake - dt * 1.6);
    for (const e of state.effects) {
      e.t += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    state.effects = state.effects.filter((e) => e.t < e.life);
    if (state.toastTimer > 0) state.toastTimer -= dt;
    // Pickup respawn timers.
    for (const pk of state.pickups) {
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) pk.active = true;
      }
    }
  }

  // --- the step ---------------------------------------------------------------------
  function step(dt, input) {
    state.events = 0;
    state.time += dt;
    stepPlayer(dt, input);
    stepTraffic(dt);
    stepPolice(dt);
    stepPeds(dt);
    stepBullets(dt);
    stepWanted(dt);
    stepCamera(dt);
    // Bust timer resets when no cop is close.
    if (!state.busted) {
      let close = false;
      const p = state.player;
      for (const car of state.cars) {
        if (car.kind === 'cop' && dist(car.x, car.y, p.x, p.y) < WANTED.bustRadius) { close = true; break; }
      }
      if (!close) {
        for (const cop of state.cops) {
          if (dist(cop.x, cop.y, p.x, p.y) < WANTED.bustRadius) { close = true; break; }
        }
      }
      if (!close) state.bustTimer = 0;
    }
    return state.events;
  }

  /** Spawn a police car at a spot (used by the screenshot scenes). */
  function spawnCopCar(x, y, angle) {
    const car = makeCar('cop', x, y, angle, 'cop');
    car.axis = 'v';
    car.line = x;
    car.dir = 1;
    car.speed = 200;
    state.cars.push(car);
    return car;
  }

  /** Spawn a parked car at a spot (used by the screenshot scenes). */
  function spawnParkedCar(model, x, y, angle) {
    const car = makeCar(model, x, y, angle, 'parked');
    state.cars.push(car);
    return car;
  }

  reset();
  return { state, city, missions, reset, step, addEffect, spawnCopCar, spawnParkedCar, missionTarget: () => missionTarget(missions, state) };
}
