// Missions, modes and rewards. Names, order, unlocks and point values come from
// balancing/BalanceConfig.lua by way of the mission planner. Goals say "crew" rather than a number
// because the Habitat is now furnished for one astronaut and the config has not caught up yet.
export const MISSIONS = [
  {
    id: 'FirstNight',
    name: 'First Night',
    multiplier: 1,
    goal: 'Keep your crew safe through the first lunar night.',
    lesson: 'No sun means no power, and no power means no new oxygen. Batteries are how a solar base gets through the long lunar night.',
  },
  {
    id: 'IceHunters',
    name: 'Ice Hunters',
    multiplier: 1.5,
    requires: { id: 'IceDrill', name: 'Ice Drill', cost: 10 },
    goal: 'Drill crater ice and fill the water tank for the next crew.',
    lesson: 'Water ice hides in craters that never see the Sun. They are cold and far from base, so every trip out has a cost.',
  },
  {
    id: 'StormWatch',
    name: 'Storm Watch',
    multiplier: 2,
    requires: { id: 'Shielding', name: 'Regolith Shielding', cost: 20 },
    goal: 'Keep your crew shielded through two solar storms.',
    lesson: 'Moon dirt is the best local radiation shield. In a solar storm, astronauts wait in the most shielded part of their home.',
  },
];

export const MODES = {
  Cadet: { label: 'Cadet', level: 'easy', points: 20, about: 'Three things to watch, and robots that help you. A good first try for ages 7 to 9.' },
  Explorer: { label: 'Explorer', level: 'medium', points: 30, about: 'Eight things to watch and fewer helpers. Made for ages 10 to 12.' },
  Commander: { label: 'Commander', level: 'hard', points: 40, about: 'Ten things to watch, including dusty panels and packing your own supply crate.' },
};

const STAR_SHARE = { 1: 0.5, 2: 0.75, 3: 1 };

export const missionById = id => MISSIONS.find(m => m.id === id);

export const pointsFor = (mission, mode, stars) =>
  Math.round(MODES[mode].points * mission.multiplier * STAR_SHARE[stars]);
