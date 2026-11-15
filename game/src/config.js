// Every number that decides how hard the game is lives here.
// Ported from balancing/BalanceConfig.lua (Roblox prototype) and reworked for the official
// Space Apps challenge: three core meters (Power, Life Support, Radiation Dose), one astronaut,
// stations inside the Habitat, robots outside.
//
// Units: every rate is "points per game second" at normal speed. Meters run 0 to 100.
// Run `npm run balance` after a change: tools/simulate.mjs plays every mission x mode with a
// careful player, a careless player and a do-nothing player.

export const CONFIG = {
  meters: { powerMax: 100, airMax: 100, doseLimit: 100, regolithMax: 100, waterMax: 20 },

  // Sunlight ramps over this many seconds at dusk and dawn.
  twilightSeconds: 20,

  // Three solar panels. Output = perPanel x sunlight x siteSun (from NASA's sunlight map) x mode.
  solar: { panels: 3, perPanel: 0.42 },

  // What each system draws from the battery, per second.
  // Tuned so a full battery lasts the night on Normal with nothing else on (about 170 s against
  // a night of 140 to 150 s), but not with the antenna, the robot and the grow lights all running:
  // that still empties it before sunrise, so there is still something to decide.
  power: {
    lifeSupport: { eco: 0.16, normal: 0.32, boost: 0.58 },
    heaters: 0.26,    // night only, automatic: the lunar night is colder than -170 C
    comms: 0.15,      // antenna on
    greenhouse: 0.22, // grow lights on
    robot: 0.19,      // robot working outside
    sendData: 6,      // one burst per science upload
    forecast: 2,      // one burst per question to Mission Control
  },

  // Life Support = the air and water loop. One astronaut uses it up; the machine refills it.
  air: {
    crewUse: 0.42,
    leak: 0.04,         // every station slowly leaks air through its seals; the Space Station tops up too
    // With breathing and the leak (0.46 a second for an Explorer), Normal only just keeps up (a Cadet
    // still gains a little, a Commander slowly loses), Eco drains and Boost refills.
    make: { eco: 0.28, normal: 0.45, boost: 0.8 },
    boostRegolith: 0.1, // Boost makes extra oxygen from moon dirt (regolith is about 45% oxygen)
    greenhouse: 0.05,   // plants turn CO2 back into oxygen
    coldPenalty: 0.6,   // a brownout means cold and CO2 build-up: crew use x (1 + this x shortfall)
    emergencySeconds: 15, // backup tanks: this long at 0 before the mission ends
  },

  // Radiation dose. 100 = the whole mission's dose budget.
  dose: {
    inside: 0.035,    // cosmic rays every day, everywhere
    outside: 0.11,    // no hull around you on a moonwalk
    // The shelter's own walls stop half of a storm. The rest takes a shield of moon dirt, built
    // with the Building tool: banked up the sides (level 1), then right over the top (level 2).
    // The dirt is piled on the shelter end only, so it helps in the shelter and nowhere else.
    storm: { outside: 3, inside: 1.1, shelter: 0.5 }, // extra per second while a storm is on
    shielding: [1, 0.5, 0.25],                         // storm multiplier in the shelter, by shield level
    shieldingCost: [25, 25],                           // regolith for level 1, then level 2
  },

  // The suit's own air tank for moonwalks. Refills inside.
  // refillAir: Life Support used per second of suit air refilled (the suit is filled from the
  // base's own air, so a full 90 s tank costs 9%). minOut: suit air needed before going out.
  suit: { seconds: 90, refill: 6, refillAir: 0.1, minOut: 45 },

  // The airlock between the cabin and the surface. Times are game seconds.
  airlock: {
    doorSeconds: 0.6, // a door sliding open or shut
    prebreathe: 6,    // breathing pure oxygen before going out (nobody may skip it)
    pump: 4,          // pumping the air out, or letting it back in
    cycleAir: 1.5,    // Life Support lost each time the air is pumped out: the pump can't save it all
  },

  robot: {
    dig: 0.4,        // regolith per second (day or night, never in a storm)
    ice: 0.12,       // water per second, hauled from the shadowed crater
    repairSeconds: 15,
    repairRegolith: 10,
    stormDamageSeconds: 25, // a robot caught outside by a storm with no warning is offline this long
  },

  evaRepairRegolith: 3, // fixing a panel by hand is cheaper but costs suit air and dose

  food: {
    eatEvery: 42,     // seconds per meal
    growEvery: 22,    // greenhouse makes a meal this often while lit and watered
    water: 0.06,      // greenhouse water per second
  },

  science: {
    sampleRP: 2,      // each rock sample brought back
    rareRP: 3,        // each rare rock sample: they lie much further from the base
    uploadRP: 1,      // each data upload
    pageRP: 2,        // reading a Scrapbook page for the first time
    uploadCooldown: 20,
  },

  // Real light travel time, Earth to Moon and back: 2 x 384,400 km / 299,792 km/s.
  commsRoundTrip: 2.6,

  // Warning before a storm hits: from Mission Control (antenna on, Earth up) or your own sensor.
  ownSensorWarning: 5,

  stars: {
    two: { lowestAir: 25, maxBlackout: 20 },
    three: { lowestAir: 40, maxBlackout: 0, maxDose: 50 },
  },
};

// Difficulty: harder modes give less warning and drain a little faster. Kept within about 10%.
export const MODES = {
  Cadet: {
    label: 'Cadet', level: 'easy', points: 20,
    about: 'Long storm warnings and a robot that parks itself before storms. A good first try for ages 7 to 9.',
    crewDrain: 0.85, solar: 1.1, stormLength: 0.75, warning: 40, robotAutoPark: true, doseGoal: 1.4,
  },
  Explorer: {
    label: 'Explorer', level: 'medium', points: 30,
    about: 'Normal storms. You park the robot yourself. Made for ages 10 to 12.',
    crewDrain: 1, solar: 1, stormLength: 1, warning: 30, robotAutoPark: false, doseGoal: 1,
  },
  Commander: {
    label: 'Commander', level: 'hard', points: 40,
    about: 'Longer storms, short warnings and an extra space rock. For astronauts who have done it before.',
    crewDrain: 1.08, solar: 0.95, stormLength: 1.25, warning: 20, robotAutoPark: false, doseGoal: 0.9, extraMeteoroid: true,
  },
};

// The base's real spot is 89.47 S, 220.4 E (the middle of the piece of NASA's LOLA Site01 map the
// ground is cut from), 16 km from the south pole. On the menu Moon the missions' flags are spread
// round the pole instead, so each can be seen and clicked.
// Missions in order. Times are game seconds. Goal values can be per mode.
// Each storm lists the usual time and length, and the size of real flare it draws (planRun in
// sim.js picks the flare and shifts the time for every playthrough).
export const MISSIONS = [
  {
    id: 'FirstNight',
    name: 'First Night',
    short: 'Collect 5 rocks and last the night.',
    place: { lat: -79, lon: 150 },  // where its flag stands on the menu Moon (see moon-menu.js)
    multiplier: 1,
    goal: 'Collect 5 glowing rock samples and survive the night.',
    brief: 'You just landed at Connecting Ridge, near the Moon\'s south pole. Follow the tour to learn the base, go on moonwalks to pick up 5 glowing rock samples, and keep the Habitat running until the Sun comes back.',
    lesson: 'No sun means no solar power. Turning things down at night (like the Eco setting) makes the battery last until sunrise.',
    dataCards: ['sunlight', 'air'],
    day: 200, night: 200,
    ease: 0.65, // power and air drain 35% slower, so there is time to learn
    start: { power: 70, air: 85, regolith: 20 },
    storms: [{ at: 160, length: 25, strength: 'Mild' }],
    meteoroids: [],
    goalType: 'samples',
    goalValue: 5, // rock samples to bring back: any 5 of the 10 around the base
    tutorial: true,
  },
  {
    id: 'SolarStorm',
    name: 'Solar Storm',
    short: 'Hide from two solar storms.',
    place: { lat: -74, lon: 262 },
    multiplier: 1.5,
    requires: { id: 'Shielding', name: 'Regolith Shielding', about: 'Regolith is the science word for moon dirt.', cost: 10 },
    goal: 'Keep your radiation dose low through two solar storms.',
    brief: 'Mission Control is watching a busy Sun. Send the robot to dig moon dirt, then take out your Building tool and build a regolith shield (a wall of moon dirt) over the Storm Shelter. Keep the antenna on to get warnings, and hide in the shelter when the storm hits.',
    lesson: 'Moon dirt is a great radiation shield, and warnings from Earth give you time to hide. The shelter is the most shielded spot in the Habitat.',
    dataCards: ['storm', 'comms'],
    day: 130, night: 140,
    // Not enough moon dirt to build with at the start: the robot has to dig first.
    start: { power: 60, air: 80, regolith: 10 },
    // The first storm leaves time to dig and build first; the second leaves time for level 2.
    storms: [{ at: 95, length: 40, strength: 'Strong' }, { at: 215, length: 35, strength: 'Strong' }],
    meteoroids: [150],
    goalType: 'dose',
    goalValue: 45, // multiplied by the mode's doseGoal
    // The third star here needs the dirt shield built, and a dose that only hiding behind it gives.
    // Hiding in the bare shelter for both storms comes to about 35 (Cadet), 43 (Explorer) or
    // 52 (Commander) at the very least; behind a level 1 shield it is about 26, 31 or 36 at most.
    threeStar: { shielding: 1, maxDose: { Cadet: 30, Explorer: 36, Commander: 40 } },
  },
  {
    id: 'IceAndGreens',
    name: 'Ice and Greens',
    short: 'Grow food with crater ice.',
    place: { lat: -81, lon: 30 },
    multiplier: 2,
    requires: { id: 'Greenhouse', name: 'Greenhouse', cost: 20 },
    goal: 'Grow enough food to have meals left at sunrise.',
    brief: 'Your food supply is low and the next cargo lander is late. Send the robot for crater ice, water the greenhouse, and keep the lights on.',
    lesson: 'Plants need light (power) and water (from crater ice). Growing food on the Moon means sharing power between plants, air and heat.',
    dataCards: ['ice'],
    day: 150, night: 140,
    start: { power: 60, air: 80, regolith: 25, food: 5, water: 4 },
    storms: [{ at: 185, length: 30, strength: 'Moderate' }],
    meteoroids: [110],
    goalType: 'food',
    goalValue: { Cadet: 2, Explorer: 3, Commander: 4 },
  },
];

// Short how-to cards that appear once ever, the first time they are needed (see tour.js).
export const HOWTOS = ['speed'];

export const STAR_SHARE = { 1: 0.5, 2: 0.75, 3: 1 };
export const missionById = id => MISSIONS.find(m => m.id === id);
export const pointsFor = (mission, mode, stars) =>
  stars ? Math.round(MODES[mode].points * mission.multiplier * STAR_SHARE[stars]) : Math.round(3 * mission.multiplier);
