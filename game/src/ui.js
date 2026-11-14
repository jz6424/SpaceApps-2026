// Menus around the game: start, mission choice, Research Tree, briefing, pause, debrief and credits.
// Also runs a mission: makes the Sim, hands it to the 3D world and the HUD, and ends it.
import './ui.css';
import { MISSIONS, MODES, missionById, pointsFor } from './config.js';
import { Sim } from './sim.js';
import { createHud, icon } from './hud.js';
import { getFlares, dataCard, SOURCES } from './nasa.js';
import { emptySave, eraseSave, loadSave, writeSave } from './save.js';
import { BRANCHES, UPGRADES_LIVE, nodeById, nodeState } from './research.js';

const $ = id => document.getElementById(id);
const SCREENS = ['start', 'missions', 'research', 'brief', 'pause', 'debrief', 'how', 'credits'];

let save = loadSave();
let saveWorks = writeSave(save);
let game = null;
let hud = null;
let sim = null;
let chosen = null;     // mission id picked in the menu
let confirmErase = false;
let flares = null;     // { live, flares[] } from DONKI, fetched once
const flaresReady = getFlares().then(f => { flares = f; return f; });

const commit = () => { saveWorks = writeSave(save); };

function show(name) {
  for (const key of SCREENS) $(key).hidden = key !== name;
  $(name ?? '')?.querySelector('button:not([disabled])')?.focus();
}

const isOpen = mission => !mission.requires || save.unlocks.includes(mission.requires.id);

function starsHtml(count) {
  const text = count ? `${count} of 3 stars` : 'No stars yet';
  return `<span class="stars"><span aria-hidden="true">${'★'.repeat(count)}<span class="off">${'★'.repeat(3 - count)}</span></span> ${text}</span>`;
}

// --- Start ---
function renderStart() {
  $('start-actions').innerHTML = `<button class="btn primary" data-do="open-missions" ${game ? '' : 'disabled'}>${game ? 'Play' : 'Loading the Moon…'}</button>`;
  $('start-status').textContent = game ? '' : 'Loading real NASA terrain…';
}

// --- Mission menu ---
function missionCard(mission, index) {
  const open = isOpen(mission);
  const best = save.best[mission.id]?.[save.mode] ?? 0;
  const need = mission.requires;
  let action;
  if (open) action = `<button class="btn primary" data-do="brief" data-id="${mission.id}">Start mission</button>`;
  else action = '<button class="btn" data-do="research">Open Research Tree</button>';
  return `
    <article class="mission ${open ? '' : 'locked'}">
      <div class="num" aria-hidden="true">${index + 1}</div>
      <h3>${mission.name}</h3>
      <p>${mission.goal}</p>
      ${open ? starsHtml(best)
        : `<p class="need">${icon('shield', 16)} Unlock ${need.name} in Research Tree</p>`}
      ${action}
    </article>`;
}

function renderMissions() {
  $('points').textContent = save.points;
  $('mode-choice').innerHTML = Object.entries(MODES).map(([key, mode]) =>
    `<button class="seg" data-do="mode" data-id="${key}" aria-pressed="${key === save.mode}">${mode.label} · ${mode.level}</button>`).join('');
  $('mode-about').textContent = MODES[save.mode].about;
  $('mission-list').innerHTML = MISSIONS.map(missionCard).join('');
  $('save-note').textContent = saveWorks
    ? 'Your stars and points save by themselves in this browser. No account needed.'
    : 'This browser is blocking saves, so your progress will be lost when you close the page.';
  $('erase').innerHTML = confirmErase
    ? '<span>Erase all stars and points? This can\'t be undone.</span> <button class="btn small" data-do="erase-yes">Yes, erase</button> <button class="btn small" data-do="erase-no">Keep my save</button>'
    : '<button class="link" data-do="erase-ask">Erase my save</button>';
}

function openMissions() {
  if (hud) endMission();
  confirmErase = false;
  renderMissions();
  show('missions');
}

// --- Research Tree ---
// Drawn as a map: the Habitat in the middle, one arm per branch, round nodes joined by lines.
// Picking a node shows what it is in the panel next to the map.
const MAP = { size: 840, radius: [0, 115, 230, 345] };
const EXTRA_ICONS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const glyph = (name, size) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${EXTRA_ICONS[name]}</svg>`;
let picked = null;    // node id shown in the panel

// Where every circle goes. Each branch owns an equal slice of the circle. Its end nodes are spread
// across the slice, and a node with children sits in the middle of them, one ring further in.
function mapLayout() {
  const slice = 360 / BRANCHES.length;
  const spots = { hub: { angle: 0, ring: 0 } };
  BRANCHES.forEach((branch, i) => {
    const middle = -90 + i * slice;
    const kids = node => branch.nodes.filter(child => child.needs === node.id);
    const roots = branch.nodes.filter(node => !node.needs);
    const ends = [];
    const findEnds = node => (kids(node).length ? kids(node).forEach(findEnds) : ends.push(node));
    roots.forEach(findEnds);
    const place = (node, ring) => {
      const children = kids(node);
      children.forEach(child => place(child, ring + 1));
      const angle = children.length
        ? children.reduce((sum, child) => sum + spots[child.id].angle, 0) / children.length
        : middle + (ends.indexOf(node) - (ends.length - 1) / 2) * (slice / ends.length);
      spots[node.id] = { angle, ring, parent: node.needs ?? `branch-${branch.id}` };
    };
    roots.forEach(root => place(root, 2));
    spots[`branch-${branch.id}`] = { angle: middle, ring: 1, parent: 'hub' };
  });
  for (const spot of Object.values(spots)) {
    const turn = spot.angle * Math.PI / 180, r = MAP.radius[spot.ring];
    spot.x = Math.round(MAP.size / 2 + r * Math.cos(turn));
    spot.y = Math.round(MAP.size / 2 + r * Math.sin(turn));
  }
  return spots;
}
const SPOTS = mapLayout();
const STATE_WORDS = { owned: 'researched', ready: 'ready to research', short: 'not enough points yet', locked: 'locked', soon: 'locked, coming soon' };
const isShut = state => state === 'locked' || state === 'soon';

function mapHtml() {
  const state = node => nodeState(node, save.unlocks, save.points);
  const at = id => `left:${SPOTS[id].x}px;top:${SPOTS[id].y}px`;
  const line = (id, kind) => {
    const a = SPOTS[SPOTS[id].parent], b = SPOTS[id];
    return `<line class="${kind}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  };
  const lines = BRANCHES.flatMap(branch => [
    line(`branch-${branch.id}`, 'on'),
    ...branch.nodes.map(node => line(node.id, state(node) === 'owned' ? 'on' : isShut(state(node)) ? 'shut' : 'open')),
  ]);
  const nodes = BRANCHES.flatMap(branch => [
    `<div class="rt-branch" style="${at(`branch-${branch.id}`)}"><span class="rt-dot">${icon(branch.icon, 24)}</span><span class="rt-name">${branch.name}</span></div>`,
    ...branch.nodes.map(node => {
      const st = state(node);
      return `<button class="rt-node is-${st}" id="node-${node.id}" style="${at(node.id)}" data-do="pick" data-id="${node.id}"
          aria-pressed="${picked === node.id}" aria-label="${node.name}, ${STATE_WORDS[st]}">
        <span class="rt-dot">${isShut(st) ? glyph('lock', 24) : icon(node.icon, 24)}${st === 'owned' ? `<span class="rt-badge">${glyph('check', 12)}</span>` : ''}</span>
        <span class="rt-name">${node.name}</span>
      </button>`;
    }),
  ]);
  return `
    <svg class="rt-lines" viewBox="0 0 ${MAP.size} ${MAP.size}" aria-hidden="true">${lines.join('')}</svg>
    <div class="rt-hub" style="${at('hub')}"><span class="rt-dot">${icon('star', 32)}</span><span class="rt-name">Your base</span></div>
    ${nodes.join('')}`;
}

function panelHtml(node) {
  const state = nodeState(node, save.unlocks, save.points);
  const mission = node.mission && missionById(node.mission);
  const status = {
    owned: `<p class="n-status done">${glyph('check', 16)} Researched</p>`,
    soon: `<p class="n-status">${glyph('lock', 16)} This upgrade is locked until a later update.</p>`,
    locked: `<p class="n-status">${glyph('lock', 16)} Research ${nodeById(node.needs)?.name} first to unlock this.</p>`,
    short: `<button class="btn small" disabled>Need ${node.cost - save.points} more points</button>`,
    ready: `<button class="btn primary small" data-do="buy" data-id="${node.id}">Research for ${node.cost} points</button>`,
  }[state];
  return `
    <div class="n-head"><h3>${node.name}</h3><span class="n-cost">${state === 'owned' ? 'Owned' : `${node.cost} points`}</span></div>
    ${mission ? `<p class="n-opens">${icon('star', 16)} Opens mission ${MISSIONS.indexOf(mission) + 1}, ${mission.name}</p>` : ''}
    <p class="n-science">${node.science}</p>
    <p class="n-change"><b>In the game</b> ${node.change}</p>
    ${status}`;
}

// The map is laid out at one size and shrunk to fit narrower screens. Below 3/4 size the
// circles get too small to tap, so it scrolls sideways instead.
function fitMap() {
  const view = $('research-view'), map = $('research-map');
  const scale = Math.min(1, Math.max(0.75, view.clientWidth / MAP.size));
  map.style.transform = `scale(${scale})`;
  $('research-fit').style.width = $('research-fit').style.height = `${MAP.size * scale}px`;
  view.scrollLeft = (view.scrollWidth - view.clientWidth) / 2;
}

function renderResearch() {
  const all = BRANCHES.flatMap(branch => branch.nodes);
  picked ??= (all.find(node => nodeState(node, save.unlocks, save.points) === 'ready') ?? all[0]).id;
  $('research-points').textContent = save.points;
  $('research-note').textContent = UPGRADES_LIVE
    ? 'Pick a circle to see what it does. Spend research points to add it to your base.'
    : 'Pick a circle to see what it does. Spend research points to open new missions. We are still building the upgrades, so they stay locked until a later update.';
  $('research-map').innerHTML = mapHtml();
  $('research-panel').innerHTML = panelHtml(nodeById(picked));
}

function openResearch() {
  renderResearch();
  show('research');
  fitMap();
}

function pick(id) {
  picked = id;
  renderResearch();
  $(`node-${id}`).focus();
}

function buy(id) {
  const node = nodeById(id);
  if (!node || nodeState(node, save.unlocks, save.points) !== 'ready') return;
  save.points -= node.cost;
  save.unlocks.push(node.id);
  commit();
  pick(id);
}

// --- Briefing ---
function flareFor(mission) {
  if (!flares || !mission.storms.length) return null;
  const i = MISSIONS.indexOf(mission) % flares.flares.length;
  return { ...flares.flares[i], live: flares.live };
}

async function brief(id) {
  chosen = id;
  const mission = missionById(id);
  const site = game.site;
  $('brief-title').textContent = mission.name;
  $('brief-text').textContent = mission.brief;
  const probe = new Sim(mission, save.mode, site);
  $('brief-goal').textContent = mission.goalType === 'dose'
    ? `${mission.goal} Keep your dose at ${probe.goalValue} or less.`
    : mission.goalType === 'food' ? `${mission.goal} You need ${probe.goalValue} meals.` : mission.goal;
  $('brief-site').innerHTML = `
    <div>${icon('sun', 24)}<b>${Math.round(site.sun * 100)}%</b><span>of the time in sunlight at your base</span></div>
    <div>${icon('globe', 24)}<b>${Math.round(site.earth * 100)}%</b><span>of the time Earth is above the horizon</span></div>
    <div>${icon('droplet', 24)}<b>${site.iceDistance} m</b><span>to the nearest ice-cold shadow</span></div>`;
  show('brief');
  $('brief-flare').textContent = mission.storms.length ? 'Checking NASA DONKI for real solar flares…' : 'Real terrain: NASA LRO LOLA laser altimeter, 5 m per pixel.';
  if (mission.storms.length) {
    await flaresReady;
    const f = flareFor(mission);
    $('brief-flare').textContent = f
      ? `This mission's storms are modelled on a real ${f.classType} solar flare from ${f.date}. ${f.note} (${f.live ? 'Live from NASA DONKI' : 'From NASA DONKI records, because the live feed could not be reached'}.)`
      : '';
  }
}

// --- Playing ---
function launch(id = chosen) {
  const mission = missionById(id);
  chosen = id;
  if (hud) endMission();
  sim = new Sim(mission, save.mode, game.site);
  const flare = flareFor(mission);
  if (flare) sim.flare = flare;
  sim.say(mission.brief, 'info');
  hud = createHud({ sim, site: game.site, unlocks: save.unlocks, api: game, flare, points: save.points });
  game.enter(sim, {
    frame(near) {
      hud.frame(near);
      if (sim.over) finish();
    },
    openStation: id => hud.openStation(id),
    notice: t => hud.notice(t),
    busy: () => hud.busy(),
    toggleSpeed: () => hud.toggleSpeed(),
  });
  show(null);
}

function endMission() {
  hud?.destroy();
  hud = null;
  game.stop();
}

function pause() {
  if (!hud) return;
  hud.close();
  game.pause();
  $('pause-title').textContent = sim.mission.name;
  show('pause');
}

function resume() {
  game.resume();
  show(null);
}

function finish() {
  const o = sim.over, mission = sim.mission, mode = sim.modeName;
  const stars = o.won ? o.stars : 0;
  const best = save.best[mission.id]?.[mode] ?? 0;
  // Replaying for stars you already had pays half. Research from samples and uploads always counts.
  let earned = pointsFor(mission, mode, stars);
  if (stars && stars <= best) earned = Math.round(earned / 2);
  earned += sim.rp;
  save.points += earned;
  if (stars) (save.best[mission.id] ??= {})[mode] = Math.max(best, stars);
  commit();
  const card = dataCard(mission.dataCard, game.site);
  const facts = [
    ['Lowest life support', `${Math.round(sim.lowestAir)}%`],
    ['Radiation dose', `${Math.round(sim.dose)} of 100${mission.goalType === 'dose' ? ` (goal ${sim.goalValue})` : ''}`],
    ['Battery empty for', `${Math.round(sim.blackout)} s`],
    ...(sim.food !== null ? [['Meals at the end', `${sim.food} (goal ${sim.goalValue})`]] : []),
    ['Research from samples and data', `${sim.rp}`],
  ];
  endMission();
  $('debrief-title').textContent = o.won ? `${mission.name}: mission complete!` : `${mission.name}: not complete yet`;
  $('debrief-reason').textContent = o.reason;
  $('debrief-stars').innerHTML = starsHtml(stars);
  $('debrief-stats').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('debrief-points').textContent = `You earned ${earned} research points. You now have ${save.points}.`;
  $('debrief-lesson').textContent = mission.lesson;
  $('debrief-tips').innerHTML = sim.tips().map(t => `<li>${t}</li>`).join('');
  $('card-title').textContent = card.title;
  $('card-body').textContent = card.body;
  $('card-source').textContent = card.source;
  $('debrief-again').dataset.id = mission.id;
  show('debrief');
}

function renderCredits() {
  $('sources').innerHTML = SOURCES.map(([what, who, url]) =>
    `<li><b>${what}:</b> ${who}. <a href="${url}" target="_blank" rel="noopener">${url.replace('https://', '')}</a></li>`).join('');
}

// --- Buttons ---
const actions = {
  'open-missions': openMissions,
  home: () => { renderStart(); show('start'); },
  how: () => show('how'),
  credits: () => { renderCredits(); show('credits'); },
  mode: id => { save.mode = id; commit(); renderMissions(); $('mode-choice').querySelector(`[data-id=${id}]`).focus(); },
  brief,
  launch: () => launch(),
  again: id => launch(id),
  restart: () => launch(sim.mission.id),
  research: openResearch,
  pick,
  buy,
  resume,
  leave: openMissions,
  menu: pause,
  'erase-ask': () => { confirmErase = true; renderMissions(); },
  'erase-no': () => { confirmErase = false; renderMissions(); },
  'erase-yes': () => {
    eraseSave();
    save = emptySave();
    confirmErase = false;
    commit();
    renderMissions();
  },
};

document.addEventListener('click', e => {
  const button = e.target.closest('[data-do]');
  if (button && !button.disabled) actions[button.dataset.do]?.(button.dataset.id);
});

addEventListener('keydown', e => {
  if (e.code !== 'Escape' || !game || e.repeat) return;
  if (hud?.open) { hud.close(); return; }
  if (hud && $('pause').hidden) pause();
  else if (!$('pause').hidden) resume();
});

addEventListener('resize', () => { if (!$('research').hidden) fitMap(); });

addEventListener('unhandledrejection', () => {
  if (!game) $('start-status').textContent = 'The Moon didn\'t load. Please refresh the page.';
});

// Called by main.js once the world has loaded.
export function gameReady(api) {
  game = api;
  $('start-picture').src = api.picture();
  $('start-picture').hidden = false;
  renderStart();
  if (!$('start').hidden) $('start').querySelector('button:not([disabled])')?.focus();
}

// Debug helpers for scripted checks: window.ui.launch('FirstNight').
window.ui = { launch, get sim() { return sim; }, get save() { return save; }, finishNow: () => { sim.t = sim.total; } };

renderStart();
show('start');
