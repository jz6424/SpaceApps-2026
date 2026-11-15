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
      () => {},
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
// Nobody skips the prebreathe: in every mode it runs its full time before the pump starts.
for (const mode of ['Cadet', 'Explorer', 'Commander']) {
  const s = new Sim(MISSIONS[0], mode);
  s.inAirlock = true;
  s.airlockStart('out');
  if (typeof s.airlockSkip === 'function') fail(`there is still a way to skip the prebreathe (${mode})`, s);
  const full = C.airlock.doorSeconds + C.airlock.prebreathe;
  for (let t = 0; t < full - 0.2; t += 0.05) s.airlockTick(0.05);
  if (s.airlockStep?.kind !== 'prebreathe') fail(`prebreathe ended early in ${mode}`, s);
  for (let t = 0; t < 0.5; t += 0.05) s.airlockTick(0.05);
  if (s.airlockStep?.kind !== 'pump') fail(`prebreathe did not hand over to the pump in ${mode}`, s);
}
// The hatch shuts behind someone who walks out, and they can open it again from the Moon side.
// Opened from outside, it stays open until they have stepped through.
{
  const s = new Sim(MISSIONS[0], 'Explorer');
  s.inAirlock = true;
  s.airlockStart('out'); settle(s);
  if (!s.airlock.outer) fail('hatch did not open for the trip out', s);
  Object.assign(s, { inAirlock: false, doorway: 'outer', where: 'outside' }); settle(s, 3);
  if (!s.airlock.outer) fail('hatch shut on someone standing in it', s);
  s.doorway = null; settle(s, 3);
  if (s.airlock.outer || s.airlock.pressure !== 'vacuum') fail('hatch did not shut behind the astronaut', s);
  if (s.airlockDoor('outer')) fail('hatch would not open again from outside', s);
  settle(s, 5);
  if (!s.airlock.outer) fail('hatch shut again before anyone came through', s);
  Object.assign(s, { inAirlock: true, where: 'inside' }); settle(s, 3);
  if (!s.airlock.outer) fail('hatch shut on someone coming in', s);
  s.airlockStart('in'); settle(s);
  if (!s.airlock.inner || s.airlock.outer || s.airlock.pressure !== 'pressurized') fail('could not get back in after the hatch shut', s);
  // Walking from the airlock into the cabin never shuts anything.
  Object.assign(s, { inAirlock: false, where: 'inside' }); settle(s, 3);
  if (!s.airlock.inner) fail('inner door shut by itself', s);
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
