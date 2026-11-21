// The save game: one JSON record in localStorage holding money, story progress, the
// pistol and its ammo, hidden packages found, activity records and where Jax was left
// standing. Saving happens at the safehouse and automatically after every mission;
// a corrupt or missing record simply means a fresh game.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function storeSave(game) {
  try {
    const player = game.player;
    const data = {
      money: game.money,
      storyIndex: game.missions.storyIndex,
      packages: game.missions.packages.filter((pack) => pack.taken).map((pack) => pack.id),
      hasPistol: player.hasPistol,
      ammoInMag: player.ammoInMag,
      reserveAmmo: player.reserveAmmo,
      armor: Math.round(player.armor),
      bestRace: game.stats.bestRace,
      stats: game.stats,
      x: Math.round(player.car ? player.car.x : player.x),
      y: Math.round(player.car ? player.car.y : player.y),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
