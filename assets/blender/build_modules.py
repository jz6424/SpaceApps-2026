# Builds the outdoor modules in Blender and exports one .glb each to export/. Original designs
# in the same chunky style as the Habitat, each based on real hardware named in its section.
#
# Units are metres (crew member = 1.8 m), Z up in Blender, Y up in the export. Pivot at the
# centre of the bottom face, front faces +X. Node names in each file:
#   <Module>_<Colour>   the look, one mesh per colour
#   COL_<name>          invisible axis-aligned boxes for Rapier; hide them and use their bounds
import math
import os
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

OUT = os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/export")


def srgb(r, g, b):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1)


PALETTE = {
    "White": (236, 238, 242),
    "Grey": (150, 156, 166),
    "Dark": (60, 64, 72),
    "Blue": (0, 66, 166),
    "Sky": (46, 150, 245),
    "Red": (228, 55, 0),
    "Yellow": (250, 200, 40),
    "Gold": (214, 170, 60),
    "Glass": (20, 40, 90),
    "Green": (70, 170, 80),
    "Glow": (255, 250, 225),
    "Tan": (190, 140, 90),
    "Hot": (255, 120, 30),
    "Cell": (18, 32, 82),      # solar cells: deep navy under glass
    "Silver": (196, 202, 212), # the bright lines between cells, bus bars
    "Dish": (232, 236, 242),   # the antenna's reflector (its own material, so the game's panel seams skip it)
}
ROUGHNESS = {"Cell": .3, "Silver": .4, "Dish": .5}


def material(name):
    full = "M_" + name
    mat = bpy.data.materials.get(full) or bpy.data.materials.new(full)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(*PALETTE[name])
    bsdf.inputs["Roughness"].default_value = ROUGHNESS.get(name, 0.65)
    if name in ("Glow", "Hot"):
        bsdf.inputs["Emission Color"].default_value = srgb(*PALETTE[name])
        bsdf.inputs["Emission Strength"].default_value = 3
    mat.diffuse_color = srgb(*PALETTE[name])
    return mat


coll = None


def add(name, bm, mat, matrix=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(mat))
    ob = bpy.data.objects.new(name, me)
    if matrix is not None:
        ob.matrix_world = matrix
    coll.objects.link(ob)
    return ob


def axis_matrix(pos, direction):
    rot = Vector((1, 0, 0)).rotation_difference(Vector(direction).normalized())
    return Matrix.Translation(pos) @ rot.to_matrix().to_4x4()


def lathe(name, profile, mat, pos, direction=(0, 0, 1), sides=14):
    """Revolve (along, radius) points around the axis, capping radius 0 ends."""
    bm = bmesh.new()
    rings = []
    for x, r in profile:
        if r == 0:
            continue
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * (i + .5) / sides),
                                    r * math.sin(2 * math.pi * (i + .5) / sides))) for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            bm.faces.new((a[i], b[i], b[(i + 1) % sides], a[(i + 1) % sides]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return add(name, bm, mat, axis_matrix(pos, direction))


def ring(name, profile, mat, pos, direction=(0, 0, 1), sides=14):
    """Like lathe, but the profile is a closed loop and there are no end caps: a ring or band
    (lathe would close each end with a flat disc)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, r * math.cos(2 * math.pi * (i + .5) / sides),
                            r * math.sin(2 * math.pi * (i + .5) / sides))) for i in range(sides)]
             for x, r in profile]
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(sides):
            bm.faces.new((a[i], b[i], b[(i + 1) % sides], a[(i + 1) % sides]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return add(name, bm, mat, axis_matrix(pos, direction))


def box(name, size, pos, mat, bevel=0.05, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((*size, 1)))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1,
                        affect='EDGES', profile=0.5)
    return add(name, bm, mat, Matrix.Translation(pos) @ Euler(rot).to_matrix().to_4x4())


def strut(name, a, b, radius, mat, sides=8):
    a, b = Vector(a), Vector(b)
    length = (b - a).length
    return lathe(name, [(0, 0), (0, radius), (length, radius), (length, 0)], mat, a, b - a, sides)


def foot(x, y, r=.45):
    lathe("Foot", [(0, 0), (0, r), (.12, r), (.25, r * .6), (.25, 0)], "Dark", (x, y, 0), (0, 0, 1), 12)


def wheel(x, y, z, r, w, tread="Dark", hub="Yellow"):
    """A chunky wheel with its axle along Y and a bright hub."""
    lathe("Tyre", [(-w / 2, 0), (-w / 2, r * .8), (-w / 2 + .06, r), (w / 2 - .06, r), (w / 2, r * .8), (w / 2, 0)],
          tread, (x, y, z), (0, 1, 0), 14)
    lathe("Hub", [(-w / 2 - .03, 0), (-w / 2 - .03, r * .5), (w / 2 + .03, r * .5), (w / 2 + .03, 0)], hub, (x, y, z), (0, 1, 0), 10)


def col(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
                          @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)))
    me = bpy.data.meshes.new("COL_" + name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("COL_" + name, me)
    ob.hide_render = True
    ob.display_type = 'WIRE'
    ob["col"] = True
    coll.objects.link(ob)


# --- The modules ---


def Solar():
    # Based on NASA's Vertical Solar Array Technology: at the south pole the Sun skims the
    # horizon, so the panel stands upright on a tall mast and turns to follow it.
    lathe("Base", [(.25, 0), (.25, 1.1), (.75, .9), (.9, .35), (.9, 0)], "White", (0, 0, 0))
    for a in (30, 150, 270):
        x, y = 2.4 * math.cos(math.radians(a)), 2.4 * math.sin(math.radians(a))
        strut("Leg", (x * .3, y * .3, .7), (x, y, .2), .13, "Grey")
        foot(x, y)
    strut("Mast", (0, 0, .8), (0, 0, 9.6), .2, "Grey", 16)
    for z in (2.6, 5):
        lathe("MastBand", [(0, 0), (0, .3), (.3, .3), (.3, 0)], "Blue", (0, 0, z), sides=16)
    lathe("Motor", [(0, 0), (0, .45), (.8, .45), (.8, 0)], "Red", (0, 0, 9.4), sides=16)
    # The panel, facing +X: a silver backing sheet carrying 12 x 6 dark solar cells with thin
    # silver lines between them, two silver bus bars across, and a slim yellow frame. Behind it,
    # a grey truss and an arm to the turning motor on the mast.
    px = .55                                            # the panel stands this far forward of the mast
    box("PanelBack", (.14, 7, 4.2), (px + .1, 0, 8), "Dark", .04)
    box("PanelSheet", (.04, 6.9, 4.1), (px + .19, 0, 8), "Silver", .01)
    cols, rows, gap = 12, 6, .05
    cw, ch = (6.8 - gap * (cols - 1)) / cols, (4.0 - gap * (rows - 1)) / rows
    for i in range(cols):
        for j in range(rows):
            box("Cell", (.03, cw, ch), (px + .225, -3.4 + cw / 2 + i * (cw + gap), 6 + ch / 2 + j * (ch + gap)), "Cell", 0)
    for z in (6 + 2 * (ch + gap) - gap / 2, 6 + 4 * (ch + gap) - gap / 2):
        box("BusBar", (.02, 6.9, .035), (px + .245, 0, z), "Silver", 0)
    for z, dz in ((10.08, .12), (5.92, .12)):
        box("PanelFrame", (.12, 7.12, dz), (px + .2, 0, z), "Yellow", .02)
    for y in (3.5, -3.5):
        box("PanelFrame", (.12, .12, 4.28), (px + .2, y, 8), "Yellow", .02)
    for y in (-2.4, 0, 2.4):
        strut("Truss", (px - .02, y, 6.1), (px - .02, y, 9.9), .05, "Grey", 8)
    strut("Truss", (px - .02, -3.2, 8), (px - .02, 3.2, 8), .05, "Grey", 8)
    strut("Arm", (.3, 0, 9.8), (px - .02, 0, 9.8), .12, "Grey", 10)
    strut("Arm", (0, 0, 8.4), (px - .02, 0, 8.4), .1, "Grey", 10)
    box("PowerBox", (.9, 1, .7), (.8, .9, .45), "Gold", .08)
    strut("Cable", (.5, .5, .5), (.1, .1, 1), .05, "Dark", 6)
    col("Mast", -.5, .5, -.5, .5, 0, 10.4)
    col("Base", -1, 1, -1, 1, 0, .95)
    col("Panel", .45, .9, -3.7, 3.7, 5.6, 10.4)
    col("PowerBox", .3, 1.3, .4, 1.4, 0, .85)


def Battery():
    # A night-survival power pack: insulated battery modules in gold foil, because batteries
    # must be kept warm through the lunar night at about -130 C.
    for x, y in ((-1.3, -1.3), (1.3, -1.3), (-1.3, 1.3), (1.3, 1.3)):
        foot(x, y, .4)
        strut("Stilt", (x, y, .2), (x, y, .6), .12, "Grey")
    box("Skid", (3.2, 3.2, .25), (0, 0, .7), "Grey", .06)
    for i, x in enumerate((-.95, .1, 1.15)):
        box("Pack", (.95, 2.5, 1.6), (x - .1, 0, 1.65), "Gold", .1)
        for z in (1.25, 2.1):
            box("PackBand", (1, 2.54, .12), (x - .1, 0, z), "White", .02)
        box("PackTop", (1, 2.56, .16), (x - .1, 0, 2.48), "White", .04)
    # A chunky charge display, with one lit bar less than full, facing +X.
    box("Panel", (.15, 1.8, 1.1), (1.6, 0, 1.95), "Dark", .03)
    for i, c in enumerate(("Green", "Green", "Yellow", "Red")):
        box("ChargeBar", (.05, .32, .75), (1.69, -.57 + i * .38, 1.95), c, .01)
    # Radiator fin on top to shed daytime heat, and a thick power cable on a reel.
    for x in (-.8, -.1, .6, 1.3):
        box("Fin", (.08, 1.8, .55), (x - .2, 0, 2.82), "Sky", .01)
    lathe("Reel", [(-.12, 0), (-.12, .42), (.12, .42), (.12, 0)], "Red", (-.2, 1.72, 1.1), (0, 1, 0), 12)
    lathe("ReelHub", [(-.15, 0), (-.15, .15), (.15, .15), (.15, 0)], "Dark", (-.2, 1.72, 1.1), (0, 1, 0), 8)
    col("Pack", -1.65, 1.7, -1.65, 1.95, 0, 3.1)


def Digger():
    # Based on NASA's IPEx regolith excavator: a low rover with counter-rotating bucket drums
    # at both ends, which cancel each other's push so it can dig in low gravity.
    for x in (-.85, .85):
        for y in (-1, 1):
            wheel(x, y, .55, .55, .42, "Dark", "Yellow")
    box("Chassis", (2.4, 1.35, .62), (0, 0, .85), "White", .1)
    box("Trim", (2.44, 1.39, .12), (0, 0, .92), "Red", .02)
    box("TopPanel", (1.5, 1.15, .1), (-.15, 0, 1.22), "Blue", .02)
    for i in range(3):
        box("Cell", (.42, 1.02, .04), (-.62 + i * .47, 0, 1.28), "Sky", .01)
    # Drums, each on two arms, with chunky scoops around them.
    for s in (-1, 1):
        x = s * 1.85
        for y in (-.55, .55):
            strut("Arm", (s * 1.05, y, .9), (x, y, .45), .09, "Grey")
        lathe("Drum", [(-.75, 0), (-.75, .42), (.75, .42), (.75, 0)], "Grey", (x, 0, .45), (0, 1, 0), 12)
        for i in range(6):
            a = i * math.pi / 3 + .3
            box("Scoop", (.2, 1.5, .2), (x + .42 * math.cos(a), 0, .45 + .42 * math.sin(a)), "Red", .03, (0, -a, 0))
    # Camera head with two round eyes, facing +X.
    strut("Neck", (.75, 0, 1.15), (.75, 0, 1.75), .08, "Grey")
    box("Head", (.4, .75, .36), (.8, 0, 1.92), "White", .08)
    for y in (-.2, .2):
        lathe("Eye", [(0, 0), (0, .13), (.08, .13), (.08, 0)], "Dark", (.98, y, 1.94), (1, 0, 0), 10)
        lathe("EyeGlint", [(.08, 0), (.08, .04), (.1, .04), (.1, 0)], "Glow", (.98, y + .04, 1.98), (1, 0, 0), 6)
    strut("Whip", (-1, .45, 1.15), (-1, .45, 2), .025, "Dark", 6)
    lathe("WhipTip", [(0, 0), (0, .06), (.12, .06), (.12, 0)], "Yellow", (-1, .45, 2), sides=8)
    col("Body", -2.3, 2.3, -1.25, 1.25, 0, 1.3)


def OxygenMaker():
    # Based on NASA carbothermal reduction tests: a hopper feeds moon dirt into a hot reactor,
    # and oxygen stripped from the dirt collects in a tank. Regolith is about 45% oxygen.
    for x in (-2.2, 2.2):
        for y in (-1.15, 1.15):
            foot(x, y, .38)
    box("Skid", (5.6, 2.7, .3), (0, 0, .4), "Grey", .08)
    box("Tread", (5.3, 2.4, .04), (0, 0, .57), "Dark", 0)
    # Hopper with a funnel, a load of dirt, and a yellow chute.
    lathe("Hopper", [(.1, 0), (.1, .35), (1.2, 1.2), (1.8, 1.2), (1.8, 0)], "Yellow", (-1.9, 0, .55), sides=8)
    lathe("Dirt", [(1.78, 0), (1.78, 1.05), (2.05, .55), (2.2, 0)], "Tan", (-1.9, 0, .55), sides=8)
    for x, y in ((-2.9, -.9), (-.9, -.9), (-2.9, .9), (-.9, .9)):
        strut("HopperLeg", (x, y, .55), (x * .85 - .28, y * .8, 1.75), .07, "Grey", 6)
    strut("Chute", (-1.9, 0, .85), (-.75, 0, 1.25), .24, "Grey")
    # Reactor: a white, insulated drum with a hot window that shows how it works.
    lathe("Reactor", [(.0, 0), (.0, .7), (.2, 1.05), (1.75, 1.05), (2, .75), (2, 0)], "White", (0, 0, .55))
    for z in (.85, 2.15):
        lathe("ReactorBand", [(0, 0), (0, 1.08), (.2, 1.08), (.2, 0)], "Blue", (0, 0, z))
    for s in (-1, 1):
        lathe("HotWindowFrame", [(0, 0), (0, .46), (.1, .46), (.1, 0)], "Dark", (0, s * 1, 1.55), (0, s, 0), 12)
        lathe("HotWindow", [(.08, 0), (.08, .33), (.14, .33), (.14, 0)], "Hot", (0, s * 1, 1.55), (0, s, 0), 12)
    strut("Stack", (0, 0, 2.5), (0, 0, 3.3), .17, "Grey")
    lathe("StackCap", [(0, 0), (0, .3), (.15, .3), (.3, .1), (.3, 0)], "Red", (0, 0, 3.25), sides=10)
    # Pipe to the oxygen tank: a big sphere-ish tank in sky blue with a gold base.
    strut("Pipe", (.7, .2, 2.25), (1.9, .2, 2.25), .11, "Grey")
    strut("Pipe", (1.9, .2, 2.25), (1.9, .2, 2), .11, "Grey")
    lathe("Tank", [(0, 0), (0, .35), (.35, .85), (.95, 1), (1.55, .85), (1.9, .35), (1.9, 0)], "Sky", (1.95, 0, .85))
    lathe("TankBase", [(0, 0), (0, .75), (.35, .55), (.35, 0)], "Gold", (1.95, 0, .55))
    lathe("TankBand", [(0, 0), (0, 1.02), (.14, 1.02), (.14, 0)], "White", (1.95, 0, 1.75))
    lathe("Gauge", [(0, 0), (0, .3), (.08, .3), (.08, 0)], "Glow", (2.9, 0, 1.95), (1, 0, 0), 10)
    strut("GaugeArm", (2.5, 0, 1.95), (2.92, 0, 1.95), .05, "Dark", 6)
    col("Skid", -2.85, 2.95, -1.5, 1.5, 0, .6)
    col("Hopper", -3.1, -.7, -1.2, 1.2, .6, 2.8)
    col("Reactor", -1.05, 1.05, -1.05, 1.05, .6, 3.3)
    col("Tank", .95, 2.95, -1, 1, .6, 2.8)


def IceDrill():
    # Based on NASA's TRIDENT drill, flown to bore into icy lunar soil: a tower that turns an
    # auger into the ground and lifts up frozen dirt. Heaters keep it running near -240 C.
    for x, y in ((-1.7, -1.7), (1.7, -1.7), (-1.7, 1.7), (1.7, 1.7)):
        foot(x, y, .5)
        strut("Leg", (x * .62, y * .62, 1), (x, y, .22), .14, "Grey")
    box("Deck", (3.1, 3.1, .35), (0, 0, 1.15), "Grey", .08)
    box("DeckStripe", (3.14, 3.14, .08), (0, 0, 1.2), "Yellow", .01)
    box("BodyLeft", (2.4, .9, 1.2), (-.2, -1.05, 1.92), "Gold", .1)
    box("BodyRight", (2.4, .9, 1.2), (-.2, 1.05, 1.92), "White", .1)
    box("BodyPanel", (.05, .7, .6), (1.02, 1.05, 2.05), "Dark", .01)
    for i, c in enumerate(("Sky", "Green")):
        box("Lamp", (.03, .2, .2), (1.06, .85 + i * .4, 2.05), c, .01)
    # The tower, an A-frame rising over the drill head.
    for x, y in ((-.55, -.5), (.55, -.5), (-.55, .5), (.55, .5)):
        strut("TowerLeg", (x, y, 1.3), (x * .25, y * .25, 7), .08, "White", 6)
    for z in (2.6, 4, 5.4):
        f = 1 - (z - 1.3) / 5.7 * .75
        box("TowerRing", (1.1 * f + .1, 1 * f + .1, .1), (0, 0, z), "Blue", .02)
    lathe("TowerCap", [(0, 0), (0, .32), (.25, .32), (.4, .1), (.4, 0)], "Red", (0, 0, 7), sides=10)
    # The auger, in chunky steps that read as a screw, going into a cuff in the ground.
    lathe("DrillMotor", [(0, 0), (0, .3), (.55, .3), (.55, 0)], "Dark", (0, 0, 3.5), sides=10)
    pts = [(0, 0)]
    z = .35
    while z < 3.4:
        pts += [(z, .1), (z + .12, .2), (z + .26, .1)]
        z += .3
    pts.append((3.5, 0))
    lathe("Auger", pts, "Sky", (0, 0, 0), sides=8)
    lathe("Cuff", [(0, 0), (0, .55), (.3, .42), (.3, 0)], "Dark", (0, 0, 0), sides=12)
    # A bin of mined ice, lit with a heater coil.
    box("Bin", (1, 1.4, .7), (2.1, 0, .75), "White", .06)
    strut("BinLeg", (2.1, -.5, .4), (2.1, -.5, 0), .09, "Grey")
    strut("BinLeg", (2.1, .5, .4), (2.1, .5, 0), .09, "Grey")
    for i, (x, y) in enumerate(((1.9, -.35), (2.25, -.1), (1.9, .25), (2.3, .4))):
        box("Ice", (.32, .32, .32), (x, y, 1.15 + (i % 2) * .05), "Glow" if i == 1 else "Sky", .04, (0, 0, .4 + i))
    col("Deck", -1.6, 1.6, -1.6, 1.6, 0, 2.6)
    col("Tower", -.65, .65, -.6, .6, 2.6, 7.4)
    col("Bin", 1.6, 2.6, -.7, .7, 0, 1.3)
    for x, y in ((-1.7, -1.7), (1.7, -1.7), (-1.7, 1.7), (1.7, 1.7)):
        col("Foot%d%d" % (x > 0, y > 0), x - .4, x + .4, y - .4, y + .4, 0, .3)


def CargoLander():
    # Based on robotic cargo landers such as Astrobotic's Griffin: a wide gold-foil body on
    # four legs, engines underneath, cargo on the deck and a ramp for rovers.
    H = 3.2  # top of the legs' attachment
    # Body: 8-sided, wrapped in gold insulation, belted in white.
    lathe("Body", [(H, 0), (H, 3.2), (H + .3, 3.6), (H + 1.9, 3.6), (H + 2.2, 3.2), (H + 2.2, 0)], "Gold", (0, 0, 0), sides=8)
    lathe("Belt", [(H + 1, 0), (H + 1, 3.66), (H + 1.25, 3.66), (H + 1.25, 0)], "White", (0, 0, 0), sides=8)
    lathe("Belt", [(H + 1.45, 0), (H + 1.45, 3.66), (H + 1.55, 3.66), (H + 1.55, 0)], "Red", (0, 0, 0), sides=8)
    # Four legs with big pads.
    for a in (45, 135, 225, 315):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        strut("Leg", (c * 2.8, s * 2.8, H + .3), (c * 5.2, s * 5.2, .4), .24, "Grey", 8)
        strut("LegBrace", (c * 1.6, s * 1.6, H), (c * 5.2, s * 5.2, .4), .12, "White", 6)
        lathe("Pad", [(0, 0), (0, .95), (.15, .95), (.42, .5), (.42, 0)], "Dark", (c * 5.2, s * 5.2, 0), sides=14)
    # Four engine bells in dark metal.
    for a in (45, 135, 225, 315):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        lathe("Bell", [(1.4, 0), (1.4, .85), (2.2, .4), (H + .05, .35), (H + .05, 0)], "Dark", (c * 1.4, s * 1.4, 0), sides=12)
    # Cargo on the deck: crates, a tank and a small crane.
    T = H + 2.2
    box("CrateA", (1.8, 1.6, 1.4), (-1.1, -1, T + .7), "White", .1)
    box("CrateStrap", (1.84, .2, 1.44), (-1.1, -1, T + .7), "Blue", .02)
    box("CrateB", (1.3, 1.3, 1), (.9, -1.5, T + .5), "Sky", .08)
    box("CrateC", (1.2, 1.4, 1.1), (-1.5, 1.2, T + .55), "Yellow", .08)
    lathe("Tank", [(0, 0), (0, .5), (.3, .75), (1.4, .75), (1.7, .5), (1.7, 0)], "White", (.9, 1.1, T))
    lathe("TankCap", [(1.6, 0), (1.6, .35), (1.85, .2), (1.85, 0)], "Red", (.9, 1.1, T), sides=10)
    strut("Crane", (2.6, 2.2, T), (2.6, 2.2, T + 2.4), .12, "Yellow", 8)
    strut("CraneArm", (2.6, 2.2, T + 2.4), (.9, 1.1, T + 2.9), .09, "Yellow", 8)
    # Ramp down to the surface on the +X side, for rovers. The plank, its two rails and the lip all
    # follow one line: from the deck's edge, just clear of the body's bulge, down to the ground.
    x0, x1, top = 3.35, 10.0, T + .05
    run, d = x1 - x0, math.atan2(T + .05, x1 - x0)
    box("Ramp", (math.hypot(run, top), 1.9, .12), ((x0 + x1) / 2, 0, top / 2), "Grey", .03, (0, d, 0))
    for s in (-1, 1):
        strut("RampEdge", (x0, s * .95, top + .1), (x1, s * .95, .1), .08, "Yellow", 6)
    box("RampLip", (.4, 2, .12), (x0 - .15, 0, top - .02), "Dark", .03)
    # Antenna and sensor mast, and a star tracker with a dark lens.
    strut("Mast", (-2.6, -2, T), (-2.6, -2, T + 2.2), .08, "Grey", 6)
    lathe("MastDish", [(0, 0), (0, .3), (.2, .55), (.25, 0)], "White", (-2.6, -2, T + 2.2), (.5, -.3, 1), 10)
    lathe("Eye", [(0, 0), (0, .24), (.1, .24), (.1, 0)], "Dark", (3.35, 1.2, H + 1.15), (1, .33, 0), 10)
    # Solid parts: the body from its underside up (you can walk under its rim, between the legs),
    # the engines below it, each footpad and the low end of each leg, and the ramp only where it is
    # low enough to bump into (three steps under it), so you can walk beneath its high end.
    col("Body", -3.5, 3.5, -3.5, 3.5, H - .1, T + 1.5)
    col("Engines", -2.2, 2.2, -2.2, 2.2, 0, H - .1)
    low = 2.4                                   # ramp lower than this (m) blocks walking under it
    xa = x1 - low * run / top
    for k in range(3):
        a, b = xa + k * (x1 - xa) / 3, xa + (k + 1) * (x1 - xa) / 3
        col("Ramp%d" % (k + 1), a, b, -.95, .95, 0, top * (x1 - a) / run)
    for a, n in ((45, "NE"), (135, "NW"), (225, "SW"), (315, "SE")):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        col("Pad" + n, c * 5.2 - .8, c * 5.2 + .8, s * 5.2 - .8, s * 5.2 + .8, 0, .45)
        col("Leg" + n, c * 4.5 - .45, c * 4.5 + .45, s * 4.5 - .45, s * 4.5 + .45, 0, 1.6)


def Antenna():
    # A surface comms dish, the kind NASA plans for Artemis: it can only talk to Earth while
    # Earth is above the horizon, so it sits on a tall mast and tilts low.
    for a in (45, 165, 285):
        x, y = 2.1 * math.cos(math.radians(a)), 2.1 * math.sin(math.radians(a))
        strut("Leg", (x * .25, y * .25, 1.6), (x, y, .22), .13, "Grey")
        foot(x, y, .5)
    lathe("Base", [(.6, 0), (.6, .7), (1.5, .55), (1.8, .25), (1.8, 0)], "White", (0, 0, 0), sides=10)
    lathe("BaseBand", [(1.05, 0), (1.05, .68), (1.3, .68), (1.3, 0)], "Blue", (0, 0, 0), sides=10)
    strut("Mast", (0, 0, 1.75), (0, 0, 4.8), .17, "Grey", 10)
    # Equipment pack on the mast, in gold foil.
    box("Pack", (.9, .9, .9), (-.5, 0, 2.5), "Gold", .08)
    box("PackLight", (.03, .25, .14), (-.03, 0, 2.5), "Green", .01)
    lathe("Beacon", [(0, 0), (0, .15), (.2, .15), (.3, .08), (.3, 0)], "Red", (-.5, 0, 2.95), sides=8)
    lathe("Pivot", [(-.35, 0), (-.35, .3), (.35, .3), (.35, 0)], "Dark", (0, 0, 4.85), (0, 1, 0), 10)
    # Dish, tilted low and pointing +X: a smooth white parabolic reflector, thin grey seams where
    # its panels meet, a slim rim, a small hub in the middle, and four struts holding the feed horn
    # at the focus, where the radio waves bounce to. A frame of struts holds it from behind.
    d = Vector((1, 0, .32)).normalized()
    p = Vector((.1, 0, 5))
    u = Vector((0, 1, 0))
    v = d.cross(u)
    R, F = 2.15, 2.1                                    # dish radius and focal length (m)

    def depth(r):                                       # the front face is a paraboloid
        return .26 + r * r / (4 * F)

    def on_face(r, ang, lift=.02):
        return p + d * (depth(r) + lift) + (u * math.cos(ang) + v * math.sin(ang)) * r

    rs = [R * k / 16 for k in range(1, 17)]
    lathe("Dish", [(depth(r) - .14, r) for r in rs] + [(depth(R) + .02, R + .04)] + [(depth(r), r) for r in reversed(rs)],
          "Dish", p, d, 48)
    for r0 in (.95, 1.6):                               # seams between the rings of panels
        ring("DishSeam", [(depth(r0) + .006, r0), (depth(r0 + .02) + .006, r0 + .02), (depth(r0 + .02) + .016, r0 + .02), (depth(r0) + .016, r0)], "Silver", p, d, 48)
    for k in range(8):                                  # seams between the panels in each ring
        ang = k * math.pi / 4 + math.pi / 8
        strut("DishSeam", on_face(.32, ang, .01), on_face(R - .05, ang, .01), .01, "Silver", 4)
    ring("DishRim", [(depth(R) - .02, R - .02), (depth(R) - .02, R + .1), (depth(R) + .08, R + .1), (depth(R) + .08, R - .02)], "Grey", p, d, 48)
    lathe("DishHub", [(depth(0), 0), (depth(0), .3), (depth(0) + .06, .3), (depth(0) + .1, 0)], "Grey", p, d, 24)
    # The frame behind: struts from a hub behind the pivot out to the back of the rim.
    lathe("DishBackHub", [(-.42, 0), (-.42, .32), (-.1, .32), (-.1, 0)], "Grey", p, d, 16)
    for k in range(6):
        ang = k * math.pi / 3 + math.pi / 6
        out = u * math.cos(ang) + v * math.sin(ang)
        strut("DishFrame", p - d * .3 + out * .28, p + d * (depth(R) - .3) + out * (R - .15), .05, "Grey", 6)
    # Four feed struts from the rim to the feed horn at the focus.
    focus = p + d * (depth(0) + F)
    for k in range(4):
        ang = k * math.pi / 2 + math.pi / 4
        strut("FeedArm", on_face(R - .1, ang, .05), focus - d * .2, .035, "Grey", 6)
    lathe("FeedHorn", [(0, 0), (0, .12), (.35, .24), (.35, 0)], "Grey", focus - d * .45, d, 16)
    lathe("Receiver", [(0, 0), (0, .2), (.22, .2), (.28, 0)], "Gold", focus - d * .1, d, 16)
    # A cable from the equipment pack up the mast to the dish.
    strut("Cable", (-.08, -.18, 2.95), (-.08, -.18, 4.75), .04, "Dark", 6)
    col("Base", -.75, .75, -.75, .75, 0, 3.4)
    col("Mast", -.3, .3, -.3, .3, 3.4, 5.2)
    col("Dish", .1, 1.2, -2.1, 2.1, 3, 7)
    col("Pack", -.95, -.05, -.45, .45, 2.05, 2.95)


MODULES = (Solar, Battery, Digger, OxygenMaker, IceDrill, CargoLander, Antenna)


def join_by_colour(name):
    groups = {}
    for ob in list(coll.objects):
        if ob.get("col"):
            continue
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
        groups.setdefault(ob.data.materials[0].name, []).append(ob)
    for mat, obs in groups.items():
        bm = bmesh.new()
        for ob in obs:
            bm.from_mesh(ob.data)
        me = bpy.data.meshes.new(name + "_" + mat[2:])
        bm.to_mesh(me)
        bm.free()
        me.materials.append(bpy.data.materials[mat])
        for ob in obs:
            bpy.data.objects.remove(ob)
        coll.objects.link(bpy.data.objects.new(me.name, me))


def build_one(fn):
    global coll
    name = fn.__name__
    old = bpy.data.collections.get(name)
    if old:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob)
        bpy.data.collections.remove(old)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    fn()
    join_by_colour(name)
    look = [o for o in coll.objects if not o.get("col")]
    co = [v.co for o in look for v in o.data.vertices]

    # Export this collection, then keep it out of the shared viewport.
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = look[0]
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_normals=True, export_materials='EXPORT',
                              export_animations=False)
    bpy.context.view_layer.layer_collection.children[name].exclude = True
    return {
        "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in look),
        "colliders": len(coll.objects) - len(look),
        "size": [round(max(c[i] for c in co) - min(c[i] for c in co), 2) for i in range(3)],
        "min": [round(min(c[i] for c in co), 2) for i in range(3)],
        "kb": os.path.getsize(path) // 1024,
    }


result = {fn.__name__: build_one(fn) for fn in MODULES}
bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/modules.blend"))
