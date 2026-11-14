"""Plays the rules in BalanceConfig.lua with scripted players, for every mission and mode.
Run:  python3 simulate.py                 all missions, all modes
      python3 simulate.py IceHunters Explorer
Needs: pip install lupa   (a Lua runtime, used only to read the config)"""
import sys, os
from lupa import LuaRuntime

here = os.path.dirname(os.path.abspath(__file__))
lua = LuaRuntime()
C = lua.execute(open(os.path.join(here, "BalanceConfig.lua")).read())

def tbl(t):
    if hasattr(t, "items"):
        keys = list(t.keys())
        if keys and all(isinstance(k, int) for k in keys):
            return [tbl(t[k]) for k in sorted(keys)]
        return {k: tbl(v) for k, v in t.items()}
    return t

cfg = tbl(C)
LIFE = ["Oxygen", "Water", "Food"]
MISSIONS = {m["Id"]: m for m in cfg["Missions"]}


def stat(upgrades, module, name):
    """A module stat after research upgrades."""
    v = cfg["Modules"][module][name]
    for u in cfg["Research"]["Upgrades"]:
        if u["Module"] == module and u["Stat"] == name:
            v *= 1 + u["Bonus"] * upgrades.get(u["Id"], 0)
    return v


def research_points(mission_id, mode, stars):
    r = cfg["Research"]["Rewards"]
    base = r["NotComplete"] if stars == 0 else r["Full"][mode] * r["StarShare"][stars - 1]
    return int(base * MISSIONS[mission_id].get("RewardMultiplier", 1) + 0.5)


def play(mission_id, mode_name, player, upgrades=None, trace=None):
    upgrades = upgrades or {}
    mis, mode = MISSIONS[mission_id], cfg["Modes"][mode_name]
    M = dict(cfg["Match"]); M.update(mis.get("Match", {}))
    sunc = dict(cfg["Sun"]); sunc.update(mis.get("Sun", {}))
    s = dict(cfg["Start"]); s.update(mis.get("Start", {}))
    m = dict(s["Modules"])
    s["Regolith"] += mode["StartRegolithBonus"]
    shown = set(mode["ShowMeters"]) | set(mis.get("AlwaysShow", []))
    supplies = [dict(x) for x in mis.get("Supply", cfg["Supply"])]
    if mode["CrateChoice"] and player.get("crate"):
        # Commander: same total weight, split the way the player chose (one plan per delivery)
        for sup, plan in zip(supplies, player["crate"]):
            assert sum(plan.values()) == sup["Water"] + sup["Food"] + sup["Regolith"], (mission_id, plan)
            sup.update({"Water": 0, "Food": 0, "Regolith": 0}); sup.update(plan)
    dust = mode["Dust"] or None
    clean = 1.0; last_clean = 0.0
    events = [e for e in mis.get("Events", []) if e["Event"] != "Micrometeoroid" or mode["Micrometeoroids"]]
    sev = cfg["Events"]["SolarStorm"]["Severity"]
    storms = [dict(sev[e.get("Severity", "Strong")], Minute=e["Minute"]) for e in events if e["Event"] == "SolarStorm"]
    for st_ in storms: st_["End"] = st_["Minute"] + st_["DurationMinutes"] * mode["StormLength"]
    arrivals = list(mis.get("CrewArrivals", []))
    crew = mis.get("Crew", s["Crew"])
    shielded = broken = 0; broke_at = None
    dt = M["TickSeconds"] / 60
    day, night_len, dawn = M["DayMinutes"], M["NightMinutes"], M["DawnMinutes"]
    total = day + night_len + dawn
    lowest = {k: s[k] for k in LIFE}
    blackout = danger = storm_secs = 0.0
    q = list(player["queue"]); t = 0.0

    def sun(t):
        if t < day: return sunc["Day"]
        if t < day + night_len: return sunc["Night"]
        return sunc["DawnStart"] + (1 - sunc["DawnStart"]) * (t - day - night_len) / dawn

    while t < total - 1e-9:
        night = day <= t < day + night_len
        now = [st_ for st_ in storms if st_["Minute"] <= t < st_["End"]]
        paused = {r for st_ in now for r in st_["PausesRobots"]}
        storm_solar = min([st_["SolarOutput"] for st_ in now] or [1])
        needs_shield = any(st_["NeedsShielding"] for st_ in now)
        # build from the queue: (thing, earliest minute)
        while q and t >= q[0][1]:
            thing = q[0][0]
            cost = cfg["Modules"][thing]["Cost"]
            assert mode_name in cfg["Modules"][thing].get("Modes", [mode_name]), (thing, mode_name)
            if s["Regolith"] < cost: break
            q.pop(0)
            if thing == "Shielding":
                if shielded >= m.get("Habitat", 0): continue
                shielded += 1
            else:
                m[thing] = m.get(thing, 0) + 1
            s["Regolith"] -= cost
        for sup in list(supplies):
            if t >= sup["Minute"]:
                for k in ("Water", "Food", "Regolith"): s[k] += sup[k]
                supplies.remove(sup)
        for a in list(arrivals):
            if t >= a["Minute"]:
                crew += a["Crew"]; arrivals.remove(a)
        for e in events:
            if e["Event"] == "Micrometeoroid" and broke_at is None and t >= e["Minute"] and m.get("Solar", 0):
                broken, broke_at = min(m["Solar"], cfg["Events"]["Micrometeoroid"]["Count"]), t
        if broken and player.get("repair_after") is not None and t >= broke_at + player["repair_after"] \
                and s["Regolith"] >= cfg["Events"]["Micrometeoroid"]["RepairCost"] * broken:
            s["Regolith"] -= cfg["Events"]["Micrometeoroid"]["RepairCost"] * broken; broken = 0

        if dust:
            clean = max(dust["Floor"], clean - dust["LossPerMinute"] * dt)
            every = player.get("clean_every")
            if every and t - last_clean >= every and s["Regolith"] >= m.get("Solar", 0) * dust["CleanCost"]:
                s["Regolith"] -= m.get("Solar", 0) * dust["CleanCost"]; clean = 1.0; last_clean = t
        cap = cfg["Meters"]["Power"]["BaseCapacity"] + m.get("Battery", 0) * stat(upgrades, "Battery", "Capacity")
        solar = (m.get("Solar", 0) - broken) * stat(upgrades, "Solar", "Power") * sun(t) * mode["SolarOutput"] * clean * storm_solar
        use = mode["ModulePowerUse"]
        diggers = 0 if "Digger" in paused or (night and (player.get("park_diggers") or mode["AutoParkDiggers"])) else m.get("Digger", 0)
        drills = 0 if "IceDrill" in paused or (night and player.get("park_drills")) else m.get("IceDrill", 0)
        greens = 0 if night and player.get("park_greenhouse") else m.get("Greenhouse", 0)
        gh = cfg["Modules"]["Greenhouse"]
        hab = cfg["Modules"]["Habitat"]
        demand = {
            "Habitat": -m.get("Habitat", 0) * (hab["PowerNight"] if night else hab["PowerDay"]) * use,
            "OxygenMaker": -m.get("OxygenMaker", 0) * stat(upgrades, "OxygenMaker", "Power") * use if s["Regolith"] > 0 else 0,
            "Digger": -diggers * cfg["Modules"]["Digger"]["Power"] * use,
            "IceDrill": -drills * cfg["Modules"]["IceDrill"]["Power"] * use,
            "WaterRecycler": -m.get("WaterRecycler", 0) * cfg["Modules"]["WaterRecycler"]["Power"] * use,
            "Greenhouse": -greens * gh["Power"] * use,
        }
        want = sum(demand.values())
        share = 1.0
        if want > 0 and s["Power"] + (solar - want) * dt < 0:
            share = max(0.0, min(1.0, (s["Power"] / dt + solar) / want))
        s["Power"] = min(cap, max(0, s["Power"] + (solar - want * share) * dt))
        if share < 1: blackout += M["TickSeconds"]

        bunks = m.get("Habitat", 0) * hab["CrewSpace"]
        no_bunk = max(0, crew - bunks)
        cd = mode["CrewDrain"]
        o2_mult = 1 + (cfg["Brownout"]["CrewOxygenMultiplierWhenHabitatOff"] - 1) * (1 - share)
        crew_o2 = cfg["Crew"]["Oxygen"] * cd * ((crew - no_bunk) * o2_mult + no_bunk * cfg["Crew"]["NoBunkOxygenMultiplier"])
        makers = m.get("OxygenMaker", 0) * share if demand["OxygenMaker"] > 0 else 0
        s["Oxygen"] += (crew_o2 + makers * cfg["Modules"]["OxygenMaker"]["Oxygen"] + greens * share * gh.get("Oxygen", 0)) * dt
        s["Regolith"] -= makers * cfg["Modules"]["OxygenMaker"]["RegolithUse"] * dt
        save = cfg["Modules"]["WaterRecycler"]["CrewWaterSaving"] * share if m.get("WaterRecycler") else 0
        if "Water" in shown:
            s["Water"] += (cfg["Crew"]["Water"] * cd * crew * (1 - save) + drills * share * cfg["Modules"]["IceDrill"]["Water"]
                           + greens * share * gh["Water"]) * dt
        if "Food" in shown:
            s["Food"] += (cfg["Crew"]["Food"] * cd * crew + greens * share * gh["Food"]) * dt
        s["Regolith"] += diggers * share * stat(upgrades, "Digger", "Regolith") * dt
        if needs_shield:
            storm_secs += max(0, crew - shielded * hab["CrewSpace"]) * M["TickSeconds"]
        for k in LIFE:
            s[k] = max(0, min(cfg["Meters"][k]["Max"], s[k])); lowest[k] = min(lowest[k], s[k])
        s["Regolith"] = max(0, min(cfg["Meters"]["Regolith"]["Max"], s["Regolith"]))
        if any(s[k] <= 0 for k in LIFE): danger += M["TickSeconds"]
        t += dt
        if trace is not None and abs(t * 2 - round(t * 2)) < dt / 2:
            trace.append((round(t, 1), round(s["Power"], 1), round(s["Oxygen"], 1), round(s["Water"], 1)))

    goal = mis["Goal"]; goal_ok = True; goal_note = ""
    if goal["Type"] == "WaterAtEnd":
        goal_ok = s["Water"] >= goal["Value"][mode_name]; goal_note = f"water at end {s['Water']:.0f}/{goal['Value'][mode_name]}"
    elif goal["Type"] == "StormSeconds":
        goal_ok = storm_secs <= goal["Value"][mode_name]; goal_note = f"storm crew-seconds {storm_secs:.0f}/{goal['Value'][mode_name]}"
    low = min(lowest.values())
    stars = 0
    if danger <= mode["DangerSecondsAllowed"] and goal_ok:
        stars = 1
        st = cfg["Stars"]
        if low >= st["Two"]["LowestLifeMeter"] and blackout <= st["Two"]["MaxBlackoutSeconds"]:
            stars = 2
            if low >= st["Three"]["LowestLifeMeter"] and blackout <= st["Three"]["MaxBlackoutSeconds"]:
                stars = 3
    return dict(stars=stars, rp=research_points(mission_id, mode_name, stars), low=lowest, blackout=blackout,
                danger=danger, goal_ok=goal_ok, goal_note=goal_note, built=m, shielded=shielded)


# Scripted players per mission. queue = (thing to build, earliest game minute)
PLAYERS = {
    "FirstNight": {
        "Careful: 3 batteries":       dict(queue=[("OxygenMaker", 0), ("Solar", 0), ("Digger", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True, repair_after=0.5,
                                         clean_every=3, crate=[{"Water": 40, "Food": 25, "Regolith": 0}]),
        "Oxygen maker late (6:00)":   dict(queue=[("Digger", 0), ("Digger", 0), ("Solar", 0), ("OxygenMaker", 6), ("Solar", 0), ("Battery", 0)], repair_after=1),
        "1 battery, diggers on":      dict(queue=[("OxygenMaker", 0), ("Solar", 0), ("Digger", 0), ("Battery", 0), ("Solar", 0), ("Digger", 0), ("Digger", 0)], repair_after=1),
        "No batteries":               dict(queue=[("OxygenMaker", 0), ("Solar", 0), ("Digger", 0), ("Solar", 0), ("Digger", 0)], repair_after=1),
        "Forgets the oxygen maker":   dict(queue=[("Solar", 0), ("Digger", 0), ("Battery", 0), ("Battery", 0)], park_diggers=True),
    },
    "IceHunters": {
        "Careful: 1 drill, runs all night": dict(clean_every=3, crate=[{"Water": 0, "Food": 25, "Regolith": 5}], queue=[("OxygenMaker", 0), ("IceDrill", 0), ("Solar", 0), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True),
        "2 drills, both run at night":   dict(queue=[("IceDrill", 0), ("OxygenMaker", 0), ("Solar", 0), ("Solar", 0), ("Digger", 0), ("Battery", 0), ("IceDrill", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True),
        "1 drill, parks it at night":     dict(queue=[("OxygenMaker", 0), ("IceDrill", 0), ("Solar", 0), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True, park_drills=True),
        "Drill built late (7:00)":        dict(queue=[("OxygenMaker", 0), ("Solar", 0), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("IceDrill", 7), ("Battery", 0)], park_diggers=True),
        "Never drills (First Night plan)": dict(queue=[("OxygenMaker", 0), ("Solar", 0), ("Digger", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True),
    },
    "StormWatch": {
        "Careful: 2nd habitat, shields both": dict(queue=[("Habitat", 0), ("Shielding", 0), ("Shielding", 0), ("Solar", 0), ("Digger", 0), ("Battery", 0), ("Digger", 0), ("Solar", 0), ("Solar", 0), ("Solar", 0), ("OxygenMaker", 0), ("Solar", 0)], park_diggers=True, repair_after=0.5,
                                              clean_every=3, crate=[{"Water": 45, "Food": 25, "Regolith": 0}, {"Water": 40, "Food": 30, "Regolith": 0}]),
        "Only one oxygen maker for 4 crew":   dict(queue=[("Habitat", 0), ("Shielding", 0), ("Shielding", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True, repair_after=0.5),
        "Never fixes the broken panels":      dict(queue=[("Habitat", 0), ("Shielding", 0), ("Solar", 0), ("OxygenMaker", 0), ("Shielding", 0), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0)], park_diggers=True, repair_after=None),
        "Shields one habitat only":           dict(queue=[("Habitat", 0), ("Shielding", 0), ("Solar", 0), ("OxygenMaker", 0), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0)], park_diggers=True, repair_after=0.5),
        "Shields after the 1st storm":        dict(queue=[("Habitat", 0), ("Solar", 0), ("OxygenMaker", 0), ("Shielding", 6), ("Shielding", 6), ("Digger", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0)], park_diggers=True, repair_after=0.5),
        "Habitat late, crew wait in lander":  dict(queue=[("Solar", 0), ("OxygenMaker", 0), ("Solar", 0), ("Habitat", 6), ("Shielding", 0), ("Shielding", 0), ("Battery", 0), ("Solar", 0), ("Battery", 0), ("Battery", 0)], park_diggers=True, repair_after=0.5),
    },
}


# Commander Greenhouse trade-off: the careful player swaps crate food for regolith and grows food instead.
# crate = the lighter-on-food crate plan; at = where in the build queue the Greenhouse goes (None = last).
GREENHOUSE = {
    "FirstNight": dict(crate=[{"Water": 40, "Food": 0, "Regolith": 25}], at=3),
    "IceHunters": dict(crate=[{"Water": 0, "Food": 0, "Regolith": 30}], at=2),
    "StormWatch": dict(crate=[{"Water": 45, "Food": 0, "Regolith": 25}, {"Water": 40, "Food": 10, "Regolith": 20}], at=4),
}


def players_for(mission_id, mode_name):
    """The mission's scripted players, plus Commander-only slips and Greenhouse plans by the careful player."""
    pls = dict(PLAYERS[mission_id])
    if mode_name == "Commander":
        name, careful = next(iter(pls.items()))
        pls[name + ", never cleans dust"] = dict(careful, clean_every=None)
        pls[name + ", default crate"] = dict(careful, crate=None)
        g = GREENHOUSE[mission_id]
        q = list(careful["queue"]); q.insert(len(q) if g["at"] is None else g["at"], ("Greenhouse", 0))
        pls["Greenhouse, lights on at night"] = dict(careful, queue=q, crate=g["crate"])
        pls["Greenhouse, parked at night"] = dict(careful, queue=q, crate=g["crate"], park_greenhouse=True)
        pls["Greenhouse but crate still full of food"] = dict(careful, queue=q)
        pls["No greenhouse, crate with no food"] = dict(careful, crate=g["crate"])
    return pls


def report(mission_id, mode_name, upgrades=None, label=""):
    print(f"== {mission_id} / {mode_name}{label} ==")
    for name, pl in players_for(mission_id, mode_name).items():
        r = play(mission_id, mode_name, pl, upgrades)
        lo = r["low"]
        print(f"  {name:<36} stars {r['stars']}  RP {r['rp']:>2}  low O2 {lo['Oxygen']:5.1f} W {lo['Water']:5.1f} F {lo['Food']:5.1f}"
              f"  blackout {r['blackout']:4.0f}s  danger {r['danger']:4.0f}s  {r['goal_note']}")


# What a typical player owns by each mission (research bought with earlier points).
TYPICAL_UPGRADES = {"FirstNight": {}, "IceHunters": {"BetterSolar": 1}, "StormWatch": {"BetterSolar": 1, "BiggerBatteries": 1}}

if __name__ == "__main__":
    ms = [a for a in sys.argv[1:] if a in MISSIONS] or list(MISSIONS)
    modes = [a for a in sys.argv[1:] if a in cfg["Modes"]] or ["Cadet", "Explorer", "Commander"]
    for mid in ms:
        for md in modes:
            report(mid, md)
            if TYPICAL_UPGRADES[mid] and md == "Commander":
                report(mid, md, TYPICAL_UPGRADES[mid], f" + upgrades {TYPICAL_UPGRADES[mid]}")
