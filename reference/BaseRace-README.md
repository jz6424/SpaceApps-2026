# BaseRace-NASA

Kid-friendly moon base builder for NASA Space Apps 2026 (Nov 14-15), built in Roblox.

| Folder | What's inside |
|---|---|
| `prototype/` | Grid placement practice scripts. Start with `SETUP.md`. For Rojo: run `rojo serve` in this folder. |
| `balancing/` | `BalanceConfig.lua` (every game number) and `simulate.py` (plays every mission and mode). |
| `site-data/` | `lola_to_roblox.py`: turns NASA LOLA elevation data into a Roblox heightmap. Save NASA downloads here. |
| `web/` | Browser demo (three.js, Rapier, Vite) to check model scale: `npm install`, then `npm run dev`, then open http://localhost:5174. |
| `docs/` | Design hub and mission planner pages (open in a browser), and the Space Apps brand style. |

Online:
- Design hub: https://claude.ai/artifact/LcuKytneN5ikDKwyP34Ge8
- Site report (Connecting Ridge, NASA sources): https://claude.ai/artifact/HgqYoa43K4GSAMLKgDG3tR

NASA elevation file for the ridge:
https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif
