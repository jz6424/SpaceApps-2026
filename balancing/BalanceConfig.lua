--[[
	BalanceConfig (ModuleScript)
	Every number that decides how hard the moon base game is lives here.
	Put this ModuleScript in ReplicatedStorage and read it with:
		local Config = require(game.ReplicatedStorage.BalanceConfig)

	Units
	  * Meters (Power, Oxygen, Water, Food) and Regolith are plain points.
	  * Every rate is "points per GAME minute". The meter script multiplies by
	    (tickSeconds / 60) * timeScale each tick, so test mode only changes TimeScale.
	  * Positive = adds to a meter, negative = takes from it.

	How a match is put together
	  * Config.Missions[n] says which mission is played. Anything a mission leaves out
	    falls back to the defaults (Config.Match, Config.Start, Config.Supply ...).
	  * Config.Modes[mode] multiplies the numbers (Cadet / Explorer / Commander).
	  * The player's research upgrades (Config.Research.Upgrades) multiply them again.

	Tuning tips
	  * Night too hard?  Lower Modules.Habitat.PowerNight or raise Modules.Battery.Capacity.
	  * Day too slow?    Raise Modules.Digger.Regolith or lower module Costs.
	  * Stars too easy?  Raise Stars.Three.LowestLifeMeter.
	  * Change one number at a time, run simulate.py, then replay the 2-minute test mode.
]]

local Config = {}

-- One match is a compressed lunar day: build in sunlight, survive the night, finish at dawn.
Config.Match = {
	DayMinutes = 12,
	NightMinutes = 6,
	DawnMinutes = 2,
	DuskWarningMinutes = 1.5, -- "Night is coming!" banner this long before dark
	TickSeconds = 1,          -- how often the meter script runs
	TimeScale = 1,            -- 1 = real 20-minute match
	TestTimeScale = 10,       -- hidden test mode: whole match in 2 minutes
}

-- Sunlight multiplies every Solar panel. Dawn ramps smoothly from DawnStart to 1.
Config.Sun = {
	Day = 1,
	Night = 0,
	DawnStart = 0.25,
}

-- Default starting kit (the cargo lander brought these). Missions can override any of it.
Config.Start = {
	Power = 20,
	Oxygen = 70,
	Water = 70,
	Food = 60,
	Regolith = 30,
	Crew = 2,
	Modules = { Habitat = 1, Solar = 1, Digger = 1 },
}

Config.Meters = {
	Power = { BaseCapacity = 30 }, -- the lander's own battery; each Battery module adds more
	Oxygen = { Max = 100 },
	Water = { Max = 100 },
	Food = { Max = 100 },
	Regolith = { Max = 200 },
	WarningAt = 25,                -- bar turns to warning colour and an icon appears below this
}

-- Each astronaut, per game minute. Real-life hint: a person breathes about 0.8 kg of oxygen a day.
Config.Crew = {
	Oxygen = -3,
	Water = -1.5,
	Food = -1,
	-- Astronauts with no Habitat bunk wait in the lander and breathe its small air supply.
	NoBunkOxygenMultiplier = 2,
}

-- Build-menu modules. Unlock = research needed before it shows in the build menu.
Config.Modules = {
	Solar = {
		Cost = 12,
		Power = 12,             -- multiplied by Config.Sun
	},
	Battery = {
		Cost = 15,
		Capacity = 60,          -- adds to Meters.Power.BaseCapacity
	},
	Habitat = {
		Cost = 25,
		PowerDay = -4,          -- lights and air cleaners
		PowerNight = -6,        -- plus heaters: the lunar night is about -133 C
		CrewSpace = 2,
	},
	OxygenMaker = {
		Cost = 20,
		Power = -6,
		Oxygen = 10,
		RegolithUse = 2,        -- oxygen comes out of moon dirt; stops when Regolith is 0
	},
	Digger = {
		Cost = 15,
		Power = -3,
		Regolith = 6,
		CanPauseAtNight = true, -- player can tap a digger to park it and save power
	},
	WaterRecycler = {
		Cost = 20,
		Power = -2,
		CrewWaterSaving = 0.75, -- crew use 75% less water (the Space Station recycles 98%)
		Unlock = "WaterRecycler",
	},
	IceDrill = {
		Cost = 20,
		Power = -5,             -- heaters keep it working at -246 C in the crater
		Water = 6,
		Zone = "ShadowCrater",  -- can only be placed inside the crater zone on the map
		CanPauseAtNight = true,
		Unlock = "IceDrill",
	},
	Shielding = {
		Cost = 15,              -- piles regolith on top of one Habitat ("bury it")
		AppliesTo = "Habitat",
		Unlock = "Shielding",
	},
	-- Commander-only trade-off: grow food instead of shipping it.
	-- Grow lights need power all the time, and plants drink water. At night the player can
	-- keep the lights on (food keeps growing, battery drains) or park it (no food, no power).
	-- Real-life hint: plants on the Space Station grow under LED lights in the Veggie garden.
	Greenhouse = {
		Cost = 30,
		Power = -4,             -- grow lights
		Food = 3.5,             -- nearly enough for 2 astronauts, day and night
		Oxygen = 1,             -- plants breathe in carbon dioxide and give out oxygen
		Water = -0.25,          -- plants drink; a Water Recycler does not help here
		CanPauseAtNight = true,
		Modes = { "Commander" },-- only shows in the build menu in these modes (no research needed)
	},
}

-- Brownout: when stored Power is 0 and modules want more than the panels make,
-- every module runs slower by the same share (PowerShare = supply / demand, 0 to 1).
-- Example: panels make 9, modules want 12, so everything runs at 75%.
-- Sharing (instead of switching modules off) means a short day can never soft-lock:
-- diggers keep earning a little regolith, so the player can always buy another Solar panel.
Config.Brownout = {
	-- Habitat at low power = heaters and air cleaners struggle, crew breathe extra suit air.
	-- Crew oxygen use is multiplied by 1 + (this - 1) * (1 - PowerShare), so 2.5 at full blackout.
	CrewOxygenMultiplierWhenHabitatOff = 2.5,
	LightsDimBelowShare = 0.8, -- visual cue only
}

-- Default timed deliveries. Minute = game minutes from the start of the match.
Config.Supply = {
	{ Minute = 6, Water = 35, Food = 30, Regolith = 0 },
}

-- Surprise events. A mission lists which ones it uses and when.
Config.Events = {
	-- Solar storms come in three strengths. Each storm in a mission names its Severity.
	-- Modes stretch or shorten every storm with Modes[mode].StormLength.
	--   PausesRobots = which robots shelter (no regolith or ice while it lasts)
	--   NeedsShielding = crew in a Habitat without Shielding count "storm seconds"
	--                    (only Storm Watch has a goal for this; Shielding unlocks before it)
	--   SolarOutput = share of solar power while it lasts (1 = no change; real storms barely dim panels)
	SolarStorm = {
		Severity = {
			Mild = {      -- First Night: a first look. Get inside and wait it out.
				DurationMinutes = 0.5,
				PausesRobots = { "Digger" },
				NeedsShielding = false,
				SolarOutput = 1,
			},
			Moderate = {  -- Ice Hunters: the ice drill must shelter too, so drill before it hits.
				DurationMinutes = 0.75,
				PausesRobots = { "Digger", "IceDrill" },
				NeedsShielding = false,
				SolarOutput = 1,
			},
			Strong = {    -- Storm Watch: only a regolith-covered Habitat keeps crew safe.
				DurationMinutes = 1,
				PausesRobots = { "Digger", "IceDrill" },
				NeedsShielding = true,
				SolarOutput = 1,
			},
		},
		FactCard = "SolarStorm",
	},
	Micrometeoroid = {
		Breaks = "Solar",       -- knocks Solar panels offline until repaired
		Count = 2,
		RepairCost = 5,         -- regolith per panel; the player taps a sparking panel to fix it
		FactCard = "Micrometeoroids",
	},
}

-- Gentle failure: the match never ends early.
-- "Danger time" = seconds when Oxygen, Water or Food sits at 0 (crew in emergency suits).
-- At the end, too much danger time OR a missed mission goal means "Mission not complete yet" plus a tip.
Config.Failure = {
	DangerSecondsAllowed = 30,
}

-- Stars are earned in order: you need star 1 to get star 2, and so on.
-- Star 1 also needs the mission goal.
-- LowestLifeMeter = lowest Oxygen, Water or Food point at any moment of the match.
-- BlackoutSeconds = time with stored Power at 0 and modules running slower (PowerShare below 1).
Config.Stars = {
	One = { CrewSafe = true, GoalMet = true },
	Two = { LowestLifeMeter = 20, MaxBlackoutSeconds = 180 },
	Three = { LowestLifeMeter = 40, MaxBlackoutSeconds = 0 },
}

-- Difficulty modes. Harder modes mostly add MORE THINGS TO KEEP TRACK OF; the number
-- multipliers stay small (within 10%) so the challenge is attention, not punishment.
--   Tracks = what the player has to watch in this mode (shown on the mode picker).
Config.Modes = {
	Cadet = {
		Tracks = { "Power", "Oxygen", "the mission's goal" },
		ShowMeters = { "Power", "Oxygen" }, -- Water and Food hidden and frozen (a mission can add one, e.g. Water on Ice Hunters)
		AutoParkDiggers = true,             -- robot helper parks diggers at night by itself
		ShowNightForecast = true,           -- "Your battery will last about 4:00"
		StormWarningSeconds = 45,
		StormLength = 0.75,                 -- storms 25% shorter
		Micrometeoroids = false,
		Dust = false,
		CrateChoice = false,
		CrewDrain = 0.75,
		ModulePowerUse = 0.85,
		SolarOutput = 1.1,
		StartRegolithBonus = 10,
		DangerSecondsAllowed = math.huge,   -- can't fail on safety; mission goals still count
	},
	Explorer = {
		Tracks = { "Power", "Oxygen", "Water", "Food", "the mission's goal", "parking diggers at night", "regolith for the Oxygen maker", "storms and broken panels" },
		ShowMeters = { "Power", "Oxygen", "Water", "Food" },
		AutoParkDiggers = false,
		ShowNightForecast = true,
		StormWarningSeconds = 30,
		StormLength = 1,
		Micrometeoroids = true,
		Dust = false,
		CrateChoice = false,
		CrewDrain = 1,
		ModulePowerUse = 1,
		SolarOutput = 1,
		StartRegolithBonus = 0,
		DangerSecondsAllowed = 30,
	},
	Commander = {
		Tracks = { "everything in Explorer", "dusty solar panels", "choosing what the supply crate carries", "grow food or ship it (Greenhouse)", "longer storms", "no battery forecast" },
		ShowMeters = { "Power", "Oxygen", "Water", "Food" },
		AutoParkDiggers = false,
		ShowNightForecast = false,
		StormWarningSeconds = 15,
		StormLength = 1.25,                 -- storms 25% longer
		Micrometeoroids = true,
		-- Moon dust settles on panels: each loses LossPerMinute of its output (down to Floor)
		-- until the player taps it to clean it, which costs CleanCost regolith per panel.
		Dust = { LossPerMinute = 0.04, Floor = 0.5, CleanCost = 1 },
		-- The player picks the crate's load before it launches: same total as the
		-- mission's crate, split between Water, Food and Regolith in steps of 5.
		CrateChoice = true,
		CrewDrain = 1.1,
		ModulePowerUse = 1.1,
		SolarOutput = 0.95,
		StartRegolithBonus = 0,
		DangerSecondsAllowed = 10,
	},
}

-- Research points: earned after every mission, spent in the lobby.
Config.Research = {
	-- Payout = Full[mode] * StarShare[stars] * the mission's RewardMultiplier, rounded.
	-- First Night pays up to 20 / 30 / 40 (Cadet / Explorer / Commander) for 3 stars;
	-- Ice Hunters pays 1.5x that, Storm Watch 2x.
	Rewards = {
		Full = { Cadet = 20, Explorer = 30, Commander = 40 }, -- 3 stars on a x1 mission
		StarShare = { 0.5, 0.75, 1 },                        -- 1, 2, 3 stars
		NotComplete = 3,      -- a little for trying (also multiplied), so a hard night still moves you forward
		ReplayShare = 0.5,    -- replaying a mission at a star count you already had pays half
	},
	-- New things to build. Some missions need one before they open.
	Unlocks = {
		{ Id = "WaterRecycler", Name = "Water Recycler", Cost = 20 },
		{ Id = "IceDrill", Name = "Ice Drill", Cost = 10 },      -- opens Mission 2; any finished First Night pays enough
		{ Id = "Shielding", Name = "Regolith Shielding", Cost = 20 }, -- opens Mission 3
		{ Id = "Greenhouse", Name = "Greenhouse", Cost = 50, Future = true }, -- already free in Commander (Modules.Greenhouse.Modes); this would open it in other modes
		{ Id = "FissionReactor", Name = "Fission Reactor", Cost = 80, Future = true },
	},
	-- Make current things better. Each tier adds its Bonus once more.
	Upgrades = {
		{ Id = "BetterSolar", Name = "Better Solar Panels", Costs = { 20, 40 }, Module = "Solar", Stat = "Power", Bonus = 0.2 },
		{ Id = "BiggerBatteries", Name = "Bigger Batteries", Costs = { 20, 40 }, Module = "Battery", Stat = "Capacity", Bonus = 0.25 },
		{ Id = "FasterDiggers", Name = "Faster Diggers", Costs = { 20, 40 }, Module = "Digger", Stat = "Regolith", Bonus = 0.2 },
		{ Id = "EfficientOxygen", Name = "Efficient Oxygen Maker", Costs = { 25 }, Module = "OxygenMaker", Stat = "Power", Bonus = -0.25 },
	},
}

-- Missions are played in order. Requires = research unlocks needed to start it.
-- Goal values are per mode, so Cadet gets a softer target.
Config.Missions = {
	{
		Id = "FirstNight",
		Name = "First Night",
		Requires = {},
		RewardMultiplier = 1,
		Crew = 2,
		Events = {
			{ Event = "SolarStorm", Minute = 4, Severity = "Mild" },
		},
		Goal = { Type = "Survive", Text = "Keep 2 astronauts safe through the first lunar night" },
	},
	{
		Id = "IceHunters",
		Name = "Ice Hunters",
		Requires = { "IceDrill" },
		RewardMultiplier = 1.5,
		Crew = 2,
		-- Second mission: a bigger starter kit, because there is more to build.
		Start = { Water = 50, Regolith = 45, Modules = { Habitat = 1, Solar = 2, Digger = 1 } },
		AlwaysShow = { "Water" },                     -- Cadet sees Water on this mission
		Supply = { { Minute = 6, Water = 0, Food = 30, Regolith = 0 } }, -- no water this time
		Events = {
			{ Event = "SolarStorm", Minute = 10, Severity = "Moderate" }, -- just before dusk: the drill has to stop when you most want water
		},
		Goal = {
			Type = "WaterAtEnd",
			Value = { Cadet = 40, Explorer = 70, Commander = 80 },
			Text = "Drill crater ice and fill the water tank for the next crew",
		},
	},
	{
		Id = "StormWatch",
		Name = "Storm Watch",
		Requires = { "Shielding" },
		RewardMultiplier = 2,
		Crew = 2,
		CrewArrivals = { { Minute = 3, Crew = 2 } },  -- a second lander brings 2 more: they need bunks
		-- The base from the last two missions is already standing.
		Start = {
			Power = 40, Oxygen = 55, Water = 80, Food = 70, Regolith = 50,
			Modules = { Habitat = 1, Solar = 2, Digger = 2, OxygenMaker = 1, Battery = 1 },
		},
		Supply = {                                     -- 4 crew need two deliveries
			{ Minute = 6, Water = 40, Food = 30, Regolith = 0 },
			{ Minute = 13, Water = 40, Food = 30, Regolith = 0 },
		},
		Events = {
			{ Event = "SolarStorm", Minute = 5, Severity = "Strong" },
			{ Event = "SolarStorm", Minute = 15, Severity = "Strong" }, -- the second storm hits in the dark
			{ Event = "Micrometeoroid", Minute = 9 },
		},
		Goal = {
			Type = "StormSeconds",                     -- crew-seconds spent unshielded during storms
			Value = { Cadet = 120, Explorer = 60, Commander = 0 },
			Text = "Keep 4 astronauts shielded through two solar storms",
		},
	},
}

-- Ideas for later chapters. Not balanced or simulated yet.
Config.FutureMissions = {
	{ Id = "LongDark", Name = "The Long Dark", Crew = 4, Match = { DayMinutes = 10, NightMinutes = 8, DawnMinutes = 2 }, Requires = { "FissionReactor" } },
	{ Id = "MarsFirstSol", Name = "First Sol on Mars", Crew = 4, Sun = { Day = 0.45, Night = 0, DawnStart = 0.2 } },
}

return Config
