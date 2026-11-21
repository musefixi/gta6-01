// The heads-up display and the full-screen states, all drawn on the canvas over the
// world: money, clock and wanted stars top-right; health, armour, weapon and speed
// bottom-right; a circular minimap with blips bottom-left; the objective line and
// mission banners up top; the context prompt at the bottom; and the title, pause,
// wasted and busted screens. Screen readers get the same news through main's status line.
import { FONT, PALETTE, WORLD } from './config.js';

function pill(ctx, x, y, w, h, r = 10) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, ratio, color, label) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.62)';
  pill(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (ratio > 0.01) {
    ctx.fillStyle = color;
    pill(ctx, x + 2, y + 2, (w - 4) * Math.min(1, ratio), h - 4, (h - 4) / 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${h - 3}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 9, y + h / 2 + 0.5);
}

function formatClock(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawMinimap(ctx, game, view) {
  const R = 84;
  const cx = R + 22;
  const cy = view.h - R - 22;
  const renderer = game.renderer;
  const player = game.player;
  const SHOW = 1560; // world pixels across the map
  const k = (R * 2) / SHOW;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 16, 26, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const map = renderer.minimap;
  const scale = renderer.mapScale;
  const srcSize = SHOW * scale;
  const sx = Math.max(0, Math.min(map.width - srcSize, player.x * scale - srcSize / 2));
  const sy = Math.max(0, Math.min(map.height - srcSize, player.y * scale - srcSize / 2));
  ctx.drawImage(map, sx, sy, srcSize, srcSize, cx - R, cy - R, R * 2, R * 2);
  const toMap = (wx, wy) => ({ x: cx + (wx - player.x) * k, y: cy + (wy - player.y) * k });
  // Police blips flash red and blue.
  const flash = Math.floor(game.time * 2.4) % 2 === 0;
  for (const car of game.cars) {
    if (car.kind !== 'cop' || car.dead) continue;
    const p = toMap(car.x, car.y);
    if (Math.hypot(p.x - cx, p.y - cy) > R - 6) continue;
    ctx.fillStyle = flash ? '#ff5252' : '#5aa2ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const ped of game.peds) {
    if (!ped.officer || ped.state === 'down' || ped.state === 'gone') continue;
    const p = toMap(ped.x, ped.y);
    if (Math.hypot(p.x - cx, p.y - cy) > R - 6) continue;
    ctx.fillStyle = flash ? '#ff5252' : '#5aa2ff';
    ctx.fillRect(p.x - 2.4, p.y - 2.4, 4.8, 4.8);
  }
  // The objective: a gold diamond, clamped to the rim when it is off the map.
  if (game.objective) {
    let p = toMap(game.objective.x, game.objective.y);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > R - 10) {
      p = { x: cx + ((p.x - cx) / d) * (R - 10), y: cy + ((p.y - cy) / d) * (R - 10) };
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.marker;
    ctx.fillRect(-4.6, -4.6, 9.2, 9.2);
    ctx.restore();
  }
  // The player arrow, pointing the way Jax (or the car) faces.
  const facing = player.car ? player.car.angle : player.angle;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(facing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(8.5, 0);
  ctx.lineTo(-6, -5.4);
  ctx.lineTo(-6, 5.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - R - 12);
}

export function drawHud(ctx, game, view) {
  const { player, police } = game;
  ctx.save();
  ctx.shadowColor = PALETTE.hudShadow;
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1;
  // Money, clock and stars, top-right.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.money;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, view.w - 24, 44);
  ctx.fillStyle = '#fff';
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(formatClock(game.hour), view.w - 24, 68);
  ctx.font = '21px ' + FONT;
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < police.stars ? PALETTE.starOn : PALETTE.starOff;
    ctx.fillText('★', view.w - 24 - (4 - i) * 23, 94);
  }
  if (game.audio.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('SOUND OFF (M)', view.w - 24, 114);
  }
  // Objective line, top-centre.
  if (game.objective) {
    ctx.textAlign = 'center';
    ctx.font = `700 16.5px ${FONT}`;
    const w = ctx.measureText(game.objective.label).width + 34;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.55)';
    pill(ctx, view.w / 2 - w / 2, 14, w, 30, 15);
    ctx.fill();
    ctx.shadowBlur = 5;
    ctx.fillStyle = PALETTE.marker;
    ctx.fillText('◆', view.w / 2 - w / 2 + 17, 36);
    ctx.fillStyle = '#fff';
    ctx.fillText(game.objective.label, view.w / 2 + 8, 36);
  }
  // Mission banner.
  if (game.banner && game.banner.timer > 0) {
    const alpha = Math.min(1, game.banner.timer / 0.8);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `800 25px ${FONT}`;
    const tw = Math.max(ctx.measureText(game.banner.title).width, ctx.measureText(game.banner.sub).width) + 52;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.66)';
    pill(ctx, view.w / 2 - tw / 2, 56, tw, 64, 14);
    ctx.fill();
    ctx.shadowBlur = 5;
    ctx.fillStyle = PALETTE.marker;
    ctx.fillText(game.banner.title, view.w / 2, 84);
    ctx.fillStyle = '#f2f4f6';
    ctx.font = `500 14.5px ${FONT}`;
    ctx.fillText(game.banner.sub, view.w / 2, 108);
    ctx.globalAlpha = 1;
  }
  // Health, armour, weapon and speed, bottom-right.
  const bx = view.w - 252;
  bar(ctx, bx, view.h - 78, 228, 17, player.health / 100, PALETTE.health, 'HEALTH');
  bar(ctx, bx, view.h - 56, 228, 13, player.armor / 100, PALETTE.armor, 'ARMOUR');
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#fff';
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'right';
  let weaponLine = 'FISTS — click or F to punch';
  if (player.hasPistol) {
    weaponLine = player.reloadTimer > 0 ? 'PISTOL — reloading…' : `PISTOL  ${player.ammoInMag} / ${player.reserveAmmo}`;
  }
  ctx.fillText(weaponLine, view.w - 24, view.h - 92);
  if (player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.31);
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(`${kmh}`, view.w - 62, view.h - 118);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('km/h', view.w - 24, view.h - 118);
    const carHealth = Math.max(0, Math.round(player.car.health));
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillStyle = carHealth < 30 ? '#ff8a80' : 'rgba(255,255,255,0.8)';
    ctx.fillText(`car condition ${carHealth}%`, view.w - 24, view.h - 140);
  }
  // Packages counter, bottom-right under the bars.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(`packages ${game.missions.packagesFound}/${game.missions.packages.length}`, view.w - 24, view.h - 18);
  // Context prompt, bottom-centre.
  if (game.prompt) {
    ctx.textAlign = 'center';
    ctx.font = `600 15.5px ${FONT}`;
    const w = ctx.measureText(game.prompt).width + 30;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.62)';
    pill(ctx, view.w / 2 - w / 2, view.h - 46, w, 30, 15);
    ctx.fill();
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#fff';
    ctx.fillText(game.prompt, view.w / 2, view.h - 26);
  }
  // The busted meter.
  if (police.bustedTimer > 0.04 && game.screen === 'play') {
    ctx.textAlign = 'center';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('BUSTED?', view.w / 2, view.h * 0.36);
    bar(ctx, view.w / 2 - 110, view.h * 0.36 + 12, 220, 13, police.bustedTimer / 1.5, '#ff5252', '');
  }
  ctx.restore();
  // Low-health pulse.
  if (player.health < 30 && game.screen === 'play') {
    const pulse = 0.16 + Math.sin(game.time * 5) * 0.07;
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.72);
    g.addColorStop(0, 'rgba(190, 20, 40, 0)');
    g.addColorStop(1, `rgba(190, 20, 40, ${pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  drawMinimap(ctx, game, view);
}

const CONTROLS = [
  ['W A S D / arrows', 'walk · drive'],
  ['Mouse', 'aim · click to shoot'],
  ['Shift', 'sprint'],
  ['E', 'enter / exit a car'],
  ['F', 'interact · punch · start jobs'],
  ['Space', 'handbrake (in a car)'],
  ['R', 'reload'],
  ['P / Esc', 'pause'],
  ['M', 'mute'],
];

export function drawScreen(ctx, game, view) {
  const { screen } = game;
  ctx.save();
  if (screen === 'title') {
    const grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, 'rgba(16, 42, 74, 0.55)');
    grad.addColorStop(0.55, 'rgba(146, 52, 96, 0.38)');
    grad.addColorStop(1, 'rgba(12, 18, 30, 0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd94d';
    ctx.font = `italic 800 30px ${FONT}`;
    ctx.fillText('P O R T   A Z U R A   P R E S E N T S', view.w / 2, view.h * 0.20);
    ctx.fillStyle = '#ffffff';
    ctx.font = `italic 900 92px ${FONT}`;
    ctx.fillText('NEON HARBOR', view.w / 2, view.h * 0.20 + 96);
    ctx.fillStyle = '#ff5d8f';
    ctx.font = `italic 900 54px ${FONT}`;
    ctx.fillText('VICE RUN', view.w / 2, view.h * 0.20 + 152);
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#eef3f6';
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText('Steal cars. Run jobs for Dee Fontaine. Outrun the Port Azura PD.', view.w / 2, view.h * 0.20 + 192);
    ctx.font = `700 19px ${FONT}`;
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(game.hasSave ? 'ENTER — continue      ·      N — new game' : 'ENTER — start the story', view.w / 2, view.h * 0.20 + 238);
    // Controls, two columns.
    ctx.font = `500 14.5px ${FONT}`;
    const colW = 300;
    const startY = view.h * 0.20 + 282;
    CONTROLS.forEach(([key, what], i) => {
      const col = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = view.w / 2 - colW + col * colW;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd94d';
      ctx.fillText(key, x + 118, startY + row * 24);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#dfe7ec';
      ctx.fillText(what, x + 128, startY + row * 24);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 12.5px ${FONT}`;
    ctx.fillText('An original game — its own city, people and story. Built for make.fun’s “Make GTA 6” bounty.', view.w / 2, view.h - 26);
  } else if (screen === 'paused') {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.68)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText('PAUSED', view.w / 2, view.h * 0.3);
    ctx.font = `500 16.5px ${FONT}`;
    ctx.fillStyle = '#dfe7ec';
    const stats = game.stats;
    const lines = [
      `Money $${game.money.toLocaleString('en-US')} · earned $${stats.earned.toLocaleString('en-US')} all told`,
      `Story: ${game.missions.storyDone ? 'complete' : `job ${game.missions.storyIndex + 1} of 6`} · taxi fares ${stats.fares} · races won ${stats.racesWon}`,
      `Hidden packages ${game.missions.packagesFound} of ${game.missions.packages.length}${stats.bestRace ? ` · best race ${stats.bestRace}s` : ''}`,
      '',
      'P or Esc — resume      ·      Enter — resume',
      ...CONTROLS.slice(0, 6).map(([k, w]) => `${k} — ${w}`),
    ];
    lines.forEach((line, i) => ctx.fillText(line, view.w / 2, view.h * 0.3 + 44 + i * 26));
  } else if (screen === 'wasted' || screen === 'busted') {
    const wasted = screen === 'wasted';
    ctx.fillStyle = wasted ? 'rgba(60, 4, 10, 0.72)' : 'rgba(8, 20, 52, 0.72)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = wasted ? '#ff5252' : '#7db4ff';
    ctx.font = `italic 900 84px ${FONT}`;
    ctx.fillText(wasted ? 'WASTED' : 'BUSTED', view.w / 2, view.h * 0.42);
    ctx.fillStyle = '#eef3f6';
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(game.endReason, view.w / 2, view.h * 0.42 + 46);
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(wasted ? 'ENTER — wake up at St. Solana General' : 'ENTER — walk out of Port Azura PD', view.w / 2, view.h * 0.42 + 88);
  }
  ctx.restore();
  void WORLD;
}
