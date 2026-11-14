--[[
	GridMath (ModuleScript)  ->  put in ReplicatedStorage, name it exactly "GridMath"

	Shared by the client (green/red preview) and the server (the real check), so both
	always agree on whether a spot is buildable.

	Cells are numbered from 0 at GridConfig.Origin. A module's "anchor" is its cell with
	the smallest X and Z; its footprint covers anchor .. anchor + size - 1.
	Rotation is 0..3 (quarter turns). Odd rotations swap width and depth.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Config = require(ReplicatedStorage:WaitForChild("BalanceConfig"))
local Grid = require(ReplicatedStorage:WaitForChild("GridConfig"))

local GridMath = {}

function GridMath.key(x, z)
	return x .. "," .. z
end

-- Footprint size in cells after rotation.
function GridMath.footprint(name, rot)
	local fp = Grid.Footprints[name] or { 1, 1 }
	local w, d = fp[1], fp[2]
	if rot % 2 == 1 then
		w, d = d, w
	end
	return w, d
end

function GridMath.worldToCell(pos)
	local s = Grid.CellSize
	return math.floor((pos.X - Grid.Origin.X) / s), math.floor((pos.Z - Grid.Origin.Z) / s)
end

function GridMath.cellCenterXZ(x, z)
	local s = Grid.CellSize
	return Grid.Origin.X + (x + 0.5) * s, Grid.Origin.Z + (z + 0.5) * s
end

-- Pick the anchor so the footprint is centred on the cell under the cursor.
function GridMath.anchorFromHover(hx, hz, w, d)
	return hx - math.floor((w - 1) / 2), hz - math.floor((d - 1) / 2)
end

function GridMath.footprintCenterXZ(ax, az, w, d)
	local s = Grid.CellSize
	return Grid.Origin.X + (ax + w / 2) * s, Grid.Origin.Z + (az + d / 2) * s
end

function GridMath.cells(ax, az, w, d)
	local list = {}
	for x = ax, ax + w - 1 do
		for z = az, az + d - 1 do
			table.insert(list, { x = x, z = z })
		end
	end
	return list
end

function GridMath.inBounds(x, z)
	return x >= 0 and z >= 0 and x < Grid.Cells.X and z < Grid.Cells.Y
end

-- Rays only hit Terrain plus any Part tagged "Ground", never modules, ghosts or players.
function GridMath.groundParams()
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	local list = { workspace.Terrain }
	for _, part in ipairs(CollectionService:GetTagged("Ground")) do
		table.insert(list, part)
	end
	params.FilterDescendantsInstances = list
	params.IgnoreWater = true
	return params
end

function GridMath.groundY(x, z, params)
	local result = workspace:Raycast(
		Vector3.new(x, Grid.RayTop, z),
		Vector3.new(0, -Grid.RayDepth, 0),
		params or GridMath.groundParams()
	)
	return result and result.Position.Y or nil
end

-- Sample the ground under a footprint: every cell centre plus the four outer corners.
-- Returns lowest and highest ground, or nil if any ray missed (hole or edge of map).
function GridMath.sampleGround(ax, az, w, d)
	local params = GridMath.groundParams()
	local s = Grid.CellSize
	local inset = 0.5
	local x0 = Grid.Origin.X + ax * s + inset
	local z0 = Grid.Origin.Z + az * s + inset
	local x1 = Grid.Origin.X + (ax + w) * s - inset
	local z1 = Grid.Origin.Z + (az + d) * s - inset
	local points = { { x0, z0 }, { x1, z0 }, { x0, z1 }, { x1, z1 } }
	for _, c in ipairs(GridMath.cells(ax, az, w, d)) do
		local cx, cz = GridMath.cellCenterXZ(c.x, c.z)
		table.insert(points, { cx, cz })
	end
	local minY, maxY = math.huge, -math.huge
	for _, p in ipairs(points) do
		local y = GridMath.groundY(p[1], p[2], params)
		if not y then
			return nil, nil
		end
		minY = math.min(minY, y)
		maxY = math.max(maxY, y)
	end
	return minY, maxY
end

-- Which zones contain this world point (X/Z only). Returns a set: { ShadowCrater = true }.
function GridMath.zonesAt(x, z)
	local found = {}
	local folder = workspace:FindFirstChild(Grid.ZoneFolderName)
	if not folder then
		return found
	end
	for _, part in ipairs(folder:GetChildren()) do
		if part:IsA("BasePart") then
			local lp = part.CFrame:PointToObjectSpace(Vector3.new(x, part.Position.Y, z))
			local inside
			if part:IsA("Part") and part.Shape == Enum.PartType.Cylinder then
				-- Upright cylinder: its local X axis points up, so Y/Z are the flat directions.
				local r = math.min(part.Size.Y, part.Size.Z) / 2
				inside = (lp.Y * lp.Y + lp.Z * lp.Z) <= r * r
			else
				inside = math.abs(lp.X) <= part.Size.X / 2 and math.abs(lp.Z) <= part.Size.Z / 2
			end
			if inside then
				found[part.Name] = true
			end
		end
	end
	return found
end

local function zoneLabel(zone)
	return Grid.ZoneLabels[zone] or zone
end

--[[
	The one placement check. isOccupied(key) -> bool. regolith = player's moon dirt.
	Returns a table:
	  ok       true when it can be built
	  reason   short kid-friendly text when not ok
	  w, d     footprint after rotation
	  minY, maxY  ground under the footprint (nil if no ground)
	  slope    degrees
	  cost     regolith cost
]]
function GridMath.check(name, ax, az, rot, isOccupied, regolith)
	local w, d = GridMath.footprint(name, rot)
	local stats = Config.Modules[name] or (Grid.FreeBuildings and Grid.FreeBuildings[name])
	local r = { ok = false, w = w, d = d, slope = 0, cost = stats and stats.Cost or 0 }
	if not stats then
		r.reason = "Unknown module"
		return r
	end

	-- Geometry first, so the ghost can still sit on the ground when the spot is bad.
	r.minY, r.maxY = GridMath.sampleGround(ax, az, w, d)
	if r.minY then
		local span = math.min(w, d) * Grid.CellSize
		r.slope = math.deg(math.atan((r.maxY - r.minY) / span))
	end

	local cells = GridMath.cells(ax, az, w, d)
	for _, c in ipairs(cells) do
		if not GridMath.inBounds(c.x, c.z) then
			r.reason = "Outside the base area"
			return r
		end
	end
	for _, c in ipairs(cells) do
		if isOccupied(GridMath.key(c.x, c.z)) then
			r.reason = "Something is already built here"
			return r
		end
	end
	if not r.minY then
		r.reason = "No ground here"
		return r
	end
	if r.slope > Grid.MaxSlopeDegrees then
		r.reason = string.format("Too steep to build (%d degrees)", math.floor(r.slope + 0.5))
		return r
	end

	-- Zones: a required zone must cover every cell; a forbidden zone must touch none.
	local forbidden = Grid.ForbiddenZones[name] or {}
	for _, c in ipairs(cells) do
		local cx, cz = GridMath.cellCenterXZ(c.x, c.z)
		local zones = GridMath.zonesAt(cx, cz)
		if stats.Zone and not zones[stats.Zone] then
			r.reason = "Must be built inside " .. zoneLabel(stats.Zone)
			return r
		end
		for zone, message in pairs(forbidden) do
			if zones[zone] then
				r.reason = message
				return r
			end
		end
	end

	if regolith < r.cost then
		r.reason = string.format("Need %d more moon dirt", r.cost - regolith)
		return r
	end

	r.ok = true
	return r
end

-- Size of the starter layout in cells, so it can be centred on the cursor.
function GridMath.layoutSize()
	local w, d = 0, 0
	for _, item in ipairs(Grid.StarterLayout) do
		local fw, fd = GridMath.footprint(item.Name, 0)
		w = math.max(w, item.X + fw)
		d = math.max(d, item.Z + fd)
	end
	return w, d
end

-- Check the whole starter base at anchor (ax, az). Every piece must pass the normal
-- check (ground, slope, zones; no cost) and sit inside the landing circle.
-- Returns allOk, firstReason, results (one check result per piece, with ax/az/name added).
function GridMath.checkLayout(ax, az, isOccupied)
	local results = {}
	local allOk, firstReason = true, nil
	local cx, cz = Grid.Cells.X / 2, Grid.Cells.Y / 2
	local r2 = Grid.LandingRadius * Grid.LandingRadius
	for _, item in ipairs(Grid.StarterLayout) do
		local ix, iz = ax + item.X, az + item.Z
		local r = GridMath.check(item.Name, ix, iz, 0, isOccupied, math.huge)
		r.ax, r.az, r.name = ix, iz, item.Name
		if r.ok then
			for _, c in ipairs(GridMath.cells(ix, iz, r.w, r.d)) do
				local dx, dz = c.x + 0.5 - cx, c.z + 0.5 - cz
				if dx * dx + dz * dz > r2 then
					r.ok = false
					r.reason = "Outside the landing zone"
					break
				end
			end
		end
		if not r.ok and allOk then
			allOk = false
			local look = Grid.Looks[item.Name]
			firstReason = (look and look.Label or item.Name) .. ": " .. (r.reason or "can't land here")
		end
		table.insert(results, r)
	end
	return allOk, firstReason, results
end

-- Where a placed module's pivot goes: centre of its footprint, on the highest ground point.
function GridMath.pivotFor(ax, az, rot, w, d, y)
	local cx, cz = GridMath.footprintCenterXZ(ax, az, w, d)
	return CFrame.new(cx, y, cz) * CFrame.Angles(0, rot * math.pi / 2, 0)
end

return GridMath
