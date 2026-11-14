--[[
	PlacementClient (LocalScript)  ->  put in StarterPlayer > StarterPlayerScripts

	Build bar, see-through preview, grid patch, rotate and place.
	  Computer: pick a module, move the mouse, R = rotate, click = build, Q or Esc = stop.
	  Tablet/phone: pick a module, tap the ground to move the preview, then press Build.
	Green means you can build here; red means you can't, and the text says why
	(colour is never the only signal).
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("BalanceConfig"))
local Grid = require(ReplicatedStorage:WaitForChild("GridConfig"))
local GridMath = require(ReplicatedStorage:WaitForChild("GridMath"))
local Visuals = require(ReplicatedStorage:WaitForChild("ModuleVisuals"))
local remotes = ReplicatedStorage:WaitForChild("PlacementRemotes")
local placeFn = remotes:WaitForChild("PlaceModule")
local digEvent = remotes:WaitForChild("TestDig")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local regolithValue = player:WaitForChild("leaderstats"):WaitForChild("Regolith")
local baseFolder = workspace:WaitForChild("Base")

-- Space Apps colours
local DEEP_BLUE = Color3.fromRGB(7, 23, 63)
local ELECTRIC_BLUE = Color3.fromRGB(0, 66, 166)
local NEON_BLUE = Color3.fromRGB(9, 96, 225)
local NEON_YELLOW = Color3.fromRGB(234, 254, 7)
local GOOD = Color3.fromRGB(60, 220, 120)
local BAD = Color3.fromRGB(228, 55, 0)
local WHITE = Color3.new(1, 1, 1)

---------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------
local selected = nil      -- module name, or nil when not building
local rotation = 0        -- 0..3 quarter turns
local ghost = nil         -- preview model
local highlight = nil
local lastCheck = nil     -- { ax, az, rot, result }
local touchPoint = nil    -- Vector2 screen point of the last tap, on touch screens
local busy = false
local lastHover = nil

---------------------------------------------------------------------------
-- Which cells are taken. Built from the models the server puts in Workspace.Base.
---------------------------------------------------------------------------
local taken = {}

local function rebuildTaken()
	taken = {}
	for _, model in ipairs(baseFolder:GetChildren()) do
		local ax, az = model:GetAttribute("AnchorX"), model:GetAttribute("AnchorZ")
		local w, d = model:GetAttribute("W"), model:GetAttribute("D")
		if ax and az and w and d then
			for _, c in ipairs(GridMath.cells(ax, az, w, d)) do
				taken[GridMath.key(c.x, c.z)] = true
			end
		end
	end
	lastHover = nil
end
baseFolder.ChildAdded:Connect(rebuildTaken)
baseFolder.ChildRemoved:Connect(rebuildTaken)
rebuildTaken()

local function isOccupied(key)
	return taken[key] == true
end

---------------------------------------------------------------------------
-- Grid patch: faint tiles around the cursor, footprint tiles green or red.
---------------------------------------------------------------------------
local tileFolder = Instance.new("Folder")
tileFolder.Name = "GridPreview"
tileFolder.Parent = workspace

local tiles = {}
local radius = Grid.GridPreviewRadius
for i = 1, (radius * 2 + 1) * (radius * 2 + 4) do -- a bit extra for big footprints
	local t = Instance.new("Part")
	t.Anchored = true
	t.CanCollide = false
	t.CanQuery = false
	t.CanTouch = false
	t.CastShadow = false
	t.Material = Enum.Material.Neon
	t.Size = Vector3.new(Grid.CellSize - 0.6, 0.15, Grid.CellSize - 0.6)
	t.Transparency = 1
	t.Parent = tileFolder
	tiles[i] = t
end

local function hideTiles()
	for _, t in ipairs(tiles) do
		t.Transparency = 1
	end
end

local function drawTiles(hx, hz, ax, az, w, d, ok)
	local params = GridMath.groundParams()
	local i = 0
	local x0, x1 = math.min(hx - radius, ax), math.max(hx + radius, ax + w - 1)
	local z0, z1 = math.min(hz - radius, az), math.max(hz + radius, az + d - 1)
	for x = x0, x1 do
		for z = z0, z1 do
			local inFoot = x >= ax and x < ax + w and z >= az and z < az + d
			local near = math.abs(x - hx) <= radius and math.abs(z - hz) <= radius
			if (inFoot or near) and GridMath.inBounds(x, z) and i < #tiles then
				local cx, cz = GridMath.cellCenterXZ(x, z)
				local y = GridMath.groundY(cx, cz, params)
				if y then
					i = i + 1
					local t = tiles[i]
					t.CFrame = CFrame.new(cx, y + 0.1, cz)
					if inFoot then
						t.Color = ok and GOOD or BAD
						t.Transparency = 0.35
					elseif taken[GridMath.key(x, z)] then
						t.Color = Color3.fromRGB(120, 120, 120)
						t.Transparency = 0.6
					else
						t.Color = WHITE
						t.Transparency = 0.85
					end
				end
			end
		end
	end
	for j = i + 1, #tiles do
		tiles[j].Transparency = 1
	end
end

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "BuildGui"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

-- The build bar only appears once the starter base has landed (see LandingClient).
local function refreshLanded()
	gui.Enabled = baseFolder:GetAttribute("Landed") == true
end
baseFolder:GetAttributeChangedSignal("Landed"):Connect(refreshLanded)
refreshLanded()

local function styleText(obj, size)
	obj.Font = Enum.Font.GothamBold
	obj.TextColor3 = WHITE
	obj.TextSize = size or 18
	obj.TextWrapped = true
end

local function corner(obj, px)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, px or 10)
	c.Parent = obj
end

local dirtLabel = Instance.new("TextLabel")
dirtLabel.Size = UDim2.fromOffset(220, 44)
dirtLabel.Position = UDim2.new(0, 16, 0, 16)
dirtLabel.BackgroundColor3 = DEEP_BLUE
styleText(dirtLabel, 20)
corner(dirtLabel)
dirtLabel.Parent = gui

local function refreshDirt()
	dirtLabel.Text = "Moon dirt: " .. regolithValue.Value
end
regolithValue.Changed:Connect(refreshDirt)
refreshDirt()

local status = Instance.new("TextLabel")
status.Size = UDim2.new(0, 520, 0, 40)
status.AnchorPoint = Vector2.new(0.5, 1)
status.Position = UDim2.new(0.5, 0, 1, -110)
status.BackgroundColor3 = DEEP_BLUE
status.BackgroundTransparency = 0.1
styleText(status, 18)
corner(status)
status.Visible = false
status.Parent = gui

local toast = status:Clone()
toast.Position = UDim2.new(0.5, 0, 1, -156)
toast.Parent = gui

local toastId = 0
local function showToast(text, good)
	toastId = toastId + 1
	local my = toastId
	toast.Text = (good and "OK: " or "Oops: ") .. text
	toast.BackgroundColor3 = good and ELECTRIC_BLUE or DEEP_BLUE
	toast.Visible = true
	task.delay(2, function()
		if toastId == my then
			toast.Visible = false
		end
	end)
end

local bar = Instance.new("Frame")
bar.AnchorPoint = Vector2.new(0.5, 1)
bar.Position = UDim2.new(0.5, 0, 1, -16)
bar.Size = UDim2.new(0, 0, 0, 80)
bar.AutomaticSize = Enum.AutomaticSize.X
bar.BackgroundColor3 = DEEP_BLUE
bar.BackgroundTransparency = 0.15
corner(bar, 14)
bar.Parent = gui
local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Horizontal
layout.Padding = UDim.new(0, 8)
layout.VerticalAlignment = Enum.VerticalAlignment.Center
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = bar
local pad = Instance.new("UIPadding")
pad.PaddingLeft = UDim.new(0, 8)
pad.PaddingRight = UDim.new(0, 8)
pad.Parent = bar

local buttons = {}

local function makeButton(text, order, color)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(112, 64)
	b.BackgroundColor3 = color or NEON_BLUE
	b.AutoButtonColor = true
	b.LayoutOrder = order
	b.Text = text
	styleText(b, 16)
	corner(b)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 0
	stroke.Color = NEON_YELLOW
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = b
	b.Parent = bar
	return b, stroke
end

-- Forward declarations
local selectModule, stopBuilding, rotate, tryPlace

for i, name in ipairs(Grid.BuildMenu) do
	local look = Grid.Looks[name] or { Label = name }
	local cost = Config.Modules[name] and Config.Modules[name].Cost or 0
	local b, stroke = makeButton(look.Label .. "\n" .. cost .. " dirt", i)
	buttons[name] = { button = b, stroke = stroke, label = look.Label, cost = cost }
	b.Activated:Connect(function()
		if selected == name then
			stopBuilding()
		else
			selectModule(name)
		end
	end)
end

local rotateBtn = makeButton("Rotate (R)", 100, ELECTRIC_BLUE)
local cancelBtn = makeButton("Stop (Q)", 101, ELECTRIC_BLUE)
local placeBtn = makeButton("Build!", 102, Color3.fromRGB(30, 120, 60))
placeBtn.Visible = false
local digBtn = nil
if Grid.TestDigAmount > 0 then
	digBtn = makeButton("Test: dig +" .. Grid.TestDigAmount, 103, Color3.fromRGB(142, 17, 0))
	digBtn.Activated:Connect(function()
		digEvent:FireServer()
	end)
end
rotateBtn.Activated:Connect(function()
	rotate()
end)
cancelBtn.Activated:Connect(function()
	stopBuilding()
end)
placeBtn.Activated:Connect(function()
	tryPlace()
end)

---------------------------------------------------------------------------
-- Building mode
---------------------------------------------------------------------------
local function refreshButtons()
	for name, info in pairs(buttons) do
		local on = name == selected
		info.stroke.Thickness = on and 3 or 0
		-- Text marks the choice too, so colour isn't the only signal.
		info.button.Text = (on and "> " or "") .. info.label .. "\n" .. info.cost .. " dirt"
	end
	local building = selected ~= nil
	rotateBtn.Visible = building
	cancelBtn.Visible = building
	placeBtn.Visible = building and UserInputService.TouchEnabled
	status.Visible = building
end

stopBuilding = function()
	selected = nil
	lastCheck = nil
	lastHover = nil
	if ghost then
		ghost:Destroy()
		ghost = nil
	end
	hideTiles()
	refreshButtons()
end

selectModule = function(name)
	stopBuilding()
	selected = name
	ghost = Visuals.makeGhost(Visuals.build(name))
	ghost.Parent = workspace
	highlight = Instance.new("Highlight")
	highlight.FillTransparency = 0.55
	highlight.OutlineTransparency = 0
	highlight.DepthMode = Enum.HighlightDepthMode.Occluded
	highlight.Parent = ghost
	refreshButtons()
end

rotate = function()
	if selected then
		rotation = (rotation + 1) % 4
		lastHover = nil
	end
end

tryPlace = function()
	if not selected or busy or not lastCheck then
		return
	end
	if not lastCheck.result.ok then
		showToast(lastCheck.result.reason or "Can't build here", false)
		return
	end
	busy = true
	local ok, message = placeFn:InvokeServer(selected, lastCheck.ax, lastCheck.az, lastCheck.rot)
	busy = false
	showToast(message or "", ok)
end

---------------------------------------------------------------------------
-- Pointer: mouse on computers, last tap on touch screens.
---------------------------------------------------------------------------
local function pointerHit()
	local ray
	if touchPoint then
		ray = camera:ScreenPointToRay(touchPoint.X, touchPoint.Y)
	else
		local m = UserInputService:GetMouseLocation()
		ray = camera:ViewportPointToRay(m.X, m.Y)
	end
	local result = workspace:Raycast(ray.Origin, ray.Direction * 1500, GridMath.groundParams())
	return result and result.Position or nil
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.KeyCode == Enum.KeyCode.R then
		rotate()
	elseif input.KeyCode == Enum.KeyCode.Q or input.KeyCode == Enum.KeyCode.Escape then
		stopBuilding()
	elseif input.UserInputType == Enum.UserInputType.MouseButton1 then
		touchPoint = nil
		tryPlace()
	end
end)

UserInputService.InputChanged:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseMovement then
		touchPoint = nil
	end
end)

UserInputService.TouchTapInWorld:Connect(function(position, processed)
	if not processed then
		touchPoint = position
	end
end)

---------------------------------------------------------------------------
-- Every frame: move the ghost, run the check, colour everything.
---------------------------------------------------------------------------
RunService.RenderStepped:Connect(function()
	if not selected or not ghost then
		return
	end
	local hit = pointerHit()
	if not hit then
		ghost:PivotTo(CFrame.new(0, -500, 0))
		hideTiles()
		lastCheck = nil
		lastHover = nil
		status.Text = "Point at the ground to build"
		return
	end

	local hx, hz = GridMath.worldToCell(hit)
	local w, d = GridMath.footprint(selected, rotation)
	local ax, az = GridMath.anchorFromHover(hx, hz, w, d)
	local result = GridMath.check(selected, ax, az, rotation, isOccupied, regolithValue.Value)
	lastCheck = { ax = ax, az = az, rot = rotation, result = result }

	ghost:PivotTo(GridMath.pivotFor(ax, az, rotation, w, d, result.maxY or hit.Y))
	highlight.FillColor = result.ok and GOOD or BAD
	highlight.OutlineColor = result.ok and GOOD or BAD

	local label = buttons[selected].label
	if result.ok then
		local how = UserInputService.TouchEnabled and "Press Build!" or "Click"
		status.Text = string.format("OK: %s to build %s (%d dirt)", how, label, result.cost)
		status.BackgroundColor3 = ELECTRIC_BLUE
	else
		status.Text = "Can't build: " .. (result.reason or "?")
		status.BackgroundColor3 = DEEP_BLUE
	end

	-- Redraw the grid patch only when something changed (raycasts aren't free).
	local hoverKey = hx .. "," .. hz .. "," .. rotation .. "," .. tostring(result.ok)
	if hoverKey ~= lastHover then
		lastHover = hoverKey
		drawTiles(hx, hz, ax, az, w, d, result.ok)
	end
end)

refreshButtons()
