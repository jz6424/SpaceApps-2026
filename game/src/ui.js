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
function nodeHtml(node, branch) {
  const state = nodeState(node, save.unlocks, save.points);
  const mission = node.mission && missionById(node.mission);
  const status = {
    owned: '<p class="n-status done">Researched</p>',
    soon: '<p class="n-status">Coming soon</p>',
    locked: `<p class="n-status">Research ${nodeById(node.needs)?.name} first</p>`,
    short: `<button class="btn small" disabled>Need ${node.cost - save.points} more points</button>`,
    ready: `<button class="btn primary small" data-do="buy" data-id="${node.id}">Research for ${node.cost} points</button>`,
  }[state];
  const children = branch.nodes.filter(child => child.needs === node.id);
  return `
    <li>
      <article class="node is-${state}" id="node-${node.id}" tabindex="-1">
        <div class="n-head"><h4>${node.name}</h4><span class="n-cost">${state === 'owned' ? 'Owned' : `${node.cost} points`}</span></div>
        ${mission ? `<p class="n-opens">${icon('star', 16)} Opens mission ${MISSIONS.indexOf(mission) + 1}, ${mission.name}</p>` : ''}
        <p class="n-science">${node.science}</p>
        <p class="n-change"><b>In the game</b> ${node.change}</p>
        ${status}
      </article>
      ${children.length ? `<ul>${children.map(child => nodeHtml(child, branch)).join('')}</ul>` : ''}
    </li>`;
}

function renderResearch() {
  $('research-points').textContent = save.points;
  $('research-note').textContent = UPGRADES_LIVE
    ? 'Spend research points on new equipment. Some items need another one first.'
    : 'Spend research points to open new missions. The upgrades are still being built, so you can read about them now and buy them in a later update.';
  $('research-tree').innerHTML = BRANCHES.map(branch => `
    <section class="branch" aria-labelledby="branch-${branch.id}">
      <h3 id="branch-${branch.id}">${icon(branch.icon, 24)} ${branch.name}</h3>
      <p class="fine">${branch.about}</p>
      <ul class="tree">${branch.nodes.filter(node => !node.needs).map(node => nodeHtml(node, branch)).join('')}</ul>
    </section>`).join('');
}

function openResearch() {
  renderResearch();
  show('research');
}

function buy(id) {
  const node = nodeById(id);
  if (!node || nodeState(node, save.unlocks, save.points) !== 'ready') return;
  save.points -= node.cost;
  save.unlocks.push(node.id);
  commit();
  renderResearch();
  $(`node-${id}`).focus();
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
  hud = createHud({ sim, site: game.site, unlocks: save.unlocks, api: game, flare });
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
