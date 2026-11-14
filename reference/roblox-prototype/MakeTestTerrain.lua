--[[
	MakeTestTerrain  ->  paste into Studio's COMMAND BAR (View > Command Bar) and press Enter.
	Run it once in Edit mode (not while playing). Takes about 10-30 seconds.

	It makes gently rolling grey moon ground (1024 x 1024 studs) with:
	  * a sunny ridge (like the real Connecting Ridge),
	  * a deep bowl crater with ice on its floor (like Shackleton), and
	  * a "ShadowCrater" zone Part inside Workspace.Zones, so the Ice Drill rule works.
	It also deletes the template Baseplate and moves the SpawnLocation onto the ground.
	Throwaway practice place only: it clears all existing Terrain first.
]]

local Terrain = workspace.Terrain
local Lighting = game:GetService("Lighting")
Terrain:Clear()
local old = workspace:FindFirstChild("Baseplate")
if old then old:Destroy() end

local SIZE = 1024         -- studs, bigger than the 768-stud build grid
local STEP = 4            -- one terrain voxel
local FLOOR = -40         -- bottom of the terrain
local TOP = 120           -- nothing is higher than this
local CRATER = Vector2.new(220, 220)
local CRATER_R = 90       -- inner radius of the bowl
local RIM_W = 24          -- width of the raised rim
local DEPTH = 50

-- Gentle, wide hills: about 8 degrees on average and over 95% flatter than 15 degrees,
-- a little smoother than the real Connecting Ridge (about 10 degrees, 86% gentle).
-- A few shallow little craters for something to look at.
local SMALL_CRATERS = {
	{ -200, 120, 22 }, { 90, -260, 16 }, { -300, -280, 26 }, { 330, -60, 14 }, { -60, 330, 18 },
}

local function heightAt(x, z)
	-- Rolling ground
	local h = 20 + math.noise(x / 240, z / 240, 0.31) * 18 + math.noise(x / 70, z / 70, 4.7) * 2
	-- A broad ridge running from the crater rim to the north-west corner
	local dx, dz = x - CRATER.X, z - CRATER.Y
	local along = (-(dx) - dz) / math.sqrt(2)          -- distance along the ridge line
	local across = (dx - dz) / math.sqrt(2)            -- distance sideways from it
	if along > 0 then
		h = h + 20 * math.exp(-(across * across) / (2 * 70 * 70))
	end
	for _, c in ipairs(SMALL_CRATERS) do
		local d = math.sqrt((x - c[1]) ^ 2 + (z - c[2]) ^ 2)
		if d < c[3] then
			h = h - c[3] * 0.18 * (1 - (d / c[3]) ^ 2) + 1
		elseif d < c[3] * 1.4 then
			h = h + (1 - (d - c[3]) / (c[3] * 0.4))
		end
	end
	-- The big crater: a bowl with a raised rim
	local dist = math.sqrt(dx * dx + dz * dz)
	if dist < CRATER_R then
		h = h - DEPTH * (1 - (dist / CRATER_R) ^ 2) + 8
	elseif dist < CRATER_R + RIM_W then
		h = h + 8 * (1 - (dist - CRATER_R) / RIM_W)
	end
	return math.clamp(h, FLOOR + 6, TOP - 4), dist
end

Terrain:SetMaterialColor(Enum.Material.Ground, Color3.fromRGB(150, 148, 144))
Terrain:SetMaterialColor(Enum.Material.Basalt, Color3.fromRGB(70, 70, 75))
Terrain:SetMaterialColor(Enum.Material.Glacier, Color3.fromRGB(200, 225, 240))

-- Write the ground in 64 x 64 stud chunks. Partly filled top voxels make it smooth.
local CHUNK = 64
local ny = (TOP - FLOOR) / STEP
local half = SIZE / 2
for x0 = -half, half - CHUNK, CHUNK do
	for z0 = -half, half - CHUNK, CHUNK do
		local n = CHUNK / STEP
		local mats, occ = {}, {}
		for i = 1, n do
			mats[i], occ[i] = {}, {}
			for j = 1, ny do
				mats[i][j], occ[i][j] = {}, {}
			end
			for k = 1, n do
				local cx, cz = x0 + (i - 0.5) * STEP, z0 + (k - 0.5) * STEP
				local h, dist = heightAt(cx, cz)
				local mat = Enum.Material.Ground
				if dist < 24 then
					mat = Enum.Material.Glacier       -- ice on the darkest part of the floor
				elseif dist < CRATER_R then
					mat = Enum.Material.Basalt
				end
				for j = 1, ny do
					local bottom = FLOOR + (j - 1) * STEP
					local o = math.clamp((h - bottom) / STEP, 0, 1)
					occ[i][j][k] = o
					mats[i][j][k] = o > 0 and mat or Enum.Material.Air
				end
			end
		end
		local region = Region3.new(Vector3.new(x0, FLOOR, z0), Vector3.new(x0 + CHUNK, TOP, z0 + CHUNK))
		Terrain:WriteVoxels(region, STEP, mats, occ)
	end
	task.wait()
end

-- The ShadowCrater zone: an invisible upright cylinder over the crater floor.
local zones = workspace:FindFirstChild("Zones") or Instance.new("Folder")
zones.Name = "Zones"
zones.Parent = workspace
local oldZone = zones:FindFirstChild("ShadowCrater")
if oldZone then oldZone:Destroy() end
local zone = Instance.new("Part")
zone.Name = "ShadowCrater"
zone.Shape = Enum.PartType.Cylinder
zone.Size = Vector3.new(140, (CRATER_R - 8) * 2, (CRATER_R - 8) * 2) -- X = height when upright
zone.CFrame = CFrame.new(CRATER.X, 0, CRATER.Y) * CFrame.Angles(0, 0, math.rad(90))
zone.Anchored = true
zone.CanCollide = false
zone.CanQuery = false
zone.CanTouch = false
zone.CastShadow = false
zone.Transparency = 0.9
zone.Color = Color3.fromRGB(0, 66, 166)
zone.Parent = zones

-- Spawn on top of the ground near the middle. Uses the height formula directly, because
-- terrain made in the same Command Bar run can't be hit by raycasts until the next frame.
local spawn = workspace:FindFirstChildOfClass("SpawnLocation")
if spawn then
	local top = -math.huge
	for _, o in ipairs({ { 0, 0 }, { 6, 6 }, { -6, 6 }, { 6, -6 }, { -6, -6 } }) do
		top = math.max(top, (heightAt(-40 + o[1], -40 + o[2])))
	end
	spawn.Position = Vector3.new(-40, top + 1, -40)
end

-- Moon-ish lighting: black sky, low Sun. At the real south pole the Sun never climbs
-- more than about 1.5 degrees above the horizon, so shadows are always long.
Lighting.ClockTime = 6.3
Lighting.Brightness = 3
Lighting.Ambient = Color3.fromRGB(20, 20, 30)
Lighting.OutdoorAmbient = Color3.fromRGB(40, 40, 55)
local atmo = Lighting:FindFirstChildOfClass("Atmosphere")
if atmo then atmo.Density = 0 atmo.Haze = 0 atmo.Glare = 0 end

print("Test moon terrain ready. Crater centre at", CRATER, "- the Ice Drill only works inside it.")
