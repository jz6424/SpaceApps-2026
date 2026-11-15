// Real NASA data in the game, and where each piece comes from.
//  * Terrain: LRO LOLA 5 m elevation model of Connecting Ridge (loaded in main.js).
//  * Sunlight, Earth visibility and permanent shadow maps from LOLA, cut to the same area.
//  * Solar flares from NASA's DONKI space weather database: live when the browser can reach it,
//    otherwise a short list of real past flares (and the game says which one you got).
//    The flares set how strong and how long the game's solar storms are.

// The PNGs store 0..255 for the map's min..max (see nasa-data/ridge_best/roblox_import.txt).
const RANGE = { sun: 0.879, earth: 0.582, psr: 1 };

async function loadGrey(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
  const out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
  return { w: c.width, h: c.height, data: out, img };
}

export async function readSiteMaps() {
  const [sun, earth, psr] = await Promise.all(['sun', 'earth', 'psr'].map(n => loadGrey(`terrain/${n}.png`)));
  const at = (m, r, c) => m.data[Math.max(0, Math.min(m.h - 1, Math.round(r))) * m.w + Math.max(0, Math.min(m.w - 1, Math.round(c)))];
  return {
    sun, earth, psr,
    psrAt: (r, c) => at(psr, r, c),
    // Average of a 5 x 5 pixel patch (25 m) around the base, in real units.
    sample(r, c) {
      let s = 0, e = 0, p = 0, n = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        s += at(sun, r + dr, c + dc); e += at(earth, r + dr, c + dc); p += at(psr, r + dr, c + dc); n++;
      }
      return { sun: s / n * RANGE.sun, earth: e / n * RANGE.earth, psr: p / n, row: r, col: c };
    },
    // Closest pixel that is permanently shadowed, at least minPx away from the base.
    nearestShadow(r0, c0, minPx) {
      let best = null;
      for (let r = 0; r < psr.h; r++) for (let c = 0; c < psr.w; c++) {
        if (psr.data[r * psr.w + c] < 0.5) continue;
        const d = Math.hypot(r - r0, c - c0);
        if (d >= minPx && (!best || d < best.d)) best = { r, c, d };
      }
      return best && { row: best.r, col: best.c };
    },
  };
}

// --- Solar flares ---
// Every storm in the game is sized from a real flare (see planRun in sim.js). The list comes
// live from NASA's DONKI space weather database when the browser can reach it. If not, the game
// uses the short list below, and says so.
//
// Real flares from DONKI, each checked against the database on 2026-11-14. sep: DONKI links the
// flare to a solar energetic particle event, which is the kind of storm the game is about.
export const PAST_FLARES = [
  { date: '2017-09-06', classType: 'X9.3', sep: true, note: 'It was the biggest flare of solar cycle 24.' },
  { date: '2024-10-03', classType: 'X9.0', sep: false, note: 'It was one of the biggest flares of solar cycle 25.' },
  { date: '2017-09-10', classType: 'X8.2', sep: true, note: 'Its particles reached the ground on Earth and lit up auroras on Mars.' },
  { date: '2012-03-07', classType: 'X5.4', sep: true },
  { date: '2023-12-14', classType: 'X2.8', sep: true },
  { date: '2021-10-28', classType: 'X1.0', sep: true, note: 'Its fast particles reached all the way to the ground on Earth.' },
  { date: '2012-01-23', classType: 'M8.7', sep: true },
  { date: '2013-04-11', classType: 'M6.5', sep: true },
  { date: '2022-01-20', classType: 'M5.5', sep: true },
  { date: '2020-11-29', classType: 'M4.4', sep: true },
  { date: '2022-03-28', classType: 'M4.0', sep: true },
  { date: '2021-10-28', classType: 'M2.2', sep: false },
];

const iso = d => d.toISOString().slice(0, 10);
const DAY = 864e5;

async function getJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// DONKI's own server answers without a key but only 60 days at a time, so a year is six requests.
async function fromCcmc(end) {
  const parts = await Promise.allSettled(Array.from({ length: 6 }, (_, k) => {
    const to = new Date(end.getTime() - k * 60 * DAY), from = new Date(to.getTime() - 59 * DAY);
    return getJson(`https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=${iso(from)}&endDate=${iso(to)}`);
  }));
  // Keep the unbroken run of answers back from today, so a count is never quietly missing a month.
  const ok = parts.findIndex(p => p.status !== 'fulfilled' || !Array.isArray(p.value));
  const got = ok < 0 ? parts : parts.slice(0, ok);
  const list = got.flatMap(p => p.value);
  list.days = got.length * 60;
  return list;
}

// The same database through NASA's API portal, as a second try.
async function fromApiPortal(end) {
  const list = await getJson(`https://api.nasa.gov/DONKI/FLR?startDate=${iso(new Date(end.getTime() - 365 * DAY))}&endDate=${iso(end)}&api_key=DEMO_KEY`);
  return Array.isArray(list) ? list : [];
}

// The past year's flares of class M1 and up. Resolves to { live, flares[] }.
export async function getFlares() {
  const end = new Date();
  for (const source of [fromCcmc, fromApiPortal]) {
    try {
      const seen = new Set();
      const raw = await source(end);
      const flares = raw
        .filter(f => /^[MX]\d+(\.\d+)?$/.test(f.classType ?? '') &&(f.peakTime || f.beginTime) && !seen.has(f.flrID ?? f.peakTime ?? f.beginTime) && seen.add(f.flrID ?? f.peakTime ?? f.beginTime))
        .map(f => ({
          date: (f.peakTime || f.beginTime).slice(0, 10),
          classType: f.classType,
          sep: (f.linkedEvents ?? []).some(e => /-SEP-/.test(e.activityID ?? '')),
          id: f.flrID,
        }));
      if (flares.length) return { live: true, flares, days: raw.days ?? 365 };
    } catch {
      // Try the next source.
    }
  }
  return { live: false, flares: PAST_FLARES };
}

// --- Data cards: the real science behind each mission ---
export function dataCard(kind, site) {
  const pct = v => `${Math.round(v * 100)}%`;
  const cards = {
    sunlight: {
      title: 'Data card: sunlight at the south pole',
      body: `Your base sits on Connecting Ridge, near Shackleton crater. NASA's Lunar Reconnaissance Orbiter measured the ground with a laser (LOLA), and from that, scientists worked out how often each spot is in sunlight. Your spot is lit about ${pct(site.sun)} of the time. The Sun stays low and goes all the way around the horizon, so dark spells are short compared to the rest of the Moon, but they still happen. In the game, one night is squeezed into a few minutes.`,
      source: 'NASA LRO LOLA sunlight map (Mazarico et al. 2011), NASA PGDA',
    },
    storm: {
      title: 'Data card: solar storms',
      body: 'A big solar flare can throw out fast particles that reach the Moon within minutes to hours. The Moon has no air or magnetic field to stop them. Scientists grade the biggest flares C, M or X. Each letter is ten times stronger than the one before, so X is the strongest. NASA\'s DONKI database keeps a record of every flare, and the storms in this game are sized from real ones: a bigger flare makes a stronger, longer storm. Not every real flare sends particles toward the Moon, but in the game each one does. NASA limits how much radiation an astronaut may get in a whole career to 600 millisieverts (a millisievert is the unit for radiation dose), so crews hide in the most shielded spot when a storm hits. Packing moon dirt (its science name is regolith) around a shelter blocks many of the particles.',
      source: 'NASA DONKI (CCMC); NASA-STD-3001 radiation limit',
    },
    ice: {
      title: 'Data card: ice in the shadows',
      body: `Some craters near the south pole never see sunlight and stay colder than -200 C. In 2009 NASA's LCROSS mission crashed a rocket stage into one of them and found water ice in the plume. The blue patches on your map are permanently shadowed ground from NASA's LOLA data. The nearest one is about ${site.iceDistance} m from your base, so the robot has a long drive.`,
      source: 'NASA LRO LOLA permanent shadow map; NASA LCROSS (2009)',
    },
    comms: {
      title: 'Data card: talking to Earth',
      body: `Radio signals travel at the speed of light, and the Moon is about 384,400 km away, so every message takes about 1.3 seconds each way. At the south pole Earth sits very low in the sky and sometimes dips below the hills. NASA's Earth-visibility map says Earth is above the horizon at your spot about ${pct(site.earth)} of the time. That is why a storm warning can come too late, or not at all, while Earth is down. On Mars the wait is much longer: 3 to 22 minutes each way, so a crew there has to decide without Mission Control.`,
      source: 'NASA LRO LOLA Earth-visibility map, NASA PGDA',
    },
    airlock: {
      title: 'Data card: the airlock',
      body: 'On the Space Station, spacewalks in American suits start in the Quest airlock, which arrived in July 2001. A spacesuit holds pure oxygen at low pressure. If astronauts went straight from cabin air to the suit, nitrogen in their blood could form bubbles and give them the bends, like a diver who comes up too fast. So first they breathe pure oxygen to clear the nitrogen out. NASA calls this a prebreathe, and the real thing takes hours. The game squeezes it into a few seconds.',
      source: 'NASA Human Research Program, Risk of Decompression Sickness evidence report; NASA EVA Hardware and Operations Overview (NTRS 20120011735)',
    },
    air: {
      title: 'Data card: life support',
      body: 'One astronaut breathes about 0.8 kg of oxygen every day and needs a few litres of water. On the Space Station, machines recycle about 98% of the water. Moon dirt is about 45% oxygen by weight, so future bases may bake oxygen out of it.',
      source: 'NASA (Ewert and Stromgren 2019, NTRS 20190027563); NASA ISS life support 2023',
    },
  };
  return cards[kind] ?? cards.air;
}

// Everything the game uses, for the credits screen.
export const SOURCES = [
  ['Terrain', 'LRO LOLA 5 m elevation model of Connecting Ridge (Site01), NASA Goddard Planetary Geodesy Data Archive (PGDA)', 'https://pgda.gsfc.nasa.gov/products/78'],
  ['Sunlight, Earth view, permanent shadow', 'LRO LOLA south pole illumination maps, NASA PGDA', 'https://pgda.gsfc.nasa.gov/products/69'],
  ['The Moon on the mission menu', 'CGI Moon Kit: whole-Moon brightness map (LROC camera) and height map (LOLA laser altimeter), NASA\'s Scientific Visualization Studio', 'https://svs.gsfc.nasa.gov/4720/'],
  ['The Earth in the sky', 'Whole-Earth map with clouds, "Equirectangular Projected Earth", NASA\'s Scientific Visualization Studio', 'https://svs.gsfc.nasa.gov/3615/'],
  ['Solar flares and storm sizes', 'NASA DONKI space weather database, Community Coordinated Modeling Center (CCMC)', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/'],
  ['Radiation limit', 'NASA-STD-3001 Volume 1, crew health standard', 'https://www.nasa.gov/ochmo/human-spaceflight-standards/'],
  ['Life support numbers', 'Ewert and Stromgren (2019), NASA Technical Reports Server 20190027563', 'https://ntrs.nasa.gov/citations/20190027563'],
  ['Airlock and prebreathe', 'Quest airlock on the International Space Station and oxygen prebreathe, NASA Human Research Program', 'https://humanresearchroadmap.nasa.gov/evidence/reports/DCS.pdf'],
  ['Ice in craters', 'NASA LCROSS mission results (2009)', 'https://www.nasa.gov/mission/lcross/'],
  ['Base site', 'Connecting Ridge was one of NASA\'s 13 Artemis III candidate landing regions in 2022. NASA\'s 2024 shortlist of nine does not include it', 'https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-Moon/'],
];
