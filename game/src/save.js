// Progress lives in this browser's localStorage. Storage can be blocked or cleared, so the game
// keeps working from memory and the menu says when saving isn't possible.
import { MISSIONS, MODES, HOWTOS } from './config.js';
import { NODES } from './research.js';
import { PAGES, LEVELS } from './scrapbook.js';

const KEY = 'moonbase.save.v2';

export function emptySave() {
  // found: Scrapbook pages met in a mission. read: pages opened (each pays research points once).
  // reading: the Scrapbook reading level, 'easy' or 'deep'. howtos: how-to cards already shown.
  return { mode: 'Cadet', points: 0, unlocks: [], best: {}, tests: {}, openAll: false, found: [], read: [], reading: 'easy', howtos: [] };
}

// Anything hand-edited or left by an older build is dropped rather than trusted.
function clean(raw) {
  const save = emptySave();
  if (!raw || typeof raw !== 'object') return save;
  if (MODES[raw.mode]) save.mode = raw.mode;
  if (Number.isFinite(raw.points) && raw.points >= 0) save.points = Math.floor(raw.points);
  save.openAll = raw.openAll === true;
  if (Array.isArray(raw.unlocks)) {
    // Research Tree nodes the player owns, including the two that open missions.
    const known = NODES.map(node => node.id);
    save.unlocks = [...new Set(raw.unlocks.filter(id => known.includes(id)))];
  }
  const pages = PAGES.map(page => page.id);
  for (const list of ['found', 'read']) {
    if (Array.isArray(raw[list])) save[list] = [...new Set(raw[list].filter(id => pages.includes(id)))];
  }
  if (Array.isArray(raw.howtos)) save.howtos = HOWTOS.filter(id => raw.howtos.includes(id));
  if (typeof raw.reading === 'string' && Object.hasOwn(LEVELS, raw.reading)) save.reading = raw.reading;
  for (const mission of MISSIONS) {
    for (const mode of Object.keys(MODES)) {
      const stars = raw.best?.[mission.id]?.[mode];
      if ([1, 2, 3].includes(stars)) (save.best[mission.id] ??= {})[mode] = stars;
      // tests: which of the three star tests have ever been passed, each on its own.
      const tests = raw.tests?.[mission.id]?.[mode];
      if (Array.isArray(tests) && tests.length === 3) (save.tests[mission.id] ??= {})[mode] = tests.map(Boolean);
    }
  }
  return save;
}

export function loadSave() {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return emptySave();
  }
}

// Returns false when the browser refused to store it.
export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function eraseSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, so nothing to erase.
  }
}
