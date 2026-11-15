// The guided tour for First Night. It is short: a welcome, steps for the screen (bottom, the
// power list, then top), two for the stations, a first moonwalk through the airlock, and a send-off.
// After it, and in the other missions, short how-to cards appear the first time they are needed
// (HOWTOS below): how to speed up time, and how to use the Building tool.
// Labels ("callouts") each sit next to the thing they describe, with a red arrow pointing at it.
// Things that sit together and belong together share one label, so no step shows more than four.
// Steps that only explain stop the game clock; steps that ask the player to do something let it run.

import { isTouch, forTouch } from './touch.js';

const $ = id => document.getElementById(id);

// A label is { target, side, title, text } or, for a group, { target, side, title, lines }.
// target is a CSS selector, a list of selectors (one frame round them all) or { station }.
// side = which side of the thing the label sits on. lines = [name, what it is] pairs.
const SCREEN_BOTTOM = [
  {
    target: '#meters', side: 'right', title: 'Your three meters',
    lines: [
      ['Power', 'Your battery. The Sun fills it, machines drain it.'],
      ['Life Support', 'The air in the base. You use it, the machine refills it.'],
      ['Radiation dose', 'It never goes down. Storms and moonwalks raise it.'],
    ],
  },
  {
    target: ['#supplies', '#rp-bar'], side: 'left', title: 'What you have collected',
    lines: [
      ['Rock samples', 'Tonight\'s goal: bring back 5 glowing rocks.'],
      ['Moon dirt', 'The robot digs it. For building, repairs and Boost.'],
      ['Research points', '+2 for each rock, +1 for each data upload.'],
    ],
  },
];
const SCREEN_TOP = [
  { target: '#feed', side: 'below', title: 'Messages', text: 'From the base computer and Mission Control.' },
  { target: '#clock', side: 'below', title: 'Sun clock', text: 'Yellow is day, blue is night, red is a storm.' },
  { target: ['#mission-handle', '#mission-card'], side: 'below', title: 'Mission', text: 'Your goal and your next step. The arrow slides it away.' },
  { target: '#settings', side: 'left', title: 'Settings', text: 'Pause, speed, sound and controls.' },
];

// The stations, in two groups, each labelled at its floating label in the base.
const STATIONS_RUN = [
  { target: { station: 'Power' }, title: 'Power', text: 'What charges and drains the battery.' },
  { target: { station: 'LifeSupport' }, title: 'Life Support', text: 'Pick Eco, Normal or Boost.' },
  { target: { station: 'Comms' }, title: 'Comms', text: 'Antenna on: Earth warns of storms.' },
];
const STATIONS_WORK = [
  { target: { station: 'MapTable' }, title: 'Robot Map', text: 'Send the robot to dig. Park it in storms.' },
  { target: { station: 'Food' }, title: 'Galley', text: 'Food and the greenhouse, for later missions.' },
  { target: { station: 'Shelter' }, title: 'Storm Shelter', text: 'Hide here in storms (the blue floor).' },
  { target: { station: 'Airlock' }, title: 'Airlock', text: 'The way out to the Moon. Not in storms.' },
];

function buildSteps() {
  const skipPractice = { label: 'Skip practice', to: 'ready' };
  return [
    {
      title: 'Welcome to your first night', at: 'center', freeze: true,
      text: [
        'You run a small Moon base on your own. <b>Bring back 5 glowing rock samples and keep the base running until the Sun comes back.</b>',
        'Short labels will show what everything does. You can press <b>Skip tour</b> at any time.',
      ],
    },
    {
      title: 'The bottom of your screen', at: 'left', freeze: true, callouts: SCREEN_BOTTOM,
      text: ['Your meters are on the left. What you have collected is on the right. Press <b>Next</b> when you have read them.'],
    },
    // The Power bar is also a button: it opens the list of what is using power.
    {
      title: 'Where your power goes', at: 'center', freeze: true, target: '#power-btn', side: 'right',
      nextLabel: 'Show me', action: hud => hud.showUses(true), until: (sim, hud) => hud.usesOpen,
      text: ['Your <b>Power</b> bar is also a button. <b>Click it</b> to see a list of everything that is using power.'],
    },
    {
      title: 'What is using your power', at: 'center', freeze: true, target: '#power-uses', side: 'right',
      enter: hud => hud.showUses(true), leave: hud => hud.showUses(false),
      text: [
        'Each row is one machine, and the power it takes every second. <b>Life Support</b> is always on. The heaters switch on by themselves at night.',
        'Dimmed rows are switched off. To save power, turn things off or down at their stations.',
        'You can open this list at any time. Click the Power bar again to close it.',
      ],
    },
    {
      title: 'The top of your screen', at: 'center', freeze: true, callouts: SCREEN_TOP,
      text: ['Messages, the Sun clock, your mission and the settings. Press <b>Next</b> when you have read them.'],
    },
    {
      title: 'Stations that run the base', at: 'left', freeze: true, callouts: STATIONS_RUN, hideWhenStationOpen: true,
      text: ['These three keep the lights on and the air fresh. <b>Click a label</b> to open a station (or press <b>E</b> when close).'],
    },
    {
      title: 'Stations for work and safety', at: 'left', freeze: true, callouts: STATIONS_WORK, hideWhenStationOpen: true,
      text: ['The robot, your food, the storm shelter and the way outside. Press <b>Next</b> when you are done.'],
    },
    // The first moonwalk, through the airlock. Every step lets the player skip it.
    {
      id: 'trip-offer', title: 'Your first moonwalk', at: 'center', freeze: true, alt: skipPractice, nextLabel: 'Let\'s go',
      closeStation: true,
      text: [
        'The glowing rocks are outside. Let\'s go out through the airlock together and pick up the first one. It takes about a minute.',
        '<b>The mission clock starts when you press Let\'s go.</b> Until then, time stands still.',
      ],
    },
    {
      id: 'trip-open', title: 'Open the Airlock', target: { station: 'Airlock' }, side: 'above', at: 'right', alt: skipPractice,
      hint: 'Click the Airlock label (or walk up and press E).',
      text: [
        '<b>The clock is running now.</b> The Sun clock at the top of the screen counts down to sunset.',
        'Click the glowing <b>Airlock</b> label.',
      ],
      waitOpen: 'Airlock', noNext: true, closeStation: true,
    },
    {
      id: 'trip-go', title: 'Suit up', target: '#station-body [data-act="outside"]', side: 'left', at: 'right', alt: skipPractice,
      hint: 'Press "Suit up and go outside", then walk out when the outer door opens.',
      text: [
        'Press <b>Suit up and go outside</b>. Watch the bar in the middle of the screen while the doors and air pump work.',
        '<b>When the hatch is open, walk out onto the Moon</b> with WASD.',
      ],
      until: sim => sim.where === 'outside', noNext: true,
    },
    {
      id: 'trip-outside', title: 'You are on the Moon', target: '#meters [data-m="suit"]', side: 'right', at: 'right',
      hint: 'Pick up a glowing rock with E. Then go back up the yellow steps, press E to open the hatch, walk in, and press E again to choose "Close up and come inside".',
      text: [
        'Walk to a <b>glowing rock</b> and press <b>E</b> to pick it up. Your <b>suit air</b> counts down on the meter.',
        'The hatch shuts behind you. <b>To come back:</b> walk up the yellow steps and press <b>E</b> at the hatch to open it. Walk in, and between the two doors press <b>E</b> again and choose <b>Close up and come inside</b>.',
      ],
      until: sim => sim.where !== 'outside' && sim.airlockStatus === 'pressurized', noNext: true,
    },
    {
      id: 'ready', title: 'You are ready', at: 'center', closeStation: true, last: true,
      text: [
        '<b>Bring back 5 glowing rocks and survive until sunrise.</b> Go for the rocks while the Sun is up if you can.',
        'A solar storm will pass before sunset: park the robot and go to the Storm Shelter.',
        'When it gets dark, set Life Support to <b>Eco</b> so the battery lasts. <b>F</b> switches your chest light on, and <b>T</b> speeds up time.',
      ],
    },
  ];
}

// How-to cards. Each is shown once (the save remembers), when `when` first comes true and nothing
// else is on screen. `known` skips one the player has plainly worked out already.
const calm = sim => !sim.stormNow && !sim.nextStorm?.warnedBy;
const HOWTOS = [
  {
    // First Night: nothing left to do but wait, so show how to make the wait shorter. It comes up
    // once all the rocks are in and you are back inside, or once night has fallen and you are inside.
    id: 'speed',
    when: (sim, hud) => !!sim.mission.tutorial && sim.where !== 'outside' && !sim.inAirlock && sim.airlockStatus === 'pressurized' && calm(sim)
      && (sim.samples.size >= sim.goalValue || sim.t >= sim.day),
    known: (sim, hud) => hud.speed > 1,
    steps: sim => [
      {
        title: 'Speed up time', at: 'right', nextLabel: 'Set 2x speed', action: hud => hud.setSpeed(2), until: (s, hud) => hud.speed > 1,
        hint: isTouch ? 'Tap "Set 2x speed" on the card to make time go faster.' : 'Press T to make time go 2x as fast.',
        text: [
          sim.samples.size >= sim.goalValue ? `All ${sim.goalValue} rocks are in. Now the base only has to last until sunrise.` : 'Night has fallen. Once the base is set for the night, sunrise is a long wait.',
          isTouch ? 'Tap <b>Set 2x speed</b> to make time go <b>2x</b> as fast.' : 'Press <b>T</b> to make time go <b>2x</b> as fast.',
        ],
      },
      {
        title: 'Time is going 2x as fast', at: 'right', nextLabel: 'Got it',
        text: [
          isTouch ? 'The <b>Game speed</b> button in Settings (the gear) steps through 2x, 3x and back to normal.' : '<b>T</b> again makes it 3x, and once more takes it back to normal. The same button is in Settings (the gear).',
          'A solar storm always sets time back to normal, so you can get to the shelter.',
        ],
      },
    ],
  },
  {
    // The mission about the regolith shield: show the new tool in slot 2 and what it builds.
    id: 'build',
    when: (sim, hud) => hud.hasTool('builder') && sim.mission.goalType === 'dose' && sim.where !== 'outside' && calm(sim),
    known: sim => sim.shielding > 0,
    steps: sim => [
      {
        title: 'New tool: the Building tool', at: 'right', freeze: true, target: '#hotbar [data-tool="builder"]', side: 'above',
        nextLabel: 'Take it out', action: hud => hud.holdTool('builder'), until: (s, hud) => hud.holding === 'builder',
        text: [
          'Your Regolith Shielding research came with a <b>Building tool</b>. It is in slot 2 at the bottom of your screen.',
          isTouch ? '<b>Tap the slot</b> to take it out.' : 'Press <b>2</b> (or click the slot) to take it out.',
        ],
      },
      {
        title: 'Build a regolith shield', at: 'right', freeze: true, target: '#build-card', side: 'above', nextLabel: 'Got it',
        text: [
          'With the tool out, this card shows what you can build: a shield of moon dirt (regolith) piled over the Storm Shelter. A blue outline at the back of the Habitat shows where it will go.',
          `<b>It needs ${sim.shieldCost} moon dirt and you have ${Math.floor(sim.regolith)}.</b> Send the robot to dig at the <b>Robot Map</b> first. When you have enough, press <b>Build it</b>${isTouch ? '' : ' (or <b>B</b>)'}.`,
          'Build it before the first storm, then hide in the shelter. You need both for 3 stars.',
        ],
      },
    ],
  },
];

const ARROW = '<svg viewBox="0 0 22 28" width="22" height="28" aria-hidden="true"><path d="M11 4 18 14h-4.5v10h-5V14H4z" fill="#fff" stroke="rgba(3, 8, 24, .6)" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// seen: the how-to cards this save has already shown. onSeen(id) is called when another one is done.
export function createTour({ sim, game, hud, seen = [], onSeen = () => {} }) {
  const root = $('tour'), card = $('tour-card'), ring = $('tour-ring'), arrow = $('tour-arrow');
  let steps = [];               // the steps on screen now: the tour's, or one how-to's
  let kind = null;              // 'tour', or the id of the how-to that is showing
  let active = false;           // a card is on screen
  const shown = new Set(seen);
  let i = -1;
  let alive = true;
  let callouts = [];            // the labels of the current step
  let lastLayout = 0;
  let lastFrame = 0;
  const holder = document.createElement('div');
  holder.id = 'tour-callouts';
  root.append(holder);

  const setFreeze = on => game.freeze(!!on);

  function clearCallouts() {
    callouts = [];
    holder.innerHTML = '';
  }

  function buildCallouts(list) {
    clearCallouts();
    callouts = list.map(c => {
      const el = document.createElement('div');
      el.className = c.lines ? 'tour-callout group' : 'tour-callout';
      const body = c.lines ? c.lines.map(([name, what]) => `<span><em>${name}</em> ${forTouch(what)}</span>`).join('') : `<span>${forTouch(c.text)}</span>`;
      el.innerHTML = `<b>${c.title}</b>${body}<i class="c-arrow">${ARROW}</i>`;
      const box = document.createElement('div'); // kept for the layout code, but never shown
      box.className = 'tour-ring-sm';
      box.hidden = true;
      holder.append(el);
      return { c, el, box, arrow: el.querySelector('.c-arrow') };
    });
  }

  // The clock stands still while the tour explains things. The first time it is let go, say so:
  // a message from the base computer, and the Sun clock flashes.
  // Only First Night holds the clock at the start; the other missions are running from the off.
  let started = !sim.mission.tutorial;
  function startClock() {
    if (started) return;
    started = true;
    const left = Math.round(sim.timeToSunset), time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    sim.say(`The mission clock has started. Sunset is in ${time}.`, 'warn');
    const clock = $('clock');
    clock.classList.remove('started');
    void clock.offsetWidth;   // lets the flash play again on a second mission
    clock.classList.add('started');
    setTimeout(() => clock.classList.remove('started'), 3200);
  }

  function run(list, id) {
    steps = list;
    kind = id;
    active = true;
    root.hidden = false;
    enter(0);
  }

  function enter(n) {
    steps[i]?.leave?.(hud);
    i = n;
    const s = steps[i];
    if (!s) return finish();
    s.enter?.(hud);
    clearCallouts();
    if (s.callouts) buildCallouts(s.callouts);
    // While the screen is being labelled, the base's own labels step back so nothing crowds.
    document.body.classList.toggle('tour-labels', s.callouts === SCREEN_BOTTOM || s.callouts === SCREEN_TOP);
    // The last card holds the clock too, unless the moonwalk already started it.
    const hold = !!s.freeze || (!!s.last && !started);
    setFreeze(hold);
    if (!hold) startClock();
    sim.flags.tourHint = s.hint ? forTouch(s.hint) : null;
    $('tour-step').textContent = `${kind === 'tour' ? 'Tour' : 'How to'}: step ${i + 1} of ${steps.length}`;
    $('tour-title').textContent = s.title;
    const text = s.last ? [...s.text, started ? 'The mission clock is already running.' : '<b>The mission clock starts when you press Start the night.</b>'] : s.text;
    $('tour-text').innerHTML = text.map(p => `<p>${forTouch(p)}</p>`).join('');
    $('tour-more').hidden = true;
    $('tour-next').hidden = !!s.noNext;
    $('tour-next').textContent = s.last ? 'Start the night' : (s.nextLabel ?? 'Next');
    // A how-to is two cards long, so its last card needs no way to skip the rest.
    $('tour-skip').textContent = kind === 'tour' ? 'Skip tour' : 'Skip';
    $('tour-skip').hidden = kind !== 'tour' && i === steps.length - 1;
    $('tour-alt').hidden = !s.alt;
    if (s.alt) $('tour-alt').textContent = s.alt.label;
    card.className = `panel at-${s.at ?? 'right'}`;
    ring.hidden = true;
    arrow.hidden = true;
    if (s.closeStation) hud.close();
    lastLayout = 0;
  }

  // Where a target is on the screen, as { left, top, width, height, panel }.
  function rectOf(target) {
    if (!target) return null;
    if (target.station) {
      const p = game.stationScreen(target.station);
      if (!p) return null;
      return { left: p.x - 58, top: p.y - 16, width: 116, height: 32 };
    }
    if (Array.isArray(target)) {
      // Several things side by side share one frame.
      const parts = target.map(rectOf).filter(Boolean);
      if (!parts.length) return null;
      const left = Math.min(...parts.map(q => q.left)), top = Math.min(...parts.map(q => q.top));
      return { left, top, width: Math.max(...parts.map(q => q.left + q.width)) - left, height: Math.max(...parts.map(q => q.top + q.height)) - top };
    }
    const el = document.querySelector(target);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const panel = el.closest('#station')?.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, panel };
  }

  // The single arrow and ring used by the one-target steps (the airlock practice).
  function place(s) {
    const r = rectOf(s.target);
    if (!r) { ring.hidden = true; arrow.hidden = true; return; }
    ring.hidden = false; arrow.hidden = false;
    const pad = 4;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const W = 40, H = 52, gap = 8;
    let x, y, rot;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    switch (s.side) {
      case 'below': x = cx - W / 2; y = r.top + r.height + gap; rot = 0; break;
      case 'above': x = cx - W / 2; y = r.top - H - gap; rot = 180; break;
      case 'left': {
        const edge = r.panel ? Math.min(r.left, r.panel.left) : r.left;
        x = edge - H - gap + (H - W) / 2; y = cy - H / 2; rot = 90; break;
      }
      default: x = r.left + r.width + gap + (H - W) / 2; y = cy - H / 2; rot = -90;
    }
    x = Math.max(4, Math.min(innerWidth - H - 4, x));
    y = Math.max(4, Math.min(innerHeight - H - 4, y));
    arrow.style.left = `${x}px`;
    arrow.style.top = `${y}px`;
    arrow.style.transform = `rotate(${rot}deg)`;
  }

  // Put every label of the step next to its target, then nudge any that overlap.
  function layoutCallouts(s, dt = 0.016) {
    const hidden = s.hideWhenStationOpen && hud.open;
    const W = innerWidth, H = innerHeight, GAP = 30, placed = [];
    for (const it of callouts) {
      let r = hidden ? null : rectOf(it.c.target);
      it.el.hidden = !r;
      if (r && !it.cw) { it.el.style.width = ''; it.cw = Math.ceil(it.el.getBoundingClientRect().width); } // measure once
      if (!r) { it.sr = it.dx = it.side = undefined; continue; }
      // Ease toward where the target is, so the label glides instead of jumping with the camera.
      const follow = 1 - Math.exp(-dt * 14);
      if (!it.sr) it.sr = { left: r.left, top: r.top, width: r.width, height: r.height };
      else for (const k of ['left', 'top', 'width', 'height']) it.sr[k] += (r[k] - it.sr[k]) * follow;
      r = it.sr;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let side = it.c.side;
      if (!side) {
        // Stations choose a side by where they are on screen. A margin keeps a label from
        // flipping back and forth when its target sits right on the line.
        const m = W * 0.05, cur = it.side;
        const want = cx < W * 0.4 ? 'left' : cx > W * 0.6 ? 'right' : cy < H * 0.5 ? 'above' : 'below';
        if (!cur) side = want;
        else if (cur === 'left') side = cx > W * 0.4 + m ? want : 'left';
        else if (cur === 'right') side = cx < W * 0.6 - m ? want : 'right';
        else if (cx < W * 0.4 - m || cx > W * 0.6 + m) side = want;
        else if (cur === 'above') side = cy > H * 0.5 + m ? 'below' : 'above';
        else side = cy < H * 0.5 - m ? 'above' : 'below';
      }
      const cw = it.cw || 190, h = it.el.offsetHeight || 40;
      let x, y;
      if (side === 'right') { x = r.left + r.width + GAP; y = cy - h / 2; }
      else if (side === 'left') { x = r.left - GAP - cw; y = cy - h / 2; }
      else if (side === 'below') { x = cx - cw / 2; y = r.top + r.height + GAP; }
      else { x = cx - cw / 2; y = r.top - GAP - h; }
      Object.assign(it, { r, side, cx, cy, cw, h, x, y });
      placed.push(it);
    }
    const vertical = it => it.side === 'left' || it.side === 'right';
    const overlap = (a, b) => a.x < b.x + b.cw + 6 && b.x < a.x + a.cw + 6 && a.y < b.y + b.h + 6 && b.y < a.y + a.h + 6;
    // Pass 1 pushes later labels down (or to the right); pass 2 pulls anything off the screen edge back.
    const order = [...placed].sort((a, b) => (vertical(a) ? a.y : a.x) - (vertical(b) ? b.y : b.x));
    order.forEach((it, k) => {
      for (let guard = 0; guard < 20; guard++) {
        const hit = order.slice(0, k).find(o => overlap(it, o));
        if (!hit) break;
        if (vertical(it)) it.y = hit.y + hit.h + 6; else it.x = hit.x + hit.cw + 6;
      }
    });
    [...order].reverse().forEach((it, k, arr) => {
      it.x = Math.max(6, Math.min(W - it.cw - 6, it.x));
      it.y = Math.max(6, Math.min(H - it.h - 6, it.y));
      for (let guard = 0; guard < 20; guard++) {
        const hit = arr.slice(0, k).find(o => overlap(it, o));
        if (!hit) break;
        if (vertical(it)) it.y = hit.y - it.h - 6; else it.x = hit.x - it.cw - 6;
        it.x = Math.max(6, Math.min(W - it.cw - 6, it.x));
        it.y = Math.max(6, Math.min(H - it.h - 6, it.y));
      }
    });
    const glide = 1 - Math.exp(-dt * 10);
    for (const it of placed) {
      if (it.dx === undefined) { it.dx = it.x; it.dy = it.y; }
      else { it.dx += (it.x - it.dx) * glide; it.dy += (it.y - it.dy) * glide; }
      const { r, side, h, cw } = it, x = it.dx, y = it.dy, pad = 3, GAPH = GAP / 2;
      Object.assign(it.el.style, { left: `${x}px`, top: `${y}px`, width: `${it.cw}px` });
      Object.assign(it.box.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
      // The arrow sits in the gap between the label and the target and points at the target.
      let ax, ay, rot;
      if (side === 'right') { ax = -GAPH; ay = Math.max(12, Math.min(h - 12, it.cy - y)); rot = -90; }
      else if (side === 'left') { ax = cw + GAPH; ay = Math.max(12, Math.min(h - 12, it.cy - y)); rot = 90; }
      else if (side === 'below') { ay = -GAPH; ax = Math.max(12, Math.min(cw - 12, it.cx - x)); rot = 0; }
      else { ay = h + GAPH; ax = Math.max(12, Math.min(cw - 12, it.cx - x)); rot = 180; }
      Object.assign(it.arrow.style, { left: `${ax - 11}px`, top: `${ay - 14}px`, transform: `rotate(${rot}deg)` });
    }
  }

  function finish() {
    if (!alive || !active) return;
    steps[i]?.leave?.(hud);
    active = false;
    i = -1;
    setFreeze(false);
    startClock();
    sim.flags.tourHint = null;
    clearCallouts();
    document.body.classList.remove('tour-labels');
    root.hidden = true;
    if (kind === 'tour') hud.close();
  }

  // Next does the step's own thing for you where there is one (open the list, take the tool out).
  const next = () => {
    if (!alive || !active) return;
    const s = steps[i];
    s?.action?.(hud);
    if (!s?.action || !s.until) enter(i + 1);
  };
  const skip = () => finish();
  $('tour-next').addEventListener('click', next);
  $('tour-skip').addEventListener('click', skip);
  const alt = () => { const k = steps.findIndex(x => x.id === steps[i].alt?.to); if (k >= 0) enter(k); };
  $('tour-alt').addEventListener('click', alt);

  root.hidden = true;
  if (sim.mission.tutorial) run(buildSteps(), 'tour');

  // With nothing showing, see whether a how-to card is due. One the player has already worked
  // out for themselves is ticked off without being shown.
  function nextHowTo() {
    if (hud.open || sim.over) return;
    for (const how of HOWTOS) {
      if (shown.has(how.id)) continue;
      const known = how.known?.(sim, hud);
      if (!known && !how.when(sim, hud)) continue;
      shown.add(how.id);
      onSeen(how.id);
      if (!known) return run(how.steps(sim, hud), how.id);
    }
  }

  return {
    // Called every frame by the game.
    frame() {
      if (!alive) return;
      if (!active) return nextHowTo();
      const s = steps[i];
      if (!s) return;
      if (s.waitOpen && hud.open === s.waitOpen) return enter(i + 1);
      if (s.until?.(sim, hud)) return enter(i + 1);
      if (s.callouts) {
        const now = performance.now();
        const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
        lastFrame = now;
        layoutCallouts(s, dt);
      } else {
        lastFrame = 0;
        place(s);
      }
    },
    destroy() {
      if (active) steps[i]?.leave?.(hud);
      alive = active = false;
      setFreeze(false);
      if (sim) sim.flags.tourHint = null;
      $('tour-next').removeEventListener('click', next);
      $('tour-skip').removeEventListener('click', skip);
      $('tour-alt').removeEventListener('click', alt);
      clearCallouts();
      holder.remove();
      root.hidden = true;
    },
  };
}
