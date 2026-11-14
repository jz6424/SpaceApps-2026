# Builds the walk-in Habitat module mesh in Blender. Original design, chunky and playful,
# based on real hardware: NASA's planned Foundation Surface Habitat (a pressurised tube on
# legs, for up to 4 crew, with an airlock; this one is fitted out for a single astronaut),
# plus radiators, a comms dish, gas tanks, yellow
# EVA handrails and a Veggie-style plant chamber like the one on the Space Station.
#
# Modelled in "design units" where a crew member is 5.5 tall, then scaled by S at the end so
# that in the export 1 unit = 1 metre and a crew member is 1.8 m. Pivot at the centre of the
# bottom face (world origin). The door faces +X. Exported to glTF for three.js + Rapier.
#
# Node names the game looks for:
#   STATION_<Name>        one per station, an empty holding that station's meshes
#   STATION_<Name>_Stand  where the player stands to use it (for prompts and camera)
#   COL_<name>            invisible axis-aligned boxes for Rapier; hide them and use their bounds
#   ROOF_<colour>         everything above SPLIT_Z, to fade out when the player is inside
#   EXTERIOR_, INTERIOR_  the rest of the look, one mesh per colour
import math
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

MODULE = "Habitat"
SIDES = 32

ZC = 13.5     # hull axis height
R = 11.0      # hull outer radius
RI = 10.3     # hull inner radius
AZ = 12.5     # airlock axis height
FLOOR = 7.5   # top of the deck inside
SPLIT_Z = 19.6  # hull above this belongs to the fading roof
S = 1.8 / 5.5   # design units to metres


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
}


def material(name):
    full = "M_" + name
    mat = bpy.data.materials.get(full) or bpy.data.materials.new(full)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(*PALETTE[name])
    bsdf.inputs["Roughness"].default_value = 0.65
    if name == "Glass":
        bsdf.inputs["Alpha"].default_value = 0.45
        mat.surface_render_method = 'BLENDED'
    if name == "Glow":
        bsdf.inputs["Emission Color"].default_value = srgb(*PALETTE[name])
        bsdf.inputs["Emission Strength"].default_value = 3
    mat.diffuse_color = srgb(*PALETTE[name])
    return mat


coll = None
GROUP = "EXTERIOR"  # which node group new meshes join


def add(name, bm, mat, matrix=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(mat))
    ob = bpy.data.objects.new(name, me)
    if matrix is not None:
        ob.matrix_world = matrix
    ob["group"] = GROUP
    coll.objects.link(ob)
    return ob


def axis_matrix(pos, direction):
    rot = Vector((1, 0, 0)).rotation_difference(Vector(direction).normalized())
    return Matrix.Translation(pos) @ rot.to_matrix().to_4x4()


def lathe(name, profile, mat, pos, direction=(1, 0, 0), sides=SIDES):
    """Revolve a list of (along, radius) points around the axis, capping radius 0 ends."""
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


def ring(name, x0, x1, r0, r1, mat, pos, direction=(1, 0, 0), sides=SIDES):
    """A hollow band from radius r0 to r1, so it can sit inside the walk-in space."""
    bm = bmesh.new()
    loops = []
    for x, r in ((x0, r0), (x0, r1), (x1, r1), (x1, r0)):
        loops.append([bm.verts.new((x, r * math.cos(2 * math.pi * (i + .5) / sides),
                                    r * math.sin(2 * math.pi * (i + .5) / sides))) for i in range(sides)])
    for k in range(4):
        a, b = loops[k], loops[(k + 1) % 4]
        for i in range(sides):
            bm.faces.new((a[i], b[i], b[(i + 1) % sides], a[(i + 1) % sides]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return add(name, bm, mat, axis_matrix(pos, direction))


def box(name, size, pos, mat, bevel=0.15, rot=(0, 0, 0)):
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


def boolean(target, tool, op):
    """Apply a boolean to target and delete tool."""
    mod = target.modifiers.new("Bool", 'BOOLEAN')
    mod.operation = op
    mod.object = tool
    mod.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    target.modifiers.clear()
    old = target.data
    target.data = me
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(tool)
    return target


def copy(ob, name):
    new = ob.copy()
    new.data = ob.data.copy()
    new.name = name
    coll.objects.link(new)
    return new


def build_shell():
    global GROUP
    GROUP = "EXTERIOR"
    # Solid outer and inner shapes. Outer minus inner leaves real walls and a walk-through
    # opening from the airlock into the hull.
    outer = lathe("Hull", [(-23.0, 0), (-23.0, 3.8), (-22.2, 7), (-20.6, 9.6), (-18.4, R), (10.8, R),
                           (12.6, 9.6), (14.4, 7), (15.5, 4), (15.5, 0)], "White", (0, 0, ZC))
    boolean(outer, lathe("AirlockOut", [(11, 0), (11, 7), (18.2, 7), (19, 6.2), (19.4, 5), (19.4, 0)],
                         "White", (0, 0, AZ)), 'UNION')
    inner = lathe("HullIn", [(-22.3, 0), (-22.3, 3.4), (-21.5, 6.4), (-20, 8.9), (-18, RI), (10.4, RI),
                             (12, 8.9), (13.7, 6.4), (14.8, 3.6), (14.8, 0)], "White", (0, 0, ZC))
    boolean(inner, lathe("AirlockIn", [(9, 0), (9, 6.3), (18, 6.3), (18.7, 5.6), (18.7, 0)],
                         "White", (0, 0, AZ)), 'UNION')

    # The deck is a slab trimmed to the inside of the hull.
    GROUP = "INTERIOR"
    deck = box("Deck", (44, 24, .5), (-2, 0, FLOOR - .25), "Grey", 0)
    boolean(deck, copy(inner, "InnerCopy"), 'INTERSECT')
    GROUP = "EXTERIOR"

    boolean(outer, inner, 'DIFFERENCE')

    # Door: tall enough for a suited astronaut, wide enough for two to pass.
    boolean(outer, box("DoorCut", (4, 6, 9), (19, 0, FLOOR + 4.4), "White", .8), 'DIFFERENCE')

    # Two real windows each side, cut right through the wall so you can look out.
    a = math.radians(14)
    for s in (-1, 1):
        for x in (-12, 2):
            d = Vector((0, s * math.cos(a), math.sin(a)))
            p = Vector((x, 0, ZC)) + d * (R - .35)
            boolean(outer, strut("WindowCut", p - d * 2, p + d * 2, 2.35, "White", 16), 'DIFFERENCE')
            ring("WindowFrame", -.65, .7, 2.3, 3.1, "Blue", p, d, 16)
            lathe("WindowGlass", [(-.1, 0), (-.1, 2.35), (.1, 2.35), (.1, 0)], "Glass", p, d, 16)
    outer["split"] = True


def build_exterior():
    global GROUP
    GROUP = "EXTERIOR"
    for x, m in ((-16.4, "Blue"), (-4.5, "Blue"), (8.2, "Blue")):
        ring("Band", x - .7, x + .7, R - .1, R + .4, m, (0, 0, ZC))["split"] = True
    ring("Band", 9.6, 10.1, R - .1, R + .2, "Red", (0, 0, ZC))["split"] = True
    lathe("DockPort", [(-23.6, 0), (-23.6, 2.6), (-23.1, 3), (-22.8, 0)], "Sky", (0, 0, ZC))
    ring("AirlockBand", 15, 16.4, 6.9, 7.4, "Blue", (0, 0, AZ))
    ring("AirlockBand", 16.7, 17, 6.9, 7.2, "Red", (0, 0, AZ))

    # Door frame, and the outer hatch standing open against the airlock.
    for y in (-3.1, 3.1):
        box("DoorJamb", (.5, .5, 9), (19.4, y, FLOOR + 4.4), "Grey", .08)
    box("DoorHead", (.5, 6.7, .5), (19.4, 0, FLOOR + 9), "Grey", .08)
    box("Hatch", (.5, 5.2, 8.4), (19.8, 5.9, FLOOR + 4.3), "White", .25)
    lathe("HatchWindow", [(0, 0), (0, 1.1), (.15, 1.1), (.15, 0)], "Glass", (20, 5.9, FLOOR + 6), (1, 0, 0), 14)
    lathe("HatchHub", [(0, 0), (0, .7), (.45, .55), (.5, 0)], "Red", (20, 5.9, FLOOR + 3), (1, 0, 0), 12)
    box("HatchHandle", (.3, 2.4, .4), (20.5, 5.9, FLOOR + 3), "Red", .05)

    # Landing and shallow steps down the side: rise 1.5, tread 2.4, easy for Roblox characters.
    box("Landing", (4, 6.4, FLOOR), (21.5, 0, FLOOR / 2), "Grey", .15)
    box("Tread", (3.8, 6.1, .16), (21.5, 0, FLOOR + .02), "Yellow", .03)
    for i in range(4):
        h = FLOOR - 1.5 * (i + 1)
        box("Step", (4, 2.4, h), (21.5, -4.4 - 2.4 * i, h / 2), "Grey", .1)
    strut("Rail", (23.4, -3.2, FLOOR + 3.4), (23.4, 3.2, FLOOR + 3.4), .16, "Yellow", 8)
    strut("RailPost", (23.4, -3.2, FLOOR), (23.4, -3.2, FLOOR + 3.4), .16, "Yellow", 8)
    strut("RailPost", (23.4, 3.2, FLOOR), (23.4, 3.2, FLOOR + 3.4), .16, "Yellow", 8)
    strut("Rail", (23.4, -3.2, FLOOR + 3.4), (23.4, -13, 3.4), .16, "Yellow", 8)
    strut("RailPost", (23.4, -13, 0), (23.4, -13, 3.4), .16, "Yellow", 8)

    # Legs with oversized footpads, so the weight spreads on soft regolith.
    for x in (-15, 8):
        box("Cradle", (2.6, 17, 1.6), (x, 0, 3.6), "Dark", .2)
        for s in (-1, 1):
            strut("Leg", (x, s * 7.4, 4), (x, s * 13.4, 1), .85, "Grey", 10)
            lathe("Pad", [(0, 0), (0, 2.1), (.5, 2.1), (1.1, 1.3), (1.1, 0)], "Dark", (x, s * 13.4, 0), (0, 0, 1), 14)

    # Everything from here up fades with the roof.
    GROUP = "ROOF"
    # Yellow EVA handrails along the hull, like the ones on the Space Station.
    a = math.radians(52)
    for s in (-1, 1):
        d = Vector((0, s * math.cos(a), math.sin(a)))
        lo, hi = Vector((-15, 0, ZC)) + d * (R + 1), Vector((7, 0, ZC)) + d * (R + 1)
        strut("Handrail", lo, hi, .2, "Yellow", 8)
        for t in (0, 1 / 3, 2 / 3, 1):
            q = lo.lerp(hi, t)
            strut("HandrailPost", q, q - d * 1.1, .16, "Yellow", 6)

    GROUP = "EXTERIOR"
    # Oxygen and nitrogen tanks on one side, gold-foil service pack on the other.
    lathe("Tank", [(-9, 0), (-9, 1), (-8.2, 1.8), (1.6, 1.8), (2.4, 1), (2.4, 0)], "White", (0, -11.9, 5.2), sides=14)
    lathe("TankCap", [(2.1, 0), (2.1, 1.3), (2.9, .8), (2.9, 0)], "Red", (0, -11.9, 5.2), sides=14)
    for x in (-5.4, -1.2):
        ring("TankStrap", x, x + .6, 1.75, 1.95, "Blue", (0, -11.9, 5.2), sides=14)
    for x in (-6, 0):
        strut("TankBracket", (x, -11, 6.5), (x, -8.2, 7.5), .3, "Grey", 8)
    for x in (-6.5, -.5):
        strut("PackBracket", (x, 10.5, 7), (x, 8.2, 7.5), .3, "Grey", 8)
    box("ServicePack", (9, 3, 4), (-3.5, 11.5, 5.4), "Gold", .3)
    box("ServicePanel", (7, .2, 2.2), (-3.5, 13.05, 5.6), "Yellow", .05)

    GROUP = "ROOF"
    # Roof: two tilted radiators that dump heat, a comms dish and a beacon.
    box("RadiatorSpine", (16, 3, 1.8), (-2, 0, 25.0), "Grey", .25)
    for s in (-1, 1):
        y = s * 5.2
        tilt = (math.radians(-s * 18), 0, 0)
        box("Radiator", (16, 6.8, .5), (-2, y, 26.4), "White", .1, tilt)
        for x in (-8, -4, 0, 4):
            box("RadiatorFin", (1.8, 6, .25), (x, y, 26.75), "Sky", .05, tilt)
        strut("RadiatorMount", (-2, s * 2.5, 25), (-2, y, 26.2), .4, "Grey", 8)
    box("RoofPack", (6, 5.4, 3), (-15.5, 0, 24.6), "Gold", .3)
    strut("Mast", (-15.5, 0, 25.8), (-15.5, 0, 29), .3, "Grey", 8)
    lathe("Dish", [(0, 0), (0, 1.6), (.5, 2.9), (.9, 3.7), (.9, 0)], "White", (-15.5, 0, 28.8), (.5, -.25, 1), 16)
    strut("DishFeed", (-15.5, 0, 29), (-14.6, -.45, 30.9), .14, "Dark", 6)
    lathe("Beacon", [(0, 0), (0, .9), (1, .9), (1.6, .55), (1.6, 0)], "Red", (8, 0, 24), (0, 0, 1), 12)


def bed(x, y, z):
    box("BedBase", (8.4, 3.4, z - FLOOR + .25), (x, y, (z + FLOOR) / 2), "White", .1)
    box("BedMattress", (7.8, 3, .5), (x, y, z + .45), "Blue", .15)
    box("BedPillow", (1.5, 2.4, .4), (x - 3.0, y, z + .85), "White", .12)
    box("BedBlanket", (3.6, 3.1, .15), (x + 1.8, y, z + .75), "Sky", .04)


def picture(x, y, z, colours):
    """A little framed picture hung on a wall facing the aisle (no words, just colour)."""
    sign = -1 if y > 0 else 1
    box("Frame", (1.5, .1, 1.2), (x, y, z), "Tan", .02)
    box("Picture", (1.2, .05, .9), (x, y + sign * .05, z), colours[0], 0)
    box("PictureHill", (1.2, .05, .35), (x, y + sign * .07, z - .27), colours[1], 0)


def build_interior():
    global GROUP
    F = FLOOR
    GROUP = "INTERIOR"
    # Aisle stripe, so it's easy to see the way through.
    box("AisleStripe", (32, .5, .05), (-4, 0, F + .03), "Yellow", 0)
    box("AisleStripe", (5.5, .5, .05), (15.5, 0, F + .03), "Yellow", 0)
    for x in (-9, 0.6):
        ring("Rib", x - .35, x + .35, RI - .7, RI + .1, "Blue", (0, 0, ZC))["split"] = True
    box("HatchFrameIn", (.6, 7, .6), (11, 0, F + 9.6), "Grey", .08)

    # Sleep bay: one bed on the south side with the astronaut's personal things around it.
    bed(-15, -6.7, F + 1.6)
    box("Shelf", (8.4, 2, .25), (-15, -7.5, F + 5.8), "White", .05)
    for x in (-19.2, -10.8):
        box("ShelfPost", (.3, .3, 5.9), (x, -8.2, F + 2.95), "Grey", .05)
    # Books, a photo, a mug, and an original little robot toy built from spare parts.
    for i, c in enumerate(("Red", "Sky", "Yellow", "Green")):
        box("Book", (.35, 1.1, 1.1 - i * .08), (-18.6 + i * .42, -7.4, F + 6.45), c, .02)
    box("PhotoStand", (1.5, .12, 1.2), (-15.6, -7.8, F + 6.55), "Tan", .02, (math.radians(-10), 0, 0))
    box("Photo", (1.2, .05, .9), (-15.6, -7.7, F + 6.55), "Sky", 0, (math.radians(-10), 0, 0))
    box("ToyBody", (.8, .7, .7), (-12.8, -7.4, F + 6.3), "Tan", .1)
    box("ToyHead", (.6, .5, .5), (-12.8, -7.4, F + 6.9), "Tan", .1)
    for dx in (-.14, .14):
        box("ToyEye", (.1, .05, .1), (-12.8 + dx, -7.13, F + 6.95), "Dark", 0)
    lathe("BedsideMug", [(0, 0), (0, .28), (.5, .3), (.5, 0)], "Red", (-11.6, -7.3, F + 5.93), (0, 0, 1), 10)
    picture(-16.8, -9.85, F + 8.8, ("Blue", "Green"))
    picture(-13.2, -9.85, F + 8.8, ("Sky", "Yellow"))
    # Slippers under the end of the bed, for the warm side of the airlock.
    for dy in (-.45, .45):
        box("Slipper", (1, .55, .35), (-10.1, -5.9 + dy, F + .18), "Red", .1)
    # Soft white cargo bags, the way stowage really arrives on the Space Station.
    for x, y, z, sz in ((-19.5, -2.7, 1.2, 2.4), (-19.5, 2.8, 1.2, 2.4), (-19.4, 2.8, 3.3, 1.8)):
        box("CargoBag", (2, sz, z * 2 if z < 2 else 1.7), (x, y, F + z), "White", .3)
        box("CargoStrap", (2.05, .2, (z * 2 if z < 2 else 1.7) + .05), (x, y, F + z), "Sky", .03)

    # Exercise corner: astronauts must work out daily or their muscles and bones weaken.
    box("TreadmillBase", (7.4, 3, .8), (-15, 6.7, F + .4), "Dark", .15)
    box("TreadmillBelt", (6.6, 2.3, .06), (-15, 6.7, F + .82), "Grey", 0)
    for y in (5.4, 8):
        strut("TreadmillArm", (-11.8, y, F + .8), (-11.8, y, F + 4.4), .16, "Grey", 8)
    strut("TreadmillBar", (-11.8, 5.4, F + 4.4), (-11.8, 8, F + 4.4), .16, "Yellow", 8)
    box("TreadmillScreen", (.2, 1.7, 1.1), (-11.7, 6.7, F + 4.95), "Glow", .03)
    # A harness on bungee cords holds you down, because low gravity makes running floaty.
    for y in (5.8, 7.6):
        strut("Bungee", (-15, y, F + .85), (-15, y, F + 2.8), .06, "Red", 6)
    box("Harness", (1.1, 2.1, .3), (-15, 6.7, F + 2.95), "Blue", .08)
    # A small original guitar on the wall, in the spirit of real instruments flown in space.
    lathe("GuitarBody", [(0, 0), (0, .55), (.3, .75), (.65, .5), (1.0, .68), (1.3, .35), (1.35, 0)], "Tan",
          (-18.3, 9.6, F + 5.4), (0, 0, 1), 10)
    strut("GuitarNeck", (-18.3, 9.6, F + 6.7), (-18.3, 9.6, F + 8.5), .12, "Dark", 6)
    for z in (F + 7.2, F + 8):
        box("Poster", (1.9, .08, .05), (-16.4, 10.05, z), "Yellow", 0)
    box("Poster", (2.3, .05, 2), (-16.4, 10.1, F + 7.6), "Blue", 0)
    lathe("PosterMoon", [(0, 0), (0, .55), (.05, .55), (.05, 0)], "White", (-15.9, 10.0, F + 8), (0, -1, 0), 10)

    # Galley table with one chair, plus lunch and a tablet at the astronaut's place.
    lathe("TableTop", [(0, 0), (0, 2.4), (.3, 2.6), (.55, 2.4), (.55, 0)], "White", (-3.5, 0, F + 2.5), (0, 0, 1), 18)
    strut("TablePost", (-3.5, 0, F), (-3.5, 0, F + 2.6), .4, "Grey", 10)
    lathe("TableBase", [(0, 0), (0, 1.3), (.25, .9), (.25, 0)], "Grey", (-3.5, 0, F), (0, 0, 1), 14)
    strut("ChairPost", (.2, 0, F), (.2, 0, F + 1.5), .22, "Grey", 8)
    lathe("ChairSeat", [(0, 0), (0, .95), (.35, .95), (.5, .7), (.5, 0)], "Red", (.2, 0, F + 1.4), (0, 0, 1), 12)
    box("ChairBack", (.3, 1.7, 1.7), (1.1, 0, F + 2.9), "Red", .12)
    strut("ChairBackPost", (.95, 0, F + 1.5), (1.1, 0, F + 2.2), .12, "Grey", 6)
    lathe("Plate", [(0, 0), (0, .55), (.08, .7), (.1, 0)], "White", (-2, 0, F + 3.05), (0, 0, 1), 12)
    box("Tablet", (.8, 1.1, .06), (-2.9, -1.2, F + 3.08), "Glow", .01)
    lathe("TableMug", [(0, 0), (0, .25), (.45, .28), (.45, 0)], "Sky", (-2.2, 1.1, F + 3.05), (0, 0, 1), 10)
    lathe("TablePot", [(0, 0), (0, .3), (.45, .4), (.45, 0)], "Tan", (-4.6, .3, F + 3.05), (0, 0, 1), 8)
    lathe("TablePlant", [(0, 0), (0, .3), (.4, .5), (.8, .25), (1, 0)], "Green", (-4.6, .3, F + 3.5), (0, 0, 1), 6)
    # Fire extinguisher and first aid, always within reach on a real station.
    strut("Extinguisher", (-8.3, 6.8, F + .8), (-8.3, 6.8, F + 3), .32, "Red", 10)
    box("FirstAid", (1.6, .5, 1.1), (-8.3, -9.9, F + 7.6), "White", .08)
    box("FirstAidBar", (.8, .06, .22), (-8.3, -9.62, F + 7.6), "Red", 0)
    box("FirstAidBar", (.22, .06, .8), (-8.3, -9.62, F + 7.6), "Red", 0)

    # STORM SHELTER: the sleep bay core, like real plans to shelter crew behind stored water
    # and supplies. A floor ring shows where to stand, a panel starts the shelter.
    GROUP = "STATION_Shelter"
    ring("ShelterRing", 0, .06, 2.5, 3.2, "Yellow", (-15, 0, F), (0, 0, 1), 20)
    box("ShelterPanel", (.4, 3.8, 3.4), (-20.2, 0, F + 4), "White", .1)
    box("ShelterScreen", (.1, 2.8, 1.5), (-19.97, 0, F + 4.6), "Glow", .02)
    lathe("ShelterButton", [(0, 0), (0, .55), (.25, .45), (.3, 0)], "Red", (-20, 0, F + 3.1), (1, 0, 0), 12)

    # FOOD: food lockers, water station and the grow rack, like the Space Station's Veggie.
    GROUP = "STATION_Food"
    for i in range(4):
        x = -7 + i * 2.2
        box("FoodLocker", (2, 1.4, 6.4), (x, -8.0, F + 3.2), "White", .12)
        box("LockerTag", (1.2, .1, .7), (x, -7.26, F + 4.8), ("Sky", "Red", "Yellow", "Green")[i], .02)
        box("LockerHandle", (.9, .15, .18), (x, -7.2, F + 3.3), "Dark", .02)
    box("WaterCounter", (8, 1.8, 3), (-3.5, 7.7, F + 1.5), "Grey", .15)
    box("WaterTop", (8.2, 2, .25), (-3.5, 7.7, F + 3.1), "White", .05)
    lathe("WaterTank", [(0, 0), (0, .8), (2.6, .8), (3, .5), (3, 0)], "Sky", (-5.6, 7.8, F + 3.2), (0, 0, 1), 12)
    box("WaterTap", (.5, 1, .6), (-2.8, 7.5, F + 4), "Dark", .05)
    box("PlantChamber", (4.6, 1.8, 6.2), (3.8, -7.8, F + 3.1), "White", .15)
    box("PlantWindow", (3.8, .1, 2.0), (3.8, -6.9, F + 4.4), "Glass", .02)
    box("PlantLight", (3.6, .15, .2), (3.8, -6.84, F + 5.6), "Glow", .02)
    for i in range(4):
        lathe("Plant", [(0, 0), (0, .5), (.5, .7), (.9, .35), (1.1, 0)], "Green", (2.5 + i * .85, -6.7, F + 3.5), (0, 0, 1), 6)

    # COMMS: console with screens, and a Moon rock waiting to be reported home.
    GROUP = "STATION_Comms"
    box("CommsBench", (5.6, 2.6, 3), (4.6, 7.3, F + 1.5), "White", .15)
    box("CommsTop", (5.8, 2.8, .25), (4.6, 7.3, F + 3.1), "Dark", .05)
    for x in (3.3, 5.9):
        box("Screen", (2.3, .2, 1.8), (x, 8.0, F + 5.1), "Glow", .03, (math.radians(-12), 0, 0))
        box("ScreenFrame", (2.7, .15, 2.2), (x, 8.2, F + 5.1), "Dark", .03, (math.radians(-12), 0, 0))
    lathe("RockSample", [(0, 0), (0, .55), (.5, .75), (.9, .45), (1.1, 0)], "Grey", (6.4, 6.9, F + 3.2), (0, 0, 1), 6)

    # POWER: a breaker cabinet with one coloured bar for each thing that needs power.
    GROUP = "STATION_Power"
    box("PowerCabinet", (3, 1.8, 7.4), (9, 7.7, F + 3.7), "Dark", .15)
    box("PowerScreen", (2.3, .1, 1.4), (9, 6.78, F + 6.3), "Glow", .02)
    for i, c in enumerate(("Red", "Sky", "Yellow", "Green")):
        box("PowerBar", (.42, .12, 3), (7.95 + i * .7, 6.76, F + 3.4), c, .02)

    # LIFE SUPPORT: air and water recycling racks with status lights.
    GROUP = "STATION_LifeSupport"
    box("AirRack", (4, 1.8, 7), (8.4, -7.8, F + 3.5), "Grey", .15)
    for z in (F + 1.8, F + 3.8, F + 5.8):
        strut("AirCylinder", (6.8, -6.75, z), (10, -6.75, z), .55, "Sky", 10)
    box("StatusLight", (.4, .1, .4), (10.0, -6.86, F + 6.9), "Green", .02)
    box("StatusLight", (.4, .1, .4), (9.2, -6.86, F + 6.9), "Red", .02)

    # Lab odds and ends: 3D printer for spare parts (the Space Station has one), tool bag,
    # a bench mug and sample trays. They sit in the lab but belong to no station.
    GROUP = "INTERIOR"
    box("PrinterBody", (1.9, 1.7, 1.8), (2.7, 7.6, F + 4.15), "White", .1)
    box("PrinterWindow", (1.4, .06, .9), (2.7, 6.73, F + 4.25), "Glass", 0)
    box("PrinterPart", (.45, .3, .35), (2.7, 7.0, F + 3.95), "Sky", .03)
    box("ToolBag", (1.2, .8, .55), (6.6, 6.4, F + 3.5), "Red", .1)
    for i in range(3):
        box("SampleTray", (1.5, 1, .22), (-.4, 7.7, F + 3.35 + i * .3), ("Sky", "White", "Yellow")[i], .03)
    # Stowage rack on the galley wall.
    for x in (-5.5, -2.2, 1):
        box("WallBox", (2.8, 1.5, 1.7), (x, 9.3, F + 5.9), "White", .15)
        box("WallBoxTag", (1.1, .06, .35), (x, 8.52, F + 5.9), "Sky", 0)
    # A clock wall panel showing Earth time.
    box("EarthClock", (1.8, .1, .9), (-5.4, 10.0, F + 7.8), "Dark", .03)
    box("EarthClockFace", (1.5, .05, .6), (-5.4, 9.94, F + 7.8), "Glow", 0)

    # MAP TABLE: a glowing table in the lab for sending robots to work outside.
    GROUP = "STATION_MapTable"
    box("MapBase", (4.6, 2.8, 2.9), (6.2, 0, F + 1.45), "Grey", .2)
    box("MapTop", (5.2, 3.4, .3), (6.2, 0, F + 3), "Dark", .08)
    box("MapGlow", (4.6, 2.8, .05), (6.2, 0, F + 3.17), "Glow", 0)
    box("MapRidge", (2.2, .5, .1), (6.0, .2, F + 3.22), "Sky", 0, (0, 0, math.radians(35)))

    # AIRLOCK: suit lockers either side of the way out.
    GROUP = "STATION_Airlock"
    for s in (-1, 1):
        box("SuitLocker", (3, 1.2, 6), (15.2, s * 3.6, F + 3), "White", .15)
        box("SuitDoorStripe", (.25, .1, 5.4), (15.2, s * 2.96, F + 3), "Red", .02)
    box("SuitPanel", (2, .1, 1.2), (15.2, 2.94, F + 5), "Glow", .02)

    GROUP = "ROOF"
    for x in (-14, -4.2, 5.4):
        box("CeilingLight", (7, 2, .25), (x, 0, 23.3), "Glow", .05)


# Where the player stands to use each station (design units, on the deck).
STANDS = {
    "Shelter": (-15, 0),
    "Food": (-3.5, -5.2),
    "Comms": (4.4, 4.2),
    "Power": (9, 4.6),
    "LifeSupport": (8.4, -5),
    "MapTable": (2.4, 0),
    "Airlock": (15.2, 0),
}


def split_roof():
    """Cut hull, bands and ribs at SPLIT_Z, with the top part joining the ROOF group."""
    for ob in list(coll.objects):
        if not ob.get("split"):
            continue
        del ob["split"]
        cutter = box("RoofCut", (80, 60, 30), (0, 0, SPLIT_Z + 15), "White", 0)
        top = copy(ob, ob.name + "Top")
        boolean(top, copy(cutter, "RoofCutCopy"), 'INTERSECT')
        top["group"] = "ROOF"
        boolean(ob, cutter, 'DIFFERENCE')


def join_by_group():
    """One mesh per group and colour, parented to an empty for each station."""
    groups = {}
    for ob in coll.objects:
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
        groups.setdefault((ob["group"], ob.data.materials[0].name), []).append(ob)
    parents = {}
    for (group, mat), obs in groups.items():
        bm = bmesh.new()
        for ob in obs:
            bm.from_mesh(ob.data)
        me = bpy.data.meshes.new(group + "_" + mat[2:])
        bm.to_mesh(me)
        bm.free()
        me.materials.append(bpy.data.materials[mat])
        for ob in obs:
            bpy.data.objects.remove(ob)
        ob = bpy.data.objects.new(me.name, me)
        coll.objects.link(ob)
        if group.startswith("STATION_"):
            if group not in parents:
                parents[group] = bpy.data.objects.new(group, None)
                coll.objects.link(parents[group])
                stand = bpy.data.objects.new(group + "_Stand", None)
                x, y = STANDS[group[len("STATION_"):]]
                stand.location = (x, y, FLOOR)
                stand.empty_display_size = .5
                coll.objects.link(stand)
                stand.parent = parents[group]
            ob.parent = parents[group]


def col(name, x0, x1, y0, y1, z0, z1):
    """An invisible axis-aligned collision box, given by its min and max corners."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
                          @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)))
    me = bpy.data.meshes.new("COL_" + name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("COL_" + name, me)
    ob.hide_render = True
    ob.display_type = 'WIRE'
    coll.objects.link(ob)


def build_colliders():
    F = FLOOR
    # Solid underneath the deck, so nobody walks under the hull.
    col("HullBase", -21, 12, -9.5, 9.5, 0, F)
    col("AirlockBase", 12, 19.4, -5, 5, 0, F)
    # Hull: side walls, back wall, ceiling, and the front wall around the airlock opening.
    col("WallSouth", -23, 12.6, -11.4, -8.6, 3, 25)
    col("WallNorth", -23, 12.6, 8.6, 11.4, 3, 25)
    col("WallBack", -23.6, -20.6, -8.6, 8.6, 3, 25)
    col("Ceiling", -20.6, 12.6, -8.6, 8.6, 22.8, 25)
    col("FrontWallSouth", 11.4, 12.6, -8.6, -4.4, F, 25)
    col("FrontWallNorth", 11.4, 12.6, 4.4, 8.6, F, 25)
    col("FrontWallTop", 11.4, 12.6, -4.4, 4.4, F + 10, 25)
    # Airlock: side walls, ceiling, and the wall around the door.
    col("AirlockSouth", 12.6, 19.4, -7, -4.4, F, 19.5)
    col("AirlockNorth", 12.6, 19.4, 4.4, 7, F, 19.5)
    col("AirlockTop", 12.6, 19.4, -4.4, 4.4, F + 10, 19.5)
    col("DoorSouth", 18.7, 19.6, -4.4, -3.05, F, F + 10)
    col("DoorNorth", 18.7, 19.6, 3.05, 4.4, F, F + 10)
    col("DoorHead", 18.7, 19.6, -3.05, 3.05, F + 8.95, F + 10)
    # Landing and steps outside.
    col("Landing", 19.4, 23.5, -3.2, 3.2, 0, F)
    for i in range(4):
        y = -3.2 - 2.4 * i
        col("Step%d" % (i + 1), 19.5, 23.5, y - 2.4, y, 0, F - 1.5 * (i + 1))
    # Furniture.
    for s, n in ((-1, "South"), (1, "North")):
        col("SuitLocker" + n, 13.7, 16.7, min(s * 3, s * 4.4), max(s * 3, s * 4.4), F, F + 6)
    col("CargoSouth", -20.6, -18.5, -3.9, -1.5, F, F + 2.4)
    col("CargoNorth", -20.6, -18.5, 1.6, 4, F, F + 4.2)
    col("Bed", -19.4, -10.6, -8.6, -5, F, F + 2.4)
    col("Treadmill", -18.8, -11.2, 5.2, 8.6, F, F + 1)
    col("TreadmillBar", -12.1, -11.5, 5.2, 8.2, F, F + 5.6)
    col("Table", -6.1, -0.9, -2.6, 2.6, F, F + 3)
    col("Chair", -.8, 1.3, -1, 1, F, F + 3)
    col("FoodLockers", -8.1, -.4, -8.6, -7.2, F, F + 6.4)
    col("WaterCounter", -7.6, .6, 6.7, 8.6, F, F + 3.2)
    col("Plants", 1.4, 6.2, -8.6, -6.5, F, F + 6.2)
    col("LifeSupport", 6.3, 10.5, -8.6, -6.2, F, F + 7)
    col("Comms", 1.7, 7.5, 6, 8.6, F, F + 3.2)
    col("Power", 7.4, 10.6, 6.7, 8.6, F, F + 7.4)
    col("MapTable", 3.6, 8.8, -1.7, 1.7, F, F + 3.2)
    col("ShelterPanel", -20.6, -19.9, -1.9, 1.9, F, F + 5.7)
    # Outside bits a walking astronaut could bump into.
    for x in (-15, 8):
        for s in (-1, 1):
            col("Foot%d%s" % (abs(x), "N" if s > 0 else "S"), x - 2, x + 2, s * 13.4 - 2, s * 13.4 + 2, 0, 1.2)
    col("Tank", -9, 2.9, -13.8, -10, 3.4, 7)
    col("ServicePack", -8, 1, 9.5, 13.1, 3.4, 7.4)


def to_metres():
    for ob in coll.objects:
        if ob.data:
            ob.data.transform(Matrix.Scale(S, 4))
        ob.location = ob.location * S
        if ob.type == 'EMPTY':
            ob.empty_display_size = .4


def setup():
    global coll
    for n in ("Cube", "Camera", "Light"):
        ob = bpy.data.objects.get(n)
        if ob:
            bpy.data.objects.remove(ob)
    old = bpy.data.collections.get(MODULE)
    if old:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob)
        bpy.data.collections.remove(old)
    # Old meshes keep their names until purged, which would give the new ones a .001 suffix.
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    coll = bpy.data.collections.new(MODULE)
    bpy.context.scene.collection.children.link(coll)


setup()
build_shell()
build_exterior()
build_interior()
split_roof()
join_by_group()
build_colliders()
to_metres()
_meshes = [o for o in coll.objects if o.type == 'MESH']
_look = [o for o in _meshes if not o.name.startswith("COL_")]
_co = [v.co for o in _look for v in o.data.vertices]
result = {
    "triangles": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in _look),
    "colliders": sum(o.name.startswith("COL_") for o in _meshes),
    "nodes": sorted(o.name for o in coll.objects if not o.name.startswith("COL_")),
    "x": (min(c.x for c in _co), max(c.x for c in _co)),
    "y": (min(c.y for c in _co), max(c.y for c in _co)),
    "z": (min(c.z for c in _co), max(c.z for c in _co)),
}
