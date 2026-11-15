// The guided tour for First Night: a red arrow and a short card walk the player through the
// meters, the clock and every station. Steps that only explain stop the clock; steps that ask
// the player to click something let the game keep running.

const $ = id => document.getElementById(id);

// --- What each step says. "freeze" stops the game clock while the player reads. ---
// target: a CSS selector, or { station: 'Power' } for a label floating in the Habitat.
// side: which side of the target the arrow sits on (it points at the target).
// at: where the card sits so it does not cover the target.
const STATION_ORDER = ['Power', 'LifeSupport', 'Comms', 'Food', 'MapTable', 'Shelter', 'Airlock'];
const NAMES = { Power: 'Power', LifeSupport: 'Life Support', Comms: 'Comms', Food: 'Galley', MapTable: 'Robot Map', Shelter: 'Storm Shelter', Airlock: 'Airlock' };

const EXPLAIN = {
  Power: {
    target: '#station-body .big', side: 'left',
    title: 'Power station',
    text: [
      '<b>This is your battery.</b> The list shows how much the solar panels make, how much the base uses, and how long the battery will last.',
      'The panels charge the battery by themselves in daylight, so the battery <b>fills up before sunset</b>. At night they make nothing and only the battery keeps you going.',
      'Near the bottom, <b>"What is using power right now"</b> lists each user and which station controls it.',
      'You can switch the <b>Antenna</b> on or off here. Everything you switch on costs power.',
    ],
  },
  LifeSupport: {
    target: '#station-body [data-act="ls"][data-arg="eco"]', side: 'left',
    title: 'Life Support station',
    text: [
      '<b>This machine makes your air and water.</b> While you are inside the base you use a little every second, so the machine has to keep up.',
      '<b>Eco</b> uses the least power and makes the least air. <b>Normal</b> makes more. <b>Boost</b> makes the most, but uses the most power and some moon dirt.',
      '<b>Tip:</b> if the battery is draining, choose Eco. If the air meter keeps falling, choose a higher setting.',
    ],
  },
  Comms: {
    target: '#station-body [data-act="comms"]', side: 'left',
    title: 'Comms station',
    text: [
      '<b>This is your link to Mission Control on Earth.</b> With the <b>Antenna</b> on, and Earth above the horizon, Earth warns you before a solar storm hits.',
      'Messages take 1.3 seconds each way, because radio waves take that long to cross 384,400 km to Earth.',
      '<b>Ask for a forecast</b> (2 power) and the storm shows up on the Sun clock. <b>Send science data</b> for +1 research point (6 power, 20 seconds between uploads).',
      'Earth sometimes sinks below the horizon, and then there is no signal.',
    ],
  },
  Food: {
    target: '#station-body .big', side: 'left',
    title: 'Galley',
    text: [
      '<b>This is the kitchen and greenhouse.</b> In First Night you have plenty of food, so you do not need to worry about meals yet.',
      'In later missions you will grow your own food here with grow lights, which use power and water.',
    ],
  },
  MapTable: {
    target: '#station-body [data-act="robot"][data-arg="dig"]', side: 'left',
    title: 'Robot Map',
    text: [
      '<b>Here you control the robot outside.</b> The map shows your base (yellow), the shadowed ice crater (white) and the robot (red), from real NASA data.',
      '<b>Dig moon dirt</b> gives you dirt for repairs, shielding and Boost. The robot uses a little power while it works.',
      '<b>Park it at the base before a solar storm.</b> A parked robot is safe. In Cadet mode it parks itself, but in Explorer and Commander a robot caught outside is damaged.',
    ],
  },
  Shelter: {
    target: '#station-body .big', side: 'left',
    title: 'Storm Shelter',
    text: [
      '<b>This is the safest spot in the base.</b> The back of the Habitat is shielded by tanks and supplies, so a solar storm adds much less radiation here.',
      'The <b>blue glowing floor</b> shows exactly where the protection applies. Stand inside it during a storm.',
      'When Mission Control warns you about a storm, walk here and wait it out. After you unlock Regolith Shielding, you can pile moon dirt on the Habitat for even more protection.',
    ],
  },
  Airlock: {
    target: '#station-body [data-act="outside"]', side: 'left',
    title: 'Airlock',
    text: [
      '<b>This is the door to the Moon.</b> It has two doors that are never open at the same time, so the base keeps its air.',
      'To go out, the inner door closes, you breathe pure oxygen for 6 seconds (Cadets can skip this), the air is pumped out, then the outer door opens. Each trip out costs 1.5% Life Support.',
      'Outside you can fix broken panels and pick up rock samples. Your suit holds 90 seconds of air, and radiation builds up about 3 times faster. You cannot go out during a solar storm.',
      'To come back, walk in through the open hatch at the top of the yellow steps. Between the two doors, press <b>E</b> to open the Airlock panel and choose <b>Close up and come inside</b>.',
    ],
  },
};

// Short text shown first. The longer text in each step is kept behind "More details".
const SHORT = {
  'Welcome to your first night': ['Survive the night until the Sun comes back.', 'Follow the red arrows to learn the base.'],
  'Power': ['Your battery. Solar panels fill it in daylight.', 'Life Support, heaters, the antenna and the robot drain it.', 'At 0% things slow down and you lose stars.'],
  'Life Support': ['The air in the base. You use it up while inside.', 'The Life Support machine refills it, using power.', 'At 0% you have 15 seconds before the mission ends.'],
  'Radiation dose': ['Radiation you have absorbed. It never goes down.', 'It rises faster outside and in solar storms.', 'At 100 the mission ends. Hide in the shelter.'],
  'Moon dirt': ['Building material the robot digs up.', 'Spend it on repairs, Boost and shielding.'],
  'Research points': ['Your points toward the next unlock.', '+2 per rock sample, +1 per data upload.'],
  'Messages': ['Messages from the base computer and Mission Control.', 'Watch for storm warnings.'],
  'The Sun clock': ['The whole day. The white marker is now.', 'Yellow is sunlight. Blue is night, with no solar power.', 'Red is a solar storm. Dashes mean no Earth signal.'],
  'Your missions box': ['Your next step is in the blue hint.', 'The arrow slides this box away. The gear opens settings and controls.'],
  'Now the stations': ['7 stations, each with a floating label.', 'Click a label to walk there, or press E when close.'],
  'Power station': ['Your battery, and what charges or drains it.', 'See "What is using power right now" below.'],
  'Life Support station': ['Makes your air. Eco uses the least power, Boost makes the most air.', 'Battery draining? Pick Eco. Air falling? Pick higher.'],
  'Comms station': ['With the antenna on, Earth warns you before storms.', 'Ask for a forecast, or send science data for +1 point.'],
  'Galley': ['The kitchen and greenhouse.', 'You have plenty of food tonight. It matters more later.'],
  'Robot Map': ['Control the robot outside. Dig moon dirt here.', 'Park it before a solar storm.'],
  'Storm Shelter': ['The safest spot: much less storm radiation.', 'The blue floor shows the protected zone.'],
  'Airlock': ['The door to the Moon. Two doors keep the base air in.', 'Going out takes a few seconds and costs 1.5% Life Support.', 'Not allowed during a solar storm.'],
  'Optional: practice a moonwalk': ['Try the airlock for real: out and back in.', 'It takes about a minute. You can skip it.'],
  'Open the Airlock': ['Click the glowing Airlock label.'],
  'Suit up': ['Press "Suit up and go outside".', 'When the outer door opens, walk out with WASD.'],
  'You are on the Moon': ['Your suit air counts down on the meter.', 'To come back: walk in through the hatch, press E, and choose "Close up and come inside".'],
  'You are ready': ['Survive until sunrise.', 'Turn on the antenna, and use the shelter in the storm.', 'Press F to speed up time.'],
};

function buildSteps() {
  const steps = [
    {
      title: 'Welcome to your first night', at: 'center', freeze: true,
      text: [
        'You are the only crew member at a small Moon base near the south pole.',
        '<b>Your goal: survive the night until the Sun comes back, and learn how everything works.</b>',
        'This tour shows you every meter and station. <b>Follow the red arrows.</b> You can press <b>Skip tour</b> at any time.',
      ],
    },
    {
      title: 'Power', target: '#meters [data-m="power"]', side: 'right', at: 'right', freeze: true,
      text: [
        '<b>This is your battery.</b> It is the most important meter at night.',
        '<b>What fills it:</b> the solar panels, all by themselves, whenever the Sun is up. You do not have to do anything. At night they make nothing.',
        '<b>What drains it:</b> Life Support (always running), the heaters (they switch on by themselves at night), the antenna, and the robot while it works.',
        '<b>If it hits 0%:</b> machines run slowly, and the air gets used up faster because the base gets cold and CO2 builds up. The mission does not end, but you lose stars for every second without power. Only running out of air or taking too much radiation ends the mission.',
      ],
    },
    {
      title: 'Life Support', target: '#meters [data-m="air"]', side: 'right', at: 'right', freeze: true,
      text: [
        '<b>This is the air and water in the base.</b>',
        '<b>What lowers it:</b> you do, a steady amount every second while you are inside the base. On a moonwalk your suit tank is used instead, so this meter does not drop.',
        '<b>What raises it:</b> the Life Support machine, which runs all the time and uses power. Its setting (Eco, Normal or Boost) decides how much air it makes.',
        '<b>If it hits 0%:</b> backup tanks last only 15 seconds, then the mission ends.',
      ],
    },
    {
      title: 'Radiation dose', target: '#meters [data-m="dose"]', side: 'right', at: 'right', freeze: true,
      text: [
        '<b>This is how much space radiation you have absorbed.</b> It never goes down.',
        '<b>What raises it:</b> a little all the time, about 3 times faster on a moonwalk, and fastest in a solar storm.',
        '<b>What helps:</b> hiding in the Storm Shelter during a storm. At 100 the mission ends.',
      ],
    },
    {
      title: 'Moon dirt', target: '#supplies .supply', side: 'left', at: 'center', freeze: true,
      text: [
        '<b>Moon dirt (regolith) is a building material.</b> The robot digs it up (see the Robot Map).',
        'You spend it on repairs, on Boost (extra air from Life Support), and on radiation shielding once you have unlocked it.',
      ],
    },
    {
      title: 'Research points', target: '#rp-bar .rp-top', side: 'left', at: 'center', freeze: true,
      text: [
        '<b>These points reward science,</b> and this bar shows how close you are to your next unlock (saved points plus this mission).',
        'On a moonwalk, each of the 3 glowing rock samples gives <b>+2</b>. At Comms, each data upload to Earth gives <b>+1</b>.',
        'You keep them after the mission and spend them in the Research Tree to unlock new missions.',
      ],
    },
    {
      title: 'The Sun clock', target: '#clock', side: 'below', at: 'right', freeze: true,
      text: [
        '<b>This bar shows the whole day.</b> The white marker is you, right now.',
        '<b>Yellow</b> is daylight, so the panels make power. <b>Blue</b> is night: no solar power, and the heaters switch on and use some battery.',
        '<b>Red</b> marks are solar storms. They appear when Earth warns you, or when you ask Comms for a forecast. The <b>white dashes</b> show when Earth is below the horizon and you cannot talk to it.',
      ],
    },
    {
      title: 'Messages', target: '#feed', side: 'right', at: 'right', freeze: true,
      text: [
        '<b>Messages appear here</b> from the base computer and from Mission Control on Earth.',
        'Mission Control\'s messages arrive about 1.3 seconds late, because radio takes that long to cross the distance. Watch for storm warnings.',
      ],
    },
    {
      title: 'Your missions box', target: '#mission-card', side: 'left', at: 'bottom', freeze: true,
      text: [
        '<b>This box tells you what to do next.</b> The blue hint changes as the situation changes.',
        'The <b>arrow</b> on its left edge slides this box out of the way and back. The <b>gear</b> in the top corner pauses the game and opens the settings (game speed, sound, music, full screen) and the list of controls. The <b>F</b> key fast-forwards time.',
      ],
    },
    {
      title: 'Now the stations', at: 'center', freeze: true,
      text: [
        'The Habitat has <b>7 stations</b>. Each one has a floating label.',
        '<b>Click a label</b> and you will walk there and open it. You can also walk up with <b>WASD</b> and press <b>E</b>.',
        'I will point to each one. The clock runs while you explore, but the night is long.',
      ],
    },
  ];

  for (const id of STATION_ORDER) {
    const ex = EXPLAIN[id];
    steps.push({
      id: `find-${id}`, title: `Find the ${NAMES[id]}`, target: { station: id }, side: 'above', at: 'right',
      hint: `Click the ${NAMES[id]} label (or walk up and press E).`,
      text: [`Click the glowing <b>${NAMES[id]}</b> label that the red arrow points to.`],
      waitOpen: id, noNext: true,
    });
    steps.push({ id: `explain-${id}`, title: ex.title, target: ex.target, side: ex.side, at: 'right', text: ex.text, stay: id });
  }

  // Optional practice trip through the new airlock. Every step lets the player skip it.
  const skipPractice = { label: 'Skip practice', to: 'ready' };
  steps.push(
    {
      id: 'trip-offer', title: 'Optional: practice a moonwalk', at: 'center', freeze: true, alt: skipPractice, nextLabel: 'Let\'s try it',
      text: [
        'Want to try the airlock for real? It takes about a minute: go out, look around, and come back in.',
        'Come back before your suit air runs low and nothing will go wrong. You can also skip this.',
      ],
    },
    {
      id: 'trip-open', title: 'Open the Airlock', target: { station: 'Airlock' }, side: 'above', at: 'right', alt: skipPractice,
      hint: 'Click the Airlock label (or walk up and press E).',
      text: ['Click the glowing <b>Airlock</b> label.'],
      waitOpen: 'Airlock', noNext: true, closeStation: true,
    },
    {
      id: 'trip-go', title: 'Suit up', target: '#station-body [data-act="outside"]', side: 'left', at: 'right', alt: skipPractice,
      hint: 'Press "Suit up and go outside", then walk out when the outer door opens.',
      text: [
        'Press <b>Suit up and go outside</b>.',
        'Watch the progress bar in the corner. The inner door closes, the air is pumped out, and then the outer door opens.',
        '<b>When the outer door is open, walk out onto the Moon</b> with WASD.',
      ],
      until: sim => sim.where === 'outside', noNext: true,
    },
    {
      id: 'trip-outside', title: 'You are on the Moon', target: '#meters [data-m="suit"]', side: 'right', at: 'right',
      hint: 'Look around, then walk back in through the hatch, press E and choose "Close up and come inside".',
      text: [
        'You are outside! Your <b>suit air</b> now shows on the meter, and it counts down.',
        'Look around. <b>To come back, walk up the yellow steps and in through the open hatch.</b> Between the two doors, press <b>E</b> to open the Airlock panel and choose <b>Close up and come inside</b>. The hatch closes behind you, the air comes back, and the inner door opens.',
      ],
      until: sim => sim.where !== 'outside' && sim.airlockStatus === 'pressurized', noNext: true,
    },
  );

  steps.push({
    id: 'ready',
    title: 'You are ready', at: 'center', closeStation: true,
    hint: 'Make the battery last until sunrise. Press F to speed up time.',
    text: [
      '<b>That is every station.</b> Now you just have to survive the night.',
      '<b>Before sunset:</b> let the battery charge, and turn the Antenna on at Comms.',
      '<b>Before sunset</b>, a <b>solar storm</b> will pass, at a slightly different time each game. With the Antenna on, Mission Control warns you early, so park the robot and go to the Storm Shelter. Without it, you only get a few seconds of warning.',
      '<b>At night</b>, keep an eye on the battery. Eco saves power if it drains too fast.',
      'Press <b>F</b> to speed up time. Good luck, astronaut!',
    ],
    last: true,
  });
  steps.forEach(s => { s.short = SHORT[s.title]; });
  return steps;
}

export function createTour({ sim, game, hud }) {
  const steps = buildSteps();
  const root = $('tour'), card = $('tour-card'), ring = $('tour-ring'), arrow = $('tour-arrow');
  let i = -1;
  let alive = true;
  let showMore = false;

  const setFreeze = on => game.freeze(!!on);

  function renderText(s) {
    const paras = s.short && !showMore ? s.short : s.text;
    $('tour-text').innerHTML = paras.map(p => `<p>${p}</p>`).join('');
    $('tour-more').hidden = !s.short;
    $('tour-more').textContent = showMore ? 'Show less' : 'More details';
  }

  function enter(n) {
    i = n;
    const s = steps[i];
    if (!s) return finish();
    if (s.id?.startsWith('find-')) hud.close();
    setFreeze(s.freeze);
    sim.flags.tourHint = s.hint ?? null;
    $('tour-step').textContent = `Tour: step ${i + 1} of ${steps.length}`;
    $('tour-title').textContent = s.title;
    showMore = false;
    renderText(s);
    $('tour-next').hidden = !!s.noNext;
    $('tour-next').textContent = s.last ? 'Start the night' : (s.nextLabel ?? 'Next');
    $('tour-alt').hidden = !s.alt;
    if (s.alt) $('tour-alt').textContent = s.alt.label;
    card.className = `panel at-${s.at ?? 'right'}`;
    if (s.closeStation) hud.close();
  }

  // Where a step's target is on the screen, as { left, top, width, height, panel }.
  function targetRect(s) {
    if (!s.target) return null;
    if (s.target.station) {
      const p = game.stationScreen(s.target.station);
      if (!p) return null;
      return { left: p.x - 60, top: p.y - 20, width: 120, height: 40 };
    }
    const el = document.querySelector(s.target);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const panel = el.closest('#station')?.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, panel };
  }

  function place(s) {
    const r = targetRect(s);
    if (!r) { ring.hidden = true; arrow.hidden = true; return; }
    ring.hidden = false; arrow.hidden = false;
    const pad = 4;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const W = 40, H = 52, gap = 8;
    let x, y, rot;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    switch (s.side) {
      case 'below': x = cx - W / 2; y = r.top + r.height + gap; rot = 0; break;       // arrow under the target, pointing up
      case 'above': x = cx - W / 2; y = r.top - H - gap; rot = 180; break;            // arrow over the target, pointing down
      case 'left': {                                                                  // arrow left of the target, pointing right
        const edge = r.panel ? Math.min(r.left, r.panel.left) : r.left;
        x = edge - H - gap + (H - W) / 2; y = cy - H / 2; rot = 90; break;
      }
      default: x = r.left + r.width + gap + (H - W) / 2; y = cy - H / 2; rot = -90;   // 'right': arrow right of the target, pointing left
    }
    x = Math.max(4, Math.min(innerWidth - H - 4, x));
    y = Math.max(4, Math.min(innerHeight - H - 4, y));
    arrow.style.left = `${x}px`;
    arrow.style.top = `${y}px`;
    arrow.style.transform = `rotate(${rot}deg)`;
  }

  function finish() {
    if (!alive) return;
    alive = false;
    setFreeze(false);
    sim.flags.tourHint = null;
    root.hidden = true;
    hud.close();
  }

  const next = () => { if (alive) enter(i + 1); };
  const skip = () => finish();
  $('tour-next').addEventListener('click', next);
  $('tour-skip').addEventListener('click', skip);
  const alt = () => { const k = steps.findIndex(x => x.id === steps[i].alt?.to); if (k >= 0) enter(k); };
  $('tour-alt').addEventListener('click', alt);
  const more = () => { showMore = !showMore; renderText(steps[i]); };
  $('tour-more').addEventListener('click', more);

  root.hidden = false;
  enter(0);

  return {
    // Called every frame by the game.
    frame() {
      if (!alive) return;
      const s = steps[i];
      if (!s) return;
      if (s.waitOpen && hud.open === s.waitOpen) return next();
      if (s.until?.(sim)) return next();
      if (s.stay && hud.open !== s.stay) return next(); // the player closed the station: move on
      place(s);
    },
    destroy() {
      alive = false;
      setFreeze(false);
      if (sim) sim.flags.tourHint = null;
      $('tour-next').removeEventListener('click', next);
      $('tour-skip').removeEventListener('click', skip);
      $('tour-more').removeEventListener('click', more);
      $('tour-alt').removeEventListener('click', alt);
      root.hidden = true;
    },
  };
}
