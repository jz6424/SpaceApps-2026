// The Research Tree: what research points buy between missions.
//
// Two kinds of node:
//   - mission nodes (`mission`) open a later mission. Their id is the mission's `requires.id` in
//     config.js, and the cost comes from there too. These work today: the HUD already checks
//     save.unlocks for 'Shielding' and 'Greenhouse'.
//   - upgrade nodes change one number in CONFIG, listed in `effects`.
//
// Upgrades are NOT wired into the mission rules yet, because sim.js is being reworked. Until
// they are, UPGRADES_LIVE stays false and the menu shows them as "Coming soon" so nobody spends
// points on something that does nothing. To switch them on:
//   1. in sim.js, read numbers from researchConfig(CONFIG, save.unlocks) instead of CONFIG
//      (ui.js would pass save.unlocks, or the finished config, into `new Sim(...)`)
//   2. set UPGRADES_LIVE = true
//   3. run `npm run balance`
//
// `needs` names the node that must be researched first. It can sit in another branch: the
// Greenhouse needs Regolith Shielding, so the missions open in order.
//
// Every owned node id lives in save.unlocks, next to the two mission unlocks.
import { MISSIONS } from './config.js';

export const UPGRADES_LIVE = false;

// effects: { path, times } multiplies CONFIG[path]; { path, add } adds to it. A path that points
// at a group of numbers (like air.make) changes every number in the group.
// `icon` is a name from ICONS in hud.js, shown inside the node's circle on the Research Tree.
// `science` says how the real thing works. `change` says what it does in the game, with numbers
// that must match `effects`.
export const BRANCHES = [
  {
    id: 'power', name: 'Power', icon: 'bolt',
    about: 'Make more electricity and waste less of it.',
    nodes: [
      {
        id: 'HeatBlankets', icon: 'moon', name: 'Heat blankets', cost: 10,
        science: 'The lunar night is colder than -170 C. Engineers wrap spacecraft in many thin, shiny layers called multi-layer insulation. Each layer reflects heat back inside.',
        change: 'Night heaters use 20% less power.',
        effects: [{ path: 'power.heaters', times: 0.8 }],
      },
      {
        id: 'SunTracking', icon: 'sun', name: 'Sun-tracking panels', cost: 15, needs: 'HeatBlankets',
        science: 'At the south pole the Sun never rises high. It circles low around the horizon, so panels that stand upright and turn to face it collect more light. NASA is developing tall solar towers like this, called VSAT.',
        change: 'Solar panels make 10% more power.',
        effects: [{ path: 'solar.perPanel', times: 1.1 }],
      },
      {
        id: 'DishAntenna', icon: 'radio', name: 'Dish antenna', cost: 8,
        science: 'A dish focuses the radio signal into a narrow beam aimed at Earth. Less of the signal misses Earth, so the radio needs less power.',
        change: 'The antenna uses 25% less power.',
        effects: [{ path: 'power.comms', times: 0.75 }],
      },
    ],
  },
  {
    id: 'air', name: 'Life Support', icon: 'wind',
    about: 'Make your air and water last longer.',
    nodes: [
      {
        id: 'Scrubber', icon: 'wind', name: 'Better CO2 scrubber', cost: 10,
        science: 'You breathe out carbon dioxide, and too much of it is dangerous. A scrubber removes it from the air. The Space Station traps it in a mineral called zeolite, so the crew can breathe the same air again.',
        change: 'Life Support drains 5% slower.',
        effects: [{ path: 'air.crewUse', times: 0.95 }],
      },
      {
        id: 'Sabatier', icon: 'droplet', name: 'Sabatier reactor', cost: 18, needs: 'Scrubber',
        science: 'A Sabatier reactor mixes the carbon dioxide you breathe out with hydrogen. The two react and become water and methane. The Space Station has used one to make water for the crew.',
        change: 'The Life Support machine refills 10% faster on every setting.',
        effects: [{ path: 'air.make', times: 1.1 }],
      },
      {
        id: 'RegolithOxygen', icon: 'box', name: 'Oxygen from moon dirt', cost: 15, needs: 'Scrubber',
        science: 'Moon dirt is about 45% oxygen by weight, but the oxygen is bonded to the rock. Melting the dirt and passing electricity through it releases the oxygen. Scientists call this molten regolith electrolysis.',
        change: 'Boost uses 30% less moon dirt.',
        effects: [{ path: 'air.boostRegolith', times: 0.7 }],
      },
    ],
  },
  {
    id: 'radiation', name: 'Radiation', icon: 'radiation',
    about: 'Take a smaller radiation dose during solar storms.',
    nodes: [
      {
        id: 'Shielding', icon: 'shield', name: 'Regolith Shielding', mission: 'SolarStorm',
        science: 'Solar storm particles lose energy as they pass through matter. A thick layer of moon dirt piled on the Habitat stops many of them before they reach you.',
        change: 'You can pile moon dirt on the Storm Shelter to lower your storm dose.',
      },
      {
        id: 'ParticleDetector', icon: 'alert', name: 'Particle detector', cost: 12, needs: 'Shielding',
        science: 'The fastest particles from a solar flare arrive before the main storm. A sensor on the Habitat detects them, so you get a warning even when Earth can\'t reach you.',
        change: 'Your own sensor warns you 10 seconds before a storm, up from 5.',
        effects: [{ path: 'ownSensorWarning', add: 5 }],
      },
      {
        id: 'WaterWall', icon: 'door', name: 'Water wall', cost: 20, needs: 'Shielding',
        science: 'Hydrogen stops space radiation well, and every water molecule has two hydrogen atoms. Lining the shelter walls with water tanks adds shielding without bringing extra metal from Earth.',
        change: 'Your storm dose inside the Storm Shelter is 25% lower.',
        effects: [{ path: 'dose.storm.shelter', times: 0.75 }],
      },
    ],
  },
  {
    id: 'food', name: 'Food and water', icon: 'leaf',
    about: 'Grow food on the Moon and reuse your water.',
    nodes: [
      {
        id: 'Greenhouse', icon: 'leaf', name: 'Greenhouse', mission: 'IceAndGreens', needs: 'Shielding',
        science: 'Plants turn light, water and the carbon dioxide you breathe out into food, and they release oxygen. Astronauts have grown lettuce on the Space Station in a garden called Veggie.',
        change: 'The Galley gets grow lights, so you can grow your own food.',
      },
      {
        id: 'GrowLights', icon: 'bolt', name: 'Red and blue grow lights', cost: 12, needs: 'Greenhouse',
        science: 'Plants use mostly red and blue light to grow. LED lamps that make mainly those two colours use less electricity than white lamps.',
        change: 'Grow lights use 20% less power.',
        effects: [{ path: 'power.greenhouse', times: 0.8 }],
      },
      {
        id: 'WaterRecycling', icon: 'droplet', name: 'Water recycling', cost: 15, needs: 'Greenhouse',
        science: 'Plants release most of the water they take up into the air as vapour. Collecting that vapour and cleaning it lets you use the same water again. The Space Station recycles about 98% of its water.',
        change: 'The greenhouse uses 25% less water.',
        effects: [{ path: 'food.water', times: 0.75 }],
      },
    ],
  },
  {
    id: 'outside', name: 'Robots and moonwalks', icon: 'map',
    about: 'Dig faster, fetch ice faster and stay outside longer.',
    nodes: [
      {
        id: 'DrumDigger', icon: 'box', name: 'Bucket-drum digger', cost: 10,
        science: 'In low gravity, digging pushes a light robot backwards. NASA\'s RASSOR robot has two digging drums that spin in opposite directions, so the two pushes cancel out.',
        change: 'The robot digs moon dirt 25% faster.',
        effects: [{ path: 'robot.dig', times: 1.25 }],
      },
      {
        id: 'IceDrill', icon: 'droplet', name: 'Ice drill', cost: 15, needs: 'DrumDigger',
        science: 'The shadowed craters are colder than -200 C, so the icy ground there is frozen hard. NASA built a drill called TRIDENT that hammers while it turns to break through it.',
        change: 'The robot brings back ice 25% faster.',
        effects: [{ path: 'robot.ice', times: 1.25 }],
      },
      {
        id: 'SuitTank', icon: 'door', name: 'Bigger suit tank', cost: 12,
        science: 'The backpack on a spacesuit carries your oxygen and removes the carbon dioxide you breathe out. A bigger oxygen tank gives you more time outside.',
        change: 'Suit air lasts 110 seconds, up from 90.',
        effects: [{ path: 'suit.seconds', add: 20 }],
      },
    ],
  },
];

export const NODES = BRANCHES.flatMap(branch => branch.nodes);
// A mission node costs whatever its mission says in config.js, so the price lives in one place.
for (const node of NODES) {
  if (node.mission) node.cost = MISSIONS.find(m => m.id === node.mission).requires.cost;
}
export const nodeById = id => NODES.find(node => node.id === id);

// 'owned', 'soon' (upgrades not switched on yet), 'locked' (needs another node first),
// 'short' (not enough points) or 'ready'.
export function nodeState(node, owned, points) {
  if (owned.includes(node.id)) return 'owned';
  if (!node.mission && !UPGRADES_LIVE) return 'soon';
  if (node.needs && !owned.includes(node.needs)) return 'locked';
  return points >= node.cost ? 'ready' : 'short';
}

// CONFIG with every owned upgrade applied. Returns a copy; the base is left alone.
export function researchConfig(base, owned) {
  const config = structuredClone(base);
  for (const node of NODES) {
    if (!owned.includes(node.id)) continue;
    for (const { path, times, add } of node.effects ?? []) {
      const keys = path.split('.');
      const last = keys.pop();
      const parent = keys.reduce((group, key) => group[key], config);
      const apply = value => (times !== undefined ? value * times : value + add);
      if (typeof parent[last] === 'object') {
        for (const key of Object.keys(parent[last])) parent[last][key] = apply(parent[last][key]);
      } else {
        parent[last] = apply(parent[last]);
      }
    }
  }
  return config;
}
