// Keyboard and mouse state for the game: which keys are held (by code, so layout and
// caps lock do not matter), the one-frame action edges (pressed since the last step),
// and the mouse position in screen pixels with its buttons. The main loop reads held
// state every simulation step and consumes the action edges once per frame.

export const ACTION = {
  confirm: 1,
  pause: 2,
  enterCar: 4,
  interact: 8,
  reload: 16,
  weapon: 32,
  map: 64,
  mute: 128,
};

const KEY_ACTIONS = {
  Enter: ACTION.confirm,
  Space: ACTION.confirm,
  Escape: ACTION.pause,
  KeyP: ACTION.pause,
  KeyE: ACTION.enterCar,
  KeyF: ACTION.interact,
  KeyR: ACTION.reload,
  KeyQ: ACTION.weapon,
  KeyM: ACTION.mute,
  Tab: ACTION.map,
};

export function createInput(canvas) {
  const held = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let pendingActions = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) pendingActions |= action;
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** True while any of the given key codes is held. */
    down(...codes) {
      return codes.some((code) => held.has(code));
    },
    /** The action edges pressed since the last call; reading clears them. */
    takeActions() {
      const actions = pendingActions;
      pendingActions = 0;
      return actions;
    },
    /** Consume the mouse's one-frame click edge. */
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
    /** Movement axes from the keys: x right, y down, each -1, 0 or 1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
  };
}
