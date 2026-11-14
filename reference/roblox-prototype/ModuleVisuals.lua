--[[
	ModuleVisuals (ModuleScript)  ->  put in ReplicatedStorage, name it exactly "ModuleVisuals"

	Builds what a module looks like. Used by the server for real buildings and by the
	client for the see-through preview ("ghost").

	Real models later: make a Folder "ModuleModels" in ReplicatedStorage and put a Model
	in it named like the module ("Solar", "Habitat" ...). Set each model's pivot to the
	centre of its BOTTOM face, sized to its footprint (Habitat = 24 x 16 studs).
	If no model is found, the part-built look from ModuleArt is used, and if that is
	missing too, a simple placeholder.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Grid = require(ReplicatedStorage:WaitForChild("GridConfig"))

-- Detailed part-built looks. Optional: without ModuleArt the simple shapes below are used.
local Art = nil
do
	local artModule = ReplicatedStorage:FindFirstChild("ModuleArt")
	if artModule then
		local ok, result = pcall(require, artModule)
		if ok then
			Art = result
		else
			warn("ModuleArt failed to load, using simple shapes: " .. tostring(result))
		end
	end
end

local ModuleVisuals = {}

local function newPart(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for k, v in pairs(props) do
		p[k] = v
	end
	return p
end

local function addLabel(model, text, height)
	local anchor = model.PrimaryPart
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = UDim2.fromOffset(140, 30)
	gui.StudsOffsetWorldSpace = Vector3.new(0, height / 2 + 3, 0)
	gui.AlwaysOnTop = false
	gui.MaxDistance = 120
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundColor3 = Color3.fromRGB(7, 23, 63)
	t.BackgroundTransparency = 0.2
	t.TextColor3 = Color3.new(1, 1, 1)
	t.Font = Enum.Font.GothamBold
	t.TextScaled = true
	t.Text = text
	t.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = t
	gui.Parent = anchor
end

-- Placeholder shapes, built around a pivot at the bottom centre (0, 0, 0).
local function placeholder(name)
	local look = Grid.Looks[name] or { Label = name, Color = Color3.new(0.7, 0.7, 0.7), Height = 4 }
	local fp = Grid.Footprints[name] or { 1, 1 }
	local s = Grid.CellSize
	local sx, sz = fp[1] * s - 0.8, fp[2] * s - 0.8
	local h = look.Height
	local model = Instance.new("Model")
	model.Name = name

	-- Every module stands on a thin pad: it is the PrimaryPart and shows the footprint.
	local pad = newPart({
		Name = "Pad",
		Size = Vector3.new(sx, 0.4, sz),
		CFrame = CFrame.new(0, 0.2, 0),
		Color = Color3.fromRGB(90, 90, 95),
	})
	pad.Parent = model
	model.PrimaryPart = pad

	if Art and Art[name] then
		local ok, top = pcall(Art[name], model, sx, sz)
		if ok then
			model.WorldPivot = CFrame.new(0, 0, 0)
			addLabel(model, look.Label, (tonumber(top) or h) * 2)
			return model
		end
		warn("ModuleArt." .. name .. " failed: " .. tostring(top))
		for _, c in ipairs(model:GetChildren()) do
			if c ~= pad then
				c:Destroy()
			end
		end
	end

	if name == "Solar" then
		-- A mast with a panel on top. At the lunar south pole the Sun skims the horizon,
		-- so real panels stand upright; this one is tilted steeply.
		newPart({ Name = "Mast", Size = Vector3.new(0.6, h - 1, 0.6), CFrame = CFrame.new(0, (h - 1) / 2, 0), Color = Color3.fromRGB(200, 200, 205) }).Parent = model
		newPart({
			Name = "Panel",
			Size = Vector3.new(sx, 0.3, sz * 0.8),
			CFrame = CFrame.new(0, h - 1, 0) * CFrame.Angles(math.rad(60), 0, 0),
			Color = look.Color,
			Material = Enum.Material.Glass,
		}).Parent = model
	elseif name == "Habitat" then
		-- A tube lying on its side, like real habitat modules.
		newPart({
			Name = "Tube",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(sx, h, h),
			CFrame = CFrame.new(0, h / 2 + 0.4, 0),
			Color = look.Color,
		}).Parent = model
		newPart({ Name = "Door", Size = Vector3.new(0.4, 4, 3), CFrame = CFrame.new(sx / 2, 2.4, 0), Color = Color3.fromRGB(14, 66, 166) }).Parent = model
	elseif name == "CargoLander" then
		-- A squat lander on four legs, wrapped in gold foil.
		local body = h * 0.55
		newPart({ Name = "Body", Size = Vector3.new(sx * 0.7, body, sz * 0.7), CFrame = CFrame.new(0, h - body / 2, 0), Color = look.Color, Material = Enum.Material.Foil }).Parent = model
		newPart({ Name = "Top", Size = Vector3.new(sx * 0.5, 1, sz * 0.5), CFrame = CFrame.new(0, h + 0.5, 0), Color = Color3.fromRGB(220, 220, 225) }).Parent = model
		for _, c in ipairs({ { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 } }) do
			newPart({
				Name = "Leg",
				Size = Vector3.new(0.6, h - body + 1, 0.6),
				CFrame = CFrame.new(c[1] * sx * 0.38, (h - body + 1) / 2, c[2] * sz * 0.38),
				Color = Color3.fromRGB(200, 200, 205),
			}).Parent = model
		end
	elseif name == "Digger" then
		newPart({ Name = "Body", Size = Vector3.new(sx * 0.7, h * 0.6, sz * 0.8), CFrame = CFrame.new(0, h * 0.3 + 0.4, 0), Color = look.Color }).Parent = model
		newPart({ Name = "Scoop", Size = Vector3.new(sx * 0.8, h * 0.3, 1), CFrame = CFrame.new(0, h * 0.2, -sz / 2 + 0.5), Color = Color3.fromRGB(142, 17, 0) }).Parent = model
	elseif name == "IceDrill" then
		newPart({ Name = "Base", Size = Vector3.new(sx * 0.8, 2, sz * 0.8), CFrame = CFrame.new(0, 1.4, 0), Color = Color3.fromRGB(14, 66, 166) }).Parent = model
		newPart({ Name = "Drill", Shape = Enum.PartType.Cylinder, Size = Vector3.new(h, 1.5, 1.5), CFrame = CFrame.new(0, h / 2, 0) * CFrame.Angles(0, 0, math.rad(90)), Color = look.Color }).Parent = model
	else
		newPart({ Name = "Body", Size = Vector3.new(sx * 0.9, h, sz * 0.9), CFrame = CFrame.new(0, h / 2 + 0.4, 0), Color = look.Color }).Parent = model
	end

	model.WorldPivot = CFrame.new(0, 0, 0)
	addLabel(model, look.Label, h * 2)
	return model
end

function ModuleVisuals.build(name)
	local folder = ReplicatedStorage:FindFirstChild("ModuleModels")
	local template = folder and folder:FindFirstChild(name)
	if template then
		local model = template:Clone()
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			end
		end
		return model
	end
	return placeholder(name)
end

-- Grey regolith pad that fills the gap down to the lowest ground point.
function ModuleVisuals.foundation(w, d, gap)
	local s = Grid.CellSize
	return newPart({
		Name = "Foundation",
		Size = Vector3.new(w * s - 0.2, gap + 1, d * s - 0.2),
		Color = Color3.fromRGB(110, 108, 104),
		Material = Enum.Material.Slate,
	})
end

-- Turn a model into a see-through preview that nothing can touch or hit.
function ModuleVisuals.makeGhost(model)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Transparency = math.max(d.Transparency, 0.45)
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			d.CastShadow = false
		elseif d:IsA("BillboardGui") then
			d:Destroy()
		end
	end
	return model
end

return ModuleVisuals
