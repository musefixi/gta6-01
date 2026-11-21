// Missions and everything Jax can do for money in Port Azura: Dee Fontaine's six-part
// story (fetch, delivery, a tail job, a hot escape, a convoy ambush and the Banco del
// Sol score), repeatable taxi fares and a checkpoint street race, three shops (guns,
// resprays, the safehouse), and twenty hidden packages. This module owns the objective
// marker and the context prompt the HUD shows; the main loop calls update every step
// and interact() when the player presses F.
import { PISTOL } from './config.js';
import { blockRect, roadCenterX, roadCenterY } from './city.js';
import { createCar, steerToward, collideCarWithWorld } from './vehicles.js';
import { setWanted } from './police.js';

const DEE = { name: 'Dee Fontaine', place: 'spray' };

function placePoint(game, id) {
  const place = game.city.place(id);
  return { x: place.x, y: place.y, label: place.name };
}

function makePackages(game) {
  const { city } = game;
  const spots = [];
  const park = blockRect(4, 4);
  spots.push(
    { x: park.x + 60, y: park.y + 60 }, { x: park.x + 170, y: park.y + 90 },
    { x: park.x + 90, y: park.y + 180 }, { x: park.x + 190, y: park.y + 190 },
  );
  for (const dock of city.docks) spots.push({ x: dock.x + dock.w - 24, y: dock.y + dock.h / 2 });
  spots.push(
    { x: 260, y: 300 }, { x: 3900, y: 2900 }, { x: 300, y: 2900 }, { x: 3950, y: 320 },
  );
  for (const id of ['police', 'hospital', 'safehouse', 'hotel', 'bank', 'arena', 'gunshop']) {
    const p = placePoint(game, id);
    spots.push({ x: p.x + 26, y: p.y - 6 });
  }
  const lotA = blockRect(3, 6);
  const lotB = blockRect(8, 6);
  spots.push({ x: lotA.x + 30, y: lotA.y + 30 }, { x: lotB.x + lotB.w - 30, y: lotB.y + lotB.h - 30 });
  spots.push({ x: roadCenterX(0) + 30, y: roadCenterY(6) }, { x: roadCenterX(10) - 30, y: roadCenterY(0) + 30 });
  return spots.slice(0, 20).map((spot, i) => ({ id: i, x: spot.x, y: spot.y, taken: false }));
}

const STORY = [
  {
    id: 'first-wheels', title: 'First Wheels', reward: 250,
    intro: 'Dee: "Jax. I left a teal coupe by the marina. Bring it to my garage — Shine Auto Body. Try not to scratch it."',
  },
  {
    id: 'hot-package', title: 'Hot Package', reward: 400,
    intro: 'Dee: "A parcel is waiting at the marina docks. Take it to the Hotel Coralina, fast and quiet."',
  },
  {
    id: 'tail-lights', title: 'Tail Lights', reward: 500,
    intro: 'Dee: "A Banco del Sol courier runs money at night. Follow him — close enough to watch, far enough to breathe."',
  },
  {
    id: 'dockside-heat', title: 'Dockside Heat', reward: 700,
    intro: 'Dee: "The dock crew owes me. Collect their envelope at the marina. It may get loud — lose any heat, then come home."',
  },
  {
    id: 'convoy', title: 'Convoy', reward: 900,
    intro: 'Dee: "Rival crew is moving product from the marina to the Azura Dome. Stop both cars. Any way you like."',
  },
  {
    id: 'big-score', title: 'The Big Score', reward: 300,
    intro: 'Dee: "Last job, Jax. The Banco del Sol keeps its reserve by the door. Take it, lose the law, and get home."',
  },
];

export function createMissions(game) {
  const packages = makePackages(game);
  return {
    storyIndex: 0,
    storyDone: false,
    active: null,
    packages,
    packagesFound: 0,
    taxi: null,
    race: null,
    update(dt) { updateMissions(game, dt); },
  };
}

function startBanner(game, mission) {
  game.setBanner(mission.title, mission.intro, 6.5);
  game.audio.pickup();
}

function completeMission(game, reward) {
  const missions = game.missions;
  game.addMoney(reward, game.player.x, game.player.y - 30);
  game.audio.missionWin();
  game.setBanner('Mission complete', `+$${reward} — ${DEE.name} sends her thanks.`, 4.5);
  missions.active = null;
  missions.storyIndex += 1;
  if (missions.storyIndex >= STORY.length) {
    missions.storyDone = true;
    game.setBanner('Story complete', 'Port Azura is yours, Jax. Taxi fares, the street race and hidden packages remain.', 7);
  }
  game.saveGame();
}

function failMission(game, reason) {
  game.audio.missionFail();
  game.setBanner('Mission failed', reason, 4.5);
  cleanupMissionCars(game);
  game.missions.active = null;
}

function cleanupMissionCars(game) {
  const active = game.missions.active;
  if (!active) return;
  for (const car of active.cars ?? []) {
    if (car.driver === 'target') car.driver = 'traffic';
    if (car.driver === 'mission') car.driver = 'parked';
  }
}

function reach(game, point, radius) {
  const p = game.player;
  return Math.hypot(p.x - point.x, p.y - point.y) < radius;
}

function startStoryMission(game) {
  const missions = game.missions;
  const def = STORY[missions.storyIndex];
  if (!def) return;
  const m = { def, stage: 0, timer: 0, cars: [], data: {} };
  missions.active = m;
  startBanner(game, def);
  if (def.id === 'first-wheels') {
    const marina = game.city.place('marina');
    const car = createCar(game.random, marina.x - 60, marina.y - 120, Math.PI / 2, { driver: 'mission', color: '#19b3a6' });
    game.cars.push(car);
    m.cars.push(car);
    m.data.car = car;
  }
  if (def.id === 'tail-lights') {
    const bank = placePoint(game, 'bank');
    const car = createCar(game.random, bank.x, bank.y - 60, 0, { driver: 'target', color: '#8e6cc8' });
    car.routePoints = [
      { x: roadCenterX(4), y: roadCenterY(5) }, { x: roadCenterX(7), y: roadCenterY(5) },
      { x: roadCenterX(7), y: roadCenterY(2) }, { x: roadCenterX(9), y: roadCenterY(2) },
      { x: roadCenterX(9), y: roadCenterY(4) },
    ];
    car.routeIndex = 0;
    game.cars.push(car);
    m.cars.push(car);
    m.data.car = car;
    m.data.followTime = 0;
    m.data.spook = 0;
    m.data.lostTimer = 0;
  }
  if (def.id === 'convoy') {
    const marina = game.city.place('marina');
    for (let i = 0; i < 2; i += 1) {
      const car = createCar(game.random, marina.x - 40, marina.y - 80 + i * 90, Math.PI, { driver: 'target', color: '#c0392b', health: 130 });
      car.routePoints = [
        { x: roadCenterX(8), y: roadCenterY(3) }, { x: roadCenterX(6), y: roadCenterY(3) },
        { x: roadCenterX(6), y: roadCenterY(1) },
      ];
      car.routeIndex = 0;
      car.fireTimer = game.random.range(1, 2);
      game.cars.push(car);
      m.cars.push(car);
    }
  }
}

function driveRouteCar(game, car, dt, cruise) {
  const points = car.routePoints;
  if (!points || car.routeIndex >= points.length) return true;
  const target = points[car.routeIndex];
  const d = steerToward(game, car, target.x, target.y, dt, cruise, { accel: 300, cornerSpeed: 170 });
  collideCarWithWorld(game, car, dt, false);
  if (d < 46) car.routeIndex += 1;
  return car.routeIndex >= points.length;
}

function storyObjective(game, m) {
  const spray = placePoint(game, DEE.place);
  const marina = { ...game.city.place('marina'), label: 'Azura Marina' };
  switch (m.def.id) {
    case 'first-wheels':
      return m.stage === 0
        ? { x: m.data.car.x, y: m.data.car.y, label: 'Get in Dee\'s coupe' }
        : { ...spray, label: 'Deliver the coupe to Shine Auto Body' };
    case 'hot-package':
      if (m.stage === 0) return { x: marina.x, y: marina.y, label: 'Pick up the parcel at the marina' };
      return { ...placePoint(game, 'hotel'), label: `Deliver the parcel — ${Math.max(0, Math.ceil(m.timer))}s` };
    case 'tail-lights': {
      const car = m.data.car;
      if (m.stage === 0) return { x: car.x, y: car.y, label: `Tail the courier — watched ${Math.floor(m.data.followTime)}s / 25s` };
      return { x: car.x, y: car.y, label: 'Take the briefcase from the parked car' };
    }
    case 'dockside-heat':
      if (m.stage === 0) return { x: marina.x, y: marina.y, label: 'Collect the envelope at the marina' };
      if (m.stage === 1) return { x: game.player.x, y: game.player.y - 130, label: 'Lose the police (or get a respray)' };
      return { ...placePoint(game, 'safehouse'), label: 'Get back to the safehouse' };
    case 'convoy': {
      const alive = m.cars.filter((car) => !car.dead);
      if (alive.length) return { x: alive[0].x, y: alive[0].y, label: `Stop the convoy — ${alive.length} car(s) rolling` };
      return { ...spray, label: 'Report back to Dee' };
    }
    case 'big-score':
      if (m.stage === 0) return { ...placePoint(game, 'bank'), label: 'Rob the Banco del Sol reserve (hold position)' };
      if (m.stage === 1) return { x: game.player.x, y: game.player.y - 130, label: 'Lose the police' };
      return { ...placePoint(game, 'safehouse'), label: 'Escape to the safehouse' };
    default:
      return null;
  }
}

function updateStory(game, m, dt) {
  const spray = placePoint(game, DEE.place);
  const marina = game.city.place('marina');
  const safehouse = placePoint(game, 'safehouse');
  switch (m.def.id) {
    case 'first-wheels': {
      if (m.stage === 0 && game.player.car === m.data.car) m.stage = 1;
      else if (m.stage === 1 && game.player.car === m.data.car && reach(game, spray, 95)) completeMission(game, m.def.reward);
      break;
    }
    case 'hot-package': {
      if (m.stage === 0 && reach(game, marina, 60)) {
        m.stage = 1;
        m.timer = 150;
        setWanted(game, 1);
        game.setBanner('Parcel collected', 'The dock cameras saw you. Move!', 3.5);
      } else if (m.stage === 1) {
        m.timer -= dt;
        if (m.timer <= 0) { failMission(game, 'Too slow — the buyer left.'); break; }
        if (reach(game, placePoint(game, 'hotel'), 70)) completeMission(game, m.def.reward);
      }
      break;
    }
    case 'tail-lights': {
      const car = m.data.car;
      if (m.stage === 0) {
        const done = driveRouteCar(game, car, dt, 195);
        const d = Math.hypot(game.player.x - car.x, game.player.y - car.y);
        if (d < 52) m.data.spook += dt;
        else m.data.spook = Math.max(0, m.data.spook - dt * 0.7);
        if (m.data.spook > 3) { failMission(game, 'You spooked the courier — he bolted.'); break; }
        if (d > 380) {
          m.data.lostTimer += dt;
          if (m.data.lostTimer > 6) { failMission(game, 'You lost the courier.'); break; }
        } else m.data.lostTimer = 0;
        if (d >= 52 && d <= 300) m.data.followTime += dt;
        if (m.data.followTime >= 25 || done) {
          m.stage = 1;
          car.driver = 'parked';
          car.speed = 0;
          game.setBanner('He parked up', 'Take the briefcase from his car.', 4);
        }
      } else if (reach(game, car, 62)) {
        completeMission(game, m.def.reward);
      }
      break;
    }
    case 'dockside-heat': {
      if (m.stage === 0 && reach(game, marina, 60)) {
        m.stage = 1;
        setWanted(game, 2);
        game.setBanner('Envelope collected', 'Two stars. Shake them off!', 3.5);
      } else if (m.stage === 1 && game.police.stars <= 1) m.stage = 2;
      else if (m.stage === 2 && reach(game, safehouse, 80)) completeMission(game, m.def.reward);
      break;
    }
    case 'convoy': {
      let escaped = false;
      for (const car of m.cars) {
        if (car.dead) continue;
        if (driveRouteCar(game, car, dt, 330)) escaped = true;
        // The crew shoots back when the player closes in.
        car.fireTimer -= dt;
        const d = Math.hypot(game.player.x - car.x, game.player.y - car.y);
        if (car.fireTimer <= 0 && d < 300) {
          car.fireTimer = game.random.range(0.8, 1.5);
          game.audio.gunshot(0.35);
          const target = game.player.car ?? game.player;
          game.effects.tracer(car.x, car.y, target.x + game.random.range(-16, 16), target.y + game.random.range(-16, 16));
          if (game.random.chance(0.45)) {
            if (game.player.car) game.hitCar(game, game.player.car, 3, 'shot');
            else game.hurtPlayer(game.random.range(3, 7));
          }
        }
      }
      if (escaped) { failMission(game, 'A convoy car reached the Dome.'); break; }
      if (m.cars.every((car) => car.dead)) completeMission(game, m.def.reward);
      break;
    }
    case 'big-score': {
      if (m.stage === 0) {
        const bank = placePoint(game, 'bank');
        if (!game.player.car && reach(game, bank, 55)) {
          m.timer += dt;
          game.prompt = `Robbing the reserve… ${Math.ceil(4 - m.timer)}`;
          if (m.timer >= 4) {
            m.stage = 1;
            game.addMoney(1200, game.player.x, game.player.y - 24);
            setWanted(game, 3);
            game.setBanner('Score taken', '$1,200 in hand. Lose the police!', 4);
          }
        } else m.timer = Math.max(0, m.timer - dt * 2);
      } else if (m.stage === 1 && game.police.stars <= 1) m.stage = 2;
      else if (m.stage === 2 && reach(game, safehouse, 85)) completeMission(game, m.def.reward);
      break;
    }
    default: break;
  }
}

/* ---------------- taxi fares ---------------- */

function updateTaxi(game, dt) {
  const missions = game.missions;
  const player = game.player;
  if (!missions.taxi) {
    if (player.car && player.car.kind === 'taxi') {
      for (const ped of game.peds) {
        if (ped.state !== 'hail') continue;
        if (Math.hypot(ped.x - player.x, ped.y - player.y) < 52 && Math.abs(player.car.speed) < 30) {
          ped.state = 'passenger';
          const dest = game.random.pick(game.city.places);
          const dist = Math.hypot(dest.x - ped.x, dest.y - ped.y);
          missions.taxi = {
            ped, dest: { x: dest.x, y: dest.y, label: dest.name },
            fare: Math.round(14 + dist * 0.055), timer: 25 + dist / 16, startHealth: player.car.health,
          };
          game.setBanner('Taxi fare', `Take your passenger to ${dest.name}.`, 3.5);
          game.audio.pickup();
          break;
        }
      }
    }
    return;
  }
  const taxi = missions.taxi;
  taxi.timer -= dt;
  if (!player.car || player.car.kind !== 'taxi') {
    taxi.ped.state = 'walk';
    taxi.ped.x = player.x + 24;
    taxi.ped.y = player.y + 10;
    missions.taxi = null;
    game.setBanner('Fare cancelled', 'The passenger bailed out.', 3);
    return;
  }
  if (taxi.timer <= 0) {
    taxi.ped.state = 'walk';
    missions.taxi = null;
    game.setBanner('Fare lost', 'Too slow — no payment.', 3);
    game.audio.missionFail();
    return;
  }
  if (reach(game, taxi.dest, 58) && Math.abs(player.car.speed) < 40) {
    const tip = Math.max(0, Math.round(taxi.timer * 0.35) - Math.max(0, Math.round((taxi.startHealth - player.car.health) * 0.4)));
    game.addMoney(taxi.fare + tip, player.x, player.y - 26);
    game.stats.fares += 1;
    game.setBanner('Fare paid', `$${taxi.fare} + $${tip} tip.`, 3.2);
    game.audio.cash();
    taxi.ped.state = 'walk';
    taxi.ped.x = player.x + 30;
    taxi.ped.y = player.y;
    taxi.ped.waypoint = null;
    missions.taxi = null;
  }
}

/* ---------------- street race ---------------- */

const RACE_CHECKPOINTS = [
  [2, 2], [5, 1], [8, 2], [9, 5], [6, 6], [3, 5], [1, 3], [2, 1],
].map(([i, j]) => ({ x: roadCenterX(i), y: roadCenterY(j) }));

function startRace(game) {
  const missions = game.missions;
  const rivals = [];
  for (let i = 0; i < 2; i += 1) {
    const car = createCar(game.random, game.player.x - 40 - i * 66, game.player.y + 30 + i * 8, 0, {
      driver: 'racer', color: i === 0 ? '#8e6cc8' : '#e67e22',
    });
    car.checkpoint = 0;
    game.cars.push(car);
    rivals.push(car);
  }
  missions.race = { rivals, checkpoint: 0, timer: 0, countdown: 3, finished: false, place: 0 };
  game.setBanner('Street race', 'Eight checkpoints. First home takes $300.', 4);
}

function updateRace(game, dt) {
  const race = game.missions.race;
  if (!race) return;
  if (race.countdown > 0) {
    race.countdown -= dt;
    if (game.player.car) game.player.car.speed *= 0.8;
    return;
  }
  race.timer += dt;
  const targetOf = (car, idx) => RACE_CHECKPOINTS[Math.min(idx, RACE_CHECKPOINTS.length - 1)];
  for (const rival of race.rivals) {
    if (rival.dead) { rival.checkpoint = RACE_CHECKPOINTS.length; continue; }
    if (rival.checkpoint >= RACE_CHECKPOINTS.length) continue;
    const target = targetOf(rival, rival.checkpoint);
    const playerProgress = race.checkpoint + (game.player.car ? 0.5 : 0);
    const rubber = rival.checkpoint < playerProgress - 1 ? 1.09 : rival.checkpoint > playerProgress + 1 ? 0.93 : 1;
    const d = steerToward(game, rival, target.x, target.y, dt, 545 * rubber, { accel: 360, cornerSpeed: 230 });
    collideCarWithWorld(game, rival, dt, false);
    if (d < 60) rival.checkpoint += 1;
  }
  if (game.player.car && race.checkpoint < RACE_CHECKPOINTS.length) {
    const target = targetOf(game.player.car, race.checkpoint);
    if (Math.hypot(game.player.x - target.x, game.player.y - target.y) < 78) {
      race.checkpoint += 1;
      game.audio.pickup();
      if (race.checkpoint < RACE_CHECKPOINTS.length) {
        game.effects.text(game.player.x, game.player.y - 34, `Checkpoint ${race.checkpoint}/${RACE_CHECKPOINTS.length}`, '#ffd94d');
      }
    }
  }
  const rivalsDone = race.rivals.filter((car) => car.checkpoint >= RACE_CHECKPOINTS.length).length;
  if (race.checkpoint >= RACE_CHECKPOINTS.length && !race.finished) {
    race.finished = true;
    race.place = rivalsDone + 1;
    if (race.place === 1) {
      game.addMoney(300, game.player.x, game.player.y - 26);
      game.stats.racesWon += 1;
      if (!game.stats.bestRace || race.timer < game.stats.bestRace) game.stats.bestRace = Math.round(race.timer);
      game.setBanner('You win the race!', `$300 — ${race.timer.toFixed(1)}s. The marina crew respects the wheel.`, 5);
      game.audio.missionWin();
    } else {
      game.setBanner(`You placed ${race.place}${race.place === 2 ? 'nd' : 'rd'}`, 'No prize — the marina start line runs the race again any time.', 4.5);
      game.audio.missionFail();
    }
    for (const rival of race.rivals) if (!rival.dead) rival.driver = 'traffic';
    game.missions.race = null;
    game.saveGame();
  } else if (rivalsDone === 2 && !race.finished) {
    game.setBanner('Race over', 'Both rivals finished first. Try again at the marina.', 4);
    for (const rival of race.rivals) if (!rival.dead) rival.driver = 'traffic';
    game.missions.race = null;
  }
}

/* ---------------- shops, prompts, objective ---------------- */

function nearestInteractable(game) {
  const player = game.player;
  const missions = game.missions;
  const spray = game.city.place('spray');
  if (!missions.active && !missions.storyDone && Math.hypot(player.x - spray.x, player.y - spray.y) < 85) {
    return { label: `F — Start "${STORY[missions.storyIndex].title}" for Dee`, run: () => startStoryMission(game) };
  }
  if (!missions.race && player.car && Math.hypot(player.x - game.city.place('marina').x, player.y - game.city.place('marina').y) < 95) {
    return { label: 'F — Start the street race (in a car)', run: () => startRace(game) };
  }
  const gunshop = game.city.place('gunshop');
  if (!player.car && Math.hypot(player.x - gunshop.x, player.y - gunshop.y) < 60) {
    if (!player.hasPistol) {
      return {
        label: `F — Buy a pistol at Harbor Arms ($${PISTOL.price})`,
        run: () => {
          if (game.money < PISTOL.price) { game.setBanner('Harbor Arms', 'Not enough cash for the pistol.', 2.6); return; }
          game.spendMoney(PISTOL.price);
          player.hasPistol = true;
          player.ammoInMag = PISTOL.magazine;
          player.reserveAmmo = 24;
          game.setBanner('Harbor Arms', 'Pistol bought. Mouse aims, click fires, R reloads.', 4);
          game.audio.cash();
        },
      };
    }
    return {
      label: `F — Buy pistol ammo, ${PISTOL.ammoPack} rounds ($${PISTOL.ammoPrice})`,
      run: () => {
        if (game.money < PISTOL.ammoPrice) { game.setBanner('Harbor Arms', 'Not enough cash for ammo.', 2.6); return; }
        game.spendMoney(PISTOL.ammoPrice);
        player.reserveAmmo += PISTOL.ammoPack;
        game.audio.cash();
      },
    };
  }
  if (player.car && Math.hypot(player.x - spray.x, player.y - spray.y) < 95) {
    return {
      label: 'F — Respray & repair at Shine Auto Body ($150, cools the heat)',
      run: () => {
        if (game.money < 150) { game.setBanner('Shine Auto Body', 'A respray costs $150.', 2.6); return; }
        game.spendMoney(150);
        player.car.color = game.random.pick(['#e74c3c', '#5dade2', '#58d68d', '#f7dc6f', '#af7ac5', '#ecf0f1']);
        player.car.health = Math.min(player.car.maxHealth, player.car.health + 45);
        if (game.police.unseenTimer > 1) game.police.heat = 0;
        else game.police.heat = Math.floor(game.police.heat / 2);
        game.audio.spray();
        game.setBanner('Shine Auto Body', 'New paint, cooler trail.', 3);
      },
    };
  }
  const safehouse = game.city.place('safehouse');
  if (!player.car && Math.hypot(player.x - safehouse.x, player.y - safehouse.y) < 60) {
    return {
      label: 'F — Rest at the safehouse (heal + save)',
      run: () => {
        player.health = 100;
        game.saveGame();
        game.setBanner('Safehouse', 'Rested and saved. Port Azura waits.', 3);
        game.audio.pickup();
      },
    };
  }
  return null;
}

export function interact(game) {
  const found = nearestInteractable(game);
  if (found) found.run();
}

function updateMissions(game, dt) {
  const missions = game.missions;
  const player = game.player;
  game.prompt = null;
  // Hidden packages pay on touch.
  for (const pack of missions.packages) {
    if (pack.taken) continue;
    if (Math.hypot(player.x - pack.x, player.y - pack.y) < 34) {
      pack.taken = true;
      missions.packagesFound += 1;
      game.addMoney(50, pack.x, pack.y - 18);
      game.audio.pickup();
      game.setBanner('Hidden package', `${missions.packagesFound} of ${missions.packages.length} found — $50 each.`, 2.6);
    }
  }
  if (missions.active) updateStory(game, missions.active, dt);
  updateTaxi(game, dt);
  updateRace(game, dt);
  // The objective: mission first, then race, then taxi, then the next story marker.
  if (missions.active) game.objective = storyObjective(game, missions.active);
  else if (missions.race) {
    const race = missions.race;
    const cp = RACE_CHECKPOINTS[Math.min(race.checkpoint, RACE_CHECKPOINTS.length - 1)];
    game.objective = { x: cp.x, y: cp.y, label: race.countdown > 0 ? `Race starts in ${Math.ceil(race.countdown)}…` : `Checkpoint ${race.checkpoint + 1}/${RACE_CHECKPOINTS.length} — ${race.timer.toFixed(0)}s` };
  } else if (missions.taxi) {
    game.objective = { ...missions.taxi.dest, label: `Fare $${missions.taxi.fare} — ${Math.max(0, Math.ceil(missions.taxi.timer))}s left` };
  } else if (!missions.storyDone) {
    const spray = placePoint(game, DEE.place);
    game.objective = { ...spray, label: `See Dee at Shine Auto Body — "${STORY[missions.storyIndex].title}"` };
  } else {
    game.objective = null;
  }
  // Context prompt (unless a mission is narrating one already).
  if (!game.prompt) {
    const found = nearestInteractable(game);
    if (found) game.prompt = found.label;
    else if (!player.car) {
      const car = game.carInReach();
      if (car) game.prompt = car.driver === 'parked' || car.driver === 'mission' ? 'E — Steal this car' : 'E — Enter car';
    }
  }
}
