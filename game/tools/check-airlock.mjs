// `npm run airlock`: hammers the airlock rules with random actions and checks three promises:
// the two doors are never open together, a job always finishes, and from any state the
// astronaut standing between the doors can still get out to the Moon and back into the cabin.
import { CONFIG as C, MISSIONS } from '../src/config.js';
import { Sim } from '../src/sim.js';

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = list => list[Math.floor(rand() * list.length)];
const fail = (why, sim) => { console.error('FAIL:', why, JSON.stringify(sim.airlock)); process.exit(1); };

function settle(sim, seconds = 30) {
  for (let t = 0; t < seconds; t += 0.05) {
    sim.airlockTick(0.05);
    if (sim.airlock.inner && sim.airlock.outer) fail('both doors open', sim);
  }
}

let checks = 0;
for (let run = 0; run < 300; run++) {
  const sim = new Sim(MISSIONS[0], pick(['Cadet', 'Explorer', 'Commander']));
  for (let n = 0; n < 60; n++) {
    sim.inAirlock = rand() < 0.6;
    sim.doorway = rand() < 0.15 ? pick(['inner', 'outer']) : null;
    pick([
      () => sim.airlockStart('out'), () => sim.airlockStart('in'),
      () => sim.airlockDoor('inner'), () => sim.airlockDoor('outer'),
      () => sim.airlockSkip(), () => {},
    ])();
    for (let t = 0; t < rand() * 8; t += 0.05) {
      sim.airlockTick(0.05);
      if (sim.airlock.inner && sim.airlock.outer) fail('both doors open', sim);
    }

    // From here, can a copy of this airlock still take someone out and back in?
    const probe = new Sim(MISSIONS[0], sim.modeName);
    probe.airlock = structuredClone(sim.airlock);
    probe.inAirlock = true;
    settle(probe);
    if (probe.airlock.cycle) fail('a job never finished', probe);
    probe.airlockStart('out');
    settle(probe);
    if (!probe.airlock.outer || probe.airlock.pressure !== 'vacuum') fail('could not get out', probe);
    probe.airlockStart('in');
    settle(probe);
    if (!probe.airlock.inner || probe.airlock.pressure !== 'pressurized') fail('could not get back in', probe);
    checks++;
  }
}

// One trip out costs exactly the configured Life Support, and coming in is free.
const sim = new Sim(MISSIONS[0], 'Explorer');
sim.inAirlock = true;
const before = sim.air;
sim.airlockStart('out'); settle(sim);
const afterOut = sim.air;
sim.airlockStart('in'); settle(sim);
if (Math.abs(before - afterOut - C.airlock.cycleAir) > 1e-9 || sim.air !== afterOut) fail('wrong Life Support cost', sim);
if (sim.airlockDoor('outer') !== 'Close the inner door first!') fail('no interlock hint', sim);
// Explorers can't skip the prebreathe; Cadets can.
for (const [mode, skips] of [['Explorer', false], ['Cadet', true]]) {
  const s = new Sim(MISSIONS[0], mode);
  s.inAirlock = true;
  s.airlockStart('out');
  for (let t = 0; t < 1; t += 0.05) s.airlockTick(0.05);
  s.airlockSkip();
  s.airlockTick(0.05);
  if ((s.airlockStep.kind !== 'prebreathe') !== skips) fail(`prebreathe skip wrong for ${mode}`, s);
}
// Someone outside can always get the hatch open, even with the cabin door open and a storm on.
{
  const s = new Sim(MISSIONS[0], 'Explorer');
  s.storms.forEach(st => { st.started = true; });
  if (s.airlockStart('out', true)) fail('hatch refused from outside', s);
  settle(s);
  if (!s.airlock.outer || s.airlock.inner) fail('hatch did not open from outside', s);
}
console.log(`Airlock OK: ${checks} random states checked, doors never open together, always a way out and back in.`);
