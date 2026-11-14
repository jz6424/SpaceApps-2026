# Grid placement prototype: Studio setup

Practice only. Build this in a throwaway place; the real game gets built fresh on the hackathon weekend.
Takes about 10 minutes.

## What you get

- An 8-stud build grid (48 x 48 cells) over bumpy moon ground.
- A build bar: Solar Panel, Battery, Habitat, Digger Robot, Oxygen Maker, Ice Drill, each with its moon dirt cost from `BalanceConfig`.
- A see-through preview that snaps to the grid, sits on the ground, and turns green (OK) or red (can't build), with a text reason every time.
- R to rotate, click to build, Q or Esc to stop. On a tablet: tap the ground, then press **Build!**
- Server-side check: the server runs the same check again, takes the moon dirt, and builds the module.
- Uneven ground: modules sit on the highest point and get a grey regolith pad underneath. Too steep (over 15 degrees) is refused.
- Zones: the Ice Drill only goes inside the Shadow Crater; Solar Panels and Habitats can't go in it.

## Files

| File | Type in Studio | Where it goes |
|---|---|---|
| `../balancing/BalanceConfig.lua` | ModuleScript named `BalanceConfig` | ReplicatedStorage |
| `GridConfig.lua` | ModuleScript named `GridConfig` | ReplicatedStorage |
| `GridMath.lua` | ModuleScript named `GridMath` | ReplicatedStorage |
| `ModuleVisuals.lua` | ModuleScript named `ModuleVisuals` | ReplicatedStorage |
| `PlacementServer.server.lua` | **Script** named `PlacementServer` | ServerScriptService |
| `PlacementClient.client.lua` | **LocalScript** named `PlacementClient` | StarterPlayer > StarterPlayerScripts |
| `LandingClient.client.lua` | **LocalScript** named `LandingClient` | StarterPlayer > StarterPlayerScripts |
| `MakeTestTerrain.lua` | nothing: paste into the Command Bar | (runs once) |

Names matter: the scripts find each other by name.

## Steps

1. **New place.** Open Roblox Studio, pick the **Baseplate** template. Save it as "Grid Practice".
2. **Open the tools you need.** In the **View** tab (or Window menu in newer Studio), turn on **Explorer**, **Properties** and **Command Bar**.
3. **Make the moon ground.** Open `MakeTestTerrain.lua`, copy all of it, paste it into the Command Bar at the bottom, press Enter. Wait until the Output says "Test moon terrain ready". You should see grey hills, a ridge, and a crater with ice on its floor.
4. **Add the four ModuleScripts.** In Explorer, hover **ReplicatedStorage**, click **+**, choose **ModuleScript**. Rename it (F2) to `BalanceConfig`. Double-click it, select all, delete the default text, paste the file contents. Repeat for `GridConfig`, `GridMath`, `ModuleVisuals`.
5. **Add the server Script.** Hover **ServerScriptService**, **+**, **Script**, rename to `PlacementServer`, paste `PlacementServer.server.lua`.
6. **Add the LocalScript.** Expand **StarterPlayer**, hover **StarterPlayerScripts**, **+**, **LocalScript**, rename to `PlacementClient`, paste `PlacementClient.client.lua`.
7. **Play.** Press **Play** (F5). Open **Output** (View tab) so you can see any red errors.

If the build bar doesn't appear, the Output usually names the problem: often a script with the wrong name, or a Script/LocalScript mix-up.

## Test checklist

Tick each one. If one fails, copy the red error text from Output into the thread.

Landing first:

- [ ] Press Play: you see the map from above, a yellow circle, and a "Choose your landing site" panel. No character yet, no build bar.
- [ ] A see-through cargo lander, habitat, solar panel and digger follow the mouse together, snapping cell by cell.
- [ ] Outside the circle, on a steep slope, or with the solar panel or habitat over the crater: red, with the reason in text.
- [ ] Click on flat ground inside the circle: the four pieces are built, your astronaut appears in the gap between the lander and the habitat, and the build bar shows up.
- [ ] With 2 players: the second player's picker closes when the first one lands, and both spawn at the base.

Then building:

- [ ] The build bar shows 6 modules with costs (Solar 12, Battery 15, Habitat 25, Digger 15, Oxygen Maker 20, Ice Drill 20) and "Moon dirt: 30" top left.
- [ ] Click **Solar Panel**: a see-through panel follows the mouse and jumps cell by cell (snapping), with a faint 7 x 7 grid patch around it.
- [ ] On flat ground the preview is green and the text says "OK: Click to build...". Click: the panel appears, moon dirt drops to 18.
- [ ] Click the same spot again: red, "Something is already built here".
- [ ] Pick **Habitat**, press **R**: the 2 x 2 tube turns a quarter. Pick **Oxygen Maker** (2 x 1), press R: its footprint swaps from wide to deep.
- [ ] With 18 dirt, try a Habitat (25): red, "Need 7 more moon dirt". Press **Test: dig +10**, then it turns green.
- [ ] Move a Battery onto the steep side of the crater or ridge: red, "Too steep to build (N degrees)".
- [ ] Build on a gentle bump: the module sits on top of the ground with a grey pad under it, not floating or sunk in.
- [ ] Ice Drill outside the crater: red, "Must be built inside the Shadow Crater". Inside on the flat floor: green.
- [ ] Solar Panel inside the crater: red, "No sunlight in the shadow crater!"
- [ ] Walk off the edge of the build area: red, "Outside the base area".
- [ ] Press **Q**: preview and grid patch vanish.
- [ ] Jumping feels floaty (moon gravity, 1/6 of Earth).
- [ ] Two players: in the **Test** tab, set Clients to 2 and press **Start**. A module built by one player appears for the other, and the other can't build on top of it.
- [ ] Tablet: in the **Test** tab use **Device** emulator (e.g. iPad). Tap the ground, the preview moves there, a **Build!** button appears and works.

## Things to try changing

All in `GridConfig`:

- `CellSize = 8` vs `4` or `12`: which feels best for kids on a tablet?
- `MaxSlopeDegrees`: 15 is strict on rough ground; try 20.
- `Footprints`: make Habitat 3 x 2.
- `ForbiddenZones`: add `Battery = { ShadowCrater = "Too cold for batteries!" }`.
- Drop a real model into a `ModuleModels` folder in ReplicatedStorage, named `Solar`, with its pivot at the centre of its bottom face. It replaces the placeholder automatically.

## Real NASA terrain

To swap the test ground for real Connecting Ridge terrain, see `../site-data/` (heightmap converter and import settings). After importing, move `Zones/ShadowCrater` over the real crater floor and set `GridConfig.Origin` to the corner of the area you want to build on.

## Not in this prototype yet

Removing or moving a module, saving the base, the meters (power, oxygen...), and a shared base dirt pool (each player has their own dirt here). Those come from the meter script and DataStore work.
