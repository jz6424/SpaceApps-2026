// The in-mission screen: meters, the sun clock, messages, hints, and the station panels.
import { CONFIG as C } from './config.js';
import { dataCard } from './nasa.js';

const $ = id => document.getElementById(id);

// Thin line icons (Feather style), 24 x 24.
export const ICONS = {
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.3A2.5 2.5 0 1 1 19.5 12H2"/>',
  radiation: '<circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 8.7 5l-6.9 4M3.3 7A10 10 0 0 1 12 2v8M7 20.7a10 10 0 0 0 10 0l-4-6.9h-2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.2-6"/>',
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  door: '<path d="M3 21h18M5 21V3h14v18M14 12h.01"/>',
  droplet: '<path d="M12 2.7 17.7 8.3a8 8 0 1 1-11.3 0z"/>',
  box: '<path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  ff: '<path d="m13 19 9-7-9-7zM2 19l9-7-9-7z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
};
export const icon = (name, size = 24) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fixed = v => (Math.round(v * 100) / 100).toFixed(2);

export function createHud({ sim, site, unlocks, api, flare }) {
  const hud = $('hud');
  hud.hidden = false;
  let open = null;        // station id with its panel showing
  let lastRender = 0;
  let seen = 0;           // messages already shown
  let speed = 1;
  const feed = [];
  const notice = text => { if (text) sim.say(text, 'warn'); };

  // Fixed parts of the HUD.
  $('hud-title').textContent = sim.mission.name;
  $('hud-mode').textContent = `${sim.modeName} mode`;
  $('feed').innerHTML = '';

  // --- Meters ---
  function meter(name, ico, label, value, max, text, state, extra = '') {
    const pct = Math.max(0, Math.min(100, value / max * 100));
    return `<div class="meter ${state}" data-m="${name}">
      <div class="m-top">${icon(ico, 20)}<span class="m-label">${label}</span><span class="m-val">${text}</span></div>
      <div class="bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(value)}"><i style="width:${pct}%"></i>${extra}</div>
      ${state !== 'ok' ? `<div class="m-state">${icon('alert', 14)} ${state === 'bad' ? 'Danger' : 'Low'}</div>` : ''}
    </div>`;
  }
  function renderMeters() {
    const net = sim.gen - sim.demand;
    const trend = v => v > 0.02 ? 'filling' : v < -0.02 ? 'draining' : 'steady';
    const pState = sim.power <= 0 ? 'bad' : sim.power < 25 ? 'warn' : 'ok';
    const aState = sim.air <= 10 ? 'bad' : sim.air < 25 ? 'warn' : 'ok';
    const storm = sim.stormNow;
    const dState = sim.dose >= 80 || (storm && sim.where !== 'shelter') ? 'bad' : sim.dose >= 50 ? 'warn' : 'ok';
    const goalMark = sim.mission.goalType === 'dose' ? `<b class="goal-mark" style="left:${sim.goalValue}%" title="Goal"></b>` : '';
    let html = meter('power', 'bolt', 'Power', sim.power, 100, `${Math.round(sim.power)}% · ${trend(net)}`, pState)
      + meter('air', 'wind', 'Life Support', sim.air, 100, `${Math.round(sim.air)}%`, aState)
      + meter('dose', 'radiation', 'Radiation dose', sim.dose, 100, `${Math.round(sim.dose)} of 100${sim.mission.goalType === 'dose' ? ` (goal ${sim.goalValue})` : ''}`, dState, goalMark);
    if (sim.where === 'outside') html += meter('suit', 'wind', 'Suit air', sim.suit, C.suit.seconds, `${Math.ceil(sim.suit)} s`, sim.suit < 20 ? 'bad' : sim.suit < 40 ? 'warn' : 'ok');
    const chips = [`${icon('box', 16)} Moon dirt ${Math.floor(sim.regolith)}`, `${icon('star', 16)} Research ${sim.rp}`];
    if (sim.food !== null) chips.push(`${icon('food', 16)} Meals ${sim.food} (goal ${sim.goalValue})`, `${icon('droplet', 16)} Water ${Math.floor(sim.water ?? 0)}`);
    html += `<div class="chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>`;
    $('meters').innerHTML = html;
  }

  // --- Sun clock across the top ---
  function renderClock() {
    const pDay = sim.day / sim.total * 100, pNow = Math.min(100, sim.t / sim.total * 100);
    const storms = sim.storms.map(s => {
      const known = s.warnedBy || s.started;
      return known ? `<b class="storm-mark" style="left:${s.at / sim.total * 100}%;width:${s.length / sim.total * 100}%" title="Solar storm"></b>` : '';
    }).join('');
    const earth = `<b class="earth-gap" style="left:${sim.earthGap[0] / sim.total * 100}%;width:${(sim.earthGap[1] - sim.earthGap[0]) / sim.total * 100}%" title="Earth below the horizon"></b>`;
    const when = sim.t < sim.day ? `${icon('sun', 18)} Sunset in ${clock(sim.timeToSunset)}` : `${icon('moon', 18)} Sunrise in ${clock(sim.timeToSunrise)}`;
    const storm = sim.stormNow;
    $('clock').innerHTML = `
      <div class="c-row"><span>${when}</span><span class="${sim.earthUp ? '' : 'dim'}">${icon('globe', 18)} Earth ${sim.earthUp ? 'up' : 'set'}</span>
      ${storm ? `<span class="hot">${icon('radiation', 18)} Storm! ${Math.ceil(storm.at + storm.length - sim.t)} s</span>` : ''}</div>
      <div class="track"><b class="night" style="left:${pDay}%"></b>${earth}${storms}<i style="left:${pNow}%"></i></div>`;
    $('storm-frame').hidden = !storm;
    $('storm-frame').classList.toggle('safe', sim.where === 'shelter');
    $('storm-text').textContent = sim.where === 'shelter' ? 'Solar storm: you are safe in the shelter' : 'Solar storm: get to the shelter!';
  }

  // --- Messages ---
  function renderFeed() {
    if (sim.messages.length === seen) return;
    for (; seen < sim.messages.length; seen++) feed.push(sim.messages[seen]);
    while (feed.length > 4) feed.shift();
    $('feed').innerHTML = feed.map(m => `<li class="msg ${m.kind}">
      <span class="from">${m.from === 'Mission Control' ? `${icon('radio', 14)} Mission Control <em>1.3 s light delay</em>` : m.from}</span>
      ${m.text}</li>`).join('');
  }

  // --- What to do next ---
  function hintText() {
    const f = sim.flags, next = sim.nextStorm, storm = sim.stormNow;
    if (storm && sim.where !== 'shelter') return 'Solar storm! Go to the Storm Shelter at the back of the Habitat.';
    if (storm) return 'Stay in the shelter until the storm is over.';
    if (next?.warnedBy && !next.started) return sim.where === 'shelter' ? 'Wait here for the storm.' : 'Storm coming! Park the robot (Robot Map), then go to the Storm Shelter.';
    if (sim.where === 'outside' && sim.suit < 35) return 'Suit air low. Walk back to the airlock door (the yellow steps).';
    if (sim.where === 'outside') {
      const broken = sim.panels.indexOf(false);
      if (broken >= 0) return `Walk to solar panel ${broken + 1} (the red light) and press E to fix it.`;
      return 'Collect glowing rock samples for research points. Watch your suit air.';
    }
    if (sim.power <= 0) return 'Battery empty! Open Power and switch something off, or set Life Support to Eco.';
    if (sim.air < 20) return 'Life support is low. Set it to Normal or Boost.';
    if (sim.panels.includes(false)) return 'A solar panel is broken. Fix it outside (Airlock) or send the robot (Robot Map).';
    if (sim.mission.tutorial) {
      if (!f.open_Power) return 'Click the Power label (or walk up and press E) to see your battery.';
      if (!f.comms) return 'Open Comms and turn the antenna on, so Mission Control can warn you about storms.';
      if (!f.robot) return 'Open the Robot Map and send the robot to dig moon dirt.';
    }
    if (sim.food !== null) {
      if (!sim.greenhouse) return 'Open the Galley and turn on the grow lights.';
      if ((sim.water ?? 0) < 3 && sim.robot.task !== 'ice') return 'The plants need water. Send the robot for crater ice.';
    }
    if (sim.mission.goalType === 'dose' && sim.shielding < 2 && sim.regolith >= C.dose.shieldingCost[sim.shielding] && unlocks.includes('Shielding')) {
      return 'You have enough moon dirt to add shielding at the Storm Shelter.';
    }
    if (sim.t < sim.day && sim.timeToSunset < 40 && sim.ls !== 'eco') return 'Night is coming. Set Life Support to Eco and turn off what you don\'t need.';
    if (sim.t >= sim.day) return `Make the battery last until sunrise. Press F to speed up time (now ${speed}x).`;
    return sim.mission.goal;
  }

  // --- Station panels ---
  const btn = (act, label, { arg = '', on = false, disabled = false, note = '' } = {}) =>
    `<button class="opt ${on ? 'on' : ''}" data-act="${act}" data-arg="${arg}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>
      <span class="opt-label">${label}${on ? ' <small>(on)</small>' : ''}</span>${note ? `<span class="opt-note">${note}</span>` : ''}</button>`;
  const P = C.power;

  const STATIONS = {
    Power: () => {
      const net = sim.gen - sim.demand, fc = sim.batteryForecast;
      return {
        title: 'Power', icon: 'bolt',
        body: `<p class="big">${Math.round(sim.power)}% battery</p>
        <dl class="facts">
          <dt>Solar panels make</dt><dd>${fixed(sim.gen)} per second (${sim.panelsWorking} of 3 working)</dd>
          <dt>Base is using</dt><dd>${fixed(sim.demand)} per second</dd>
          <dt>Battery</dt><dd>${net >= 0 ? 'charging' : `lasts about ${clock(fc)} at this rate`}</dd>
          <dt>Next sunrise</dt><dd>${sim.t < sim.day ? `${clock(sim.timeToSunrise)} away (sunset first)` : `in ${clock(sim.timeToSunrise)}`}</dd>
        </dl>
        <h4>Switch things on or off</h4>
        <div class="opts">
          ${btn('comms', 'Antenna', { arg: sim.comms ? 'off' : 'on', on: sim.comms, note: `Uses ${P.comms}/s. Hears storm warnings from Earth.` })}
          ${sim.food !== null || unlocks.includes('Greenhouse') ? btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${P.greenhouse}/s. Grows food, adds a little air.` }) : ''}
        </div>
        <p class="fine">Always on: Life Support (${P.lifeSupport[sim.ls]}/s on ${sim.ls}), heaters at night (${P.heaters}/s)${sim.robotWorking ? `, robot (${P.robot}/s)` : ''}.</p>`,
      };
    },
    LifeSupport: () => ({
      title: 'Life Support', icon: 'wind',
      body: `<p class="big">${Math.round(sim.air)}% air and water</p>
      <p>You use about ${fixed(C.air.crewUse * sim.mode.crewDrain)} per second. Pick how hard the machine works:</p>
      <div class="opts">
        ${btn('ls', 'Eco', { arg: 'eco', on: sim.ls === 'eco', note: `Uses ${P.lifeSupport.eco} power/s. Makes ${C.air.make.eco}/s, a bit less than you breathe.` })}
        ${btn('ls', 'Normal', { arg: 'normal', on: sim.ls === 'normal', note: `Uses ${P.lifeSupport.normal} power/s. Makes ${C.air.make.normal}/s, a little more than you breathe.` })}
        ${btn('ls', 'Boost', { arg: 'boost', on: sim.ls === 'boost', note: `Uses ${P.lifeSupport.boost} power/s and moon dirt. Makes ${C.air.make.boost}/s.` })}
      </div>
      <p class="fine">If the battery runs empty, everything runs slowly, the base gets cold and the air goes stale faster.</p>`,
    }),
    Comms: () => ({
      title: 'Comms', icon: 'radio',
      body: `<p class="big">Earth is ${sim.earthUp ? 'above' : 'below'} the horizon</p>
      <div class="opts">
        ${btn('comms', 'Antenna', { arg: sim.comms ? 'off' : 'on', on: sim.comms, note: `Uses ${P.comms} power/s. Mission Control warns you about storms ${sim.mode.warning} s early.` })}
        ${btn('forecast', 'Ask for a space weather forecast', { disabled: !sim.comms, note: `Answer takes ${C.commsRoundTrip} s: there and back at the speed of light.` })}
        ${btn('upload', 'Send science data', { disabled: !sim.comms, note: `Costs ${P.sendData} power. +${C.science.uploadRP} research point.` })}
      </div>
      <p class="fine">Every message takes about 1.3 s to cross the 384,400 km to Earth. ${flare ? `Today's storm is modelled on a real ${flare.classType} flare from ${flare.date}${flare.live ? ' (live from NASA DONKI)' : ' (from NASA DONKI records)'}.` : ''}</p>`,
    }),
    Food: () => {
      if (sim.food === null) {
        return {
          title: 'Galley', icon: 'food',
          body: `<p class="big">Food: plenty</p><p>The cargo lander brought enough meals for this mission.</p>
          ${unlocks.includes('Greenhouse') ? `<div class="opts">${btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${P.greenhouse} power/s. Plants add a little air.` })}</div>` : '<p class="fine">Unlock the Greenhouse with research points to grow your own food.</p>'}`,
        };
      }
      return {
        title: 'Galley and greenhouse', icon: 'leaf',
        body: `<p class="big">${sim.food} meals left (goal: ${sim.goalValue} at sunrise)</p>
        <dl class="facts"><dt>Water for plants</dt><dd>${Math.floor(sim.water)} of ${C.meters.waterMax}</dd>
        <dt>Next meal eaten</dt><dd>in ${Math.ceil((C.food.eatEvery - sim.foodTimer) / sim.mode.crewDrain)} s</dd>
        <dt>Greens ready</dt><dd>${sim.greenhouse && sim.water > 0 ? `in ${Math.ceil(C.food.growEvery - sim.growTimer)} s` : 'not growing'}</dd></dl>
        <div class="opts">${btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${P.greenhouse} power/s and water. One meal every ${C.food.growEvery} s.` })}</div>
        <p class="fine">Plants on the Space Station grow under LED lights in NASA's Veggie garden.</p>`,
      };
    },
    MapTable: () => {
      const R = sim.robot;
      const status = R.offline > 0 ? `being fixed (${Math.ceil(R.offline)} s)` : sim.stormNow && R.task !== 'idle' ? 'sheltering from the storm' : { idle: 'parked at the base', dig: 'digging moon dirt', ice: 'hauling crater ice', repair: `fixing panel ${R.target + 1}` }[R.task];
      const broken = sim.panels.indexOf(false);
      return {
        title: 'Robot Map', icon: 'map',
        body: `<div class="maprow"><canvas id="robot-map" width="200" height="200" aria-label="Map of the base from NASA data: the base, the ice crater, and the robot"></canvas>
        <div><p class="big">Robot: ${status}</p>
        <ul class="legend"><li><b class="dot base"></b> Your base</li><li><b class="dot ice"></b> Shadowed ice (${site.iceDistance} m away)</li><li><b class="dot bot"></b> Robot</li></ul>
        <p class="fine">Map: NASA LOLA sunlight (bright = sunny) and permanent shadow (blue).</p></div></div>
        <div class="opts">
          ${btn('robot', 'Park at base', { arg: 'idle', on: R.task === 'idle', note: 'Uses no power. Safe in storms.' })}
          ${btn('robot', 'Dig moon dirt', { arg: 'dig', on: R.task === 'dig', note: `Uses ${P.robot} power/s. +${C.robot.dig} dirt/s for shielding, repairs and Boost.` })}
          ${sim.water !== null ? btn('robot', 'Haul crater ice', { arg: 'ice', on: R.task === 'ice', note: `Uses ${P.robot} power/s. +${C.robot.ice} water/s for the plants.` }) : ''}
          ${btn('robot', `Fix panel ${broken >= 0 ? broken + 1 : ''}`, { arg: 'repair', on: R.task === 'repair', disabled: broken < 0 && R.task !== 'repair', note: `Costs ${C.robot.repairRegolith} moon dirt, takes ${C.robot.repairSeconds} s. No moonwalk needed.` })}
        </div>
        <p class="fine">Robots must be parked before a solar storm${sim.mode.robotAutoPark ? ' (in Cadet mode it parks itself)' : ', or the storm damages them'}.</p>`,
        after: drawMap,
      };
    },
    Shelter: () => {
      const has = unlocks.includes('Shielding');
      const cost = C.dose.shieldingCost[sim.shielding];
      const k = sim.shieldMult;
      return {
        title: 'Storm Shelter', icon: 'shield',
        body: `<p class="big">${sim.stormNow ? 'Storm now! Stay here.' : 'Hide here during solar storms'}</p>
        <p>The shelter is the back of the Habitat, behind the water tanks and supplies. Extra dose per second in a strong storm:</p>
        <dl class="facts"><dt>Outside</dt><dd>${C.dose.storm.outside}</dd><dt>Rest of Habitat</dt><dd>${fixed(C.dose.storm.inside * k)}</dd><dt>Here in the shelter</dt><dd>${fixed(C.dose.storm.shelter * k)}</dd></dl>
        ${has ? `<div class="opts">${btn('shield', `Pile on moon dirt (level ${sim.shielding + 1})`, { disabled: cost === undefined || sim.regolith < cost, note: cost === undefined ? 'Fully shielded.' : `Costs ${cost} moon dirt (you have ${Math.floor(sim.regolith)}). Cuts storm dose inside.` })}</div>`
          : '<p class="fine">Unlock Regolith Shielding with research points to pile moon dirt on the Habitat.</p>'}
        <p class="fine">Shielding level: ${sim.shielding} of 2.</p>`,
      };
    },
    Airlock: () => ({
      title: 'Airlock', icon: 'door',
      body: `<p class="big">Go on a moonwalk?</p>
      <p>Outside you can fix solar panels by hand and collect rock samples. Your suit holds ${C.suit.seconds} s of air, and your radiation dose rises about 3 times faster than inside.</p>
      <div class="opts">${btn('outside', 'Suit up and go outside', { disabled: !!sim.stormNow, note: sim.stormNow ? 'Not during a solar storm!' : `Suit air: ${Math.floor(sim.suit)} s.` })}</div>
      <p class="fine">Come back in through the door at the top of the yellow steps.</p>`,
    }),
  };

  function drawMap() {
    const cv = $('robot-map');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const { maps } = site, half = 90; // pixels each way = 450 m
    const r0 = site.row - half, c0 = site.col - half, size = half * 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(maps.sun.img, c0, r0, size, size, 0, 0, 200, 200);
    const img = ctx.getImageData(0, 0, 200, 200);
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const p = maps.psrAt(r0 + y * size / 200, c0 + x * size / 200);
      if (p > 0.5) { const i = (y * 200 + x) * 4; img.data[i] = 46; img.data[i + 1] = 150; img.data[i + 2] = 245; }
    }
    ctx.putImageData(img, 0, 0);
    const toMap = (wx, wz) => [(wx - site.worldX) / 5 / size * 200 + 100, (wz - site.worldZ) / 5 / size * 200 + 100];
    const dot = ([x, y], fill, r) => { ctx.fillStyle = fill; ctx.strokeStyle = '#07173F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(Math.max(4, Math.min(196, x)), Math.max(4, Math.min(196, y)), r, 0, 7); ctx.fill(); ctx.stroke(); };
    dot([100, 100], '#EAFE07', 7);
    dot(toMap(site.ice.x, site.ice.z), '#FFFFFF', 6);
    dot(toMap(site.robot().x, site.robot().z), '#E43700', 5);
  }

  function renderStation(force = false) {
    if (!open) return;
    const view = STATIONS[open]();
    const focused = document.activeElement?.closest?.('#station [data-act]');
    const key = focused ? `${focused.dataset.act}|${focused.dataset.arg}` : null;
    if (force) $('station-title').innerHTML = `${icon(view.icon, 24)} ${view.title}`;
    $('station-body').innerHTML = view.body;
    view.after?.();
    if (key) {
      const [act, arg] = key.split('|');
      $('station-body').querySelector(`[data-act="${act}"][data-arg="${arg}"]`)?.focus();
    }
  }

  const ACTIONS = {
    comms: arg => sim.setComms(arg === 'on'),
    greenhouse: arg => sim.setGreenhouse(arg === 'on'),
    ls: arg => sim.setLifeSupport(arg),
    forecast: () => notice(sim.askForecast()),
    upload: () => notice(sim.sendData()),
    robot: arg => notice(sim.setRobot(arg)),
    shield: () => notice(sim.addShielding()),
    outside: () => { if (sim.stormNow) return; close(); api.goOutside(); },
  };
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    ACTIONS[b.dataset.act]?.(b.dataset.arg);
    renderStation();
  }
  $('station').addEventListener('click', onClick);
  const closeBtn = () => close();
  $('station-close').addEventListener('click', closeBtn);

  function openStation(id) {
    open = id;
    sim.flags[`open_${id}`] = true;
    $('station').hidden = false;
    renderStation(true);
    $('station').querySelector('button.opt:not([disabled])')?.focus();
  }
  function close() {
    open = null;
    $('station').hidden = true;
    document.activeElement?.blur?.();
  }

  function toggleSpeed() {
    speed = speed === 1 ? 3 : 1;
    api.setSpeed(speed);
    $('speed').setAttribute('aria-pressed', speed > 1);
    $('speed').innerHTML = `${icon('ff', 18)} ${speed}x speed`;
  }
  const speedBtn = () => toggleSpeed();
  $('speed').addEventListener('click', speedBtn);
  $('speed').innerHTML = `${icon('ff', 18)} 1x speed`;
  $('speed').setAttribute('aria-pressed', 'false');
  const backBtn = () => api.goInside();
  $('back-in').addEventListener('click', backBtn);

  function frame(near) {
    // A storm forces normal speed, so nobody fast-forwards into danger.
    if (speed > 1 && (sim.stormNow || sim.nextStorm?.warnedBy)) toggleSpeed();
    renderFeed();
    const now = performance.now();
    if (now - lastRender < 200) return;
    lastRender = now;
    renderMeters();
    renderClock();
    $('hint').textContent = hintText();
    $('prompt').hidden = !near || !!open;
    if (near) $('prompt').innerHTML = `Press <kbd>E</kbd> to ${near.label}`;
    $('back-in').hidden = sim.where !== 'outside';
    if (open && now % 1000 < 220) renderStation();
  }

  return {
    frame, openStation, close, toggleSpeed,
    notice,
    busy: () => !!open,
    get open() { return open; },
    destroy() {
      close();
      hud.hidden = true;
      $('storm-frame').hidden = true;
      $('station').removeEventListener('click', onClick);
      $('station-close').removeEventListener('click', closeBtn);
      $('speed').removeEventListener('click', speedBtn);
      $('back-in').removeEventListener('click', backBtn);
    },
    dataCard: () => dataCard(sim.mission.dataCard, site),
  };
}
