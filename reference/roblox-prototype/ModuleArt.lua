--[[
	ModuleArt (ModuleScript)  ->  ReplicatedStorage, name it exactly "ModuleArt"

	Part-built models for every module, written as code so Rojo keeps them in sync.
	ModuleVisuals calls ModuleArt[name](model, sx, sz) after it makes the grey floor pad.
	  model  the Model to put parts in
	  sx/sz  the usable footprint in studs (already a little smaller than the cells)
	Everything is built around a pivot at the bottom centre (0, 0, 0), resting on y = 0.4
	(the top of the pad). +X is the module's "front" before rotation.

	Looks are inspired by real NASA hardware (named in each section) but simplified for kids.
	Swap any of them for a mesh later by dropping a Model with the same name into
	ReplicatedStorage.ModuleModels.
]]

local ModuleArt = {}

local FLOOR = 0.4 -- top of the pad

-- Palette: white and grey hardware, Space Apps blues for accents, gold foil, red for robots.
local WHITE = Color3.fromRGB(236, 238, 242)
local LIGHT_GREY = Color3.fromRGB(190, 194, 200)
local DARK_GREY = Color3.fromRGB(60, 64, 72)
local ELECTRIC_BLUE = Color3.fromRGB(0, 66, 166)
local BLUE_YONDER = Color3.fromRGB(46, 150, 245)
local NEON_YELLOW = Color3.fromRGB(234, 254, 7)
local ROCKET_RED = Color3.fromRGB(228, 55, 0)
local GOLD = Color3.fromRGB(214, 170, 60)
local GLASS = Color3.fromRGB(20, 40, 90)

local function part(model, name, size, cf, color, material, shape)
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	if shape then
		p.Shape = shape
	end
	p.Parent = model
	return p
end

-- A cylinder standing up (Roblox cylinders lie along X, so turn them).
local function upright(model, name, height, diameter, pos, color, material)
	return part(model, name, Vector3.new(height, diameter, diameter),
		CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(90)), color, material, Enum.PartType.Cylinder)
end

-- A strut between two points.
local function strut(model, name, a, b, thickness, color, material)
	local len = (b - a).Magnitude
	return part(model, name, Vector3.new(thickness, thickness, len),
		CFrame.lookAt((a + b) / 2, b), color, material)
end

---------------------------------------------------------------------------
-- HABITAT (3 x 2 cells)
-- Inspired by NASA's planned Foundation Surface Habitat: a pressurised tube for up to
-- 4 astronauts, raised on supports, with an airlock at one end.
---------------------------------------------------------------------------
function ModuleArt.Habitat(model, sx, sz)
	-- Everything must fit inside the footprint (x from -sx/2 to sx/2), so the parts are
	-- laid out end to end: rounded back cap | tube | airlock | steps.
	local capOut, airlockLen, stepsLen = 2.2, 3.6, 1.8
	local D = math.min(sz * 0.6, 20)                            -- tube diameter
	local L = sx - 0.4 - capOut - airlockLen - stepsLen         -- tube length
	local xc = -sx / 2 + 0.2 + capOut + L / 2                   -- tube centre
	local lift = 2.2                                            -- tube sits on saddles this high
	local cy = FLOOR + lift + D / 2
	-- saddles
	for _, f in ipairs({ -0.3, 0.3 }) do
		part(model, "Saddle", Vector3.new(1.4, lift + 1, D * 0.8), CFrame.new(xc + f * L, FLOOR + (lift + 1) / 2, 0), LIGHT_GREY, Enum.Material.Metal)
	end
	-- tube, end rings and a blue band
	part(model, "Tube", Vector3.new(L, D, D), CFrame.new(xc, cy, 0), WHITE, nil, Enum.PartType.Cylinder)
	for _, x in ipairs({ xc - L / 2, xc + L / 2 }) do
		part(model, "EndRing", Vector3.new(0.8, D + 0.5, D + 0.5), CFrame.new(x, cy, 0), LIGHT_GREY, Enum.Material.Metal, Enum.PartType.Cylinder)
	end
	part(model, "Band", Vector3.new(1.4, D + 0.3, D + 0.3), CFrame.new(xc - L * 0.15, cy, 0), ELECTRIC_BLUE, nil, Enum.PartType.Cylinder)
	-- rounded back end: a ball that pokes out capOut studs past the tube
	local capD = D * 0.8
	part(model, "BackCap", Vector3.new(capD, capD, capD), CFrame.new(xc - L / 2 - capOut + capD / 2, cy, 0), WHITE, nil, Enum.PartType.Ball)
	-- windows on both sides
	for _, side in ipairs({ -1, 1 }) do
		for i = -1, 1 do
			part(model, "Window", Vector3.new(1.8, 1.4, 0.4), CFrame.new(xc + L * 0.15 + i * 2.8, cy + 1, side * (D / 2 - 0.05)), GLASS, Enum.Material.Glass)
		end
	end
	-- airlock box with a door on the front (+X)
	local ax = xc + L / 2 + airlockLen / 2
	local ah = 7
	part(model, "Airlock", Vector3.new(airlockLen, ah, 5.4), CFrame.new(ax, FLOOR + lift + ah / 2 - 0.5, 0), LIGHT_GREY)
	local face = ax + airlockLen / 2
	part(model, "Door", Vector3.new(0.3, 5, 3), CFrame.new(face + 0.05, FLOOR + lift + 2.3, 0), ELECTRIC_BLUE)
	part(model, "DoorLight", Vector3.new(0.3, 0.4, 1.2), CFrame.new(face + 0.05, FLOOR + lift + 5.2, 0), NEON_YELLOW, Enum.Material.Neon)
	-- two steps up to the door
	for i = 1, 2 do
		local h = i * (lift / 2)
		local depth = stepsLen / 2
		part(model, "Step", Vector3.new(depth, h, 3), CFrame.new(face + stepsLen - (i - 0.5) * depth, FLOOR + h / 2, 0), DARK_GREY, Enum.Material.DiamondPlate)
	end
	-- antenna and radiator fin on the roof
	part(model, "Mast", Vector3.new(0.3, 4, 0.3), CFrame.new(xc - L * 0.3, cy + D / 2 + 2, 0), LIGHT_GREY, Enum.Material.Metal)
	part(model, "Dish", Vector3.new(0.3, 2.4, 2.4), CFrame.new(xc - L * 0.3, cy + D / 2 + 4, 0) * CFrame.Angles(0, 0, math.rad(60)), WHITE, nil, Enum.PartType.Cylinder)
	part(model, "Radiator", Vector3.new(L * 0.35, 0.2, 3.5), CFrame.new(xc + L * 0.1, cy + D / 2 + 0.3, 0), WHITE, Enum.Material.Metal)
	return cy + D / 2 + 5
end

---------------------------------------------------------------------------
-- CARGO LANDER (2 x 2 cells)
-- Inspired by robotic cargo landers like Astrobotic's Griffin and Blue Origin's Blue Moon
-- MK1: a gold-foil body on four legs, an engine underneath and cargo on the deck.
---------------------------------------------------------------------------
function ModuleArt.CargoLander(model, sx, sz)
	local W = math.min(sx, sz)
	local bodyW = W * 0.62
	local bodyBottom = FLOOR + 4.5
	local bodyH = 5
	local by = bodyBottom + bodyH / 2
	-- octagonal body: two square blocks, one turned 45 degrees
	part(model, "Body", Vector3.new(bodyW, bodyH, bodyW), CFrame.new(0, by, 0), GOLD, Enum.Material.Foil)
	part(model, "Body", Vector3.new(bodyW, bodyH, bodyW), CFrame.new(0, by, 0) * CFrame.Angles(0, math.rad(45), 0), GOLD, Enum.Material.Foil)
	-- deck
	upright(model, "Deck", 0.6, bodyW * 1.18, Vector3.new(0, bodyBottom + bodyH + 0.3, 0), LIGHT_GREY, Enum.Material.Metal)
	-- engine bell
	upright(model, "Engine", 2.6, 2.6, Vector3.new(0, bodyBottom - 1.3, 0), DARK_GREY, Enum.Material.Metal)
	upright(model, "Nozzle", 1, 3.4, Vector3.new(0, bodyBottom - 2.6, 0), DARK_GREY, Enum.Material.Metal)
	-- four legs with round feet
	for _, c in ipairs({ { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 } }) do
		local top = Vector3.new(c[1] * bodyW * 0.36, bodyBottom + 1, c[2] * bodyW * 0.36)
		local foot = Vector3.new(c[1] * W * 0.42, FLOOR + 0.4, c[2] * W * 0.42)
		strut(model, "Leg", top, foot, 0.6, LIGHT_GREY, Enum.Material.Metal)
		strut(model, "Brace", Vector3.new(top.X, bodyBottom, 0), foot, 0.3, LIGHT_GREY, Enum.Material.Metal)
		upright(model, "Foot", 0.4, 2.2, foot, DARK_GREY, Enum.Material.Metal)
	end
	-- cargo on the deck: a crate and a fuel tank
	local deckTop = bodyBottom + bodyH + 0.6
	part(model, "Crate", Vector3.new(4, 3, 3.4), CFrame.new(-1.2, deckTop + 1.5, -0.8), WHITE)
	part(model, "CrateStripe", Vector3.new(4.05, 0.5, 3.45), CFrame.new(-1.2, deckTop + 2.2, -0.8), ELECTRIC_BLUE)
	part(model, "Tank", Vector3.new(2.4, 2.4, 2.4), CFrame.new(2, deckTop + 1.2, 1.4), WHITE, nil, Enum.PartType.Ball)
	-- high-gain antenna
	part(model, "Mast", Vector3.new(0.3, 3, 0.3), CFrame.new(2.2, deckTop + 1.5, -2), LIGHT_GREY, Enum.Material.Metal)
	part(model, "Dish", Vector3.new(0.3, 2.6, 2.6), CFrame.new(2.2, deckTop + 3, -2) * CFrame.Angles(0, math.rad(30), math.rad(55)), WHITE, nil, Enum.PartType.Cylinder)
	-- a little robot-arm boom, folded
	strut(model, "Arm", Vector3.new(-bodyW * 0.45, deckTop, bodyW * 0.3), Vector3.new(-bodyW * 0.45, deckTop + 3, -bodyW * 0.1), 0.5, ROCKET_RED)
	return deckTop + 5
end

---------------------------------------------------------------------------
-- SOLAR PANEL (1 x 1 cell)
-- Inspired by NASA's Vertical Solar Array Technology (VSAT): at the south pole the Sun
-- skims the horizon, so panels stand upright on a tall mast and turn to follow it.
---------------------------------------------------------------------------
function ModuleArt.Solar(model, sx, sz)
	local mastH = 13
	-- tripod base
	for i = 0, 2 do
		local a = math.rad(i * 120)
		strut(model, "Foot", Vector3.new(math.cos(a) * sx * 0.42, FLOOR, math.sin(a) * sz * 0.42), Vector3.new(0, FLOOR + 3, 0), 0.4, LIGHT_GREY, Enum.Material.Metal)
	end
	upright(model, "Mast", mastH, 0.7, Vector3.new(0, FLOOR + mastH / 2, 0), LIGHT_GREY, Enum.Material.Metal)
	-- the upright panel (faces +X), with a frame and cell lines
	local pw, ph = sz * 0.95, 9
	local py = FLOOR + mastH - ph / 2 + 1.5
	part(model, "Frame", Vector3.new(0.3, ph + 0.4, pw + 0.4), CFrame.new(0.35, py, 0), LIGHT_GREY, Enum.Material.Metal)
	part(model, "Panel", Vector3.new(0.3, ph, pw), CFrame.new(0.55, py, 0), ELECTRIC_BLUE, Enum.Material.Glass)
	for i = 1, 3 do
		part(model, "CellLine", Vector3.new(0.32, 0.12, pw), CFrame.new(0.56, py - ph / 2 + i * ph / 4, 0), BLUE_YONDER, Enum.Material.Neon)
	end
	part(model, "CellLine", Vector3.new(0.32, ph, 0.12), CFrame.new(0.56, py, 0), BLUE_YONDER, Enum.Material.Neon)
	upright(model, "Cap", 0.4, 1.2, Vector3.new(0, FLOOR + mastH + 0.2, 0), NEON_YELLOW, Enum.Material.Neon)
	return FLOOR + mastH + 1
end

---------------------------------------------------------------------------
-- DIGGER ROBOT (1 x 1 cell)
-- Inspired by NASA's IPEx regolith excavator: a small rover with digging drums.
---------------------------------------------------------------------------
function ModuleArt.Digger(model, sx, sz)
	local wy = FLOOR + 1.1
	for _, c in ipairs({ { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 } }) do
		part(model, "Wheel", Vector3.new(1, 2.2, 2.2), CFrame.new(c[1] * sx * 0.32, wy, c[2] * sz * 0.36) * CFrame.Angles(0, math.rad(90), 0), DARK_GREY, Enum.Material.Rubber, Enum.PartType.Cylinder)
	end
	part(model, "Body", Vector3.new(sx * 0.55, 1.8, sz * 0.6), CFrame.new(0, wy + 1, 0), WHITE)
	part(model, "Stripe", Vector3.new(sx * 0.56, 0.4, sz * 0.61), CFrame.new(0, wy + 1.4, 0), ROCKET_RED)
	-- digging drums front and back (IPEx digs with spinning drums)
	for _, side in ipairs({ -1, 1 }) do
		part(model, "Drum", Vector3.new(sz * 0.55, 1.6, 1.6), CFrame.new(side * sx * 0.42, wy + 0.3, 0) * CFrame.Angles(0, math.rad(90), 0), ROCKET_RED, Enum.Material.Metal, Enum.PartType.Cylinder)
		strut(model, "DrumArm", Vector3.new(side * sx * 0.22, wy + 1.4, 0), Vector3.new(side * sx * 0.42, wy + 0.3, 0), 0.4, LIGHT_GREY, Enum.Material.Metal)
	end
	part(model, "SolarTop", Vector3.new(sx * 0.45, 0.2, sz * 0.5), CFrame.new(0, wy + 2, 0), ELECTRIC_BLUE, Enum.Material.Glass)
	part(model, "CameraMast", Vector3.new(0.3, 1.5, 0.3), CFrame.new(sx * 0.15, wy + 2.8, 0), LIGHT_GREY, Enum.Material.Metal)
	part(model, "Camera", Vector3.new(0.6, 0.5, 1.1), CFrame.new(sx * 0.15, wy + 3.6, 0), DARK_GREY)
	return wy + 4
end

---------------------------------------------------------------------------
-- BATTERY (1 x 1 cell)
-- A stack of insulated battery packs, like the ones that carry rovers through the night.
---------------------------------------------------------------------------
function ModuleArt.Battery(model, sx, sz)
	local h = 4.6
	part(model, "Case", Vector3.new(sx * 0.7, h, sz * 0.7), CFrame.new(0, FLOOR + h / 2, 0), WHITE)
	for i = 1, 3 do
		part(model, "Cell", Vector3.new(sx * 0.72, 0.5, sz * 0.72), CFrame.new(0, FLOOR + i * h / 4, 0), DARK_GREY)
	end
	-- charge light strip on the front (Neon Yellow = power)
	part(model, "ChargeBar", Vector3.new(0.2, h * 0.7, 0.8), CFrame.new(sx * 0.36, FLOOR + h / 2, 0), NEON_YELLOW, Enum.Material.Neon)
	-- radiator fins on the sides
	for _, side in ipairs({ -1, 1 }) do
		for i = -1, 1 do
			part(model, "Fin", Vector3.new(sx * 0.12, h * 0.8, 0.15), CFrame.new(i * sx * 0.18, FLOOR + h / 2, side * sz * 0.38), LIGHT_GREY, Enum.Material.Metal)
		end
	end
	part(model, "Terminal", Vector3.new(0.8, 0.6, 0.8), CFrame.new(-sx * 0.15, FLOOR + h + 0.3, 0), ROCKET_RED)
	part(model, "Terminal", Vector3.new(0.8, 0.6, 0.8), CFrame.new(sx * 0.15, FLOOR + h + 0.3, 0), DARK_GREY)
	return FLOOR + h + 1
end

---------------------------------------------------------------------------
-- OXYGEN MAKER (2 x 1 cells)
-- Inspired by NASA's carbothermal reactor tests: moon dirt goes into a hopper, is heated
-- in a reactor, and the oxygen is stored in a tank.
---------------------------------------------------------------------------
function ModuleArt.OxygenMaker(model, sx, sz)
	-- hopper (left): a box that narrows to a chute
	local hx = -sx * 0.3
	part(model, "HopperLegs", Vector3.new(sx * 0.2, 3, sz * 0.5), CFrame.new(hx, FLOOR + 1.5, 0), DARK_GREY, Enum.Material.Metal)
	part(model, "Hopper", Vector3.new(sx * 0.28, 3, sz * 0.7), CFrame.new(hx, FLOOR + 4.5, 0), LIGHT_GREY, Enum.Material.Metal)
	part(model, "Dirt", Vector3.new(sx * 0.26, 0.3, sz * 0.66), CFrame.new(hx, FLOOR + 6.05, 0), Color3.fromRGB(130, 128, 124), Enum.Material.Sand)
	-- reactor (middle): an upright drum that glows
	upright(model, "Reactor", 6, sz * 0.62, Vector3.new(0, FLOOR + 3, 0), WHITE)
	upright(model, "HeatRing", 0.8, sz * 0.66, Vector3.new(0, FLOOR + 2.5, 0), ROCKET_RED, Enum.Material.Neon)
	upright(model, "ReactorTop", 0.6, sz * 0.4, Vector3.new(0, FLOOR + 6.3, 0), LIGHT_GREY, Enum.Material.Metal)
	-- oxygen tank (right), lying down, in blue
	part(model, "Tank", Vector3.new(sz * 0.7, 3.2, 3.2), CFrame.new(sx * 0.3, FLOOR + 2.2, 0) * CFrame.Angles(0, math.rad(90), 0), BLUE_YONDER, nil, Enum.PartType.Cylinder)
	part(model, "TankCradle", Vector3.new(2.4, 0.8, sz * 0.5), CFrame.new(sx * 0.3, FLOOR + 0.4, 0), DARK_GREY, Enum.Material.Metal)
	-- pipes
	strut(model, "Pipe", Vector3.new(hx, FLOOR + 3.5, 0), Vector3.new(-sz * 0.3, FLOOR + 3.5, 0), 0.5, LIGHT_GREY, Enum.Material.Metal)
	strut(model, "Pipe", Vector3.new(sz * 0.3, FLOOR + 4.5, 0), Vector3.new(sx * 0.3, FLOOR + 3.8, 0), 0.5, LIGHT_GREY, Enum.Material.Metal)
	return FLOOR + 8
end

---------------------------------------------------------------------------
-- ICE DRILL (1 x 1 cell)
-- Inspired by NASA's TRIDENT drill: a tower that bores down into icy crater soil.
---------------------------------------------------------------------------
function ModuleArt.IceDrill(model, sx, sz)
	local apex = Vector3.new(0, FLOOR + 12, 0)
	for i = 0, 2 do
		local a = math.rad(i * 120 + 30)
		strut(model, "Leg", Vector3.new(math.cos(a) * sx * 0.45, FLOOR, math.sin(a) * sz * 0.45), apex, 0.5, LIGHT_GREY, Enum.Material.Metal)
	end
	part(model, "Base", Vector3.new(sx * 0.4, 1.4, sz * 0.4), CFrame.new(0, FLOOR + 0.7, 0), ELECTRIC_BLUE)
	upright(model, "Motor", 2, 1.8, Vector3.new(0, apex.Y - 1, 0), WHITE)
	upright(model, "DrillRod", apex.Y - FLOOR - 2, 0.6, Vector3.new(0, FLOOR + (apex.Y - FLOOR - 2) / 2, 0), DARK_GREY, Enum.Material.Metal)
	upright(model, "Bit", 0.8, 1.2, Vector3.new(0, FLOOR + 1.6, 0), NEON_YELLOW, Enum.Material.Metal)
	part(model, "Lamp", Vector3.new(0.8, 0.8, 0.8), CFrame.new(0, apex.Y + 0.6, 0), BLUE_YONDER, Enum.Material.Neon, Enum.PartType.Ball)
	-- a work light: the crater is always dark
	local light = Instance.new("PointLight")
	light.Range = 18
	light.Brightness = 2
	light.Color = BLUE_YONDER
	light.Parent = model:FindFirstChild("Lamp")
	return apex.Y + 1.5
end

return ModuleArt
