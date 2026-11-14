// The rules of the game, with no 3D or HTML in it, so tools/simulate.mjs can play it in Node.
// One Sim = one mission. Call tick(dt) every frame; read the fields; call the action methods
// when the player uses a station. Messages for the player go in sim.messages.
import { CONFIG as C, MODES } from './config.js';

const STRENGTH = { Mild: 0.5, Moderate: 0.75, Strong: 1 };
const SIZES = ['Mild', 'Moderate', 'Strong'];

// How big a real flare is, from its X-ray class. Each letter is ten times the one before
// (C, M, X), and the number multiplies it: M5 is five times M1, and X1 is ten times M1.
//   units: 1 = M1, 10 = X1.  strength: which storm size it gives in the game.
//   place: 0 to 1, how far up its own size band it sits (used to stretch the storm).
export function flareSize(classType) {
  const tens = { C: 0.1, M: 1, X: 10 }[String(classType)[0]] ?? 0;
  const units = tens * (parseFloat(String(classType).slice(1)) || 1);
  if (units < 1) return null; // smaller than M1: too weak to trouble a moon base
  const [strength, lo, hi] = units < 5 ? ['Mild', 1, 5] : units < 10 ? ['Moderate', 5, 10] : ['Strong', 10, 100];
  const place = Math.min(1, Math.log(units / lo) / Math.log(hi / lo));
  return { units, strength, place };
}

const niceDate = iso => new Date(`${iso}T00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const flareLabel = f => `${f.classType} flare of ${niceDate(f.date)}`;

// Works out what happens in one playthrough, so no two are the same. Each storm in the mission
// draws a real solar flare of the size the mission calls for (flares = [{ date, classType }]
// from NASA DONKI). The flare's class sets the storm's strength, a bigger flare makes it last
// longer, and storms and space rocks arrive a little earlier or later each time.
// With no flares it keeps the mission's own sizes and only shifts the times.
export function planRun(mission, flares = [], rnd = Math.random) {
  const total = mission.day + mission.night;
  const shift = spread => (rnd() * 2 - 1) * spread;
  const sized = flares.map(f => ({ flare: f, size: flareSize(f.classType) })).filter(f => f.size);
  const used = new Set();
  let earliest = 40;
  const storms = mission.storms.map(slot => {
    // Flares of the size this mission wants; if there are none, the nearest size there is.
    const want = SIZES.indexOf(slot.strength);
    const free = sized.filter(f => !used.has(f.flare));
    const gap = Math.min(...free.map(f => Math.abs(SIZES.indexOf(f.size.strength) - want)));
    const pool = free.filter(f => Math.abs(SIZES.indexOf(f.size.strength) - want) === gap);
    const pick = pool[Math.floor(rnd() * pool.length)];
    if (pick) used.add(pick.flare);
    const length = slot.length * (pick ? 0.9 + 0.25 * pick.size.place : 1);
    const at = Math.round(Math.max(earliest, Math.min(total - length * 1.25 - 5, slot.at + shift(12))));
    earliest = at + length * 1.25 + 20;
    return { at, length, strength: pick ? pick.size.strength : slot.strength, flare: pick?.flare ?? null };
  });
  const meteoroids = mission.meteoroids.map(at => Math.round(at + shift(15)));
  return { storms, meteoroids };
}

export class Sim {
  // site: { sun, earth } shares from NASA's maps at the base (0 to 1).
  // plan: this playthrough's storms and space rocks from planRun(); without one, the mission's own.
  constructor(mission, modeName, site = { sun: 0.75, earth: 0.5 }, plan = null) {
    const mode = MODES[modeName];
    this.mission = mission;
    this.modeName = modeName;
    this.mode = mode;
    this.site = site;
    // Panels on a sunnier spot make more. 0.75 of the time in sunlight counts as normal.
    this.siteSun = Math.min(1.15, Math.max(0.75, site.sun / 0.75));

    this.t = 0;
    this.day = mission.day;
    this.total = mission.day + mission.night;
    const s = mission.start;
    this.power = s.power;
    this.air = s.air;
    this.dose = 0;
    this.regolith = s.regolith ?? 20;
    this.food = s.food ?? null;   // only Ice and Greens counts meals
    this.water = s.water ?? null;
    this.rp = 0;
    this.suit = C.suit.seconds;

    this.ls = 'normal';
    this.comms = false;
    this.greenhouse = false;
    this.robot = { task: 'idle', offline: 0, progress: 0, target: -1, resumeAfterStorm: null };
    this.panels = Array(C.solar.panels).fill(true);
    this.shielding = 0;
    this.where = 'inside';

    this.storms = (plan?.storms ?? mission.storms).map(st => ({
      flare: null,     // the real flare this storm is sized from, when there is one
      ...st,
      length: st.length * mode.stormLength,
      warnedBy: null,  // 'earth' or 'sensor'
      forecastAt: null, // when Mission Control's forecast of it arrives
      started: false,
      done: false,
    }));
    this.meteoroids = [...(plan?.meteoroids ?? mission.meteoroids)];
    if (mode.extraMeteoroid) this.meteoroids.push(Math.min(this.total - 30, (this.meteoroids[0] ?? 100) + 70));
    this.meteoroids.sort((a, b) => a - b);

    // Earth dips below the horizon for a while. How long comes from NASA's Earth-visibility map:
    // the less often Earth is up at this spot, the longer the gap.
    const gap = Math.round(Math.min(70, Math.max(30, (1 - site.earth) * 90)));
    const setAt = mission.earthSetAt ?? Math.round(this.day * 0.85);
    this.earthGap = [setAt, setAt + gap];

    this.share = 1;           // power share in a brownout (1 = everything runs)
    this.gen = 0;
    this.demand = 0;
    this.lowestAir = this.air;
    this.blackout = 0;
    this.emergency = 0;       // seconds spent at 0 air
    this.foodTimer = 0;
    this.growTimer = 0;
    this.uploadReady = 0;
    this.samples = new Set();
    this.pending = [];        // messages on their way from Earth
    this.messages = [];       // for the HUD: { from, text, kind }
    this.flags = {};          // tutorial progress and one-time notices
    this.over = null;         // { won, reason, stars }
  }

  // --- What the world looks like right now ---
  get sunlight() {
    const tw = C.twilightSeconds;
    if (this.t < this.day - tw) return 1;
    if (this.t < this.day) return (this.day - this.t) / tw;
    return 0;
  }
  get isNight() { return this.sunlight < 0.5; }
  get earthUp() { return !(this.t >= this.earthGap[0] && this.t < this.earthGap[1]); }
  get stormNow() { return this.storms.find(s => s.started && !s.done) ?? null; }
  get nextStorm() { return this.storms.find(s => !s.started) ?? null; }
  get timeToSunrise() { return Math.max(0, this.total - this.t); }
  get timeToSunset() { return Math.max(0, this.day - this.t); }
  get panelsWorking() { return this.panels.filter(Boolean).length; }
  get robotWorking() { return this.robot.task !== 'idle' && this.robot.offline <= 0 && !this.stormNow; }
  get shieldMult() { return C.dose.shielding[this.shielding]; }
  get goalValue() {
    const v = this.mission.goalValue;
    if (this.mission.goalType === 'dose') return Math.round(v * this.mode.doseGoal);
    return typeof v === 'object' ? v[this.modeName] : v;
  }
  get batteryForecast() { // seconds the battery lasts at the current net drain, or Infinity
    const net = this.gen - this.demand;
    return net >= 0 ? Infinity : this.power / -net;
  }

  say(text, kind = 'info', from = 'Base computer') { this.messages.push({ from, text, kind, t: this.t }); }
  // Mission Control is on Earth, so whatever it says arrives one light-trip later.
  fromEarth(text, kind = 'info', delay = C.commsRoundTrip / 2) {
    this.pending.push({ at: this.t + delay, from: 'Mission Control', text, kind });
  }

  // --- Station actions. Each returns a short result for the station panel. ---
  setLifeSupport(mode) { this.ls = mode; this.flags.lifeSupport = true; }
  setComms(on) {
    this.comms = on;
    this.flags.comms = true;
    if (on && this.earthUp) this.fromEarth('We hear you, Connecting Ridge. We will warn you about the Sun.');
    if (on && !this.earthUp) this.say('Antenna on, but Earth is below the horizon. No signal until it rises.', 'warn');
  }
  setGreenhouse(on) { this.greenhouse = on; this.flags.greenhouse = true; }
  setRobot(task, target = -1) {
    this.flags.robot = true;
    if (this.robot.offline > 0) return 'The robot is still being fixed.';
    if (task === 'repair') {
      if (this.regolith < C.robot.repairRegolith) return `Not enough moon dirt. Repairs need ${C.robot.repairRegolith}.`;
      if (target < 0) target = this.panels.indexOf(false);
      if (target < 0) return 'No broken panels.';
      this.regolith -= C.robot.repairRegolith;
      this.robot.target = target;
      this.robot.progress = 0;
    }
    this.robot.task = task;
    return null;
  }
  addShielding() {
    const cost = C.dose.shieldingCost[this.shielding];
    if (cost === undefined) return 'The shelter already has all the shielding it can hold.';
    if (this.regolith < cost) return `Not enough moon dirt. You need ${cost}.`;
    this.regolith -= cost;
    this.shielding++;
    this.flags.shielding = true;
    this.say(`Shelter covered with moon dirt. Storm dose there is now ${Math.round(this.shieldMult * 100)}% of before.`, 'good');
    return null;
  }
  repairPanelByHand(i) {
    if (this.panels[i]) return 'This panel works fine.';
    if (this.regolith < C.evaRepairRegolith) return `You need ${C.evaRepairRegolith} moon dirt to patch it.`;
    this.regolith -= C.evaRepairRegolith;
    this.panels[i] = true;
    if (this.robot.task === 'repair' && this.robot.target === i) this.robot.task = 'idle';
    this.say('Panel fixed. Power is flowing again.', 'good');
    return null;
  }
  collectSample(id) {
    if (this.samples.has(id)) return;
    this.samples.add(id);
    this.rp += C.science.sampleRP;
    this.say(`Rock sample collected. +${C.science.sampleRP} research points.`, 'good');
  }
  sendData() {
    if (!this.comms) return 'Turn the antenna on first.';
    if (!this.earthUp) return 'Earth is below the horizon. Wait for it to rise.';
    if (this.uploadReady > this.t) return `Antenna busy. Try again in ${Math.ceil(this.uploadReady - this.t)} s.`;
    if (this.power < C.power.sendData) return 'Not enough power to send.';
    this.power -= C.power.sendData;
    this.uploadReady = this.t + C.science.uploadCooldown;
    this.rp += C.science.uploadRP;
    this.fromEarth(`Science data received. +${C.science.uploadRP} research point. (It took ${C.commsRoundTrip / 2} s to reach us.)`, 'good', C.commsRoundTrip);
    return null;
  }
  askForecast() {
    if (!this.comms) return 'Turn the antenna on first.';
    if (!this.earthUp) return 'Earth is below the horizon.';
    if (this.power < C.power.forecast) return 'Not enough power to send the question.';
    this.power -= C.power.forecast;
    const next = this.nextStorm;
    const text = next
      ? `${next.flare ? `Our satellites saw a flare like the real ${flareLabel(next.flare)}. ` : ''}A ${next.strength.toLowerCase()} solar storm will reach you in about ${Math.max(0, Math.round(next.at - this.t - C.commsRoundTrip))} s. It is on your sun clock now.`
      : 'The Sun looks calm for the rest of your mission.';
    if (next) next.forecastAt ??= this.t + C.commsRoundTrip;
    this.fromEarth(text, next ? 'warn' : 'info', C.commsRoundTrip);
    return null;
  }

  // --- The clock ---
  tick(dt) {
    if (this.over) return;
    this.t += dt;
    const C_ = C, mode = this.mode;

    // Messages from Earth land after their light delay.
    this.pending = this.pending.filter(m => {
      if (m.at > this.t) return true;
      this.messages.push({ from: m.from, text: m.text, kind: m.kind, t: this.t });
      return false;
    });

    // Earth setting and rising.
    if (!this.flags.earthSet && this.t >= this.earthGap[0]) {
      this.flags.earthSet = true;
      this.say('Earth has dipped below the horizon. No messages from Mission Control for a while.', 'warn');
    }
    if (!this.flags.earthRise && this.t >= this.earthGap[1]) {
      this.flags.earthRise = true;
      this.say('Earth is back above the horizon.', 'info');
    }
    if (!this.flags.dusk && this.t >= this.day - 30) {
      this.flags.dusk = true;
      this.say('Sunset in 30 seconds. Is your battery ready for the night?', 'warn');
    }
    if (!this.flags.night && this.t >= this.day) {
      this.flags.night = true;
      this.say('The Sun has set. Heaters are on. Solar panels make nothing until sunrise.', 'warn');
    }

    this.updateStorms();

    // Space rocks.
    while (this.meteoroids.length && this.meteoroids[0] <= this.t) {
      this.meteoroids.shift();
      const ok = this.panels.map((p, i) => p ? i : -1).filter(i => i >= 0);
      if (ok.length) {
        const i = ok[Math.floor(this.t * 7.3) % ok.length];
        this.panels[i] = false;
        this.say(`A tiny space rock hit solar panel ${i + 1}! Fix it outside, or send the robot.`, 'bad');
      }
    }

    // Power.
    const P = C_.power;
    this.gen = this.panelsWorking * C_.solar.perPanel * this.sunlight * this.siteSun * mode.solar;
    this.demand = P.lifeSupport[this.ls] + (this.isNight ? P.heaters : 0) + (this.comms ? P.comms : 0)
      + (this.greenhouse ? P.greenhouse : 0) + (this.robotWorking ? P.robot : 0);
    const net = this.gen - this.demand;
    this.power = Math.min(C_.meters.powerMax, this.power + net * dt);
    if (this.power <= 0) {
      this.power = 0;
      this.share = this.demand > 0 ? Math.min(1, this.gen / this.demand) : 1;
      this.blackout += dt;
      if (!this.flags.brownout) { this.flags.brownout = true; this.say('Battery empty! Everything is running slowly. Turn something off.', 'bad'); }
    } else {
      this.share = 1;
      if (this.power > 10) this.flags.brownout = false;
    }

    // Life support.
    const A = C_.air;
    let make = A.make[this.ls];
    if (this.ls === 'boost') {
      if (this.regolith > 0) this.regolith = Math.max(0, this.regolith - A.boostRegolith * this.share * dt);
      else make = A.make.normal;
    }
    make = make * this.share + (this.greenhouse ? A.greenhouse * this.share : 0);
    const use = this.where === 'outside' ? 0 : A.crewUse * mode.crewDrain * (1 + A.coldPenalty * (1 - this.share));
    this.air = Math.min(C_.meters.airMax, this.air + (make - use) * dt);
    if (this.air <= 0) {
      this.air = 0;
      this.emergency += dt;
      if (!this.flags.emergency) { this.flags.emergency = true; this.say('Life support is empty! Backup air tanks are on. Turn power to Life Support!', 'bad'); }
      if (this.emergency >= A.emergencySeconds) return this.end(false, 'Life support ran out, so the crew had to leave the base.');
    } else if (this.air > 5) {
      this.flags.emergency = false;
    }
    this.lowestAir = Math.min(this.lowestAir, this.air);
    if (!this.flags.airLow && this.air < 25) { this.flags.airLow = true; this.say('Life support is getting low.', 'warn'); }
    if (this.air > 35) this.flags.airLow = false;

    // Suit air on moonwalks.
    if (this.where === 'outside') {
      this.suit -= dt;
      if (!this.flags.suitLow && this.suit < 20) { this.flags.suitLow = true; this.say('Suit air low! Head back to the airlock.', 'warn'); }
    } else {
      this.suit = Math.min(C_.suit.seconds, this.suit + C_.suit.refill * dt);
      this.flags.suitLow = false;
    }

    // Radiation.
    const D = C_.dose, storm = this.stormNow;
    let rate = this.where === 'outside' ? D.outside : D.inside;
    if (storm) {
      const k = STRENGTH[storm.strength];
      rate += this.where === 'outside' ? D.storm.outside * k : D.storm[this.where] * k * this.shieldMult;
    }
    this.dose += rate * dt;
    if (this.dose >= C_.meters.doseLimit) return this.end(false, 'Your radiation dose reached the mission limit, so the flight doctor called you home.');

    // Robot.
    const R = this.robot;
    if (R.offline > 0) {
      R.offline -= dt;
      if (R.offline <= 0) this.say('The robot is fixed and back on standby.', 'good');
    } else if (this.robotWorking) {
      const s = this.share;
      if (R.task === 'dig') this.regolith = Math.min(C_.meters.regolithMax, this.regolith + C_.robot.dig * s * dt);
      if (R.task === 'ice') {
        if (this.water === null) this.water = 0;
        this.water = Math.min(C_.meters.waterMax, this.water + C_.robot.ice * s * dt);
      }
      if (R.task === 'repair') {
        R.progress += s * dt;
        if (R.progress >= C_.robot.repairSeconds) {
          if (R.target >= 0) this.panels[R.target] = true;
          this.say(`The robot fixed solar panel ${R.target + 1}.`, 'good');
          R.task = 'idle';
          R.target = -1;
        }
      }
    }

    // Food (Ice and Greens).
    if (this.food !== null) {
      this.foodTimer += dt * mode.crewDrain;
      if (this.foodTimer >= C_.food.eatEvery) {
        this.foodTimer -= C_.food.eatEvery;
        this.food = Math.max(0, this.food - 1);
        this.say(this.food > 0 ? `Meal time. ${this.food} meals left.` : 'Out of food! Grow more in the greenhouse.', this.food > 1 ? 'info' : 'bad');
      }
      if (this.greenhouse && this.water > 0) {
        this.growTimer += dt * this.share;
        this.water = Math.max(0, this.water - C_.food.water * this.share * dt);
        if (this.growTimer >= C_.food.growEvery) {
          this.growTimer -= C_.food.growEvery;
          this.food++;
          this.say('Fresh greens are ready. +1 meal.', 'good');
        }
      } else if (this.greenhouse && !this.flags.dry) {
        this.flags.dry = true;
        this.say('The greenhouse is out of water. Send the robot for crater ice.', 'warn');
      }
      if (this.water > 1) this.flags.dry = false;
    }

    if (this.t >= this.total) this.finish();
  }

  updateStorms() {
    const lead = this.mode.warning;
    for (const s of this.storms) {
      if (s.done) continue;
      if (!s.warnedBy) {
        const toGo = s.at - this.t;
        if (toGo <= lead && this.comms && this.earthUp) {
          s.warnedBy = 'earth';
          this.fromEarth(`Solar storm warning! ${s.flare ? `A flare like the real ${flareLabel(s.flare)} just went off. ` : ''}A ${s.strength.toLowerCase()} storm of fast particles will reach you in about ${Math.round(toGo - C.commsRoundTrip / 2)} s. Get to the shelter and park the robot.`, 'bad');
        } else if (toGo <= C.ownSensorWarning) {
          s.warnedBy = 'sensor';
          this.say('Radiation sensor alarm! A solar storm is starting. Get to the shelter now!', 'bad');
        }
      }
      if (!s.started && this.t >= s.at) {
        s.started = true;
        this.flags.stormSeen = true;
        const robotOut = this.robot.task !== 'idle' && this.robot.offline <= 0;
        if (robotOut && !this.mode.robotAutoPark) {
          this.robot.offline = C.robot.stormDamageSeconds;
          this.robot.task = 'idle';
          this.say(`The robot was caught outside in the storm and needs ${C.robot.stormDamageSeconds} s of repairs.`, 'bad');
        } else if (robotOut) {
          this.say('The robot parked itself until the storm is over.', 'info');
        }
        this.say(`Solar storm! ${this.where === 'shelter' ? 'You are in the shelter. Stay there.' : 'Get to the shelter!'}`, 'bad');
      }
      if (s.started && !s.done && this.t >= s.at + s.length) {
        s.done = true;
        this.say('The solar storm is over. It is safe to leave the shelter.', 'good');
      }
    }
  }

  goalMet() {
    const m = this.mission;
    if (m.goalType === 'dose') return this.dose <= this.goalValue;
    if (m.goalType === 'food') return (this.food ?? 0) >= this.goalValue;
    if (m.goalType === 'battery') return this.power > 0;
    return true;
  }

  finish() {
    if (!this.goalMet()) {
      const why = {
        dose: `You made it to sunrise, but your dose was ${Math.round(this.dose)} and the goal was ${this.goalValue} or less.`,
        food: `You made it to sunrise, but you had ${this.food} meals and the goal was ${this.goalValue}.`,
        battery: `You made it to sunrise, but the battery ran out ${Math.round(this.blackout)} s before the Sun came back.`,
      }[this.mission.goalType];
      return this.end(false, why, true);
    }
    const S = C.stars;
    let stars = 1;
    if (this.lowestAir >= S.two.lowestAir && this.blackout <= S.two.maxBlackout) stars = 2;
    if (stars === 2 && this.lowestAir >= S.three.lowestAir && this.blackout <= S.three.maxBlackout && this.dose <= S.three.maxDose) stars = 3;
    this.end(true, 'The Sun is up and your base made it through.', true, stars);
  }

  end(won, reason, reachedSunrise = false, stars = 0) {
    this.over = { won, reason, reachedSunrise, stars };
  }

  // Tips for the debrief, from what actually happened.
  tips() {
    const tips = [];
    if (this.blackout > 0) tips.push(`The battery was empty for ${Math.round(this.blackout)} s. Try Eco life support at night, or turn the antenna off when you don't need it.`);
    if (this.lowestAir < 25) tips.push('Life support got low. Normal or Boost keeps air topped up while the Sun gives you spare power.');
    if (this.dose > 40) tips.push('Your dose was high. Hide in the shelter during storms and pile moon dirt on it.');
    if (this.storms.some(s => s.warnedBy === 'sensor')) tips.push('A storm surprised you. With the antenna on, Mission Control warns you much earlier.');
    if (this.mission.goalType === 'food' && (this.food ?? 0) < this.goalValue) tips.push('Keep the greenhouse lit and watered. The robot can haul crater ice.');
    if (!tips.length) tips.push('Great flying! Try a harder mode next.');
    return tips;
  }
}
