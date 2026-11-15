// Menus around the game: start, mission choice, Research Tree, Scrapbook, briefing, pause, debrief and credits.
// Also runs a mission: makes the Sim, hands it to the 3D world and the HUD, and ends it.
import './ui.css';
import { CONFIG as C, MISSIONS, MODES, missionById, pointsFor } from './config.js';
import { Sim, planRun, flareLabel, flareSize, starRules } from './sim.js';
import { createHud, icon } from './hud.js';
import { createTour } from './tour.js';
import { getFlares, dataCard, SOURCES, PAST_FLARES } from './nasa.js';
import { emptySave, eraseSave, loadSave, writeSave } from './save.js';
import { BRANCHES, UPGRADES_LIVE, nodeById, nodeState, researchConfig } from './research.js';
import { PAGES } from './scrapbook.js';
import { createScrapbook } from './scrapbook-view.js';
import * as sound from './sound.js';
import { isTouch as isTouchScreen } from './touch.js';
import { createMoonMenu } from './moon-menu.js';
import { stopReading } from './speak.js';

const $ = id => document.getElementById(id);
const SCREENS = ['start', 'missions', 'research', 'scrapbook', 'pause', 'success', 'debrief', 'how', 'credits'];

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
// "The Sun right now": the newest flare in NASA's live feed, on the mission menu. Only shown when
// the feed really answered, so archived flares are never passed off as today's Sun.
flaresReady.then(({ live, flares: list }) => {
  if (!live || !list.length) return;
  const newest = list.reduce((a, b) => (b.date > a.date ? b : a));
  const days = Math.max(0, Math.round((Date.now() - Date.parse(`${newest.date}T12:00Z`)) / 86400000));
  const month = list.filter(f => Date.now() - Date.parse(`${f.date}T12:00Z`) < 30 * 86400000).length;
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  $('sun-now').innerHTML = `<b>The Sun right now</b> (live from NASA DONKI): its latest big flare was the ${flareLabel(newest)}, ${when}. `
    + `${month ? `That makes ${month} big flare${month === 1 ? '' : 's'} in the last 30 days.` : 'It has been quiet for the last 30 days.'} `
    + 'A flare is a sudden flash of energy from the Sun, and a big one can send a radiation storm toward the Moon.';
  $('sun-now').hidden = false;
});

const commit = () => { saveWorks = writeSave(save); };

// The Scrapbook: a page for each part of the base, collected by using that part in a mission.
const scrapbook = createScrapbook({
  getSave: () => save,
  commit,
  unlocks: () => unlocksNow(),
  allOpen: () => allOpen(),
  snapshot: name => game?.snapshot(name) ?? null,
  cover: () => $('start-picture').getAttribute('src'),
});
let newPages = [];     // Scrapbook pages collected in the mission being played
const listOf = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);

// Most screens swap with a plain cut. A few swaps are a move instead, named here with how long
// they take in milliseconds (the moves themselves are in ui.css, "Moving between screens"):
//   up    the view tips up to the sky: the old screen sinks away, with a soft top edge, off the
//         sky that was waiting behind it, while the stars rush down and slow to a stop
//   down  the way back: the stars rush up as the new screen rises over the sky
//   fade  the old screen fades away over the new one
//
//   scope       title screen to mission menu: the ring round the title's picture opens out
//               until the menu fills the screen
//   scope-back  the way back: the ring closes down onto the picture again
const MOVES = { up: 1100, down: 1000, fade: 350, scope: 850, 'scope-back': 700 };
const ALL_MOVES = Object.keys(MOVES).map(m => `move-${m}`);

// Tells ui.css where the ring round the title's picture is, how big, and how far it must open
// to uncover the whole screen.
function aimScope() {
  const ring = $('start').querySelector('.frame').getBoundingClientRect(), root = document.documentElement;
  const x = ring.left + ring.width / 2, y = ring.top + ring.height / 2, r0 = Math.max(24, ring.width / 2);
  const r1 = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 8;
  for (const [name, value] of [['x', `${x}px`], ['y', `${y}px`], ['r0', `${r0}px`], ['r1', `${r1}px`], ['grow', r1 / r0]]) root.style.setProperty(`--scope-${name}`, value);
}
const showing = () => SCREENS.find(key => !$(key).hidden && !$(key).classList.contains('leaving'));
let moving = null;   // { from, to, timer } while a move is playing
function settle() {
  if (!moving) return;
  clearTimeout(moving.timer);
  const { from, to } = moving;
  moving = null;
  for (const key of [from, to]) $(key).classList.remove('leaving', 'arriving', ...ALL_MOVES);
  $(from).hidden = true;
  if (to !== 'missions') moonMenu?.stop();
}
function show(name, move) {
  settle();   // a move that is still playing ends here
  const from = showing();
  for (const key of SCREENS) $(key).hidden = key !== name;
  if (move && from && name && from !== name && !calm) {
    // The old screen stays until the move is over. It can no longer be clicked.
    const old = $(from);
    old.hidden = false;
    old.style.setProperty('--scrolled', `${old.scrollTop}px`);
    if (move.startsWith('scope')) aimScope();
    old.classList.add('leaving', `move-${move}`);
    $(name).classList.add('arriving', `move-${move}`);
    moving = { from, to: name, timer: setTimeout(settle, MOVES[move] + 40) };
  }
  if (name !== 'missions' && !moving) moonMenu?.stop();   // the Moon only turns while it is on screen
  // Every screen opens at its top (you can scroll down from there), and starts on its main button
  // so Enter does the expected thing, without that moving the page.
  const screen = $(name ?? '');
  if (screen) screen.scrollTop = 0;
  // (Only a button that is showing can take it: the mission menu's Play is tucked away until a mission is picked.)
  const buttons = screen ? [...screen.querySelectorAll('.btn.primary:not([disabled])'), ...screen.querySelectorAll('button:not([disabled])')] : [];
  buttons.find(button => button.getClientRects().length)?.focus({ preventScroll: true });
}

const isOpen = mission => !mission.requires || unlocksNow().includes(mission.requires.id);

function starsHtml(count) {
  const text = count ? `${count} of 3 stars` : 'No stars yet';
  return `<span class="stars"><span aria-hidden="true">${'★'.repeat(count)}<span class="off">${'★'.repeat(3 - count)}</span></span> ${text}</span>`;
}

// --- Start ---
// While the Moon loads, the start screen shows just "Loading the Moon" with its dots counting
// . .. ... and round again; the Play button takes its place once it has loaded.
let loadingDots = 0;
function renderStart() {
  clearInterval(loadingDots);
  $('start-status').textContent = '';
  if (game) {
    $('start-actions').innerHTML = '<button class="btn primary" data-do="open-missions">Play</button>';
    makeMoon();
    return;
  }
  $('start-actions').innerHTML = '<p class="loading" role="status">Loading the Moon<span class="dots" aria-hidden="true">.</span></p>';
  const dots = $('start-actions').querySelector('.dots');
  let n = 1;
  loadingDots = setInterval(() => { n = n % 3 + 1; dots.textContent = '.'.repeat(n); }, 450);
}

// --- Mission menu ---
// The missions are a column of boxes beside a turning Moon with a flag for each one. Picking a
// mission opens its box (briefing, difficulty, star tests, Play) and turns the Moon to its flag.
let selected = null;   // mission id whose box is open on the menu
let moonMenu = null;   // the Moon, made the first time the menu is shown
let diving = false;    // true while the camera flies down to the flag after Play

function missionCard(mission, index) {
  const open = isOpen(mission), on = mission.id === selected;
  // Difficulty is picked inside the box, so the closed box shows your best result in any mode.
  const best = Math.max(0, ...Object.values(save.best[mission.id] ?? {}));
  const need = mission.requires;
  const mark = open
    ? `<span class="m-stars" aria-hidden="true">${'★'.repeat(best)}<span class="off">${'★'.repeat(3 - best)}</span></span><span class="sr-only">${best ? `${best} of 3 stars` : 'No stars yet'}</span>`
    : `<span class="m-lock">${icon('shield', 16)} Locked</span>`;
  return `
    <article class="mission ${open ? '' : 'locked'} ${on ? 'selected' : ''}" data-mission="${mission.id}">
      <button class="m-head" data-do="brief" data-id="${mission.id}" aria-expanded="${on}">
        <span class="num" aria-hidden="true">${index + 1}</span>
        <span class="m-title"><b>${mission.name}</b><span>${mission.short}</span></span>
        ${mark}
      </button>
      <div class="m-body">${on && !open ? `
        <p>${mission.brief}</p>
        <p class="need">${icon('shield', 16)} Unlock ${need.name} in the Research Tree to fly this mission.${need.about ? ` ${need.about}` : ''}</p>
        <button class="btn" data-do="research">Open Research Tree</button>` : ''}</div>
    </article>`;
}

function renderMissions() {
  $('points').textContent = save.points;
  const unread = scrapbook.unread();
  $('scrapbook-new').textContent = `${unread} new`;
  $('scrapbook-new').hidden = !unread;
  // The briefing panel is one piece of the page that moves into whichever box is open. Park it
  // before the list is redrawn so it is not thrown away with the old boxes.
  $('brief-holder').append($('brief-panel'));
  $('mission-list').innerHTML = MISSIONS.map(missionCard).join('');
  const mission = selected && missionById(selected);
  if (mission && isOpen(mission)) {
    $('mission-list').querySelector(`[data-mission="${selected}"] .m-body`).append($('brief-panel'));
    $('brief-text').textContent = mission.brief;
    renderBriefMode();
  }
  $('moon-caption').hidden = !!mission;
  $('moon-info').hidden = $('brief-flare').hidden = !mission;
  $('moon-out').hidden = !mission;
  moonMenu?.setLocked(MISSIONS.filter(m => !isOpen(m)).map(m => m.id));
  moonMenu?.pick(selected);
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

// How wide the mission menu's scroll bar is (0 where scroll bars float over the page). The Moon's
// picture stops short of it: see #moon-view in ui.css.
function measureBar() {
  const screen = $('missions');
  if (!screen.hidden) screen.style.setProperty('--bar', `${screen.offsetWidth - screen.clientWidth}px`);
}
addEventListener('resize', measureBar);

// Coming back from the Research Tree the view tips back down from the sky; coming back from the
// Scrapbook, the shut book fades away. From anywhere else it is a cut.
function openMissions() {
  if (hud) endMission();
  confirmErase = false;
  selected = null;
  diving = false;
  $('dive').classList.remove('on');
  const from = showing();
  if (from === 'research') startPan(-1, MOVES.down / 1000);
  show('missions', { research: 'down', scrapbook: 'fade', start: 'scope' }[from]);
  measureBar();
  makeMoon();
  renderMissions();
  // The menu starts on its first mission, so Enter opens that and doesn't go back to the title.
  $('mission-list').querySelector('.m-head')?.focus({ preventScroll: true });
  moonMenu.start();
}
// The Moon is made once, as soon as the game has loaded, so that its maps of the real Moon have
// arrived by the time the menu opens. It sizes itself to its place on the page when it starts.
function makeMoon() {
  moonMenu ??= createMoonMenu($('moon'), MISSIONS, id => { if (id ? id !== selected : selected) brief(id ?? selected); });
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
// Why a circle can't be researched yet, in a few words under its name (shown in red).
function whyNot(node, state) {
  if (state === 'short') return `Need ${node.cost - save.points} more point${node.cost - save.points === 1 ? '' : 's'}`;
  if (state === 'locked') return `Research ${nodeById(node.needs)?.name} first`;
  return '';
}
// Until the player has researched something, one good first pick pulses: Regolith Shielding,
// because it opens mission 2. If that is already open (the open-everything switch), the first of
// a few cheap, useful upgrades that can be researched takes its place. After the first purchase
// the choice is the player's, and nothing pulses.
const FIRST_PICKS = ['Shielding', 'DishAntenna', 'HeatBlankets', 'Scrubber', 'DrumDigger'];
function recommended() {
  if (save.unlocks.length) return null;
  return FIRST_PICKS.find(id => ['ready', 'short'].includes(nodeState(nodeById(id), unlocksNow(), save.points))) ?? null;
}

function mapHtml() {
  const state = node => nodeState(node, unlocksNow(), save.points);
  const first = recommended();
  const at = id => `left:${SPOTS[id].x}px;top:${SPOTS[id].y}px;--ring:${SPOTS[id].ring}`;
  const line = (id, kind, from = SPOTS[id].parent) => {
    const a = SPOTS[from], b = SPOTS[id];
    return `<line class="${kind}" data-a="${from}" data-b="${id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  };
  const kindOf = node => (state(node) === 'owned' ? 'on' : isShut(state(node)) ? 'shut' : 'open');
  const lines = BRANCHES.flatMap(branch => [
    line(`branch-${branch.id}`, 'on'),
    ...branch.nodes.map(node => line(node.id, kindOf(node))),
    ...branch.nodes.filter(node => SPOTS[node.id].dep).map(node => line(node.id, kindOf(node), SPOTS[node.id].dep)),
  ]);
  const nodes = BRANCHES.flatMap(branch => [
    `<div class="rt-branch" data-spot="branch-${branch.id}" style="${at(`branch-${branch.id}`)}"><span class="rt-dot">${glyph(branch.id, 24, branch.icon)}</span><span class="rt-name">${branch.name}</span></div>`,
    ...branch.nodes.map(node => {
      const st = state(node), why = whyNot(node, st), rec = first === node.id;
      return `<button class="rt-node is-${st}${rec ? ' is-recommended' : ''}" id="node-${node.id}" data-spot="${node.id}" style="${at(node.id)}" data-do="pick" data-id="${node.id}"
          aria-pressed="${picked === node.id}" aria-label="${node.name}, ${rec ? 'recommended first, ' : ''}${why || STATE_WORDS[st]}">
        <span class="rt-dot">${glyph(node.id, 24, node.icon)}${st === 'owned' ? `<span class="rt-badge">${glyph('check', 12)}</span>` : isShut(st) ? `<span class="rt-badge">${glyph('lock', 12)}</span>` : ''}</span>
        <span class="rt-name">${rec ? '<span class="rt-rec">Recommended</span>' : ''}${node.name}${why ? `<span class="rt-why">${why}</span>` : ''}</span>
      </button>`;
    }),
  ]);
  return `
    <svg class="rt-lines" viewBox="0 0 ${MAP.size} ${MAP.size}" aria-hidden="true">${lines.join('')}</svg>
    <div class="rt-hub" data-spot="hub" style="${at('hub')}"><span class="rt-dot">${glyph('hub', 32)}</span><span class="rt-name">Your base</span></div>
    ${nodes.join('')}`;
}

function panelHtml(node) {
  const state = nodeState(node, unlocksNow(), save.points);
  const mission = node.mission && missionById(node.mission);
  const status = {
    owned: `<p class="n-status done">${glyph('check', 16)} Researched</p>`,
    soon: `<p class="n-status">${glyph('lock', 16)} This upgrade is locked until a later update.</p>`,
    locked: `<p class="n-status no">${glyph('lock', 16)} Locked: research ${nodeById(node.needs)?.name} first to unlock this.</p>`,
    short: `<p class="n-status no">${icon('alert', 16)} Not enough research points: you have ${save.points} and this needs ${node.cost}.</p>
      <p class="n-earn">Earn more by finishing missions, picking up rock samples and sending science data home.</p>`,
    ready: `<button class="btn primary small" data-do="buy" data-id="${node.id}">Research for ${node.cost} points</button>`,
  }[state];
  return `
    <div class="n-head"><h3>${node.name}</h3><span class="n-cost">${state === 'owned' ? 'Owned' : `${node.cost} points`}</span></div>
    ${mission ? `<p class="n-opens">${icon('star', 16)} Opens mission ${MISSIONS.indexOf(mission) + 1}, ${mission.name}</p>` : ''}
    ${recommended() === node.id ? `<p class="n-rec">${icon('star', 16)} Recommended first${node.mission ? `: it opens mission ${MISSIONS.indexOf(mission) + 1}` : ''}. After this, what to research is up to you.</p>` : ''}
    ${status}
    <p class="n-science">${node.science}</p>
    <p class="n-change"><b>In the game</b> ${node.change}</p>`;
}

// The whole screen is the map. Drag anywhere that isn't a circle or a button to move it; zoom with
// the wheel, a trackpad pinch, two fingers on a touch screen, or the + and - keys. It opens zoomed
// in on your base, its five branches and the start of each path. Zoomed all the way out, the
// outermost circles still run off the top and bottom of the screen, so the whole tree is never in
// view at once: you explore it by dragging. It can't be zoomed in further than 2.4 times, nor
// dragged so far that the tree leaves the screen.
const view = { x: 0, y: 0, s: 1 };
const ZOOM_MAX = 2.4;
const zoomRange = () => {
  const box = $('research-view');
  // Out to where the outer ring sits just past the shorter edge of the screen.
  const lo = 1.15 * (Math.min(box.clientWidth, box.clientHeight) / 2 - 40) / (MAP.radius[3] - 30);
  return [lo, Math.max(ZOOM_MAX, lo * 1.9)]; // bigger screens may zoom in further, so there is always room
};
function placeMap() {
  const box = $('research-view'), w = box.clientWidth, h = box.clientHeight, size = MAP.size * view.s;
  const [lo, hi] = zoomRange();
  view.s = Math.min(hi, Math.max(lo, view.s));
  // The middle of the screen always stays over the tree.
  view.x = Math.min(w / 2, Math.max(w / 2 - size, view.x));
  view.y = Math.min(h / 2, Math.max(h / 2 - size, view.y));
  $('research-map').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
}
// Zoom by a factor, keeping the point under (px, py) where it is.
function zoomMap(factor, px, py) {
  const box = $('research-view');
  px ??= box.clientWidth / 2; py ??= box.clientHeight / 2;
  const [lo, hi] = zoomRange(), next = Math.min(hi, Math.max(lo, view.s * factor)), k = next / view.s;
  view.x = px - (px - view.x) * k;
  view.y = py - (py - view.y) * k;
  view.s = next;
  placeMap();
}
// The starting view: your base in the middle, with the branches and the first circle of each
// path in sight.
function fitMap() {
  const box = $('research-view'), w = box.clientWidth, h = box.clientHeight;
  view.s = zoomRange()[0] * 1.22; // a little closer than the furthest you can zoom out
  view.x = w / 2 - MAP.size / 2 * view.s;
  // Centred in the space below the title bar, not behind it.
  const bar = $('research').querySelector('.rt-top').offsetHeight;
  view.y = (h + bar) / 2 - MAP.size / 2 * view.s;
  placeMap();
}
(function dragMap() {
  const box = $('research-view');
  const fingers = new Map();
  let from = null, dragged = false, pinch = 0;
  box.addEventListener('pointerdown', e => {
    // Circles are buttons: a press on one is for picking it, not for moving the map.
    if (e.button !== 0 || e.target.closest('.rt-dot')) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    box.setPointerCapture(e.pointerId);
    from = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    dragged = false; pinch = 0;
  });
  box.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], apart = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomMap(apart / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = apart; dragged = true;
      return;
    }
    const dx = e.clientX - from.x, dy = e.clientY - from.y;
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    dragged = true;
    box.classList.add('dragging');
    view.x = from.vx + dx;
    view.y = from.vy + dy;
    placeMap();
  });
  const drop = e => {
    if (!fingers.delete(e.pointerId)) return;
    box.classList.remove('dragging');
    pinch = 0;
    if (fingers.size === 1) { const [f] = fingers.values(); from = { x: f.x, y: f.y, vx: view.x, vy: view.y }; }
    // A press on empty space that didn't move puts the details box away.
    else if (!dragged && e.type === 'pointerup') { picked = null; showPanel(null); renderResearch(); }
  };
  box.addEventListener('pointerup', drop);
  box.addEventListener('pointercancel', drop);
  // The wheel and a two-finger trackpad swipe zoom; a trackpad pinch arrives as a wheel with Ctrl.
  box.addEventListener('wheel', e => {
    e.preventDefault();
    zoomMap(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - box.getBoundingClientRect().left, e.clientY - box.getBoundingClientRect().top);
  }, { passive: false });
  addEventListener('keydown', e => {
    if ($('research').hidden || e.target.closest?.('input')) return;
    if (e.key === '+' || e.key === '=') { zoomMap(1.2); e.preventDefault(); }
    if (e.key === '-' || e.key === '_') { zoomMap(1 / 1.2); e.preventDefault(); }
  });
  // Hovering a circle shows its details; leaving it puts them away again, unless the circle was
  // clicked (then they stay) or the pointer has moved onto the details box itself.
  let leaveTimer = 0;
  box.addEventListener('pointerover', e => {
    const node = e.target.closest('.rt-dot')?.closest('.rt-node');
    if (!node) return;
    clearTimeout(leaveTimer);
    showPanel(node.dataset.id);
  });
  box.addEventListener('pointerout', e => {
    if (!e.target.closest('.rt-dot')) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => showPanel(picked), 280);
  });
  $('research-panel').addEventListener('pointerenter', () => clearTimeout(leaveTimer));
  $('research-panel').addEventListener('pointerleave', () => { leaveTimer = setTimeout(() => showPanel(picked), 280); });
  // Tabbing to a circle shows its details and brings it into view. A circle that was clicked or
  // tapped is left where it is: moving it from under the pointer would lose the click.
  let byKey = false;
  addEventListener('keydown', () => { byKey = true; }, true);
  addEventListener('pointerdown', () => { byKey = false; }, true);
  box.addEventListener('focusin', e => {
    const node = e.target.closest('.rt-node');
    if (!node) return;
    showPanel(node.dataset.id);
    if (!byKey) return;
    const dot = node.querySelector('.rt-dot').getBoundingClientRect(), edge = 96;
    if (dot.left < edge) view.x += edge - dot.left;
    if (dot.right > innerWidth - edge) view.x -= dot.right - (innerWidth - edge);
    if (dot.top < edge + 60) view.y += edge + 60 - dot.top;
    if (dot.bottom > innerHeight - edge) view.y -= dot.bottom - (innerHeight - edge);
    placeMap();
  });
})();
let panelShows = null;
function showPanel(id) {
  if (id === panelShows) return;
  panelShows = id;
  $('research-panel').hidden = !id;
  if (id) $('research-panel').innerHTML = panelHtml(nodeById(id));
}

// The sky behind the tree: a field of stars, the same every time. Most of them twinkle, each on its
// own slow beat; a few bright ones carry a soft halo.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let sky = [];
function drawStars() {
  const cv = $('research-stars'), w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  let seed = 20261114;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const TINTS = ['255, 255, 255', '255, 255, 255', '255, 255, 255', '196, 214, 255', '222, 204, 255'];
  sky = [];
  for (let i = Math.round(w * h / 650); i > 0; i--) {
    const x = rnd() * w, y = rnd() * h, big = rnd() > 0.93;
    const r = big ? 0.9 + rnd() * 0.7 : 0.35 + rnd() * 0.5;
    const tint = TINTS[Math.floor(rnd() * TINTS.length)], alpha = big ? 0.8 + rnd() * 0.2 : 0.3 + rnd() * 0.6;
    let halo = null;
    if (big) { // made once: a gradient belongs to its place on the canvas, so it can be reused
      halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      halo.addColorStop(0, `rgba(${tint}, 0.28)`);
      halo.addColorStop(1, `rgba(${tint}, 0)`);
    }
    // phase, speed (one beat every 2 to 8 seconds) and depth of the twinkle
    sky.push({ x, y, r, tint, fill: `rgb(${tint})`, alpha, halo, phase: rnd() * 6.283, speed: 0.8 + rnd() * 2.4, depth: rnd() < 0.3 ? 0.1 : 0.45 + rnd() * 0.5 });
  }
  paintStars(0);
}
// The sky could drift with the map (SKY_DRIFT above 0; it wraps round at the edges); for now it stays still.
const SKY_DRIFT = 0; // the sky stays still behind the map
const skyFrom = { x: 0, y: 0 };
// --- Looking up and down. Going to the tree from the mission menu, the view tips up: the whole sky
// moves down the screen, fast at first and slowing to a stop, and while it moves each star leaves
// a streak behind it, longer the faster it goes. Going back, the sky rushes up and away. The map
// rides with the stars. panTo(now) works out where the sky is and how fast it is moving.
const STREAK = 0.05;   // a star's streak is as long as the distance it covers in this many seconds
let pan = null;        // { t0, seconds, way } while the sky moves. way 1: arriving, -1: leaving
const panAt = { off: 0, speed: 0 };   // how far the sky is from its resting place (px), and px a second
function startPan(way, seconds) {
  if (calm) return;
  pan = { t0: performance.now(), seconds, way };
  panTo(pan.t0);
}
function stopPan() {
  pan = null;
  panAt.off = panAt.speed = 0;
  Object.assign($('research-view').style, { transform: '', opacity: '' });
}
function panTo(now) {
  if (!pan) return;
  const p = Math.min(1, Math.max(0, (now - pan.t0) / 1000 / pan.seconds)), far = innerHeight * 0.9;
  // Slow, fast, slow: the same curve as the screen's own move in ui.css.
  const e = p < 0.5 ? 4 * p ** 3 : 1 - (2 - 2 * p) ** 3 / 2, rate = (p < 0.5 ? 12 * p * p : 12 * (1 - p) ** 2) / pan.seconds;
  if (p >= 1 && pan.way > 0) return stopPan();
  panAt.off = pan.way > 0 ? -far * (1 - e) : -far * e;
  panAt.speed = pan.way * far * rate;
  // The map comes into view with the stars, and is only shown once they have slowed down.
  const seen = pan.way > 0 ? (p - 0.45) / 0.35 : 1 - p / 0.4;
  Object.assign($('research-view').style, { transform: `translateY(${panAt.off.toFixed(1)}px)`, opacity: Math.min(1, Math.max(0, seen)).toFixed(3) });
}
function paintStars(t) {
  const cv = $('research-stars'), ctx = cv.getContext('2d'), dpr = cv.width / innerWidth, w = innerWidth, h = innerHeight;
  const px = calm ? 0 : (view.x - skyFrom.x) * SKY_DRIFT, py = (calm ? 0 : (view.y - skyFrom.y) * SKY_DRIFT) + panAt.off;
  const wrap = (v, size) => ((v % size) + size) % size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // A streak trails behind a moving star: above it while the sky moves down, below while it moves up.
  // One fading strip is made for each star colour and reused for every star of that colour.
  const long = Math.min(130, Math.abs(panAt.speed) * STREAK), back = panAt.speed > 0 ? -1 : 1, strips = {};
  for (const st of sky) {
    const glow = calm ? 1 : 1 - st.depth * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase));
    const sx = wrap(st.x + px, w), sy = wrap(st.y + py, h);
    ctx.globalAlpha = st.alpha * glow;
    if (long > 2) {
      if (!strips[st.tint]) {
        strips[st.tint] = ctx.createLinearGradient(0, 0, 0, back * long);
        strips[st.tint].addColorStop(0, `rgba(${st.tint}, 0.85)`);
        strips[st.tint].addColorStop(1, `rgba(${st.tint}, 0)`);
      }
      const wide = Math.max(1, st.r * 1.7);
      ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
      ctx.fillStyle = strips[st.tint];
      ctx.fillRect(-wide / 2, back > 0 ? 0 : -long, wide, long);
    }
    ctx.setTransform(dpr, 0, 0, dpr, (sx - st.x) * dpr, (sy - st.y) * dpr);
    if (st.halo) { ctx.fillStyle = st.halo; ctx.beginPath(); ctx.arc(st.x, st.y, st.r * 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = st.fill;
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r * (0.85 + 0.25 * glow), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- The jiggle: the circles hang on springs. While the map is dragged they trail a little behind,
// further the faster it moves; when it stops they swing past and settle. The outer circles move
// more than the inner ones and the centre not at all.
const SPRING = 120, DAMP = 5, LAG = 0.009, SWAY = [0, 0.5, 0.78, 0.95]; // stiffness, damping, trail per px/s, share per ring
let wobble = new Map(); // spot id -> { el, w, k, ox, oy, vx, vy }
let wobbleLines = [];
function wireWobble() {
  wobble = new Map();
  for (const el of $('research-map').querySelectorAll('[data-spot]')) {
    const id = el.dataset.spot, spot = SPOTS[id];
    // A small difference in stiffness from circle to circle, so they don't all move as one.
    const k = SPRING * (0.85 + 0.3 * ((id.length * 37 + id.charCodeAt(0)) % 10) / 10);
    wobble.set(id, { el, w: SWAY[spot.ring], k, ox: 0, oy: 0, vx: 0, vy: 0 });
  }
  wobbleLines = [...$('research-map').querySelectorAll('line[data-a]')].map(el => ({ el, a: el.dataset.a, b: el.dataset.b }));
}
const motion = { x: 0, y: 0, s: 0, vx: 0, vy: 0, still: 0 };
function jiggle(dt) {
  if (calm || !wobble.size) return;
  // How fast the map is moving on screen, smoothed over a few frames. A zoom isn't a drag.
  const vx = view.s === motion.s ? (view.x - motion.x) / dt : 0, vy = view.s === motion.s ? (view.y - motion.y) / dt : 0;
  const smooth = 1 - Math.exp(-dt * 22), fastest = 2500;
  motion.vx += (Math.max(-fastest, Math.min(fastest, vx)) - motion.vx) * smooth;
  motion.vy += (Math.max(-fastest, Math.min(fastest, vy)) - motion.vy) * smooth;
  Object.assign(motion, { x: view.x, y: view.y, s: view.s });
  let busy = false;
  for (const n of wobble.values()) {
    if (!n.w) continue;
    // Where it would hang while the map moves (in map units), and the spring that pulls it there.
    const tx = -n.w * motion.vx * LAG / view.s, ty = -n.w * motion.vy * LAG / view.s;
    n.vx += (n.k * (tx - n.ox) - DAMP * n.vx) * dt;
    n.vy += (n.k * (ty - n.oy) - DAMP * n.vy) * dt;
    n.ox = Math.max(-14, Math.min(14, n.ox + n.vx * dt));
    n.oy = Math.max(-14, Math.min(14, n.oy + n.vy * dt));
    if (Math.abs(n.ox) + Math.abs(n.oy) > 0.05 || Math.abs(n.vx) + Math.abs(n.vy) > 0.5 || Math.abs(motion.vx) + Math.abs(motion.vy) > 1) busy = true;
    else { n.ox = n.oy = n.vx = n.vy = 0; }
  }
  if (!busy && motion.still) return; // everything at rest, and already drawn at rest
  motion.still = !busy;
  for (const n of wobble.values()) n.el.style.transform = n.ox || n.oy ? `translate(${n.ox.toFixed(2)}px, ${n.oy.toFixed(2)}px)` : '';
  const off = id => wobble.get(id) ?? { ox: 0, oy: 0 };
  for (const l of wobbleLines) {
    const a = SPOTS[l.a], b = SPOTS[l.b], oa = off(l.a), ob = off(l.b);
    l.el.setAttribute('x1', (a.x + oa.ox).toFixed(2)); l.el.setAttribute('y1', (a.y + oa.oy).toFixed(2));
    l.el.setAttribute('x2', (b.x + ob.ox).toFixed(2)); l.el.setAttribute('y2', (b.y + ob.oy).toFixed(2));
  }
}

// --- Arriving: the tree is traced out like a constellation. At first each circle is only a point
// of light among the stars. Then the lines are drawn outward from your base, one ring at a time,
// and each point grows into its circle as its line reaches it. A click on the map ends it early.
// The circles and names are animated in ui.css from the three times set here; the lines are drawn here.
const TRACE = { step: 0.26, draw: 0.34 };   // seconds between rings, and to draw one line
let trace = null;                           // { t0, start } while the tree is being traced
function startTrace(start) {
  if (calm) return;
  const map = $('research-map');
  for (const [name, seconds] of [['start', start], ['step', TRACE.step], ['draw', TRACE.draw]]) map.style.setProperty(`--trace-${name}`, `${seconds}s`);
  map.classList.add('tracing');
  trace = { t0: performance.now(), start };
  drawTrace(trace.t0);   // so no line shows before the first frame
}
function drawTrace(now) {
  if (!trace) return;
  const t = (now - trace.t0) / 1000;
  for (const l of wobbleLines) {
    const a = SPOTS[l.a], b = SPOTS[l.b];
    // A line to a ring starts when the ring before it is done. Lines that join two paths come last.
    const from = trace.start + (b.ring - 1) * TRACE.step + (l.a === b.parent ? 0 : TRACE.step);
    const k = Math.min(1, Math.max(0, (t - from) / TRACE.draw)), e = k * k * (3 - 2 * k);
    l.el.setAttribute('x2', (a.x + (b.x - a.x) * e).toFixed(2));
    l.el.setAttribute('y2', (a.y + (b.y - a.y) * e).toFixed(2));
    l.el.style.visibility = k ? '' : 'hidden';
  }
  if (t > trace.start + 3 * TRACE.step + TRACE.draw + 0.6) endTrace();
}
function endTrace() {
  if (!trace) return;
  trace = null;
  $('research-map').classList.remove('tracing');
  for (const l of wobbleLines) {
    l.el.setAttribute('x2', SPOTS[l.b].x); l.el.setAttribute('y2', SPOTS[l.b].y);
    l.el.style.visibility = '';
  }
  motion.still = 0;   // the jiggle redraws the lines where they hang
}

// One loop for the Research Tree screen while it is open: the twinkle, the jiggle and the tracing.
let treeLoop = 0, treeLast = 0;
let starsPainted = 0;
function treeFrame(now) {
  if ($('research').hidden) { treeLoop = 0; return; }
  const dt = Math.min(0.05, (now - treeLast) / 1000 || 0.016);
  treeLast = now;
  jiggle(dt);
  panTo(now);
  drawTrace(now);
  // The twinkle is slow (one beat every few seconds), so the star field is repainted 20 times a
  // second, which looks the same and costs far less. While the sky pans it is painted every frame.
  if (!calm && (panAt.speed || now - starsPainted >= 50)) { starsPainted = now; paintStars(now / 1000); }
  treeLoop = requestAnimationFrame(treeFrame);
}
function startTreeLoop() {
  Object.assign(motion, { x: view.x, y: view.y, s: view.s, vx: 0, vy: 0, still: 0 });
  Object.assign(skyFrom, { x: view.x, y: view.y });
  if (!treeLoop) { treeLast = performance.now(); treeLoop = requestAnimationFrame(treeFrame); }
}

function renderResearch() {
  endTrace();   // the map is made again below, so a tracing in progress ends here
  $('research-points').textContent = save.points;
  $('research-note').textContent = (UPGRADES_LIVE
    ? 'Point at a circle to see what it does, and click it to research it. '
    : 'Point at a circle to see what it does. For now research opens new missions; the upgrades stay locked until a later update. ')
    + (isTouchScreen ? 'Drag to move around, pinch to zoom.' : 'Drag to move around. Scroll or press + and − to zoom.');
  $('research-map').innerHTML = mapHtml();
  wireWobble();
  panelShows = undefined;
  showPanel(picked);
}

// From the mission menu the view tips up to the sky, where the tree is waiting as points of light.
function openResearch() {
  const from = showing(), up = from === 'missions';
  picked = null;
  renderResearch();
  show('research', up ? 'up' : undefined);
  fitMap();
  stopPan();
  if (up) startPan(1, 1.5);   // the stars take a little longer to settle than the menu takes to go
  drawStars();
  startTreeLoop();
  if (from !== 'research') startTrace(up && !calm ? 1.15 : 0.15);
}

// Clicking a circle keeps its details showing; clicking it again puts them away.
function pick(id) {
  picked = picked === id ? null : id;
  renderResearch();
  $(`node-${id}`)?.focus({ preventScroll: true });
  if (picked) clearOfPanel(id);
}
// The details box opens over the map. If it covers the circle just picked (or the title bar
// does), the map slides the shortest way that brings the circle and its name back into view.
function clearOfPanel(id) {
  const dot = $(`node-${id}`)?.closest('.rt-node'), panel = $('research-panel');
  if (!dot || panel.hidden) return;
  const c = dot.querySelector('.rt-dot').getBoundingClientRect(), n = dot.querySelector('.rt-name')?.getBoundingClientRect() ?? c;
  // The circle and the name under it, as one box.
  const d = { left: Math.min(c.left, n.left), right: Math.max(c.right, n.right), top: c.top, bottom: Math.max(c.bottom, n.bottom) };
  const p = panel.getBoundingClientRect(), bar = $('research').querySelector('.rt-top').getBoundingClientRect();
  const GAP = 16, NAME = 0;
  if (d.top < bar.bottom + GAP) view.y += bar.bottom + GAP - d.top;
  else if (d.right + GAP > p.left && d.left - GAP < p.right && d.bottom + NAME > p.top && d.top - GAP < p.bottom) {
    const left = d.right + GAP - p.left, up = d.bottom + NAME - p.top;
    // Sideways if the box is beside the tree (a computer), upward if it lies along the bottom (a phone).
    if (p.width < innerWidth * 0.7) view.x -= left; else view.y -= up;
  } else return;
  const map = $('research-map');
  map.style.transition = calm ? '' : 'transform .3s ease';
  placeMap();
  setTimeout(() => { map.style.transition = ''; }, 320);
}

function buy(id) {
  const node = nodeById(id);
  if (!node || nodeState(node, unlocksNow(), save.points) !== 'ready') return;
  save.points -= node.cost;
  save.unlocks.push(node.id);
  commit();
  picked = id;
  renderResearch();
}

// --- Scrapbook ---
// With no id it opens on the contents; with one, on that page.
// Coming from another screen the book starts shut and its cover swings open; turning pages
// inside the book does not shut it again.
function openScrapbook(id) {
  if (hud) endMission();
  const closed = $('scrapbook').hidden;
  show('scrapbook', showing() === 'missions' ? 'fade' : undefined);
  scrapbook.open(id, { closed });
}

// --- Briefing ---
// What the Sun has really been doing, from the flares the storms will be drawn from.
function spaceWeatherReport() {
  const list = flares.flares, count = letter => list.filter(f => f.classType[0] === letter).length;
  const top = list.reduce((a, b) => flareSize(b.classType).units > flareSize(a.classType).units ? b : a);
  const sizes = 'Flares are graded C, M or X, and X is the strongest.';
  return flares.live
    ? `Space weather report, live from NASA's DONKI database: in the past ${flares.days >= 360 ? '12 months' : `${flares.days} days`} the Sun fired off ${count('X')} X-class flares and ${count('M')} M-class flares. The biggest was the ${flareLabel(top)}. ${sizes} Your storms are sized from these real flares, and they change every time you play.`
    : `Space weather report: the live NASA feed could not be reached, so your storms are sized from ${list.length} real past flares in NASA's DONKI records. ${sizes} They change every time you play.`;
}

// Which of a mission's three star tests have been passed in a mode. Stars build on each other,
// so an old save that only knows "2 stars" counts as the first two.
function testsPassed(id, mode) {
  const best = save.best[id]?.[mode] ?? 0, seen = save.tests[id]?.[mode] ?? [];
  return [0, 1, 2].map(i => i < best || !!seen[i]);
}

// The difficulty buttons on the briefing, and the parts of the briefing that depend on them.
// The goal in full words, with this mode's number in it.
function goalText(mission, mode) {
  const probe = new Sim(mission, mode, game.site);
  return mission.goalType === 'dose'
    ? `${mission.goal} Keep your dose at ${probe.goalValue} or less.`
    : mission.goalType === 'food' ? `${mission.goal} You need ${probe.goalValue} meals.`
    : mission.goalType === 'battery' ? `${mission.goal} If the battery is empty when the Sun comes up, the mission is not complete.`
    : mission.goalType === 'samples' ? `${mission.goal} The rocks are outside, close to the base. Use the Airlock to go and get them. Rare blue ones lie further out and are worth more.` : mission.goal;
}

// What each of a mission's three stars asks for in a mode, in full words.
function starTexts(mission, mode) {
  const S = starRules(mission, mode);
  return [
    'Finish the mission: reach sunrise with the goal met',
    `Keep Life Support at ${S.two.lowestAir}% or more, with the battery empty for no more than ${S.two.maxBlackout} seconds`,
    `Keep Life Support at ${S.three.lowestAir}% or more, ${S.three.maxBlackout ? `the battery empty for no more than ${S.three.maxBlackout} seconds` : 'never let the battery run empty'}, ${S.three.shielding ? 'build the regolith shield, ' : ''}and keep your radiation dose at ${S.three.maxDose} or less${S.three.shielding ? ' (that takes the shield and hiding in the Storm Shelter)' : ''}`,
  ];
}

function renderBriefMode() {
  const mission = missionById(chosen);
  $('mode-choice').innerHTML = Object.entries(MODES).map(([key, mode]) =>
    `<button class="seg" data-do="mode" data-id="${key}" aria-pressed="${key === save.mode}"><b>${mode.label}</b><small>${mode.level}</small></button>`).join('');
  $('mode-about').textContent = MODES[save.mode].about;
  // The three star tests, one under the other. A star is filled in only if that test has been
  // passed before in this mode, so a filled second star can sit between two empty ones.
  const got = testsPassed(mission.id, save.mode), tests = starTexts(mission, save.mode);
  $('star-title').textContent = `How to earn 3 stars in ${MODES[save.mode].label} mode`;
  $('star-list').innerHTML = tests.map((text, i) =>
    `<li class="${got[i] ? 'got' : ''}"><span class="star" aria-hidden="true">${got[i] ? '★' : '☆'}</span><span>${text}<span class="sr-only"> (${got[i] ? 'earned before' : 'not earned yet'})</span></span></li>`).join('');
  $('brief-goal').textContent = goalText(mission, save.mode);
}

// Picking a mission on the menu (its box or its flag). Picking the open one again closes it.
async function brief(id) {
  if (diving) return;
  selected = selected === id ? null : id;
  if (selected) chosen = id;
  renderMissions();
  const box = $('mission-list').querySelector(`[data-mission="${id}"]`);
  box.querySelector('.m-head').focus({ preventScroll: true });
  $('missions').scrollTop = 0; // the menu stays at its top, Back and the Research Tree in view
  if (!selected) return;
  const mission = missionById(id), site = game.site;
  $('brief-site').innerHTML = `
    <div>${icon('sun', 24)}<b>${Math.round(site.sun * 100)}%</b><span>of the time in sunlight at your base</span></div>
    <div>${icon('globe', 24)}<b>${Math.round(site.earth * 100)}%</b><span>of the time Earth is above the horizon</span></div>
    <div>${icon('droplet', 24)}<b>${site.iceDistance} m</b><span>to the nearest ice-cold shadow</span></div>`;
  $('brief-flare').textContent = mission.storms.length ? 'Checking NASA DONKI for real solar flares…' : 'Real terrain: NASA LRO LOLA laser altimeter, 5 m per pixel.';
  if (mission.storms.length) {
    await flaresReady;
    if (selected === id) $('brief-flare').textContent = spaceWeatherReport();
  }
}

// Play: the camera flies down to the mission's flag while the screen fades, then the mission starts.
async function playChosen() {
  if (diving || !selected || !isOpen(missionById(selected))) return;
  diving = true;
  $('dive').classList.add('on');
  await moonMenu?.dive(selected);
  diving = false;
  launch(selected);
  $('dive').classList.remove('on');
}

// --- Playing ---
let tour = null;
function launch(id = chosen) {
  const mission = missionById(id);
  chosen = id;
  if (hud) endMission();
  newPages = [];
  let frames = 0;
  // A new plan every time: different real flares, and storms at slightly different times.
  // If the live check hasn't answered yet, the storms come from NASA's archived flares instead.
  sim = new Sim(mission, save.mode, game.site, planRun(mission, flares?.flares ?? PAST_FLARES), researchConfig(C, save.unlocks));
  sim.say(mission.brief, 'info');
  hud = createHud({ sim, site: game.site, unlocks: unlocksNow(), api: game, liveFlares: flares?.live ?? false });
  tour?.destroy();
  tour = null;
  game.enter(sim, {
    frame(near) {
      hud.frame(near);
      tour?.frame();
      // A few times a second: has the player just met something that has a Scrapbook page?
      if (frames++ % 20 === 0) {
        const fresh = scrapbook.collect(sim);
        if (fresh.length) {
          newPages.push(...fresh);
          sim.say(`New Scrapbook page${fresh.length > 1 ? 's' : ''}: ${listOf(fresh.map(page => page.name))}. Read ${fresh.length > 1 ? 'them' : 'it'} after the mission.`, 'good');
        }
      }
      if (sim.over) finish();
    },
    openStation: id => hud.openStation(id),
    notice: t => hud.notice(t),
    busy: () => hud.busy(),
    toggleSpeed: () => hud.toggleSpeed(),
    hotbar: i => hud.selectSlot(i),
    useTool: id => hud.holdTool(id),
    build: () => hud.build(),
  });
  // First Night gets the guided tour. Every mission gets the short how-to cards, each shown once.
  tour = createTour({ sim, game, hud, seen: save.howtos, onSeen: id => { if (!save.howtos.includes(id)) { save.howtos.push(id); commit(); } } });
  show(null);
}

function endMission() {
  stopReading();
  tour?.destroy();
  tour = null;
  hud?.destroy();
  hud = null;
  $('hud').inert = false;
  game.stop();
}

// The gear (or Esc) opens the Settings page; the "i" on the mission box opens the Mission page.
function pause(tab = 'settings') {
  if (!hud) return;
  hud.close();
  game.pause();
  $('pause-mission').textContent = `${sim.mission.name}, ${sim.modeName} mode.`;
  $('pm-goal').textContent = goalText(sim.mission, sim.modeName);
  $('pm-brief').textContent = sim.mission.brief;
  $('pm-flare').textContent = sim.storms.some(s => s.flare) ? 'Each solar storm in this mission is sized from a real flare in NASA\'s DONKI records.' : '';
  $('abandon').hidden = true;
  $('pause').querySelector('.dialog > .row').hidden = false;
  pauseTab(tab);
  $('hud').inert = true; // Tab stays inside the pause panel instead of reaching the HUD behind it
  show('pause');
}

// Abandoning asks first, and says plainly what will be lost.
function abandonAsk() {
  const rp = sim.rp;
  $('abandon-text').textContent = `You will go back to the mission menu and this run of ${sim.mission.name} ends here. `
    + `It earns no stars and no research points${rp ? `, so the ${rp} research point${rp === 1 ? '' : 's'} you collected on this run will not be kept` : ''}. `
    + 'Your saved stars, points and research stay as they are. You can start the mission again at any time.';
  $('abandon').hidden = false;
  $('pause').querySelector('.dialog > .row').hidden = true; // the question takes the place of the buttons
  $('abandon').querySelector('[data-do="abandon-no"]').focus();
}

// The Game paused panel has three pages: the mission, the settings, and the list of controls.
function pauseTab(id) {
  for (const page of ['mission', 'settings', 'controls']) {
    $(`page-${page}`).hidden = page !== id;
    $(`tab-${page}`).setAttribute('aria-selected', page === id);
  }
}

function resume() {
  $('hud').inert = false;
  game.resume();
  show(null);
}

function finish() {
  stopReading(); // the mission is over: stop reading a panel that is about to go
  const o = sim.over, mission = sim.mission, mode = sim.modeName;
  const stars = o.won ? o.stars : 0;
  const best = save.best[mission.id]?.[mode] ?? 0;
  // Replaying for stars you already had pays half. Research from samples and uploads always counts.
  let earned = pointsFor(mission, mode, stars);
  if (stars && stars <= best) earned = Math.round(earned / 2);
  earned += sim.rp;
  save.points += earned;
  if (stars) (save.best[mission.id] ??= {})[mode] = Math.max(best, stars);
  // Remember each star test passed in a full run to sunrise, even when the others were missed.
  if (o.reachedSunrise) {
    const passed = sim.starTests, before = testsPassed(mission.id, mode);
    (save.tests[mission.id] ??= {})[mode] = before.map((had, i) => had || passed[i]);
  }
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
    ...(mission.goalType === 'samples' ? [['Rock samples', `${sim.samples.size} (goal ${sim.goalValue})`]] : []),
    ['Research from samples and data', `${sim.rp}`],
    ...stormFacts,
  ];
  endMission();
  $('debrief-title').textContent = o.won ? `${mission.name}: mission complete!` : `${mission.name}: not complete yet`;
  $('debrief-reason').textContent = o.reason;
  $('debrief-stars').innerHTML = starsHtml(stars);
  $('debrief-stats').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  // A full-width note under the table: as a table row its long text was squeezed into a narrow column on phones.
  $('debrief-note').textContent = 'About the dose: the meter counts this mission\'s share of a safe dose, out of 100. NASA caps a real astronaut\'s whole career at 600 millisieverts (the unit for radiation dose), so every mission has to stay well under it.';
  $('debrief-points').textContent = `You earned ${earned} research points. You now have ${save.points}.`;
  $('debrief-pages').hidden = !newPages.length;
  if (newPages.length) {
    $('debrief-pages').innerHTML = `<b>New in your Scrapbook:</b> ${listOf(newPages.map(page => page.name))}. Read ${newPages.length > 1 ? 'each page' : 'the page'} for ${C.science.pageRP} more research points.`;
  }
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
  if (!o.won) return show('debrief');

  // A won mission stops first on the success screen: the stars earned come in one at a time,
  // each with its own note, and Continue goes on to the debrief.
  $('success-mission').textContent = `${mission.name} · ${MODES[mode].label} mode`;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  $('success-stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < stars ? 'got' : 'not'}" style="--i:${i}">${STAR}</span>`).join('');
  $('success-stars').setAttribute('aria-label', `${stars} of 3 stars`);
  $('success').style.setProperty('--n', stars);
  $('success-line').textContent = `${['', 'You made it to sunrise.', 'Great work, astronaut!', 'A perfect mission!'][stars]}${stars > best ? (best ? ' That is your best yet.' : '') : ''}`;
  $('success-count').textContent = `${stars} of 3 stars`;
  $('success-next-star').hidden = stars >= 3;
  if (stars < 3) $('success-next-star').textContent = `For star ${stars + 1}: ${starTexts(mission, mode)[stars].replace(/^./, c => c.toLowerCase())}.`;
  $('success-points').textContent = `+${earned} research points`;
  show('success');
  sound.winSound(stars, calm ? 0 : 0.5, calm ? 0 : 0.5);
}

function renderCredits() {
  $('sources').innerHTML = SOURCES.map(([what, who, url]) =>
    `<li><b>${what}:</b> ${who}. <a href="${url}" target="_blank" rel="noopener">${url.replace('https://', '')}</a></li>`).join('');
  $('photo-credits').innerHTML = PAGES.map(page => `<li><b>${page.name}:</b> ${page.real.caption} Photo: ${page.real.credit}.</li>`).join('');
}

// --- Buttons ---
const actions = {
  // Leaving the Scrapbook, the book shuts first.
  'open-missions': () => (showing() === 'scrapbook' ? scrapbook.close(openMissions) : openMissions()),
  home: () => { renderStart(); show('start', showing() === 'missions' ? 'scope-back' : undefined); },
  how: () => show('how'),
  credits: () => { renderCredits(); show('credits'); },
  mode: id => { save.mode = id; commit(); renderBriefMode(); $('mode-choice').querySelector(`[data-id=${id}]`).focus({ preventScroll: true }); },
  brief,
  launch: playChosen,
  'moon-out': () => { if (selected) brief(selected); },   // back to the whole Moon: closes the open mission
  again: id => launch(id),
  'success-next': () => show('debrief', 'fade'),
  restart: () => launch(sim.mission.id),
  research: openResearch,
  scrapbook: () => openScrapbook(),
  page: id => openScrapbook(id),
  level: id => scrapbook.setLevel(id),
  pick,
  buy,
  'pause-tab': pauseTab,
  'map-zoom': id => zoomMap(id === 'in' ? 1.25 : 1 / 1.25),
  'open-all': () => { save.openAll = true; commit(); renderMissions(); },
  resume,
  leave: openMissions,
  menu: () => pause('settings'),
  'mission-info': () => pause('mission'),
  'abandon-ask': abandonAsk,
  'abandon-no': () => { $('abandon').hidden = true; $('pause').querySelector('.dialog > .row').hidden = false; $('pause').querySelector('[data-do="resume"]').focus(); },
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
  if (e.code !== 'Escape' || e.repeat) return;
  // Between missions Esc is the Back button of whatever menu is showing.
  // It closes the innermost thing first: a pinned Research Tree box, then the tree; a Scrapbook
  // page goes back to the contents, then the book shuts.
  if (!hud) {
    const on = showing();
    if (on === 'research' && picked) { e.preventDefault(); picked = null; showPanel(null); renderResearch(); return; }
    if (on === 'scrapbook' && scrapbook.page) { e.preventDefault(); openScrapbook(); return; }
    const back = { research: 'open-missions', scrapbook: 'open-missions', how: 'home', credits: 'home', success: 'success-next', missions: selected ? 'moon-out' : 'home' }[on];
    if (back && !diving) { e.preventDefault(); actions[back](); }
    return;
  }
  if (!game) return;
  if (hud?.open) { hud.close(); return; }
  if (hud?.usesOpen) { hud.showUses(false); return; } // the power list closes before the game pauses
  if (hud && $('pause').hidden) pause();
  else if (!$('pause').hidden) resume();
});

addEventListener('resize', () => { if (!$('research').hidden) { placeMap(); drawStars(); } });

addEventListener('unhandledrejection', () => {
  if (!game) { clearInterval(loadingDots); $('start-actions').innerHTML = ''; $('start-status').textContent = 'The Moon didn\'t load. Please refresh the page.'; }
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
window.ui = { launch, get moon() { return moonMenu; }, scrapbook: openScrapbook, get sim() { return sim; }, get save() { return save; }, finishNow: () => { sim.t = sim.total; }, get cues() { return sound.cuesPlayed; } };

renderStart();
show('start');

// The 3D world (three.js scene, Rapier physics, models and terrain) is a separate download that
// starts now, so the start screen and its "Loading the Moon" show straight away instead of after
// the whole game has arrived. main.js calls gameReady() when the Moon is ready.
import('./main.js');
