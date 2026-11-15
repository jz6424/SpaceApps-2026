// Plays every mission x mode with three made-up players and prints how each did.
// Run: npm run balance   (or: node tools/simulate.mjs)
// Change numbers in src/config.js, then run this again before playtesting.
//
// Table 1 uses each mission's own storm sizes and times. Table 2 plays many playthroughs the way
// the game does: storms sized from real NASA DONKI flares (live if this computer can reach the
// feed, otherwise the saved list) and shifted in time, to check no draw makes a mission unfair.
import { CONFIG as C, MISSIONS, MODES } from '../src/config.js';
import { Sim, planRun } from '../src/sim.js';
import { getFlares } from '../src/nasa.js';

const SITE = { sun: 0.79, earth: 0.55 }; // what NASA's maps read at the base spot on Connecting Ridge

// The careful player can be told to skip one thing, to check what the third star really needs.
let skip = null; // 'shield': never builds the dirt shield. 'shelter': builds it but never hides.

const PLAYERS = {
  // Never touches anything.
  idle: () => {},
  // Turns everything on and never hides.
  careless: sim => {
    if (sim.t < 1) { sim.setComms(true); sim.setGreenhouse(sim.food !== null); sim.setRobot('dig'); sim.setLifeSupport('boost'); }
  },
  // Does what the tutorial teaches.
  careful: sim => {
    const storm = sim.stormNow, next = sim.nextStorm;
    const warned = next && next.warnedBy;
    sim.where = (storm || warned) && skip !== 'shelter' ? 'shelter' : 'inside';
    sim.comms = (sim.earthUp && !sim.isNight) || (next && next.at - sim.t < 60 && sim.earthUp);
    if (sim.isNight) sim.ls = sim.air > 30 ? 'eco' : 'normal';
    else sim.ls = sim.air < 90 ? 'normal' : 'eco';
    if (sim.food !== null) sim.greenhouse = sim.water > 0 && (!sim.isNight || (sim.food < sim.goalValue + 2 && sim.power > 35));
    const broken = sim.panels.indexOf(false);
    // Nobody is at the Robot Map in the first ten seconds. In Cadet mode the robot parks itself
    // when a storm starts, so there it keeps working through the warning.
    if (sim.t < 10) { /* still finding the way round */ }
    else if (storm || (warned && !sim.mode.robotAutoPark)) { if (sim.robot.task !== 'idle' && sim.robot.task !== 'repair') sim.robot.task = 'idle'; }
    else if (broken >= 0 && sim.robot.task !== 'repair' && sim.regolith >= 10) sim.setRobot('repair', broken);
    else if (sim.robot.task === 'idle' || (sim.robot.task === 'repair' && broken < 0)) {
      const wantIce = sim.food !== null && (sim.water ?? 0) < 12;
      if (!sim.isNight) sim.robot.task = wantIce ? 'ice' : 'dig';
    }
    if (sim.isNight && sim.robot.task !== 'repair' && !(sim.food !== null && sim.water < 3 && sim.power > 50)) sim.robot.task = 'idle';
    if (sim.mission.goalType === 'dose' && skip !== 'shield' && sim.regolith >= sim.shieldCost) sim.addShielding();
    // Rock samples: a short moonwalk every 40 s, day or night (they glow), unless a storm is near.
    // About 25 s outside per rock, and each trip out costs the airlock's share of air.
    if (sim.mission.goalType === 'samples' && sim.samples.size < sim.goalValue && !storm && !warned) {
      const phase = sim.t % 40, trip = Math.floor(sim.t / 40);
      if (phase < 25) {
        sim.where = 'outside';
        if (sim.walk !== trip) { sim.walk = trip; sim.air = Math.max(0, sim.air - C.airlock.cycleAir); }
      } else if (sim.walk === trip && sim.fetched !== trip) { sim.fetched = trip; sim.collectSample(`rock${sim.samples.size}`); }
    }
  },
  noShield: sim => { skip = 'shield'; PLAYERS.careful(sim); skip = null; },
  noShelter: sim => { skip = 'shelter'; PLAYERS.careful(sim); skip = null; },
};

const pad = (s, n) => String(s).padEnd(n);
function play(mission, mode, player, plan = null) {
  const sim = new Sim(mission, mode, SITE, plan);
  while (!sim.over) { PLAYERS[player](sim); sim.tick(0.25); }
  return sim;
}

console.log('1. Each mission with its own storm sizes and times\n');
console.log(`${pad('mission', 14)}${pad('mode', 11)}${pad('player', 10)}${pad('result', 26)}low air  dose  blackout  stars`);
for (const mission of MISSIONS) {
  for (const mode of Object.keys(MODES)) {
    for (const name of Object.keys(PLAYERS)) {
      const sim = play(mission, mode, name);
      const o = sim.over;
      const result = o.won ? 'won' : o.reachedSunrise ? 'missed goal' : `lost at ${Math.round(sim.t)} s`;
      const extra = mission.goalType === 'food' ? ` food ${sim.food}` : '';
      console.log(`${pad(mission.id, 14)}${pad(mode, 11)}${pad(name, 10)}${pad(result + extra, 26)}${pad(Math.round(sim.lowestAir), 9)}${pad(Math.round(sim.dose), 6)}${pad(Math.round(sim.blackout), 10)}${o.stars}`);
    }
  }
}

// The same sequence of "random" numbers every time, so two runs of this tool can be compared.
function seeded(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RUNS = 300;
const { live, flares } = await getFlares();
console.log(`\n2. ${RUNS} playthroughs each, storms sized from ${flares.length} real flares (${live ? 'live from NASA DONKI' : 'saved list: the live feed could not be reached'})\n`);
console.log('   "no shield" hides in every storm but never builds the dirt shield. "no shelter" builds it but never hides.\n');
console.log(`${pad('mission', 14)}${pad('mode', 11)}${pad('careful: won', 14)}${pad('stars 1/2/3', 15)}${pad('dose', 9)}${pad('careless: won', 15)}${pad('idle: won', 11)}${pad('no shield: won', 16)}${pad('3 stars', 9)}${pad('dose', 9)}${pad('no shelter: won', 17)}3 stars`);
for (const mission of MISSIONS) {
  for (const mode of Object.keys(MODES)) {
    const rnd = seeded(7);
    const won = Object.fromEntries(Object.keys(PLAYERS).map(name => [name, 0])), stars = [0, 0, 0, 0];
    const three = { noShield: 0, noShelter: 0 }, dose = { careful: [Infinity, 0], noShield: [Infinity, 0] };
    for (let i = 0; i < RUNS; i++) {
      const plan = planRun(mission, flares, rnd);
      for (const name of Object.keys(PLAYERS)) {
        const sim = play(mission, mode, name, plan);
        if (sim.over.won) won[name]++;
        if (name === 'careful') stars[sim.over.stars]++;
        if (name in three && sim.over.stars === 3) three[name]++;
        if (dose[name]) dose[name] = [Math.min(dose[name][0], sim.dose), Math.max(dose[name][1], sim.dose)];
      }
    }
    const pct = n => `${Math.round(n / RUNS * 100)}%`;
    const span = ([lo, hi]) => `${Math.round(lo)}-${Math.round(hi)}`;
    console.log(`${pad(mission.id, 14)}${pad(mode, 11)}${pad(pct(won.careful), 14)}${pad(stars.slice(1).join('/'), 15)}${pad(span(dose.careful), 9)}${pad(pct(won.careless), 15)}${pad(pct(won.idle), 11)}${pad(pct(won.noShield), 16)}${pad(three.noShield, 9)}${pad(span(dose.noShield), 9)}${pad(pct(won.noShelter), 17)}${three.noShelter}`);
  }
}
