--[[
	LandingClient (LocalScript)  ->  put in StarterPlayer > StarterPlayerScripts

	Before anyone spawns: an aerial view of the landing zone. The player moves the starter
	base (cargo lander, habitat, solar panel, digger) around inside the circle and clicks
	(or taps, then presses "Land here!") to set it down. Story: the robots already landed
	this cargo and set up a shelter; the crew arrives right after.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local Grid = require(ReplicatedStorage:WaitForChild("GridConfig"))
local GridMath = require(ReplicatedStorage:WaitForChild("GridMath"))
local Visuals = require(ReplicatedStorage:WaitForChild("ModuleVisuals"))
local remotes = ReplicatedStorage:WaitForChild("PlacementRemotes")
local landFn = remotes:WaitForChild("ChooseLandingSite")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local baseFolder = workspace:WaitForChild("Base")

if baseFolder:GetAttribute("Landed") then
	return -- someone already landed; the server spawns us at the base
end

local DEEP_BLUE = Color3.fromRGB(7, 23, 63)
local ELECTRIC_BLUE = Color3.fromRGB(0, 66, 166)
local NEON_YELLOW = Color3.fromRGB(234, 254, 7)
local GOOD = Color3.fromRGB(60, 220, 120)
local BAD = Color3.fromRGB(228, 55, 0)
local WHITE = Color3.new(1, 1, 1)

local s = Grid.CellSize
local center = Vector3.new(Grid.Origin.X + Grid.Cells.X * s / 2, 0, Grid.Origin.Z + Grid.Cells.Y * s / 2)

-- With StreamingEnabled the client only has terrain near the camera or character, and we
-- have no character yet. Ask for the landing area and wait until the ground is there.
pcall(function()
	player:RequestStreamAroundAsync(center, 5)
end)
local centerY = GridMath.groundY(center.X, center.Z)
local waited = 0
while not centerY and waited < 10 do
	waited = waited + task.wait(0.25)
	centerY = GridMath.groundY(center.X, center.Z)
end
center = Vector3.new(center.X, centerY or 0, center.Z)

---------------------------------------------------------------------------
-- Aerial camera
---------------------------------------------------------------------------
-- Scroll (or pinch) to zoom in; WASD / arrow keys move the view while zoomed in.
local zoom = 1          -- 1 = whole landing circle, ZOOM_MIN = close up
local ZOOM_MIN = 0.3
local look = center     -- the point the camera looks at
local function aerial()
	camera.CameraType = Enum.CameraType.Scriptable
	local offset = Vector3.new(0, Grid.AerialHeight, Grid.AerialTilt) * zoom
	camera.CFrame = CFrame.lookAt(look + offset, look)
end
aerial()
-- The default camera scripts may reset the camera on the first frames; hold it for a moment.
task.delay(0.5, function()
	if not baseFolder:GetAttribute("Landed") then
		aerial()
	end
end)

---------------------------------------------------------------------------
-- Landing circle drawn on the ground
---------------------------------------------------------------------------
local world = Instance.new("Folder")
world.Name = "LandingPreview"
world.Parent = workspace

local radiusStuds = Grid.LandingRadius * s
local params = GridMath.groundParams()

-- Ask for terrain all around the circle too, not just the middle.
for i = 0, 7 do
	local a = i / 8 * math.pi * 2
	task.spawn(function()
		pcall(function()
			player:RequestStreamAroundAsync(center + Vector3.new(math.cos(a), 0, math.sin(a)) * radiusStuds, 5)
		end)
	end)
end

-- Ring segments. Ground far from the middle can arrive a few seconds late, so any
-- segment without ground yet is retried until it appears.
local SEGMENTS = 96
local placed = {}
local function drawRing()
	local missing = 0
	for i = 1, SEGMENTS do
		if not placed[i] then
			local a = (i / SEGMENTS) * math.pi * 2
			local x, z = center.X + math.cos(a) * radiusStuds, center.Z + math.sin(a) * radiusStuds
			local y = GridMath.groundY(x, z, params)
			if y then
				local p = Instance.new("Part")
				p.Anchored = true
				p.CanCollide = false
				p.CanQuery = false
				p.CanTouch = false
				p.CastShadow = false
				p.Material = Enum.Material.Neon
				p.Color = NEON_YELLOW
				p.Size = Vector3.new(3, 0.4, radiusStuds * 2 * math.pi / SEGMENTS * 0.6)
				p.CFrame = CFrame.new(x, y + 0.3, z) * CFrame.Angles(0, -a, 0)
				p.Parent = world
				placed[i] = true
			else
				missing = missing + 1
			end
		end
	end
	return missing
end
task.spawn(function()
	for _ = 1, 60 do
		if not world.Parent or drawRing() == 0 then
			return
		end
		task.wait(0.5)
	end
end)

---------------------------------------------------------------------------
-- Ghost of the starter base
---------------------------------------------------------------------------
local ghosts = {}
for i, item in ipairs(Grid.StarterLayout) do
	local g = Visuals.makeGhost(Visuals.build(item.Name))
	local h = Instance.new("Highlight")
	h.FillTransparency = 0.5
	h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
	h.Parent = g
	g.Parent = world
	h.Enabled = false
	g:PivotTo(CFrame.new(0, -1000, 0))
	ghosts[i] = { model = g, highlight = h }
end
local layoutW, layoutD = GridMath.layoutSize()

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "LandingGui"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = false
gui.Parent = player:WaitForChild("PlayerGui")

local function text(parent, size, bold, height)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.TextColor3 = WHITE
	t.Font = bold and Enum.Font.GothamBlack or Enum.Font.Gotham
	t.TextSize = size
	t.TextWrapped = true
	t.TextXAlignment = Enum.TextXAlignment.Left
	t.Size = UDim2.new(1, 0, 0, height)
	t.Parent = parent
	return t
end

local panel = Instance.new("Frame")
panel.Position = UDim2.new(0, 16, 0, 16)
panel.Size = UDim2.new(0, 400, 0, 0)
panel.AutomaticSize = Enum.AutomaticSize.Y
panel.BackgroundColor3 = DEEP_BLUE
panel.BackgroundTransparency = 0.1
panel.Parent = gui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 12)
local pad = Instance.new("UIPadding", panel)
pad.PaddingTop, pad.PaddingBottom = UDim.new(0, 14), UDim.new(0, 14)
pad.PaddingLeft, pad.PaddingRight = UDim.new(0, 16), UDim.new(0, 16)
local list = Instance.new("UIListLayout", panel)
list.Padding = UDim.new(0, 8)
list.SortOrder = Enum.SortOrder.LayoutOrder

local title = text(panel, 22, true, 28)
title.Text = "CHOOSE YOUR LANDING SITE"
title.LayoutOrder = 1
local story = text(panel, 16, false, 84)
story.LayoutOrder = 2
story.Text = "A robot cargo lander is coming in with a small shelter, a solar panel and a digger. "
	.. "Pick flat, sunny ground inside the yellow circle. Your crew lands right after it."
local hint = text(panel, 14, false, 54)
hint.LayoutOrder = 3
hint.TextColor3 = NEON_YELLOW
hint.Text = UserInputService.TouchEnabled and "Tap the ground to move it, then press Land here!"
	or "Move the mouse to aim, click to land. Scroll to zoom, WASD to move the view."

local status = Instance.new("TextLabel")
status.AnchorPoint = Vector2.new(0.5, 1)
status.Position = UDim2.new(0.5, 0, 1, -100)
status.Size = UDim2.new(0, 520, 0, 44)
status.BackgroundColor3 = DEEP_BLUE
status.TextColor3 = WHITE
status.Font = Enum.Font.GothamBold
status.TextSize = 18
status.TextWrapped = true
status.Parent = gui
Instance.new("UICorner", status).CornerRadius = UDim.new(0, 10)

local landBtn = Instance.new("TextButton")
landBtn.AnchorPoint = Vector2.new(0.5, 1)
landBtn.Position = UDim2.new(0.5, 0, 1, -40)
landBtn.Size = UDim2.new(0, 200, 0, 50)
landBtn.BackgroundColor3 = NEON_YELLOW
landBtn.TextColor3 = DEEP_BLUE
landBtn.Font = Enum.Font.GothamBlack
landBtn.TextSize = 20
landBtn.Text = "Land here!"
landBtn.Visible = UserInputService.TouchEnabled
landBtn.Parent = gui
Instance.new("UICorner", landBtn).CornerRadius = UDim.new(0, 10)

---------------------------------------------------------------------------
-- Aiming and landing
---------------------------------------------------------------------------
local touchPoint = nil
local last = nil -- { ax, az, ok, reason }
local busy = false
local done = false
local connections = {}

local function finish()
	if done then
		return
	end
	done = true
	for _, c in ipairs(connections) do
		c:Disconnect()
	end
	world:Destroy()
	gui:Destroy()
	camera.CameraType = Enum.CameraType.Custom
end

local function pointerHit()
	local ray
	if touchPoint then
		ray = camera:ScreenPointToRay(touchPoint.X, touchPoint.Y)
	else
		local m = UserInputService:GetMouseLocation()
		ray = camera:ViewportPointToRay(m.X, m.Y)
	end
	local r = workspace:Raycast(ray.Origin, ray.Direction * 2000, GridMath.groundParams())
	return r and r.Position or nil
end

local function noneTaken()
	return false
end

local function tryLand()
	if busy or done or not last then
		return
	end
	if not last.ok then
		status.Text = "Can't land: " .. (last.reason or "?")
		return
	end
	busy = true
	status.Text = "Landing..."
	local ok, message = landFn:InvokeServer(last.ax, last.az)
	busy = false
	if ok then
		finish()
	else
		status.Text = "Can't land: " .. tostring(message)
	end
end

local PAN_KEYS = {
	[Enum.KeyCode.W] = Vector3.new(0, 0, -1), [Enum.KeyCode.Up] = Vector3.new(0, 0, -1),
	[Enum.KeyCode.S] = Vector3.new(0, 0, 1), [Enum.KeyCode.Down] = Vector3.new(0, 0, 1),
	[Enum.KeyCode.A] = Vector3.new(-1, 0, 0), [Enum.KeyCode.Left] = Vector3.new(-1, 0, 0),
	[Enum.KeyCode.D] = Vector3.new(1, 0, 0), [Enum.KeyCode.Right] = Vector3.new(1, 0, 0),
}
local function setZoom(z)
	zoom = math.clamp(z, ZOOM_MIN, 1)
	if zoom >= 1 then
		look = center
	end
	aerial()
end

table.insert(connections, RunService.RenderStepped:Connect(function(dt)
	-- Pan the view with the keyboard, but never past the landing circle.
	local move = Vector3.zero
	if not UserInputService:GetFocusedTextBox() then
		for key, dir in pairs(PAN_KEYS) do
			if UserInputService:IsKeyDown(key) then
				move = move + dir
			end
		end
	end
	if move.Magnitude > 0 and zoom < 1 then
		local p = look + move.Unit * dt * 160 * zoom
		local flat = Vector3.new(p.X - center.X, 0, p.Z - center.Z)
		if flat.Magnitude > radiusStuds then
			flat = flat.Unit * radiusStuds
		end
		look = Vector3.new(center.X + flat.X, center.Y, center.Z + flat.Z)
		aerial()
	end
	if busy then
		return
	end
	local hit = pointerHit()
	if not hit then
		last = nil
		for _, g in ipairs(ghosts) do
			g.highlight.Enabled = false
			g.model:PivotTo(CFrame.new(0, -1000, 0))
		end
		status.Text = "Point at the ground inside the circle"
		status.BackgroundColor3 = DEEP_BLUE
		return
	end
	local hx, hz = GridMath.worldToCell(hit)
	local ax, az = hx - math.floor(layoutW / 2), hz - math.floor(layoutD / 2)
	local ok, reason, results = GridMath.checkLayout(ax, az, noneTaken)
	last = { ax = ax, az = az, ok = ok, reason = reason }
	for i, r in ipairs(results) do
		local g = ghosts[i]
		g.model:PivotTo(GridMath.pivotFor(r.ax, r.az, 0, r.w, r.d, r.maxY or hit.Y))
		g.highlight.Enabled = true
		local color = r.ok and GOOD or BAD
		g.highlight.FillColor = color
		g.highlight.OutlineColor = color
	end
	if ok then
		status.Text = UserInputService.TouchEnabled and "OK: press Land here!" or "OK: click to land here"
		status.BackgroundColor3 = ELECTRIC_BLUE
	else
		status.Text = "Can't land: " .. reason
		status.BackgroundColor3 = DEEP_BLUE
	end
end))

table.insert(connections, UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		touchPoint = nil
		tryLand()
	end
end))
table.insert(connections, UserInputService.InputChanged:Connect(function(input, processed)
	if input.UserInputType == Enum.UserInputType.MouseMovement then
		touchPoint = nil
	elseif input.UserInputType == Enum.UserInputType.MouseWheel and not processed then
		-- Zoom toward the point under the mouse, so you can dive onto a spot.
		local before = zoom
		setZoom(zoom - input.Position.Z * 0.1)
		if zoom < before then
			local hit = pointerHit()
			if hit then
				local t = 0.25
				look = Vector3.new(look.X + (hit.X - look.X) * t, center.Y, look.Z + (hit.Z - look.Z) * t)
				aerial()
			end
		end
	end
end))
local pinchStart = 1
table.insert(connections, UserInputService.TouchPinch:Connect(function(_, scale, _, state, processed)
	if processed then
		return
	end
	if state == Enum.UserInputState.Begin then
		pinchStart = zoom
	elseif state == Enum.UserInputState.Change then
		setZoom(pinchStart / math.max(scale, 0.05)) -- spread fingers = zoom in
	end
end))
table.insert(connections, UserInputService.TouchTapInWorld:Connect(function(position, processed)
	if not processed then
		touchPoint = position
	end
end))
table.insert(connections, landBtn.Activated:Connect(tryLand))

-- Another player landed first: drop the picker and wait to spawn at their base.
table.insert(connections, baseFolder:GetAttributeChangedSignal("Landed"):Connect(function()
	if baseFolder:GetAttribute("Landed") then
		finish()
	end
end))
