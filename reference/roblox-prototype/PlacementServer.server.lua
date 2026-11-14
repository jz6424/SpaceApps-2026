--[[
	PlacementServer (Script)  ->  put in ServerScriptService

	The server decides. The client only asks "can I build X here?"; this script runs the
	same GridMath.check, takes the moon dirt, and builds the module for everyone.

	Landing: nobody spawns until the starter base has landed. The first player picks the
	spot from an aerial view (LandingClient); the server checks it, builds the cargo lander
	and starter modules for free, then spawns everyone next to them.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("BalanceConfig"))
local Grid = require(ReplicatedStorage:WaitForChild("GridConfig"))
local GridMath = require(ReplicatedStorage:WaitForChild("GridMath"))
local Visuals = require(ReplicatedStorage:WaitForChild("ModuleVisuals"))

if Grid.MoonGravity then
	workspace.Gravity = Grid.MoonGravity
end

-- Characters wait until the base has landed.
Players.CharacterAutoLoads = false

-- Remotes the client talks to.
local remotes = Instance.new("Folder")
remotes.Name = "PlacementRemotes"
local placeFn = Instance.new("RemoteFunction")
placeFn.Name = "PlaceModule"
placeFn.Parent = remotes
local landFn = Instance.new("RemoteFunction")
landFn.Name = "ChooseLandingSite"
landFn.Parent = remotes
local digEvent = Instance.new("RemoteEvent")
digEvent.Name = "TestDig"
digEvent.Parent = remotes
remotes.Parent = ReplicatedStorage

-- Everything built goes in Workspace.Base. occupied["x,z"] = the model on that cell.
local baseFolder = workspace:FindFirstChild("Base")
if not baseFolder then
	baseFolder = Instance.new("Folder")
	baseFolder.Name = "Base"
	baseFolder.Parent = workspace
end
baseFolder:SetAttribute("Landed", false)
local occupied = {}

local function isOccupied(key)
	return occupied[key] ~= nil
end

-- Build a module whose check result r already passed. ownerId 0 = the robots.
local function buildAt(name, ax, az, rot, r, ownerId)
	local model = Visuals.build(name)
	model:PivotTo(GridMath.pivotFor(ax, az, rot, r.w, r.d, r.maxY))
	model:SetAttribute("Module", name)
	model:SetAttribute("AnchorX", ax)
	model:SetAttribute("AnchorZ", az)
	model:SetAttribute("W", r.w)
	model:SetAttribute("D", r.d)
	model:SetAttribute("Rotation", rot)
	model:SetAttribute("Owner", ownerId)

	-- Uneven ground: fill the gap with a regolith pad so nothing floats.
	local gap = r.maxY - r.minY
	if gap > Grid.FoundationMinGap then
		local pad = Visuals.foundation(r.w, r.d, gap)
		local cx, cz = GridMath.footprintCenterXZ(ax, az, r.w, r.d)
		pad.CFrame = CFrame.new(cx, r.minY - 1 + pad.Size.Y / 2, cz)
		pad.Parent = model
	end

	local keys = {}
	for _, c in ipairs(GridMath.cells(ax, az, r.w, r.d)) do
		local k = GridMath.key(c.x, c.z)
		occupied[k] = model
		table.insert(keys, k)
	end
	-- If the model is ever deleted (by a later "remove" tool or by hand in Studio), free its cells.
	model.Destroying:Connect(function()
		for _, k in ipairs(keys) do
			if occupied[k] == model then
				occupied[k] = nil
			end
		end
	end)

	model.Parent = baseFolder
	return model
end

---------------------------------------------------------------------------
-- Spawning
---------------------------------------------------------------------------
local spawnCFrame = nil -- set when the base lands

-- The template SpawnLocation would put people in a random spot, so switch it off.
for _, d in ipairs(workspace:GetDescendants()) do
	if d:IsA("SpawnLocation") then
		d.Enabled = false
		d.Transparency = 1
		d.CanCollide = false
		d.CanQuery = false
		local decal = d:FindFirstChildOfClass("Decal")
		if decal then
			decal.Transparency = 1
		end
	end
end

-- With StreamingEnabled, terrain only streams to a player near their character. Before
-- landing there is no character, so point streaming at the middle of the build grid.
local focus = Instance.new("Part")
focus.Name = "LandingFocus"
focus.Anchored = true
focus.CanCollide = false
focus.CanQuery = false
focus.CanTouch = false
focus.Transparency = 1
focus.Size = Vector3.new(1, 1, 1)
do
	local cx = Grid.Origin.X + Grid.Cells.X * Grid.CellSize / 2
	local cz = Grid.Origin.Z + Grid.Cells.Y * Grid.CellSize / 2
	focus.Position = Vector3.new(cx, (GridMath.groundY(cx, cz) or 0) + 50, cz)
end
focus.Parent = workspace

local function spawnPlayer(player)
	if not player.Parent or not spawnCFrame then
		return
	end
	player:LoadCharacter()
end

local function onCharacter(player, character)
	-- Put the astronaut at the base, then respawn there a few seconds after any accident.
	task.defer(function()
		if spawnCFrame and character.Parent then
			character:PivotTo(spawnCFrame)
		end
	end)
	local humanoid = character:WaitForChild("Humanoid")
	humanoid.Died:Connect(function()
		task.wait(3)
		spawnPlayer(player)
	end)
end

-- Moon dirt per player, shown on the leaderboard. The real game will use one shared
-- base pool from the meter script; this is enough to test the cost check.
local function onPlayer(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local regolith = Instance.new("IntValue")
	regolith.Name = "Regolith"
	regolith.Value = Config.Start.Regolith
	regolith.Parent = stats
	stats.Parent = player

	player.ReplicationFocus = focus
	player.CharacterAdded:Connect(function(character)
		player.ReplicationFocus = nil -- stream around the character from now on
		onCharacter(player, character)
	end)
	-- Joined after landing: go straight to the base.
	if baseFolder:GetAttribute("Landed") then
		spawnPlayer(player)
	end
end
Players.PlayerAdded:Connect(onPlayer)
for _, p in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayer, p)
end

local lastRequest = {}
Players.PlayerRemoving:Connect(function(player)
	lastRequest[player] = nil
end)

local function tooFast(player)
	local now = os.clock()
	if lastRequest[player] and now - lastRequest[player] < 0.25 then
		return true
	end
	lastRequest[player] = now
	return false
end

local function isNumber(v)
	return type(v) == "number" and v == v -- second part rejects NaN
end

---------------------------------------------------------------------------
-- Landing the starter base
---------------------------------------------------------------------------
landFn.OnServerInvoke = function(player, ax, az)
	if baseFolder:GetAttribute("Landed") then
		return true, "The base has already landed"
	end
	if not isNumber(ax) or not isNumber(az) then
		return false, "Bad request"
	end
	if tooFast(player) then
		return false, "Slow down, pilot!"
	end
	ax, az = math.floor(ax), math.floor(az)

	local ok, reason, results = GridMath.checkLayout(ax, az, isOccupied)
	if not ok then
		return false, reason
	end

	for _, r in ipairs(results) do
		buildAt(r.name, r.ax, r.az, 0, r, 0)
	end

	-- Crew appears in the walkway between the lander and the habitat.
	local sx, sz = GridMath.cellCenterXZ(ax + Grid.SpawnCell.X, az + Grid.SpawnCell.Z)
	local sy = GridMath.groundY(sx, sz) or results[1].maxY
	spawnCFrame = CFrame.new(sx, sy + 4, sz)

	baseFolder:SetAttribute("Landed", true)
	for _, p in ipairs(Players:GetPlayers()) do
		task.spawn(spawnPlayer, p)
	end
	return true, "Touchdown! Your crew has arrived."
end

---------------------------------------------------------------------------
-- Building
---------------------------------------------------------------------------
local function inMenu(name)
	for _, n in ipairs(Grid.BuildMenu) do
		if n == name then
			return true
		end
	end
	return false
end

placeFn.OnServerInvoke = function(player, name, ax, az, rot)
	-- Never trust the client: check every argument.
	if type(name) ~= "string" or not isNumber(ax) or not isNumber(az) or not isNumber(rot) then
		return false, "Bad request"
	end
	if not baseFolder:GetAttribute("Landed") then
		return false, "Land the base first"
	end
	if not inMenu(name) then
		return false, "You can't build that yet"
	end
	if tooFast(player) then
		return false, "Slow down, builder!"
	end

	ax, az, rot = math.floor(ax), math.floor(az), math.floor(rot) % 4
	local stats = player:FindFirstChild("leaderstats")
	local regolith = stats and stats:FindFirstChild("Regolith")
	if not regolith then
		return false, "Still loading"
	end

	local r = GridMath.check(name, ax, az, rot, isOccupied, regolith.Value)
	if not r.ok then
		return false, r.reason
	end

	regolith.Value = regolith.Value - r.cost
	buildAt(name, ax, az, rot, r, player.UserId)
	local look = Grid.Looks[name]
	return true, "Built " .. (look and look.Label or name) .. "!"
end

-- Test button: pretend a digger brought in some moon dirt.
digEvent.OnServerEvent:Connect(function(player)
	if Grid.TestDigAmount <= 0 then
		return
	end
	local stats = player:FindFirstChild("leaderstats")
	local regolith = stats and stats:FindFirstChild("Regolith")
	if regolith then
		regolith.Value = math.min(regolith.Value + Grid.TestDigAmount, Config.Meters.Regolith.Max)
	end
end)
