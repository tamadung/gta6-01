// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Screens: title, play, paused, busted, wasted, done.
// Progress saves to localStorage; ?seed=N fixes the city; ?shot=name stages a
// screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot tool.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED, EVENT_COP_SHOT, EVENT_CRASH, EVENT_HONK, EVENT_MISSION,
  EVENT_PICKUP, EVENT_ROB, EVENT_SHOT, EVENT_STEAL, EVENT_WASTED,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_BUSTED, SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { activeMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const SAVE_KEY = 'solmara-save-v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const { state, missions } = world;

let screen = SCREEN_TITLE;
let saveTimer = 0;
let doneShown = false;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.mission !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      mission: missions.index,
      packages: missions.packagesFound,
      x: state.player.x,
      y: state.player.y,
      health: state.player.health,
      ammo: state.player.ammo,
    }));
  } catch {
    // Storage may be unavailable (private mode); the game still plays.
  }
}

function applySave(save) {
  state.cash = save.cash;
  missions.index = Math.max(0, Math.min(5, save.mission));
  missions.stage = 0;
  missions.packagesFound = save.packages || 0;
  state.player.x = save.x;
  state.player.y = save.y;
  state.player.health = save.health || 100;
  state.player.ammo = save.ammo || 30;
  state.camera.x = save.x;
  state.camera.y = save.y;
}

function readInput() {
  const actions = input.takeActions();
  const held = input.held;
  const mouse = input.mouse();
  const view = renderer.view();
  // Mouse aim in world coordinates (through the camera).
  const cam = state.camera;
  const aimX = cam.x + (mouse.x - view.w / 2) / cam.zoom;
  const aimY = cam.y + (mouse.y - view.h / 2) / cam.zoom;
  return {
    up: held.up, down: held.down, left: held.left, right: held.right,
    run: held.run, handbrake: held.handbrake,
    interact: (actions & ACTION_INTERACT) !== 0,
    interactHeld: held.interact,
    punch: (actions & ACTION_PUNCH) !== 0,
    shoot: input.takeShoot(),
    honk: held.handbrake && (actions & ACTION_INTERACT) !== 0,
    aimX, aimY,
    confirm: (actions & ACTION_CONFIRM) !== 0,
    pause: (actions & ACTION_PAUSE) !== 0,
    mute: (actions & ACTION_MUTE) !== 0,
  };
}

function playEvents(events) {
  if (events & EVENT_SHOT) audio.shot();
  if (events & EVENT_COP_SHOT) audio.copShot();
  if (events & EVENT_CRASH) audio.crash();
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_STEAL) audio.steal();
  if (events & EVENT_HONK) audio.honk();
  if (events & EVENT_MISSION) audio.mission();
  if (events & EVENT_ROB) audio.rob();
  if (events & EVENT_BUSTED) {
    audio.busted();
    screen = SCREEN_BUSTED;
  }
  if (events & EVENT_WASTED) {
    audio.busted();
    screen = SCREEN_WASTED;
  }
}

function penalize() {
  // Busted or wasted: lose $200, the heat clears, wake up at the garage.
  state.cash = Math.max(0, state.cash - 200);
  state.wanted = 0;
  state.wantedTimer = 0;
  state.bustTimer = 0;
  state.busted = false;
  state.wasted = false;
  const p = state.player;
  if (p.inCar) {
    p.inCar.kind = 'parked';
    p.inCar.speed = 0;
    p.inCar = null;
  }
  p.x = 740;
  p.y = 640;
  p.health = 100;
  p.vx = 0;
  p.vy = 0;
  state.camera.x = p.x;
  state.camera.y = p.y;
  writeSave();
}

function stepFrame(dt, frameInput) {
  if (frameInput.mute) audio.setMuted(!audio.isMuted());
  if (frameInput.pause && screen === SCREEN_PLAY) {
    screen = SCREEN_PAUSED;
    writeSave();
    audio.click();
    return;
  }
  if (frameInput.pause && screen === SCREEN_PAUSED) {
    screen = SCREEN_PLAY;
    audio.click();
    return;
  }
  if (screen !== SCREEN_PLAY) return;
  const events = world.step(dt, frameInput);
  playEvents(events);
  // Engine + siren follow the driving state.
  const p = state.player;
  audio.update(!!p.inCar, p.inCar ? p.inCar.speed : 0, state.wanted);
  // Story finished: show the legend screen once.
  if (missions.index >= 5 && !doneShown) {
    doneShown = true;
    screen = SCREEN_DONE;
    writeSave();
  }
  // Autosave every 10 seconds of play.
  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    writeSave();
  }
  // Screen-reader status line.
  const m = activeMission(missions);
  status.textContent = m
    ? `${m.title}: cash $${state.cash}, wanted ${state.wanted} stars, health ${Math.round(state.player.health)}`
    : `Free roam: cash $${state.cash}, wanted ${state.wanted} stars`;
}

function onTitleConfirm() {
  audio.unlock();
  audio.click();
  const save = readSave();
  if (save) applySave(save);
  screen = SCREEN_PLAY;
}

function onEndConfirm() {
  if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) penalize();
  screen = SCREEN_PLAY;
  audio.click();
}

let last = performance.now();
function loop(now) {
  const frame = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  const frameInput = readInput();
  if (screen === SCREEN_TITLE) {
    if (frameInput.confirm) onTitleConfirm();
    // The city lives behind the title: traffic and pedestrians keep moving.
    world.step(frame, { up: false, down: false, left: false, right: false, run: false, handbrake: false, interact: false, interactHeld: false, punch: false, shoot: false, honk: false, aimX: 0, aimY: 0 });
  } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_DONE) {
    if (frameInput.confirm) onEndConfirm();
  } else {
    let remaining = frame;
    while (remaining > 0) {
      const dt = Math.min(STEP, remaining);
      stepFrame(dt, frameInput);
      remaining -= dt;
      if (screen !== SCREEN_PLAY) break;
    }
  }
  renderer.draw(state, missions, screen);
  window.requestAnimationFrame(loop);
}

if (shot) {
  // Screenshot mode: stage the scene, paint it twice, signal readiness.
  const staged = stageShot(shot, world);
  renderer.draw(state, missions, staged.screen);
  renderer.draw(state, missions, staged.screen);
  window.__shotReady = true;
} else {
  window.requestAnimationFrame(loop);
}
