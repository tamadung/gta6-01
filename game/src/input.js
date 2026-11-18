// Keyboard and pointer input. Held keys give a movement direction; one-shot
// presses (interact, punch, pause, confirm) are queued as flags and taken once
// by the loop, so a press between two frames is never lost and never counted
// twice. The mouse position is kept in screen pixels; the caller turns it into
// world coordinates with the camera.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

const KEYS = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  run: new Set(['ShiftLeft', 'ShiftRight']),
  handbrake: new Set(['Space']),
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, handbrake: false, interact: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let shootQueued = false;

  function keyDown(event) {
    for (const name of Object.keys(KEYS)) {
      if (KEYS[name].has(event.code)) {
        held[name] = true;
        event.preventDefault();
        return;
      }
    }
    if (event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_INTERACT;
      held.interact = true;
      event.preventDefault();
    } else if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_PUNCH;
      event.preventDefault();
    } else if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  }

  function keyUp(event) {
    for (const name of Object.keys(KEYS)) {
      if (KEYS[name].has(event.code)) held[name] = false;
    }
    if (event.code === 'KeyE') held.interact = false;
  }

  function mouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function mouseDownHandler(event) {
    if (event.button === 0) {
      mouseDown = true;
      shootQueued = true;
      mouseMove(event);
    }
  }

  function mouseUpHandler(event) {
    if (event.button === 0) mouseDown = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('mousedown', mouseDownHandler);
  window.addEventListener('mouseup', mouseUpHandler);
  // Touch: tap to shoot toward the tap, drag to move (simple, for the review).
  canvas.addEventListener('touchstart', (event) => {
    const t = event.touches[0];
    if (!t) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = t.clientX - rect.left;
    mouseY = t.clientY - rect.top;
    shootQueued = true;
    event.preventDefault();
  }, { passive: false });

  return {
    held,
    /** Take and clear the queued one-shot actions. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** A mouse click this frame (cleared after one read). */
    takeShoot() {
      const s = shootQueued;
      shootQueued = false;
      return s;
    },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
  };
}
