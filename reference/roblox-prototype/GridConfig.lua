--[[
	GridConfig (ModuleScript)  ->  put in ReplicatedStorage, name it exactly "GridConfig"

	Every number for the build grid lives here. Costs come from BalanceConfig
	(Config.Modules[name].Cost), so this file only holds grid and look settings.
]]

local GridConfig = {}

-- One grid cell is 8 x 8 studs = 2 x 2 terrain voxels. With the LOLA heightmap at
-- 4 studs per pixel (5 m per pixel), one cell is about 10 m x 10 m on the real Moon.
GridConfig.CellSize = 8

-- The buildable area. Origin is the corner with the smallest X and Z (Y is ignored).
-- 96 x 96 cells = 768 x 768 studs (about 960 m), centred on the world origin.
GridConfig.Origin = Vector3.new(-384, 0, -384)
GridConfig.Cells = Vector2.new(96, 96)

-- Ground is found by shooting rays straight down from this height.
GridConfig.RayTop = 600
GridConfig.RayDepth = 1200

-- Uneven ground. Slope = the height difference under a module across its shortest side.
-- Above this, the cell turns red with "Too steep". Real landers also need gentle ground.
GridConfig.MaxSlopeDegrees = 15
-- When the ground under a module is uneven by more than this many studs, a regolith
-- pad is built underneath so the module never floats.
GridConfig.FoundationMinGap = 0.5

-- How many cells around the cursor show the faint grid (radius 3 = a 7 x 7 patch).
GridConfig.GridPreviewRadius = 3

-- Moon gravity: Roblox default is 196.2 studs/s^2 for Earth; the Moon has 1/6 of that.
-- Set to nil to keep Earth gravity.
GridConfig.MoonGravity = 32.4

-- Footprint in cells {width (X), depth (Z)} before rotation.
GridConfig.Footprints = {
	Solar = { 1, 1 },
	Battery = { 1, 1 },
	Habitat = { 6, 4 }, -- 48 x 32 studs: big enough for the crew to walk around inside
	Digger = { 1, 1 },
	OxygenMaker = { 2, 1 },
	WaterRecycler = { 1, 1 },
	IceDrill = { 1, 1 },
	Shielding = { 2, 2 },
	CargoLander = { 2, 2 },
}

-- Placeholder look, used until real models are dropped into ReplicatedStorage.ModuleModels.
GridConfig.Looks = {
	Solar = { Label = "Solar Panel", Color = Color3.fromRGB(46, 150, 245), Height = 15 },
	Battery = { Label = "Battery", Color = Color3.fromRGB(234, 254, 7), Height = 6 },
	Habitat = { Label = "Habitat", Color = Color3.fromRGB(235, 235, 240), Height = 18 },
	Digger = { Label = "Digger Robot", Color = Color3.fromRGB(228, 55, 0), Height = 6 },
	OxygenMaker = { Label = "Oxygen Maker", Color = Color3.fromRGB(9, 96, 225), Height = 9 },
	WaterRecycler = { Label = "Water Recycler", Color = Color3.fromRGB(120, 200, 255), Height = 5 },
	IceDrill = { Label = "Ice Drill", Color = Color3.fromRGB(180, 230, 255), Height = 14 },
	Shielding = { Label = "Shielding", Color = Color3.fromRGB(120, 115, 110), Height = 10 },
	CargoLander = { Label = "Cargo Lander", Color = Color3.fromRGB(214, 170, 60), Height = 14 },
}

-- What shows in the build bar, in order. IceDrill is here so the crater rule can be tested.
GridConfig.BuildMenu = { "Solar", "Battery", "Habitat", "Digger", "OxygenMaker", "IceDrill" }

-- Zones are Parts inside a Workspace folder with this name. The Part's Name is the zone name
-- (for example "ShadowCrater"). Box parts and upright cylinder parts both work.
GridConfig.ZoneFolderName = "Zones"

-- A module with Zone = "ShadowCrater" in BalanceConfig must sit fully inside that zone.
-- These modules may NOT touch the listed zones, with the message shown to the player.
GridConfig.ForbiddenZones = {
	Solar = { ShadowCrater = "No sunlight in the shadow crater!" },
	Habitat = { ShadowCrater = "Too cold for a habitat in the crater!" },
}

-- Friendly zone names for messages.
GridConfig.ZoneLabels = {
	ShadowCrater = "the Shadow Crater",
}

-- Buildings that are not in BalanceConfig.Modules and cost nothing (the robots brought them).
GridConfig.FreeBuildings = {
	CargoLander = { Cost = 0 },
}

-- LANDING SITE PICKER
-- Story: a robot cargo lander touched down first and set up a small shelter. Before the
-- crew spawns, the first player picks from above where that starter base landed.
-- Cells are relative to the layout's corner; rotation is 0. Keep the modules in step with
-- BalanceConfig.Start.Modules (Habitat 1, Solar 1, Digger 1).
GridConfig.StarterLayout = {
	{ Name = "CargoLander", X = 0, Z = 0 }, -- 2 x 2
	-- column 2 is left open as a walkway; the crew spawns there
	{ Name = "Habitat", X = 3, Z = 0 },     -- 6 x 4
	{ Name = "Solar", X = 9, Z = 0 },
	{ Name = "Digger", X = 9, Z = 1 },
}
GridConfig.SpawnCell = { X = 2, Z = 0 }      -- where astronauts appear, relative to the layout
-- The starter base must sit fully inside this circle (in cells) around the centre of the grid.
GridConfig.LandingRadius = 26
-- Aerial camera: height above the grid centre, and how far it leans back (studs).
-- Keep the far edge of the circle within about 450 studs of the camera: Roblox stops
-- drawing terrain further away than that on lower graphics settings.
GridConfig.AerialHeight = 360
GridConfig.AerialTilt = 60

-- Test only: the "Dig +10" button adds this much moon dirt. Set to 0 to hide the button.
GridConfig.TestDigAmount = 10

return GridConfig
