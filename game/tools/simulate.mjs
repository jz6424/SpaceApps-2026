// Plays every mission x mode with three made-up players and prints how each did.
// Run: npm run balance   (or: node tools/simulate.mjs)
// Change numbers in src/config.js, then run this again before playtesting.
import { MISSIONS, MODES } from '../src/config.js';
import { Sim } from '../src/sim.js';

const SITE = { sun: 0.79, earth: 0.55 }; // what NASA's maps read at the base spot on Connecting Ridge

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
    sim.where = storm || warned ? 'shelter' : 'inside';
    sim.comms = (sim.earthUp && !sim.isNight) || (next && next.at - sim.t < 60 && sim.earthUp);
    if (sim.isNight) sim.ls = sim.air > 30 ? 'eco' : 'normal';
    else sim.ls = sim.air < 90 ? 'normal' : 'eco';
    if (sim.food !== null) sim.greenhouse = sim.water > 0 && (!sim.isNight || (sim.food < sim.goalValue + 2 && sim.power > 35));
    const broken = sim.panels.indexOf(false);
    if (warned || storm) { if (sim.robot.task !== 'idle' && sim.robot.task !== 'repair') sim.robot.task = 'idle'; }
    else if (broken >= 0 && sim.robot.task !== 'repair' && sim.regolith >= 10) sim.setRobot('repair', broken);
    else if (sim.robot.task === 'idle' || (sim.robot.task === 'repair' && broken < 0)) {
      const wantIce = sim.food !== null && (sim.water ?? 0) < 12;
      if (!sim.isNight) sim.robot.task = wantIce ? 'ice' : 'dig';
    }
    if (sim.isNight && sim.robot.task !== 'repair' && !(sim.food !== null && sim.water < 3 && sim.power > 50)) sim.robot.task = 'idle';
    if (sim.mission.goalType === 'dose' && sim.regolith >= 20 && sim.shielding < 2) sim.addShielding();
  },
};

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('mission', 14)}${pad('mode', 11)}${pad('player', 10)}${pad('result', 26)}low air  dose  blackout  stars`);
for (const mission of MISSIONS) {
  for (const mode of Object.keys(MODES)) {
    for (const [name, play] of Object.entries(PLAYERS)) {
      const sim = new Sim(mission, mode, SITE);
      const dt = 0.25;
      while (!sim.over) { play(sim); sim.tick(dt); }
      const o = sim.over;
      const result = o.won ? 'won' : o.reachedSunrise ? 'missed goal' : `lost at ${Math.round(sim.t)} s`;
      const extra = mission.goalType === 'food' ? ` food ${sim.food}` : '';
      console.log(`${pad(mission.id, 14)}${pad(mode, 11)}${pad(name, 10)}${pad(result + extra, 26)}${pad(Math.round(sim.lowestAir), 9)}${pad(Math.round(sim.dose), 6)}${pad(Math.round(sim.blackout), 10)}${o.stars}`);
    }
  }
}
