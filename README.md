# Moon Base Trainer (NASA Space Apps 2026)

Our entry for the Space Apps challenge **"Build a Junior Astronaut Mission Trainer"**: a single-player
browser game for kids 7 to 12. You are the whole crew of a small base at Connecting Ridge, near the
Moon's south pole. Walk around inside the Habitat (cutaway view), use its stations, send a robot
outside, go on moonwalks, and make it to sunrise.

## Play it

```
cd game
npm install
npm run dev        # then open http://localhost:5174
```

You need Node 20.19 or newer, or 22.12 or newer (Vite 8 won't start on older versions, including Node 21).

`npm run build` writes the game as a static site to `game/dist/` (works from any folder).

**Online:** https://jz6424.github.io/SpaceApps-2026/ is the project website (`site/`), with the game
embedded and a full-screen button. The game alone is at `/play/`. Every push to `main` rebuilds and
publishes both (`.github/workflows/pages.yml`; one-time setup: repo Settings > Pages > Source = GitHub Actions).
To preview the whole website locally: `./build-site.sh`, then `python3 -m http.server -d _site 5175`
and open http://localhost:5175.

Opening `game/dist/index.html` straight from Finder (a `file://` address) won't work, because browsers block loading the terrain and models that way; use `npm run preview` or the online link.

Add `?low` to the address for simple graphics on slow computers (the game also switches by itself).

## The game loop

* **Three core meters:** Power (solar + battery), Life Support (air and water), Radiation dose.
* **Stations in the Habitat:** Power, Life Support (Eco / Normal / Boost), Comms (antenna, forecast,
  science uploads, 1.3 s light delay), Galley and greenhouse, Robot Map (dig regolith, haul crater ice,
  fix panels), Storm Shelter (regolith shielding), Airlock (moonwalks).
* **First Night:** bring back 5 glowing rock samples and reach sunrise. There are 10 around the base,
  in new spots every game: 5 ordinary ones 14 to 40 m out and 5 rare blue ones further out, worth more. After dark only the cabin is lit, and Eco dims it. **F** switches the chest light on the suit,
  **T** speeds up time.
* **Airlock:** an inner door and an outer plug hatch that never open together. Going out: the inner door
  closes, you prebreathe pure oxygen (a few seconds here, hours in real life), pumps take the air out,
  then the hatch opens; it shuts by itself behind you. Each trip out costs 1.5% Life Support (`airlock`
  in `src/config.js`). Going out is blocked during a solar storm, but coming back in never is, and the
  airlock counts as outside for radiation. `npm run airlock` checks the rules.
* **No free choices:** everything that helps costs power, moon dirt, suit air or radiation dose.
* **Events:** sunset and a lunar night, solar storms, micrometeoroid hits on solar panels, Earth
  setting below the horizon (no comms).
* **Storms from real flares:** each storm is sized from a real flare in NASA DONKI. The flare's class
  (M1 to M4.9 mild, M5 to M9.9 moderate, X strong) sets the storm's strength, and a bigger flare makes
  it last longer. Every playthrough draws different flares and shifts the storm and space-rock times
  (`planRun` in `src/sim.js`), so no two runs are the same. During a storm the view shows small
  light flashes, like the ones Apollo astronauts saw when radiation passed through their eyes: more of
  them the bigger your dose, and faster than in real life so you can see it.
* **Win / lose:** reach sunrise with the mission goal met. Life support at 0 for 15 s, or the dose
  limit, ends the mission. Stars, research points, unlocks, then a debrief with NASA data cards.
* **Missions:** First Night (tutorial; goal: 5 rock samples and reach sunrise), Solar Storm (needs
  Regolith Shielding), Ice and Greens (needs Greenhouse). Modes: Cadet, Explorer, Commander.
* **Research Tree:** spend research points between missions. Regolith Shielding and Greenhouse open
  missions 2 and 3. Thirteen upgrades (each with the real science and the exact change, listed in
  `game/src/research.js`) change the numbers the next missions run on: warmer blankets, a dish
  antenna, a bigger suit tank and so on. Circles you can't afford yet say why in red; the first pick
  (Regolith Shielding) pulses until you research something. After a mission, a popup and a red dot on
  the Research Tree button say when you have points to spend.
* **Scrapbook:** a ring binder with a page for each big part of the base (14 pages: Habitat, Life
  Support, solar panels, airlock, robot and so on; upgrades don't get their own page). A page is
  added the first time you use that part in a mission, and two (Regolith shielding, Greenhouse)
  come from the Research Tree. Until then the contents shows it with a padlock and how to unlock it,
  and it opens as a locked page: the picture from the game, question marks for the other pictures,
  the write-up covered over, and the same line on how to unlock it.
  Each page has a picture taken live from the game, our Blender model, a real NASA photograph, the
  science at two reading levels (Easy read for ages 7 to 9, Deep dive for 10 and up) and links to
  NASA pages. Reading a page for the first time pays 2 research points (`science.pageRP` in
  `src/config.js`). The words are in `src/scrapbook.js`; `npm run scrapbook` checks that every
  NASA link still works and prints the reading grade of each write-up. Coming into the Scrapbook,
  the binder is shut for a moment and its cover swings open onto the contents (a click on the cover
  skips this; with reduced motion it fades instead).
* **For teachers and judges:** "Open every mission now" at the bottom of the mission menu, or add
  `?all` to the game's address, opens every mission and every Scrapbook page without earning points.

## Real NASA data

| Where | Data |
|---|---|
| Terrain you walk on | LRO LOLA 5 m elevation model, Connecting Ridge (PGDA product 78) -> `game/public/terrain/ridge_heights.u16` |
| Base spot, solar output, comms gaps | LOLA sunlight and Earth-visibility maps (PGDA product 69) -> `sun.png`, `earth.png` |
| Crater ice, faintly tinted ground, ice drill spot | LOLA permanent shadow map -> `psr.png` |
| The Moon on the mission menu | [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) from NASA's Scientific Visualization Studio: the LROC brightness map and the LOLA height map of the whole Moon -> `game/public/moon/` (NASA's files, unchanged). The globe's seas and craters are the real ones, with heights stretched 5 times so they show. The blue crater by the flags is our own marker for the icy craters |
| The Earth in the sky | [SVS 3615](https://svs.gsfc.nasa.gov/3615/) whole-Earth map with clouds, redrawn in cartoon colours in the game -> `game/public/earth/earth.jpg` |
| Solar storms | NASA DONKI flares of the past 12 months, live from `ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR` (no key; 60 days per request, so six requests), then `api.nasa.gov/DONKI/FLR` as a second try, then a list of real past flares. The game says which one it used |
| Data cards | NASA-STD-3001 dose limit, Ewert & Stromgren 2019 life support, LCROSS, ISS Quest airlock and oxygen prebreathe |
| Scrapbook photographs | NASA Image and Video Library (images.nasa.gov) and nasa.gov articles -> `game/public/scrapbook/real-*.jpg`. Each one is credited under the picture and in the in-game credits |

Raw downloads and the scripts that cut them are in `nasa-data/` (big TIFFs, ~160 MB).

### Getting the raw NASA data (optional)

You don't need it to run or change the game: the small cut-outs the game loads are committed in
`game/public/terrain/`. The raw GeoTIFFs are only needed to re-cut the terrain or pick a new site, and
they are too big for git, so download them from NASA Goddard's PGDA into `nasa-data/`:

```
cd nasa-data
B=https://pgda.gsfc.nasa.gov/data
curl -LO $B/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif                               # Connecting Ridge, 41 MB
curl -LO $B/LOLA_5mpp/Site06/Site06_final_adj_5mpp_surf.tif                               # Nobile Rim, 64 MB
curl -L  $B/MoonIllumination/AVGVISIB_85S_060M_201608.TIF       -o AVGVISIB_85S_060M_201608.tiff        # sunlight, 34 MB
curl -L  $B/MoonIllumination/AVGVISIB_85S_060M_201608_EARTH.TIF -o AVGVISIB_85S_060M_201608_EARTH.tiff  # Earth view, 25 MB
curl -L  $B/MoonIllumination/LPSR_85S_060M_201608.TIF           -o LPSR_85S_060M_201608.tiff            # permanent shadow, 1 MB
pip install rasterio numpy pillow scipy
```

Keep the file names exactly as above (the scripts look for them). Product pages:
[LOLA 5 m site models (78)](https://pgda.gsfc.nasa.gov/products/78),
[south pole illumination maps (69)](https://pgda.gsfc.nasa.gov/products/69).
Then `python game/tools/make_heights.py` rewrites `game/public/terrain/ridge_heights.u16`, and
`python nasa-data/lola_to_roblox.py -h` shows how to cut a new area.

## Folders

| Folder | What's inside |
|---|---|
| `game/` | The browser game (three.js, Rapier physics, Vite). Rules in `src/sim.js`, numbers in `src/config.js`. |
| `site/` | The project website that hosts the game (plain HTML, CSS, JS). `build-site.sh` puts it and the built game into `_site/`. |
| `game/tools/simulate.mjs` | `npm run balance`: plays every mission x mode with careful, careless and idle bots, then 300 playthroughs each with storms drawn from the real flare feed. |
| `nasa-data/` | NASA LOLA rasters, cut-outs for Connecting Ridge and Nobile Rim, and the conversion scripts. |
| `balancing/` | Original Roblox `BalanceConfig.lua` and `simulate.py` (the JS config was ported from these). |
| `assets/blender/` | `modules.blend`, build scripts, glTF exports (copied into `game/public/models/`), previews. `build_astronaut.py` makes the rigged astronaut with Idle, Walk and Run loops (`Astronaut.glb`). `preview_scrapbook.py` renders the Scrapbook's model pictures (`game/public/scrapbook/model-*.jpg`). |
| `docs/` | Design hub, mission planner, Space Apps brand style. |
| `reference/` | The paused Roblox prototype, for reference only. |

## AI disclosure (Super Intelligence tools)

Space Apps 2026 calls AI tools "Super Intelligence (SI)" and asks every project to say how they were
used. We used one SI tool: Claude (Anthropic), for code, balancing, Blender scripts, fact checks and
text. The team chose the design, directed the work, and reviewed and tested it. This is also stated
in the in-game credits, and the same paragraph goes on our project submission form.

## License

The team's code, models and text are under the MIT License (see `LICENSE`). NASA data and photos,
the fonts, and the open-source libraries keep their own terms and are credited above and in the game.
