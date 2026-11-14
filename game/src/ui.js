// Menus around the game: start, mission choice, Research Tree, briefing, pause, debrief and credits.
// Also runs a mission: makes the Sim, hands it to the 3D world and the HUD, and ends it.
import './ui.css';
import { MISSIONS, MODES, missionById, pointsFor } from './config.js';
import { Sim, planRun, flareLabel, flareSize } from './sim.js';
import { createHud, icon } from './hud.js';
import { createTour } from './tour.js';
import { getFlares, dataCard, SOURCES } from './nasa.js';
import { emptySave, eraseSave, loadSave, writeSave } from './save.js';
import { BRANCHES, UPGRADES_LIVE, nodeById, nodeState } from './research.js';
import * as sound from './sound.js';

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
// Teachers and judges can open everything at once: a button in the mission menu, or ?all in the address.
const openAllHere = new URLSearchParams(location.search).has('all');
const allOpen = () => openAllHere || save.openAll;
const unlockIds = MISSIONS.map(m => m.requires?.id).filter(Boolean);
const unlocksNow = () => allOpen() ? [...new Set([...save.unlocks, ...unlockIds])] : save.unlocks;
const flaresReady = getFlares().then(f => { flares = f; return f; });

const commit = () => { saveWorks = writeSave(save); };

function show(name) {
  for (const key of SCREENS) $(key).hidden = key !== name;
  // Start on the screen's main button, so Enter does the expected thing.
  const screen = $(name ?? '');
  (screen?.querySelector('.btn.primary:not([disabled])') ?? screen?.querySelector('button:not([disabled])'))?.focus();
}

const isOpen = mission => !mission.requires || unlocksNow().includes(mission.requires.id);

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
        : `<p class="need">${icon('shield', 16)} Unlock ${need.name} in Research Tree.${need.about ? ` ${need.about}` : ''}</p>`}
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
  $('open-all').innerHTML = allOpen()
    ? 'Every mission is open.'
    : 'Teacher or judge? <button class="link" data-do="open-all">Open every mission now</button>';
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
// The tree has its own glyphs: thin geometric line drawings, one per branch and per item, drawn
// in white on black (the CSS gives them square stroke ends). Keys are branch ids and node ids from
// research.js; anything missing falls back to the HUD icon the node names.
const TREE_ICONS = {
  hub: '<path d="M2 20h20"/><path d="M5 20v-6a7 7 0 0 1 14 0v6"/><path d="M10 20v-4h4v4"/>',
  lock: '<path d="M6 11h12v10H6z"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  // Branches
  power: '<path d="M13.5 2 5 13.5h6L9.5 22 19 10h-6l.5-8z"/>',
  air: '<path d="M2 12h4.5l2-6 3.5 12 3-9 1.5 3H22"/>',
  radiation: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  food: '<path d="M12 21v-9"/><path d="M12 13c0-4-2.5-6.5-7-6.5 0 4 2.5 6.5 7 6.5z"/><path d="M12 11c0-3.5 2.2-6 7-6 0 3.8-2.4 6-7 6z"/>',
  outside: '<path d="M3 9h13l3 5H3z"/><path d="M7 9V5h4"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="16" cy="17.5" r="2.5"/>',
  // Power
  HeatBlankets: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  SunTracking: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  DishAntenna: '<path d="M4 6a11 11 0 0 0 14 14z"/><path d="m11 13 5.5-5.5"/><circle cx="17.8" cy="6.2" r="1.7"/>',
  // Life Support
  Scrubber: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  Sabatier: '<path d="M9 3h6M10 3v6l-5.2 9.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9V3"/><path d="M7.6 15h8.8"/>',
  RegolithOxygen: '<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>',
  // Radiation
  Shielding: '<path d="M12 2 4 5v6c0 5 3.2 9 8 11 4.8-2 8-6 8-11V5z"/>',
  ParticleDetector: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="m12 12-7 7"/>',
  WaterWall: '<path d="M4 3h16v18H4z"/><path d="M7 9.5c1.7-1.6 3.3 1.6 5 0s3.3-1.6 5 0"/><path d="M7 14.5c1.7-1.6 3.3 1.6 5 0s3.3-1.6 5 0"/>',
  // Food and water
  Greenhouse: '<path d="M4 21V10l8-7 8 7v11z"/><path d="M12 21v-7"/><path d="M12 15.5c0-2.3 1.4-3.6 4-3.6 0 2.3-1.4 3.6-4 3.6z"/><path d="M12 17.5c0-1.9-1.1-3-3.3-3 0 1.9 1.1 3 3.3 3z"/>',
  GrowLights: '<path d="M4 4h16v3H4z"/><path d="M8 10.5v3M12 10.5v6M16 10.5v3"/><path d="M6 21h12"/>',
  WaterRecycling: '<path d="M20 11A8 8 0 0 0 5.5 7.5"/><path d="M5 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 3.5"/><path d="M19 21v-5h-5"/>',
  // Robots and moonwalks
  DrumDigger: '<circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M4.2 7.5 6.8 9M17.2 15l2.6 1.5M4.2 16.5 6.8 15M17.2 9l2.6-1.5"/>',
  IceDrill: '<path d="M12 2v5"/><path d="M8 7h8l-4 15z"/><path d="M9.3 12h5.4M10.6 17h2.8"/>',
  SuitTank: '<path d="M8 7h8v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M10 7V3h4v4"/><path d="M8 12h8"/>',
};
const glyph = (name, size, fallback) => (TREE_ICONS[name]
  ? `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${TREE_ICONS[name]}</svg>`
  : icon(fallback, size));
let picked = null;    // node id shown in the panel

// Where every circle goes. Each branch owns an equal slice of the circle. Its end nodes are spread
// across the slice, and a node with children sits in the middle of them, one ring further in.
// A node that needs one from another branch stays on its own arm and gets a second line (`dep`)
// from the node it needs.
function mapLayout() {
  const slice = 360 / BRANCHES.length;
  const spots = { hub: { angle: 0, ring: 0 } };
  BRANCHES.forEach((branch, i) => {
    const middle = -90 + i * slice;
    const inBranch = id => branch.nodes.some(node => node.id === id);
    const kids = node => branch.nodes.filter(child => child.needs === node.id);
    const roots = branch.nodes.filter(node => !inBranch(node.needs));
    const ends = [];
    const findEnds = node => (kids(node).length ? kids(node).forEach(findEnds) : ends.push(node));
    roots.forEach(findEnds);
    const place = (node, ring) => {
      const children = kids(node);
      children.forEach(child => place(child, ring + 1));
      const angle = children.length
        ? children.reduce((sum, child) => sum + spots[child.id].angle, 0) / children.length
        : middle + (ends.indexOf(node) - (ends.length - 1) / 2) * (slice / ends.length);
      spots[node.id] = inBranch(node.needs)
        ? { angle, ring, parent: node.needs }
        : { angle, ring, parent: `branch-${branch.id}`, dep: node.needs };
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
  const state = node => nodeState(node, unlocksNow(), save.points);
  const at = id => `left:${SPOTS[id].x}px;top:${SPOTS[id].y}px`;
  const line = (id, kind, from = SPOTS[id].parent) => {
    const a = SPOTS[from], b = SPOTS[id];
    return `<line class="${kind}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  };
  const kindOf = node => (state(node) === 'owned' ? 'on' : isShut(state(node)) ? 'shut' : 'open');
  const lines = BRANCHES.flatMap(branch => [
    line(`branch-${branch.id}`, 'on'),
    ...branch.nodes.map(node => line(node.id, kindOf(node))),
    ...branch.nodes.filter(node => SPOTS[node.id].dep).map(node => line(node.id, kindOf(node), SPOTS[node.id].dep)),
  ]);
  const nodes = BRANCHES.flatMap(branch => [
    `<div class="rt-branch" style="${at(`branch-${branch.id}`)}"><span class="rt-dot">${glyph(branch.id, 24, branch.icon)}</span><span class="rt-name">${branch.name}</span></div>`,
    ...branch.nodes.map(node => {
      const st = state(node);
      return `<button class="rt-node is-${st}" id="node-${node.id}" style="${at(node.id)}" data-do="pick" data-id="${node.id}"
          aria-pressed="${picked === node.id}" aria-label="${node.name}, ${STATE_WORDS[st]}">
        <span class="rt-dot">${glyph(node.id, 24, node.icon)}${st === 'owned' ? `<span class="rt-badge">${glyph('check', 12)}</span>` : isShut(st) ? `<span class="rt-badge">${glyph('lock', 12)}</span>` : ''}</span>
        <span class="rt-name">${node.name}</span>
      </button>`;
    }),
  ]);
  return `
    <svg class="rt-lines" viewBox="0 0 ${MAP.size} ${MAP.size}" aria-hidden="true">${lines.join('')}</svg>
    <div class="rt-hub" style="${at('hub')}"><span class="rt-dot">${glyph('hub', 32)}</span><span class="rt-name">Your base</span></div>
    ${nodes.join('')}`;
}

function panelHtml(node) {
  const state = nodeState(node, unlocksNow(), save.points);
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
// The window onto the map has no scroll bars: you drag the map around inside it instead.
const pan = { x: 0, y: 0, scale: 1, placed: false };
function placeMap() {
  const view = $('research-view'), size = MAP.size * pan.scale;
  // An axis that fits is centred. One that doesn't can be dragged until either edge shows.
  const hold = (at, room) => (size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, at)));
  pan.x = hold(pan.x, view.clientWidth);
  pan.y = hold(pan.y, view.clientHeight);
  $('research-fit').style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}
function fitMap() {
  const view = $('research-view');
  // The window takes whatever height is left on the screen, so the page itself never scrolls.
  // On narrow screens the details panel sits under it and needs its share.
  const narrow = matchMedia('(max-width: 1100px)').matches;
  const top = view.getBoundingClientRect().top + $('research').scrollTop;
  const room = innerHeight - top - 44 - (narrow ? $('research-panel').offsetHeight + 16 : 0);
  view.style.height = `${Math.max(narrow ? 220 : 320, room)}px`;
  pan.scale = Math.min(1, Math.max(0.75, view.clientWidth / MAP.size));
  $('research-map').style.transform = `scale(${pan.scale})`;
  $('research-fit').style.width = $('research-fit').style.height = `${MAP.size * pan.scale}px`;
  if (!pan.placed) {
    // Start with the base in the middle of the window.
    pan.x = (view.clientWidth - MAP.size * pan.scale) / 2;
    pan.y = (view.clientHeight - MAP.size * pan.scale) / 2;
    pan.placed = true;
  }
  placeMap();
}
(function dragMap() {
  const view = $('research-view');
  let from = null, dragged = false;
  view.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    from = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    dragged = false;
  });
  view.addEventListener('pointermove', e => {
    if (!from) return;
    const dx = e.clientX - from.x, dy = e.clientY - from.y;
    // A small wobble is still a click on a circle. Past that it is a drag.
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    if (!dragged) { dragged = true; view.setPointerCapture(e.pointerId); view.classList.add('dragging'); }
    pan.x = from.panX + dx;
    pan.y = from.panY + dy;
    placeMap();
  });
  const drop = () => { from = null; view.classList.remove('dragging'); };
  view.addEventListener('pointerup', drop);
  view.addEventListener('pointercancel', drop);
  // The click that ends a drag must not pick the circle under the pointer.
  view.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  view.addEventListener('wheel', e => { e.preventDefault(); pan.x -= e.deltaX; pan.y -= e.deltaY; placeMap(); }, { passive: false });
  // Tabbing to a circle outside the window brings it into view.
  view.addEventListener('focusin', e => {
    const node = e.target.closest('.rt-node');
    if (!node) return;
    const dot = node.querySelector('.rt-dot').getBoundingClientRect(), box = view.getBoundingClientRect(), edge = 72;
    if (dot.left < box.left + edge) pan.x += box.left + edge - dot.left;
    if (dot.right > box.right - edge) pan.x -= dot.right - (box.right - edge);
    if (dot.top < box.top + edge) pan.y += box.top + edge - dot.top;
    if (dot.bottom > box.bottom - edge) pan.y -= dot.bottom - (box.bottom - edge);
    placeMap();
  });
})();

// The sky behind the tree: a field of stars, the same every time, redrawn to fit the window.
function drawStars() {
  const cv = $('research-stars'), w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  let seed = 20261114;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const TINTS = ['255, 255, 255', '255, 255, 255', '255, 255, 255', '196, 214, 255', '222, 204, 255'];
  for (let i = Math.round(w * h / 650); i > 0; i--) {
    const x = rnd() * w, y = rnd() * h, big = rnd() > 0.93;
    const r = big ? 0.9 + rnd() * 0.7 : 0.35 + rnd() * 0.5;
    const tint = TINTS[Math.floor(rnd() * TINTS.length)], alpha = big ? 0.8 + rnd() * 0.2 : 0.3 + rnd() * 0.6;
    if (big) { // a soft halo around the few bright ones
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      halo.addColorStop(0, `rgba(${tint}, 0.28)`);
      halo.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = `rgba(${tint}, ${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}

function renderResearch() {
  const all = BRANCHES.flatMap(branch => branch.nodes);
  picked ??= (all.find(node => nodeState(node, unlocksNow(), save.points) === 'ready') ?? all[0]).id;
  $('research-points').textContent = save.points;
  $('research-note').textContent = UPGRADES_LIVE
    ? 'Pick a circle to see what it does. Drag the map to move around. Spend research points to add it to your base.'
    : 'Pick a circle to see what it does. Drag the map to move around. Spend research points to open new missions. We are still building the upgrades, so they stay locked until a later update.';
  $('research-map').innerHTML = mapHtml();
  $('research-panel').innerHTML = panelHtml(nodeById(picked));
  if (!$('research').hidden) fitMap();
}

function openResearch() {
  renderResearch();
  show('research');
  fitMap();
  drawStars();
}

function pick(id) {
  picked = id;
  renderResearch();
  $(`node-${id}`).focus();
}

function buy(id) {
  const node = nodeById(id);
  if (!node || nodeState(node, unlocksNow(), save.points) !== 'ready') return;
  save.points -= node.cost;
  save.unlocks.push(node.id);
  commit();
  pick(id);
}

// --- Briefing ---
// What the Sun has really been doing, from the flares the storms will be drawn from.
function spaceWeatherReport() {
  const list = flares.flares, count = letter => list.filter(f => f.classType[0] === letter).length;
  const top = list.reduce((a, b) => flareSize(b.classType).units > flareSize(a.classType).units ? b : a);
  const sizes = 'Flares are graded C, M or X, and X is the strongest.';
  return flares.live
    ? `Space weather report, live from NASA's DONKI database: in the past 12 months the Sun fired off ${count('X')} X-class flares and ${count('M')} M-class flares. The biggest was the ${flareLabel(top)}. ${sizes} Your storms are sized from these real flares, and they change every time you play.`
    : `Space weather report: the live NASA feed could not be reached, so your storms are sized from ${list.length} real past flares in NASA's DONKI records. ${sizes} They change every time you play.`;
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
    : mission.goalType === 'food' ? `${mission.goal} You need ${probe.goalValue} meals.`
    : mission.goalType === 'battery' ? `${mission.goal} If the battery is empty when the Sun comes up, the mission is not complete.` : mission.goal;
  $('brief-site').innerHTML = `
    <div>${icon('sun', 24)}<b>${Math.round(site.sun * 100)}%</b><span>of the time in sunlight at your base</span></div>
    <div>${icon('globe', 24)}<b>${Math.round(site.earth * 100)}%</b><span>of the time Earth is above the horizon</span></div>
    <div>${icon('droplet', 24)}<b>${site.iceDistance} m</b><span>to the nearest ice-cold shadow</span></div>`;
  show('brief');
  $('brief-flare').textContent = mission.storms.length ? 'Checking NASA DONKI for real solar flares…' : 'Real terrain: NASA LRO LOLA laser altimeter, 5 m per pixel.';
  if (mission.storms.length) {
    await flaresReady;
    if (chosen === id) $('brief-flare').textContent = spaceWeatherReport();
  }
}

// --- Playing ---
let tour = null;
function launch(id = chosen) {
  const mission = missionById(id);
  chosen = id;
  if (hud) endMission();
  // A new plan every time: different real flares, and storms at slightly different times.
  sim = new Sim(mission, save.mode, game.site, planRun(mission, flares?.flares ?? []));
  sim.say(mission.brief, 'info');
  hud = createHud({ sim, site: game.site, unlocks: unlocksNow(), api: game, liveFlares: flares?.live ?? false, points: save.points });
  tour?.destroy();
  tour = null;
  game.enter(sim, {
    frame(near) {
      hud.frame(near);
      tour?.frame();
      if (sim.over) finish();
    },
    openStation: id => hud.openStation(id),
    notice: t => hud.notice(t),
    busy: () => hud.busy(),
    toggleSpeed: () => hud.toggleSpeed(),
  });
  if (mission.tutorial) tour = createTour({ sim, game, hud });
  show(null);
}

function endMission() {
  tour?.destroy();
  tour = null;
  hud?.destroy();
  hud = null;
  game.stop();
}

function pause() {
  if (!hud) return;
  hud.close();
  game.pause();
  $('pause-mission').textContent = `${sim.mission.name}, ${sim.modeName} mode.`;
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
  const cards = mission.dataCards.map(kind => dataCard(kind, game.site));
  // Anyone who went through the airlock also gets the card about it.
  if (sim.airlock.uses) cards.push(dataCard('airlock', game.site));
  const met = sim.storms.filter(s => s.started);
  const stormFacts = met.map((s, i) => [
    met.length > 1 ? `Solar storm ${i + 1}` : 'Solar storm',
    s.flare
      ? `${s.strength}, sized from the real ${flareLabel(s.flare)}.${s.flare.sep ? ' NASA recorded a real particle storm after it.' : ''}${s.flare.note ? ` ${s.flare.note}` : ''}`
      : s.strength,
  ]);
  const facts = [
    ['Lowest life support', `${Math.round(sim.lowestAir)}%`],
    ['Radiation dose', `${Math.round(sim.dose)} of 100${mission.goalType === 'dose' ? ` (goal ${sim.goalValue})` : ''}`],
    ['Battery empty for', `${Math.round(sim.blackout)} s`],
    ...(sim.food !== null ? [['Meals at the end', `${sim.food} (goal ${sim.goalValue})`]] : []),
    ['Research from samples and data', `${sim.rp}`],
    ...stormFacts,
  ];
  endMission();
  $('debrief-title').textContent = o.won ? `${mission.name}: mission complete!` : `${mission.name}: not complete yet`;
  $('debrief-reason').textContent = o.reason;
  $('debrief-stars').innerHTML = starsHtml(stars);
  $('debrief-stats').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('debrief-points').textContent = `You earned ${earned} research points. You now have ${save.points}.`;
  $('debrief-lesson').textContent = mission.lesson;
  $('debrief-tips').innerHTML = sim.tips().map(t => `<li>${t}</li>`).join('');
  $('debrief-cards').replaceChildren(...cards.map(card => {
    const el = $('card-template').content.firstElementChild.cloneNode(true);
    el.querySelector('h3').textContent = card.title;
    el.querySelector('.card-body').textContent = card.body;
    el.querySelector('.card-source').textContent = card.source;
    return el;
  }));
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
  'open-all': () => { save.openAll = true; commit(); renderMissions(); },
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

addEventListener('resize', () => { if (!$('research').hidden) { fitMap(); drawStars(); } });

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
window.ui = { launch, get sim() { return sim; }, get save() { return save; }, finishNow: () => { sim.t = sim.total; }, get cues() { return sound.cuesPlayed; } };

renderStart();
show('start');
