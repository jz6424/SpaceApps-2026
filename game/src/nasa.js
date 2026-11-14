// Real NASA data in the game, and where each piece comes from.
//  * Terrain: LRO LOLA 5 m elevation model of Connecting Ridge (loaded in main.js).
//  * Sunlight, Earth visibility and permanent shadow maps from LOLA, cut to the same area.
//  * Solar flares from NASA's DONKI space weather database: live when the browser can reach it,
//    otherwise a short list of real past flares (and the game says which one you got).

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
// Real flares, used when DONKI can't be reached (offline, or the API is busy).
const PAST_FLARES = [
  { date: '2024-10-03', classType: 'X9.0', note: 'The biggest flare of the current solar cycle so far.' },
  { date: '2017-09-10', classType: 'X8.2', note: 'Its particles reached the ground on Earth and lit up auroras on Mars.' },
  { date: '2024-05-14', classType: 'X8.7', note: 'Came days after the strongest geomagnetic storm on Earth in 20 years.' },
  { date: '2017-09-06', classType: 'X9.3', note: 'The biggest flare of solar cycle 24.' },
  { date: '2021-10-28', classType: 'X1.0', note: 'Sent fast particles all the way to the ground on Earth.' },
];

const iso = d => d.toISOString().slice(0, 10);

// Asks DONKI for the strongest flares of the past year. Resolves to { live, flares[] }.
export async function getFlares() {
  const end = new Date(), startD = new Date(end.getTime() - 365 * 864e5);
  const url = `https://api.nasa.gov/DONKI/FLR?startDate=${iso(startD)}&endDate=${iso(end)}&api_key=DEMO_KEY`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(res.status);
    const list = await res.json();
    const score = c => ({ X: 100, M: 10, C: 1 }[c[0]] ?? 0) * parseFloat(c.slice(1) || 1);
    const flares = list
      .filter(f => f.classType && /^[XM]/.test(f.classType))
      .sort((a, b) => score(b.classType) - score(a.classType))
      .slice(0, 5)
      .map(f => ({ date: (f.peakTime || f.beginTime).slice(0, 10), classType: f.classType, note: `Seen by ${f.instruments?.[0]?.displayName ?? 'NASA and NOAA satellites'}.`, id: f.flrID }));
    if (!flares.length) throw new Error('none');
    return { live: true, flares };
  } catch {
    return { live: false, flares: PAST_FLARES };
  }
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
      body: 'A big solar flare can throw out fast particles that reach the Moon within minutes to hours. The Moon has no air or magnetic field to stop them. NASA\'s DONKI database keeps a record of every flare and storm. NASA limits how much radiation an astronaut may get in a whole career (600 millisieverts), so crews hide in the most shielded spot when a storm hits. Packing moon dirt (regolith) around a shelter blocks many of the particles.',
      source: 'NASA DONKI (CCMC); NASA-STD-3001 radiation limit',
    },
    ice: {
      title: 'Data card: ice in the shadows',
      body: `Some craters near the south pole never see sunlight and stay colder than -200 C. In 2009 NASA's LCROSS mission crashed a rocket stage into one of them and found water ice in the plume. The blue patches on your map are permanently shadowed ground from NASA's LOLA data. The nearest one is about ${site.iceDistance} m from your base, so the robot has a long drive.`,
      source: 'NASA LRO LOLA permanent shadow map; NASA LCROSS (2009)',
    },
    comms: {
      title: 'Data card: talking to Earth',
      body: `Radio signals travel at the speed of light, and the Moon is about 384,400 km away, so every message takes about 1.3 seconds each way. At the south pole Earth sits very low in the sky and sometimes dips below the hills. NASA's Earth-visibility map says Earth is above the horizon at your spot about ${pct(site.earth)} of the time.`,
      source: 'NASA LRO LOLA Earth-visibility map, NASA PGDA',
    },
    air: {
      title: 'Data card: life support',
      body: 'One astronaut breathes about 0.9 kg of oxygen every day and needs a few litres of water. On the Space Station, machines recycle about 98% of the water. Moon dirt is about 45% oxygen by weight, so future bases may bake oxygen out of it.',
      source: 'NASA (Ewert and Stromgren 2019, NTRS 20190027563); NASA ISS life support 2023',
    },
  };
  return cards[kind] ?? cards.air;
}

// Everything the game uses, for the credits screen.
export const SOURCES = [
  ['Terrain', 'LRO LOLA 5 m elevation model of Connecting Ridge (Site01), NASA Goddard Planetary Geodesy Data Archive (PGDA)', 'https://pgda.gsfc.nasa.gov/products/78'],
  ['Sunlight, Earth view, permanent shadow', 'LRO LOLA south pole illumination maps, NASA PGDA', 'https://pgda.gsfc.nasa.gov/products/69'],
  ['Solar flares', 'NASA DONKI space weather database (CCMC), via api.nasa.gov', 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'],
  ['Radiation limit', 'NASA-STD-3001 Volume 1, crew health standard', 'https://www.nasa.gov/ochmo/human-spaceflight-standards/'],
  ['Life support numbers', 'Ewert and Stromgren (2019), NASA Technical Reports Server 20190027563', 'https://ntrs.nasa.gov/citations/20190027563'],
  ['Ice in craters', 'NASA LCROSS mission results (2009)', 'https://www.nasa.gov/mission/lcross/'],
  ['Base site', 'Connecting Ridge was one of NASA\'s Artemis III candidate landing regions (2022)', 'https://www.nasa.gov/artemis/'],
];
