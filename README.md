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

`npm run build` writes a static site to `game/dist/` (works from any folder, e.g. GitHub Pages).
**Online:** every push to `main` builds the game and publishes it to https://jz6424.github.io/SpaceApps-2026/ (`.github/workflows/pages.yml`; one-time setup: repo Settings > Pages > Source = GitHub Actions).
Opening `game/dist/index.html` straight from Finder (a `file://` address) won't work, because browsers block loading the terrain and models that way; use `npm run preview` or the online link.

Add `?low` to the address for simple graphics on slow computers (the game also switches by itself).

## The game loop

* **Three core meters:** Power (solar + battery), Life Support (air and water), Radiation dose.
* **Stations in the Habitat:** Power, Life Support (Eco / Normal / Boost), Comms (antenna, forecast,
  science uploads, 1.3 s light delay), Galley and greenhouse, Robot Map (dig regolith, haul crater ice,
  fix panels), Storm Shelter (regolith shielding), Airlock (moonwalks).
* **No free choices:** everything that helps costs power, moon dirt, suit air or radiation dose.
* **Events:** sunset and a lunar night, solar storms (modelled on real DONKI flares), micrometeoroid hits
  on solar panels, Earth setting below the horizon (no comms).
* **Win / lose:** reach sunrise with the mission goal met. Life support at 0 for 15 s, or the dose
  limit, ends the mission. Stars, research points, unlocks, then a debrief with a NASA data card.
* **Missions:** First Night (tutorial), Solar Storm (needs Regolith Shielding), Ice and Greens (needs
  Greenhouse). Modes: Cadet, Explorer, Commander.

## Real NASA data

| Where | Data |
|---|---|
| Terrain you walk on | LRO LOLA 5 m elevation model, Connecting Ridge (PGDA product 78) -> `game/public/terrain/ridge_heights.f32` |
| Base spot, solar output, comms gaps | LOLA sunlight and Earth-visibility maps (PGDA product 69) -> `sun.png`, `earth.png` |
| Crater ice, blue ground, ice drill spot | LOLA permanent shadow map -> `psr.png` |
| Solar storms | NASA DONKI flares, live via api.nasa.gov, with real past flares as fallback |
| Data cards | NASA-STD-3001 dose limit, Ewert & Stromgren 2019 life support, LCROSS |

Raw downloads and the scripts that cut them are in `nasa-data/` (big TIFFs, ~160 MB).

## Folders

| Folder | What's inside |
|---|---|
| `game/` | The browser game (three.js, Rapier physics, Vite). Rules in `src/sim.js`, numbers in `src/config.js`. |
| `game/tools/simulate.mjs` | `npm run balance`: plays every mission x mode with careful, careless and idle bots. |
| `nasa-data/` | NASA LOLA rasters, cut-outs for Connecting Ridge and Nobile Rim, and the conversion scripts. |
| `balancing/` | Original Roblox `BalanceConfig.lua` and `simulate.py` (the JS config was ported from these). |
| `assets/blender/` | `modules.blend`, build scripts, glTF exports (copied into `game/public/models/`), previews. |
| `docs/` | Design hub, mission planner, Space Apps brand style. |
| `reference/` | The paused Roblox prototype, for reference only. |

## AI disclosure

Built with help from Claude (Anthropic) for code, balancing, Blender scripts, fact checks and text.
The team chose the design, directed the work, and reviewed and tested it. This is also stated in the
in-game credits.
