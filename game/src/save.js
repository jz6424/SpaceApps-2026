// Progress lives in this browser's localStorage. Storage can be blocked or cleared, so the game
// keeps working from memory and the menu says when saving isn't possible.
import { MISSIONS, MODES } from './config.js';
import { NODES } from './research.js';

const KEY = 'moonbase.save.v2';

export function emptySave() {
  return { mode: 'Cadet', points: 0, unlocks: [], best: {}, openAll: false };
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
  for (const mission of MISSIONS) {
    for (const mode of Object.keys(MODES)) {
      const stars = raw.best?.[mission.id]?.[mode];
      if ([1, 2, 3].includes(stars)) (save.best[mission.id] ??= {})[mode] = stars;
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
