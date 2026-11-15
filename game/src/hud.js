// The in-mission screen: meters, the sun clock, messages, hints, and the station panels.
import { CONFIG as C, MISSIONS } from './config.js';
import { flareLabel } from './sim.js';
import { isTouch, forTouch } from './touch.js';
import { airlockSound, hologramSound, messageCue, soundOn, setSound, warningSound, lowPowerSound, stormSound, sampleSound, dataSentSound, buildSound } from './sound.js';

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
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  door: '<path d="M3 21h18M5 21V3h14v18M14 12h.01"/>',
  droplet: '<path d="M12 2.7 17.7 8.3a8 8 0 1 1-11.3 0z"/>',
  box: '<path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  ff: '<path d="m13 19 9-7-9-7zM2 19l9-7-9-7z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/>',
  scoop: '<path d="M4 20 13 11"/><path d="m11 7 6 6 3.5-2.5c1.2-3.2-.8-6.8-4.5-7.5z"/>',
  // Hotbar tools, drawn in the instrument style (square ends, see .slot-icon in ui.css).
  shovel: '<path d="M16.5 3.5 20.5 7.5"/><path d="M18.5 5.5 10.5 13.5"/><path d="m8 11 5 5-3.5 4.5H4.5L3.5 19.5v-5z"/>',
  sampler: '<path d="M9 3h6v3l1.5 1.5V19a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V7.5L9 6z"/><path d="M9 6h6"/><path d="M7.5 11h3.5M7.5 14h2.5M7.5 17h3.5"/><path d="M14 12.5v4"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
};
export const icon = (name, size = 24) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fixed = v => (Math.round(v * 100) / 100).toFixed(2);
// Every rate in the game is written the same way: "0.42 power per second".
const per = (v, what) => `${fixed(v)} ${what} per second`;

export function createHud({ sim, site, unlocks, api, liveFlares, points = 0 }) {
  const hud = $('hud');
  hud.hidden = false;
  let open = null;        // station id with its panel showing
  let lastRender = 0;
  let seen = 0;           // messages already shown
  let speed = 1;
  const notice = text => { if (text) sim.say(text, 'warn'); };
  // The meters, clock and so on are redrawn five times a second. Most of those times nothing has
  // changed, so the page is only touched when the drawing is different from what is showing.
  const showing = new Map();
  const put = (id, html) => {
    if (showing.get(id) === html) return false;
    showing.set(id, html);
    $(id).innerHTML = html;
    return true;
  };

  // Fixed parts of the HUD.
  $('hud-title').textContent = sim.mission.name;
  $('hud-mode').textContent = `· ${sim.modeName} mode`;
  $('mc-pin').innerHTML = icon('target', 18);
  $('settings').innerHTML = icon('gear', 24);
  // The mission is a drawer on the right edge. Its handle is an arrow: ">" pushes it away, "<" pulls
  // it back. Every mission starts with it out.
  const showMission = on => {
    $('mission-drawer').classList.toggle('shut', !on);
    $('mission-card').inert = !on; // nothing inside can be reached while it is tucked away
    const handle = $('mission-handle'), say = on ? 'Hide the mission' : 'Show the mission';
    handle.innerHTML = icon(on ? 'right' : 'left', 24);
    handle.setAttribute('aria-expanded', on);
    handle.setAttribute('aria-label', say);
    handle.title = say;
  };
  const missionBtn = () => showMission($('mission-drawer').classList.contains('shut'));
  $('mission-handle').addEventListener('click', missionBtn);
  // On a small phone the drawer starts tucked away, so it doesn't cover the base.
  showMission(!(isTouch && Math.min(innerWidth, innerHeight) < 560));

  // The speed, sound and full screen buttons live in the Game paused panel (the gear button, or Esc).
  // Full screen button (F11 works too).
  const fsBtn = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  $('fullscreen').addEventListener('click', fsBtn);

  // --- Hotbar: the tools you have, at the bottom of the screen ---
  // A number key (or a click) puts a tool in the astronaut's right hand; the same key again puts
  // it away. Only tools you own are shown: the Sample kit from the start, and the Building tool
  // once Regolith Shielding is researched. Picking up a rock takes the Sample kit out by itself.
  const SLOTS = [
    { id: 'scoop', name: 'Sample kit', icon: 'sampler' },
    unlocks.includes('Shielding') && { id: 'builder', name: 'Building tool', icon: 'shovel' },
  ].filter(Boolean);
  let held = -1;
  const holding = () => SLOTS[held]?.id ?? null;
  function renderHotbar() {
    $('hotbar').innerHTML = SLOTS.map((slot, i) => `<button class="slot${i === held ? ' on' : ''}" data-slot="${i}" data-tool="${slot.id}"
        aria-pressed="${i === held}" aria-label="Slot ${i + 1}: ${slot.name}" title="${slot.name}">
        <span class="slot-key">${i + 1}</span><span class="slot-icon">${icon(slot.icon, 28)}</span><i class="slot-bar"></i></button>`).join('');
    $('hotbar-name').textContent = held >= 0 ? SLOTS[held].name : '';
    renderBuild();
  }
  function selectSlot(i) {
    if (!SLOTS[i]) return;
    held = held === i ? -1 : i;
    api.hold(holding());
    renderHotbar();
  }
  function holdTool(id) {
    const i = SLOTS.findIndex(slot => slot.id === id);
    if (i < 0 || i === held) return;
    held = i;
    api.hold(id);
    renderHotbar();
  }
  const slotBtn = e => {
    const b = e.target.closest('[data-slot]');
    if (!b || b.disabled) return;
    selectSlot(Number(b.dataset.slot));
    document.activeElement?.blur?.(); // so Space keeps meaning "jump", not "press this button again"
  };
  $('hotbar').addEventListener('click', slotBtn);

  // --- The Building tool: with it in your hand, a card over the hotbar offers what can be built ---
  // For now that is one thing, the regolith shield over the Storm Shelter, in two levels. It is
  // paid for in moon dirt, which the robot has to dig first. The card's parts stay in the page
  // and only their words change, so a click on Build is never lost to a redraw.
  const pct = v => `${Math.round(v * 100)}%`;
  function renderBuild() {
    const on = holding() === 'builder';
    $('build-card').hidden = !on;
    if (!on) return;
    const level = sim.shielding, cost = sim.shieldCost, have = Math.floor(sim.regolith), done = cost === undefined;
    const levels = C.dose.shielding.length - 1, now = C.dose.shielding[level], next = C.dose.shielding[level + 1];
    const title = done ? 'Regolith shield: finished' : `Regolith shield: level ${level + 1} of ${levels}`;
    const text = done
      ? `The Storm Shelter is buried in moon dirt. A storm in there gives you ${pct(now)} of the dose it did.`
      : `${level ? 'Bury the Storm Shelter in moon dirt, right over the top' : 'Bank moon dirt up the sides of the Storm Shelter'}. Storm dose in the shelter goes from ${pct(now)} to ${pct(next)}.`;
    const short = !done && have < cost;
    const digging = sim.robotWorking && sim.robot.task === 'dig';
    const wait = Math.ceil((cost - sim.regolith) / (C.robot.dig * sim.share || 1));
    const need = done ? 'Nothing more to build here.'
      : `Needs ${cost} moon dirt. You have ${have}.${!short ? '' : digging ? ` The robot is digging: about ${wait} s to go.` : ' Send the robot to dig at the Robot Map.'}`;
    const go = short ? 'Not enough moon dirt yet' : isTouch ? 'Build it' : 'Build it <kbd>B</kbd>';
    if (showing.get('build-title') !== title) { showing.set('build-title', title); $('build-title').innerHTML = `${icon('shovel', 20)} ${title}`; }
    for (const [id, value] of [['build-text', text], ['build-need', need]]) {
      if (showing.get(id) !== value) { showing.set(id, value); $(id).textContent = value; }
    }
    if (showing.get('build-go') !== go) { showing.set('build-go', go); $('build-go').innerHTML = go; }
    $('build-go').hidden = done;
    $('build-go').disabled = short;
    $('build-bar').hidden = done;
    $('build-bar').setAttribute('aria-valuenow', Math.min(have, cost ?? have));
    $('build-bar').setAttribute('aria-valuemax', cost ?? have);
    $('build-bar').firstElementChild.style.width = `${done ? 100 : Math.min(100, sim.regolith / cost * 100)}%`;
  }
  function build() {
    if (holding() !== 'builder' || open) return;
    const no = sim.addShielding();
    if (no) notice(no); else buildSound();
    renderBuild();
  }
  const buildBtn = () => { build(); document.activeElement?.blur?.(); };
  $('build-go').addEventListener('click', buildBtn);
  renderHotbar();

  // --- Research points bar: fills toward the cheapest item you have not unlocked yet ---
  function renderRp() {
    const total = points + sim.rp;
    const next = MISSIONS.map(m => m.requires).filter(r => r && !unlocks.includes(r.id)).sort((a, b) => a.cost - b.cost)[0];
    const goal = next?.cost ?? 0;
    const pct = next ? Math.min(100, total / goal * 100) : 100;
    put('rp-bar', `
      <div class="rp-top">${icon('star', 16)}<span>Research points</span><b>${next ? `${total} / ${goal}` : `${total} · MAX`}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${next ? `<div class="rp-next">Next unlock: ${next.name}</div>` : ''}`);
  }

  // --- Low suit air alert ---
  // It pulses a few times when it appears, then stays steady. It goes the moment it no longer
  // applies (back inside, or the suit refilled). "Getting low" also goes after a few seconds;
  // "almost gone" stays until you are back in.
  let airLevel = 0, airShownAt = 0; // 0 fine, 1 getting low, 2 almost gone
  function checkSuitAir(now) {
    const t = $('air-toast');
    const level = sim.where !== 'outside' ? 0 : sim.suit < 20 ? 2 : sim.suit < 40 ? 1 : 0;
    if (level > airLevel) {
      t.textContent = level === 2 ? 'Suit air almost gone. Back to the airlock now!' : 'Suit air is getting low';
      t.className = level === 2 ? 'bad' : 'warn';
      t.hidden = false;
      t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; // pulse again from the start
      warningSound(level);
      airShownAt = now;
    }
    if (!t.hidden && (level === 0 || (level === 1 && now - airShownAt > 8000))) t.hidden = true;
    airLevel = level;
  }
  $('feed').innerHTML = '';

  // --- Meters ---
  function meter(name, ico, label, value, max, text, state, extra = '', note = '', more = '') {
    const pct = Math.max(0, Math.min(100, value / max * 100));
    return `<div class="meter ${state}" data-m="${name}">
      <div class="m-top">${icon(ico, 20)}<span class="m-label">${label}${more}</span><span class="m-val">${text}</span></div>
      <div class="bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(value)}"><i style="width:${pct}%"></i>${extra}</div>
      ${state !== 'ok' ? `<div class="m-state">${icon('alert', 14)} ${state === 'bad' ? 'Danger' : 'Low'}</div>` : ''}
      ${note ? `<div class="m-note">${note}</div>` : ''}
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
    // The little arrow on Power says the bar opens a list (see "Where your power goes" below).
    let html = meter('power', 'bolt', 'Power', sim.power, 100, `${Math.round(sim.power)}% · ${trend(net)}`, pState, '', '', `<span class="m-more">${icon(usesOpen !== isTouch ? 'down' : 'up', 14)}</span>`)
      + meter('air', 'wind', 'Life Support', sim.air, 100, `${Math.round(sim.air)}%`, aState)
      + meter('dose', 'radiation', 'Radiation dose', sim.dose, 100, `${Math.round(sim.dose)} / 100`, dState, goalMark, sim.mission.goalType === 'dose' ? `Goal: finish at ${sim.goalValue} or less (the white mark)` : '');
    if (sim.where === 'outside') html += meter('suit', 'wind', 'Suit air', sim.suit, C.suit.seconds, `${Math.ceil(sim.suit)} s`, sim.suit < 20 ? 'bad' : sim.suit < 40 ? 'warn' : 'ok');
    // The button over the Power bar is as tall as the bar's own block, which grows with a Low sign.
    if (put('meter-rows', html)) $('power-btn').style.height = `${$('meter-rows').firstElementChild.offsetHeight}px`;
  }

  // --- Where your power goes: click the Power bar and a list opens above it ---
  // Every machine that can draw power is on the list, with how much it takes each second. The ones
  // that are off stay on it, dimmed, so you can see what else there is to switch.
  let usesOpen = false;
  const cap = word => word[0].toUpperCase() + word.slice(1);
  function powerUses() {
    const R = sim.robot, lights = sim.food !== null || unlocks.includes('Greenhouse');
    const job = { dig: 'digging moon dirt', ice: 'hauling crater ice', repair: 'fixing a panel' }[R.task];
    return [
      { name: 'Life Support', state: cap(sim.ls), on: true, use: P.lifeSupport[sim.ls], where: 'Life Support station', note: `${sim.ls} setting, always on` },
      { name: 'Heaters', state: sim.isNight ? 'on at night' : 'off until night', on: sim.isNight, use: P.heaters, where: 'automatic, there is no station for it', note: 'switch on at night' },
      { name: 'Antenna', state: sim.comms ? 'on' : 'off', on: sim.comms, use: P.comms, where: 'Comms station', note: 'on' },
      lights && { name: 'Grow lights', state: sim.greenhouse ? 'on' : 'off', on: sim.greenhouse, use: P.greenhouse, where: 'Galley', note: 'on' },
      { name: 'Robot', state: sim.robotWorking ? job : 'parked', on: sim.robotWorking, use: P.robot, where: 'Robot Map station', note: 'working outside' },
    ].filter(Boolean);
  }
  function renderUses() {
    if (!usesOpen) return;
    const uses = powerUses(), most = Math.max(...Object.values(P.lifeSupport), P.heaters);
    const net = sim.gen - sim.demand, fc = sim.batteryForecast;
    put('pu-body', `
      <ul class="pu">${uses.map(u => `<li class="${u.on ? 'on' : 'off'}">
        <span class="pu-name">${u.name} <small>${u.state}</small></span>
        <span class="pu-bar" aria-hidden="true"><i style="width:${u.on ? Math.round(u.use / most * 100) : 0}%"></i></span>
        <b>${u.on ? fixed(u.use) : '0'}</b></li>`).join('')}</ul>
      <dl class="pu-sum">
        <dt>All together</dt><dd>${per(sim.demand, 'power')}</dd>
        <dt>Solar panels make</dt><dd>${per(sim.gen, 'power')}</dd>
        <dt>Battery</dt><dd>${sim.power <= 0 ? 'empty: everything runs slowly' : net >= 0 ? 'charging' : `draining, lasts about ${clock(fc)}`}</dd>
      </dl>
      <p class="fine">The numbers are power used each second. To save power, switch things off or down at their stations.</p>`);
  }
  function showUses(on) {
    usesOpen = on;
    $('power-uses').hidden = !on;
    $('power-btn').setAttribute('aria-expanded', on);
    $('power-btn').title = on ? 'Hide the list' : 'See what is using power';
    showing.delete('pu-body');
    renderMeters();
    renderUses();
  }
  const usesBtn = () => { showUses(!usesOpen); document.activeElement?.blur?.(); };
  const usesClose = () => showUses(false);
  $('power-btn').addEventListener('click', usesBtn);
  $('pu-close').addEventListener('click', usesClose);
  $('pu-title').innerHTML = `${icon('bolt', 20)} Where your power goes`;
  $('pu-close').innerHTML = icon('x', 18);

  // --- Supplies, in the corner above the research points ---
  function renderSupplies() {
    const rows = [['box', 'Moon dirt', Math.floor(sim.regolith)]];
    if (sim.mission.goalType === 'samples') rows.unshift(['star', 'Rock samples', `${sim.samples.size} <small>goal ${sim.goalValue}</small>`]);
    if (sim.food !== null) rows.push(['food', 'Meals', `${sim.food} <small>goal ${sim.goalValue}</small>`], ['droplet', 'Water', Math.floor(sim.water ?? 0)]);
    put('supplies', rows.map(([ico, label, value]) => `<div class="supply">${icon(ico, 18)}<span>${label}</span><b>${value}</b></div>`).join(''));
  }

  // --- Sun clock across the top ---
  function renderClock() {
    const pDay = sim.day / sim.total * 100, pNow = Math.min(100, sim.t / sim.total * 100);
    const storms = sim.storms.map(s => {
      // A storm shows up once you have been warned, or once a forecast you asked for has arrived.
      const known = s.warnedBy || s.started || (s.forecastAt !== null && sim.t >= s.forecastAt);
      return known ? `<b class="storm-mark" style="left:${s.at / sim.total * 100}%;width:${s.length / sim.total * 100}%" title="Solar storm${s.flare ? `, sized from the real ${flareLabel(s.flare)}` : ''}"></b>` : '';
    }).join('');
    const earth = `<b class="earth-gap" style="left:${sim.earthGap[0] / sim.total * 100}%;width:${(sim.earthGap[1] - sim.earthGap[0]) / sim.total * 100}%" title="Earth below the horizon"></b>`;
    const when = sim.t < sim.day ? `${icon('sun', 18)} Sunset in ${clock(sim.timeToSunset)}` : `${icon('moon', 18)} Sunrise in ${clock(sim.timeToSunrise)}`;
    const storm = sim.stormNow;
    put('clock', `
      <div class="c-row"><span>${when}</span><span class="${sim.earthUp ? '' : 'dim'}">${icon('globe', 18)} Earth ${sim.earthUp ? 'up' : 'set'}</span>
      ${storm ? `<span class="hot">${icon('radiation', 18)} Storm! ${Math.ceil(storm.at + storm.length - sim.t)} s</span>` : ''}</div>
      <div class="track"><b class="night" style="left:${pDay}%"></b>${earth}${storms}<i style="left:${pNow}%"></i></div>`);
    $('storm-frame').hidden = !storm;
    $('storm-frame').classList.toggle('safe', sim.where === 'shelter');
    // Once you are in the shelter there is nothing left to warn about, so the words go; the thin
    // blue edge stays to show the storm is still on.
    $('storm-text').textContent = 'Solar storm: get to the shelter';
    $('storm-text').hidden = sim.where === 'shelter';
  }

  // --- Messages ---
  // Each message types itself out, letter by letter, with a short sound when it starts. The newest
  // is at the bottom; older ones slide up and fade at the top edge, and the list scrolls back.
  const TYPE_RATE = 90; // letters per second
  const instant = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const list = $('feed');
  let typing = [];        // messages still being typed: { out, text, start }
  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 12;
  const fadeTop = () => list.classList.toggle('faded', list.scrollTop > 4);
  list.addEventListener('scroll', fadeTop);
  // After a while with nothing new the list fades back (not away). The mouse over it, a finger on
  // it, scrolling it or a new message brings it back.
  let feedAwake = performance.now(), overFeed = false;
  const wakeFeed = () => { feedAwake = performance.now(); list.classList.remove('quiet'); };
  const enterFeed = () => { overFeed = true; wakeFeed(); };
  const leaveFeed = () => { overFeed = false; wakeFeed(); };
  list.addEventListener('pointerenter', enterFeed);
  list.addEventListener('pointerleave', leaveFeed);
  list.addEventListener('pointerdown', wakeFeed);
  list.addEventListener('wheel', wakeFeed, { passive: true });
  function renderFeed(now) {
    const follow = atBottom();
    if (seen < sim.messages.length) wakeFeed();
    else if (!overFeed && !typing.length && now - feedAwake > 6000) list.classList.add('quiet');
    for (; seen < sim.messages.length; seen++) {
      const m = sim.messages[seen], fromEarth = m.from === 'Mission Control';
      const li = document.createElement('li');
      li.className = `msg ${m.kind}`;
      li.innerHTML = `<span class="from">${fromEarth ? `${icon('radio', 14)} Mission Control <em>1.3 s light delay</em>` : m.from}</span>
        <span class="sr-only"></span><span class="typed" aria-hidden="true"></span>`;
      li.querySelector('.sr-only').textContent = m.text; // screen readers get the whole message at once
      list.append(li);
      const out = li.querySelector('.typed');
      if (instant) out.textContent = m.text;
      else { out.classList.add('typing'); typing.push({ out, text: m.text, start: now }); }
      messageCue(fromEarth);
    }
    typing = typing.filter(t => {
      const shown = Math.floor((now - t.start) / 1000 * TYPE_RATE) + 1;
      t.out.textContent = t.text.slice(0, shown);
      if (shown < t.text.length) return true;
      t.out.classList.remove('typing');
      return false;
    });
    if (follow) list.scrollTop = list.scrollHeight;
    fadeTop();
  }

  // --- What to do next ---
  const rocksLeft = () => (sim.mission.goalType === 'samples' ? Math.max(0, sim.goalValue - sim.samples.size) : 0);
  // At night the battery is all there is. Say whether it will last, and exactly what to turn down.
  function nightAdvice() {
    const left = clock(sim.timeToSunrise);
    if (sim.batteryForecast >= sim.timeToSunrise) return `Night: the battery will last until sunrise (${left} to go). Press T to speed up time (now ${speed}x).`;
    const cuts = [];
    if (sim.ls !== 'eco') cuts.push('set Life Support to Eco');
    if (sim.robotWorking) cuts.push('park the robot at the Robot Map');
    if (sim.greenhouse && sim.food === null) cuts.push('turn the grow lights off at Power');
    if (sim.comms && !sim.nextStorm) cuts.push('turn the antenna off at Power');
    const how = cuts.length ? `To save power: ${cuts.join(', ')}.` : 'Everything is already turned down, so keep an eye on Life Support.';
    return `Night: the battery lasts about ${clock(sim.batteryForecast)} but sunrise is ${left} away. ${how}`;
  }
  function hintText() {
    const f = sim.flags, next = sim.nextStorm, storm = sim.stormNow;
    if (storm && sim.where !== 'shelter') return 'Solar storm! Go to the Storm Shelter at the back of the Habitat.';
    if (storm) return 'Stay in the shelter until the storm is over.';
    if (next?.warnedBy && !next.started) return sim.where === 'shelter' ? 'Wait here for the storm.' : 'Storm coming! Park the robot (Robot Map), then go to the Storm Shelter.';
    const lock = sim.airlockStep;
    if (lock?.waiting) return 'Step away from the door so it can close.';
    if (lock) return lock.kind === 'open' && lock.door === 'outer' ? 'The outer door is opening. Off you go!' : 'The airlock is working. Hang tight!';
    if (sim.inAirlock && sim.airlock.pressure === 'vacuum') return 'Step outside for your moonwalk, or use the Airlock panel to come back in.';
    if (sim.where === 'outside') {
      const broken = sim.panels.indexOf(false);
      if (broken >= 0) return `Walk to solar panel ${broken + 1} (the red light) and press E to fix it.`;
      const light = sim.sunlight === 0 ? ' It is dark: press F for your chest light.' : '';
      if (rocksLeft() > 0) return `Pick up the glowing rocks with E: ${sim.samples.size} of ${sim.goalValue} so far. Watch your suit air.${light}`;
      return `Collect glowing rock samples for research points. Watch your suit air.${light}`;
    }
    if (sim.power <= 0) return 'Battery empty! Open Power and switch something off, or set Life Support to Eco.';
    if (sim.air < 20) return 'Life support is low. Set it to Normal or Boost.';
    if (sim.power > 0 && sim.sunlight === 0 && sim.batteryForecast < sim.timeToSunrise) return nightAdvice();
    if (sim.panels.includes(false)) return 'A solar panel is broken. Fix it outside (Airlock) or send the robot (Robot Map).';
    if (f.tourHint) return f.tourHint; // the guided tour in First Night
    if (sim.food !== null) {
      if (!sim.greenhouse) return 'Open the Galley and turn on the grow lights.';
      if ((sim.water ?? 0) < 3 && sim.robot.task !== 'ice') return 'The plants need water. Send the robot for crater ice.';
    }
    // The dirt shield, in the mission that is about it: dig, then build, one level at a time.
    if (sim.mission.goalType === 'dose' && sim.shieldCost !== undefined && SLOTS.some(slot => slot.id === 'builder')) {
      const level = sim.shielding + 1, cost = sim.shieldCost;
      if (sim.regolith >= cost) {
        if (holding() === 'builder') return `You have the moon dirt for level ${level} of the regolith shield. ${isTouch ? 'Tap Build it.' : 'Press Build it (or B).'}`;
        return `You have enough moon dirt. ${isTouch ? 'Tap the Building tool' : 'Press 2 for the Building tool'} and build level ${level} of the regolith shield.`;
      }
      if (sim.robot.task !== 'dig' && sim.robot.offline <= 0 && (sim.t < sim.day || !sim.shielding)) return `The regolith shield needs ${cost} moon dirt and you have ${Math.floor(sim.regolith)}. Send the robot to dig at the Robot Map.`;
    }
    if (sim.t < sim.day && sim.timeToSunset < 40 && sim.ls !== 'eco') return 'Night is coming. Set Life Support to Eco and turn off what you don\'t need.';
    if (rocksLeft() > 0) return `Rock samples: ${sim.samples.size} of ${sim.goalValue}. Use the Airlock to go outside and pick up the glowing rocks.${sim.t >= sim.day ? ' They glow in the dark.' : ''}`;
    if (sim.t >= sim.day) return nightAdvice();
    return sim.mission.goal;
  }

  // --- Station panels ---
  const btn = (act, label, { arg = '', on = false, disabled = false, note = '' } = {}) =>
    `<button class="opt ${on ? 'on' : ''}" data-act="${act}" data-arg="${arg}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>
      <span class="opt-label">${label}${on ? ' <small>(on)</small>' : ''}</span>${note ? `<span class="opt-note">${note}</span>` : ''}</button>`;
  // First Night drains power and air more gently, so the panels show the real, eased numbers.
  const ease = sim.mission.ease ?? 1;
  const r2 = v => Math.round(v * 100) / 100;
  const P = {
    ...C.power,
    lifeSupport: Object.fromEntries(Object.entries(C.power.lifeSupport).map(([k, v]) => [k, r2(v * ease)])),
    heaters: r2(C.power.heaters * ease), comms: r2(C.power.comms * ease),
    greenhouse: r2(C.power.greenhouse * ease), robot: r2(C.power.robot * ease),
  };
  const breathe = C.air.crewUse * sim.mode.crewDrain * ease;
  const vs = made => made < breathe - 0.005 ? 'less than' : 'more than';

  const STATIONS = {
    Power: () => {
      const net = sim.gen - sim.demand, fc = sim.batteryForecast;
      return {
        title: 'Power', icon: 'bolt',
        body: `<p class="big">${Math.round(sim.power)}% battery</p>
        <dl class="facts">
          <dt>Solar panels make</dt><dd>${per(sim.gen, 'power')} (${sim.panelsWorking} of 3 working)</dd>
          <dt>Base is using</dt><dd>${per(sim.demand, 'power')}</dd>
          <dt>Battery</dt><dd>${net >= 0 ? 'charging' : `lasts about ${clock(fc)} at this rate`}</dd>
          <dt>Next sunrise</dt><dd>${sim.t < sim.day ? `${clock(sim.timeToSunrise)} away (sunset first)` : `in ${clock(sim.timeToSunrise)}`}</dd>
        </dl>
        <h4>Switch things on or off</h4>
        <div class="opts">
          ${btn('comms', 'Antenna', { arg: sim.comms ? 'off' : 'on', on: sim.comms, note: `Uses ${per(P.comms, 'power')}. Hears storm warnings from Earth.` })}
          ${sim.food !== null || unlocks.includes('Greenhouse') ? btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${per(P.greenhouse, 'power')}. Grows food, adds a little air.` }) : ''}
        </div>
        <h4>What is using power right now</h4>
        <ul class="uses">${powerUses().filter(u => u.on).map(u => `<li><b>${u.name}</b> <span class="u-val">${per(u.use, 'power')}</span><span class="u-where">${u.note}. Find it at: ${u.where}.</span></li>`).join('')}</ul>`,
      };
    },
    LifeSupport: () => ({
      title: 'Life Support', icon: 'wind',
      body: `<p class="big">${Math.round(sim.air)}% air and water</p>
      <p>You use about ${per(breathe, 'air')} while you are inside. Pick how hard the machine works:</p>
      <div class="opts">
        ${btn('ls', 'Eco', { arg: 'eco', on: sim.ls === 'eco', note: `Uses ${per(P.lifeSupport.eco, 'power')}. Makes ${per(C.air.make.eco, 'air')}, ${vs(C.air.make.eco)} you breathe.` })}
        ${btn('ls', 'Normal', { arg: 'normal', on: sim.ls === 'normal', note: `Uses ${per(P.lifeSupport.normal, 'power')}. Makes ${per(C.air.make.normal, 'air')}, ${vs(C.air.make.normal)} you breathe.` })}
        ${btn('ls', 'Boost', { arg: 'boost', on: sim.ls === 'boost', note: `Uses ${per(P.lifeSupport.boost, 'power')} and moon dirt. Makes ${per(C.air.make.boost, 'air')}.` })}
      </div>
      <p class="fine">If the battery runs empty, everything runs slowly, the base gets cold and the air goes stale faster.</p>`,
    }),
    Comms: () => ({
      title: 'Comms', icon: 'radio',
      body: `<p class="big">Earth is ${sim.earthUp ? 'above' : 'below'} the horizon</p>
      <div class="opts">
        ${btn('comms', 'Antenna', { arg: sim.comms ? 'off' : 'on', on: sim.comms, note: `Uses ${per(P.comms, 'power')}. Mission Control warns you about storms ${sim.mode.warning} s early.` })}
        ${btn('forecast', 'Ask for a space weather forecast', { disabled: !sim.comms, note: `Costs ${P.forecast} power. The answer takes ${C.commsRoundTrip} s, there and back at the speed of light, and puts the next storm on your sun clock.` })}
        ${btn('upload', 'Send science data', { disabled: !sim.comms, note: `Costs ${P.sendData} power. +${C.science.uploadRP} research point.` })}
      </div>
      <p class="fine">Every message takes about 1.3 s to cross the 384,400 km to Earth, and none get through while Earth is below the horizon. ${sim.storms.some(s => s.flare) ? `Storms here are sized from real solar flares${liveFlares ? ' (live from NASA DONKI)' : ' (from NASA DONKI records)'}.` : ''}</p>`,
    }),
    Food: () => {
      if (sim.food === null) {
        return {
          title: 'Galley', icon: 'food',
          body: `<p class="big">Food: plenty</p><p>The cargo lander brought enough meals for this mission.</p>
          ${unlocks.includes('Greenhouse') ? `<div class="opts">${btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${per(P.greenhouse, 'power')}. Plants add a little air.` })}</div>` : '<p class="fine">Unlock the Greenhouse with research points to grow your own food.</p>'}`,
        };
      }
      return {
        title: 'Galley and greenhouse', icon: 'leaf',
        body: `<p class="big">${sim.food} meals left (goal: ${sim.goalValue} at sunrise)</p>
        <dl class="facts"><dt>Water for plants</dt><dd>${Math.floor(sim.water)} of ${C.meters.waterMax}</dd>
        <dt>Next meal eaten</dt><dd>in ${Math.ceil((C.food.eatEvery - sim.foodTimer) / sim.mode.crewDrain)} s</dd>
        <dt>Greens ready</dt><dd>${sim.greenhouse && sim.water > 0 ? `in ${Math.ceil(C.food.growEvery - sim.growTimer)} s` : 'not growing'}</dd></dl>
        <div class="opts">${btn('greenhouse', 'Grow lights', { arg: sim.greenhouse ? 'off' : 'on', on: sim.greenhouse, note: `Uses ${per(P.greenhouse, 'power')} and water. One meal every ${C.food.growEvery} s.` })}</div>
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
          ${btn('robot', 'Dig moon dirt', { arg: 'dig', on: R.task === 'dig', note: `Uses ${per(P.robot, 'power')}. Digs ${per(C.robot.dig, 'moon dirt')} for building, repairs and Boost.` })}
          ${sim.water !== null ? btn('robot', 'Haul crater ice', { arg: 'ice', on: R.task === 'ice', note: `Uses ${per(P.robot, 'power')}. Brings ${per(C.robot.ice, 'water')} for the plants.` }) : ''}
          ${btn('robot', `Fix panel ${broken >= 0 ? broken + 1 : ''}`, { arg: 'repair', on: R.task === 'repair', disabled: broken < 0 && R.task !== 'repair', note: `Costs ${C.robot.repairRegolith} moon dirt, takes ${C.robot.repairSeconds} s. No moonwalk needed.` })}
        </div>
        <p class="fine">Robots must be parked before a solar storm${sim.mode.robotAutoPark ? ' (in Cadet mode it parks itself)' : ', or the storm damages them'}.</p>`,
        after: drawMap,
      };
    },
    Shelter: () => {
      const has = SLOTS.some(slot => slot.id === 'builder');
      const cost = sim.shieldCost, k = sim.shieldMult;
      const shield = !has ? 'Research Regolith Shielding to get a Building tool. With it you can cover the shelter in moon dirt.'
        : cost === undefined ? 'The regolith shield is finished: the shelter is buried in moon dirt.'
        : `Regolith shield: level ${sim.shielding} of 2. Close this panel and ${isTouch ? 'tap the Building tool' : 'press 2 for the Building tool'} to build the next level (${cost} moon dirt).`;
      return {
        title: 'Storm Shelter', icon: 'shield',
        body: `<p class="big">${sim.stormNow ? 'Storm now! Stay here.' : 'Hide here during solar storms'}</p>
        <p>The shelter is the back of the Habitat, behind the water tanks and supplies. Extra dose per second in a strong storm:</p>
        <dl class="facts"><dt>Outside</dt><dd>${fixed(C.dose.storm.outside)}</dd><dt>Rest of Habitat</dt><dd>${fixed(C.dose.storm.inside)}</dd><dt>Here in the shelter</dt><dd>${fixed(C.dose.storm.shelter * k)}</dd></dl>
        <p class="fine">${shield}</p>`,
      };
    },
    Airlock: () => {
      const status = sim.airlockStatus, words = { pressurized: 'Pressurized', cycling: 'Cycling...', vacuum: 'Vacuum' }[status];
      const cost = `Each trip out costs ${C.airlock.cycleAir}% Life Support.`;
      const view = {
        pressurized: `<p class="big">Go on a moonwalk?</p>
          <p>Outside you can fix solar panels by hand and collect rock samples. Your suit holds ${C.suit.seconds} s of air, and your radiation dose rises about 3 times faster than inside.</p>
          <div class="opts">${btn('outside', 'Suit up and go outside', { disabled: !!sim.stormNow, note: sim.stormNow ? 'Not during a solar storm' : `Suit air: ${Math.floor(sim.suit)} s. ${cost}` })}</div>`,
        vacuum: `<p class="big">Ready to come in?</p>
          <p>The outer door closes, the air comes back, then the inner door opens.</p>
          <div class="opts">${btn('inside', 'Close up and come inside', { note: 'Takes a few seconds.' })}</div>`,
        cycling: '<p class="big">The airlock is working</p><p>Watch the bar in the middle of the screen.</p>',
      }[status];
      return {
        title: 'Airlock', icon: 'door',
        body: `${view}
        <dl class="facts"><dt>Air in the airlock</dt><dd>${words}</dd><dt>Inner door</dt><dd>${sim.airlock.inner ? 'Open' : 'Closed'}</dd><dt>Outer door</dt><dd>${sim.airlock.outer ? 'Open' : 'Closed'}</dd></dl>
        <p class="fine">Only one door opens at a time, so the cabin never loses its air. Come back in through the door at the top of the yellow steps.</p>`,
      };
    },
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
    outside: () => { const no = sim.airlockStart('out'); if (no) notice(no); else close(); },
    inside: () => { const no = sim.airlockStart('in'); if (no) notice(no); else close(); },
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
    hologramSound('open');
    sim.flags[`open_${id}`] = true;
    $('station').hidden = false;
    $('hotbar-wrap').hidden = true; // out of the way of a tall panel
    $('touch-stick').hidden = $('touch-actions').hidden = true;
    renderStation(true);
    $('station').querySelector('button.opt:not([disabled])')?.focus();
  }
  function close() {
    if (open) hologramSound('close');
    open = null;
    $('station').hidden = true;
    $('hotbar-wrap').hidden = false;
    $('touch-stick').hidden = $('touch-actions').hidden = false;
    document.activeElement?.blur?.();
  }

  // Game speed: T (or the button in Settings) steps through 1x, 2x and 3x, then back to 1x.
  const SPEEDS = [1, 2, 3];
  function setSpeed(to) {
    speed = to;
    api.setSpeed(speed);
    $('speed').setAttribute('aria-pressed', speed > 1);
    $('speed').innerHTML = `${icon('ff', 18)} ${speed}x speed`;
  }
  const toggleSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  const speedBtn = () => toggleSpeed();
  $('speed').addEventListener('click', speedBtn);
  setSpeed(1);
  // --- Airlock progress: one bar per step, with the reason for the step ---
  const LOCK_STEPS = {
    'close inner': ['Airlock', 'Closing the inner door', ''],
    'close outer': ['Airlock', 'Closing the outer door', ''],
    prebreathe: ['Prebreathe', 'Breathing pure oxygen', 'Astronauts breathe pure oxygen before a spacewalk. It clears nitrogen out of their blood, so they don\'t get the bends.'],
    'pump out': ['Depressurize', 'Pumping the air out', `Pumps save most of the air for later. This trip costs ${C.airlock.cycleAir}% Life Support.`],
    'pump in': ['Repressurize', 'Letting the air back in', 'Nearly there. The inner door opens when the air is back.'],
    'open inner': ['Airlock', 'Opening the inner door', ''],
    'open outer': ['Airlock', 'Opening the outer door', ''],
  };
  let lockShown = '';
  let lockLast = ''; // what the airlock was doing a moment ago, for the "pressure ready" beep
  function renderAirlock() {
    const step = sim.airlockStep;
    $('airlock-panel').hidden = !step;
    if (!step) { lockShown = ''; lockLast = ''; return; }
    const key = step.kind === 'pump' ? `pump ${step.dir}` : step.door ? `${step.kind} ${step.door}` : step.kind;
    if (key + step.waiting !== lockShown) {
      lockShown = key + step.waiting;
      const secs = step.length / speed;
      if (step.kind === 'pump') airlockSound(step.dir === 'out' ? 'pump-out' : 'pump-in', secs);
      else if (step.kind === 'prebreathe') airlockSound('prebreathe', secs);
      else if (step.door && !step.waiting) {
        if (lockLast === 'pump') airlockSound('done');   // the pump just finished
        airlockSound(step.kind === 'open' ? 'door-open' : 'door-close', secs);
      }
      lockLast = step.kind;
      const [title, text, fact] = LOCK_STEPS[key];
      $('lock-title').innerHTML = `${icon('door', 20)} ${title}`;
      $('lock-text').textContent = step.waiting ? 'Step away from the door so it can close!' : text;
      $('lock-fact').textContent = fact;
      $('lock-fact').hidden = !fact;
      $('lock-skip').hidden = !(step.kind === 'prebreathe' && sim.modeName === 'Cadet');
    }
    $('lock-bar').setAttribute('aria-valuenow', Math.round(step.progress * 100));
    $('lock-bar').firstElementChild.style.width = `${step.progress * 100}%`;
  }
  const skipBtn = () => sim.airlockSkip();
  $('lock-skip').addEventListener('click', skipBtn);
  const showSound = () => {
    $('sound').setAttribute('aria-pressed', soundOn());
    $('sound').textContent = soundOn() ? 'Sound on' : 'Sound off';
  };
  const soundBtn = () => { setSound(!soundOn()); showSound(); };
  $('sound').addEventListener('click', soundBtn);
  showSound();

  // --- Sound cues: watch for things that just happened ---
  const heard = { brownout: false, airLow: false, emergency: false, warned: 0, started: 0, done: 0, samples: 0, rp: sim.rp };
  function watchSounds() {
    const f = sim.flags;
    if (f.brownout && !heard.brownout) lowPowerSound();
    if ((f.airLow && !heard.airLow) || (f.emergency && !heard.emergency)) warningSound(f.emergency ? 2 : 1, 0.6);
    heard.brownout = !!f.brownout; heard.airLow = !!f.airLow; heard.emergency = !!f.emergency;
    const count = k => sim.storms.filter(s => s[k]).length;
    const warned = count('warnedBy'), started = count('started'), done = count('done');
    if (warned > heard.warned) stormSound('warning');
    if (started > heard.started) stormSound('start');
    if (done > heard.done) stormSound('end');
    Object.assign(heard, { warned, started, done });
    if (sim.samples.size > heard.samples) sampleSound();
    else if (sim.rp > heard.rp) dataSentSound();
    heard.samples = sim.samples.size; heard.rp = sim.rp;
  }

  function frame(near) {
    // A storm forces normal speed, so nobody fast-forwards into danger.
    if (speed > 1 && (sim.stormNow || sim.nextStorm?.warnedBy)) setSpeed(1);
    const now = performance.now();
    renderFeed(now);
    checkSuitAir(now);
    watchSounds();
    renderAirlock();
    if (now - lastRender < 200) return;
    lastRender = now;
    renderMeters();
    renderUses();
    renderBuild();
    renderSupplies();
    renderClock();
    renderRp();
    $('hint').textContent = forTouch(hintText());
    $('prompt').hidden = !near || !!open;
    if (near) $('prompt').innerHTML = isTouch ? `Tap <b>Use</b> to ${near.label}` : `Press <kbd>E</kbd> to ${near.label}`;
    $('touch-use').classList.toggle('ready', !!near && !open); // the Use button lights up when there is something to use
    if (open && now % 1000 < 220) renderStation();
  }

  return {
    frame, openStation, close, toggleSpeed, setSpeed, selectSlot, holdTool, build, showUses,
    notice,
    get speed() { return speed; },
    get holding() { return holding(); },
    get usesOpen() { return usesOpen; },
    hasTool: id => SLOTS.some(slot => slot.id === id),
    busy: () => !!open,
    get open() { return open; },
    destroy() {
      close();
      hud.hidden = true;
      $('storm-frame').hidden = true;
      $('station').removeEventListener('click', onClick);
      $('station-close').removeEventListener('click', closeBtn);
      $('speed').removeEventListener('click', speedBtn);
      $('fullscreen').removeEventListener('click', fsBtn);
      $('mission-handle').removeEventListener('click', missionBtn);
      $('hotbar').removeEventListener('click', slotBtn);
      $('build-go').removeEventListener('click', buildBtn);
      $('build-card').hidden = true;
      $('power-btn').removeEventListener('click', usesBtn);
      $('pu-close').removeEventListener('click', usesClose);
      $('power-uses').hidden = true;
      $('sound').removeEventListener('click', soundBtn);
      list.removeEventListener('scroll', fadeTop);
      list.removeEventListener('pointerenter', enterFeed);
      list.removeEventListener('pointerleave', leaveFeed);
      list.removeEventListener('pointerdown', wakeFeed);
      list.removeEventListener('wheel', wakeFeed);
      list.classList.remove('quiet');
      $('air-toast').hidden = true;
      $('lock-skip').removeEventListener('click', skipBtn);
      $('airlock-panel').hidden = true;
    },
  };
}
