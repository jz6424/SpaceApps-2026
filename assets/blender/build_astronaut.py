# Builds the astronaut in Blender, rigs it, animates Idle, Walk and Run, and exports
# export/Astronaut.glb. Run it inside modules.blend (it finds the folder from the open file).
#
# Same chunky, flat-colour style as the Habitat and the modules. The suit follows the surface
# suits NASA is developing for Artemis (xEMU and Axiom's AxEMU):
#   - white outer layer, which reflects sunlight so the suit stays cool
#   - a wide helmet bubble with a gold sun visor (a thin gold coating blocks glare, heat and UV),
#     plus helmet lights and a camera
#   - a hard upper torso with the display and control unit on the chest
#   - the portable life support backpack: oxygen, CO2 removal, cooling water, radio
#   - bearings at the shoulders, waist, hips, knees and ankles so the crew can walk and kneel
#     (Apollo suits could barely bend at the waist)
#   - red stripes on the arms and legs, which mark the commander on camera
#   - thick insulated boots for ground that can be colder than -200 C in the shadows
#
# The moves follow how people move in one-sixth gravity:
#   Walk  a slow step with a forward lean (the backpack pulls the centre of mass back) and small
#         joint angles, because a pressurised suit resists bending
#   Run   the "lunar lope" Apollo crews found fastest: long bounding strides with a long float
#         between each push-off, elbows bent
#   Idle  a small sway
#
# Units are metres, 1.8 m tall. Z up in Blender, Y up in the export. Pivot between the feet on
# the ground. The astronaut faces -Y in Blender, which is +Z in the export (the way three.js
# characters face). Animations play in place: the game moves the character.
#
# In the file: one armature "Astronaut", one skinned mesh per colour "Astronaut_<Colour>", and
# animations named Idle, Walk and Run that loop.
import math
import os
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(ROOT, "export", "Astronaut.glb")
NAME = "Astronaut"
HEIGHT = 1.8
FPS = 24


def srgb(r, g, b):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1)


# The same colours as build_modules.py.
PALETTE = {
    "White": (236, 238, 242),
    "Grey": (150, 156, 166),
    "Dark": (60, 64, 72),
    "Blue": (0, 66, 166),
    "Sky": (46, 150, 245),
    "Red": (228, 55, 0),
    "Gold": (214, 170, 60),
    "Green": (70, 170, 80),
    "Glow": (255, 250, 225),
}


def material(name):
    full = "M_" + name
    mat = bpy.data.materials.get(full) or bpy.data.materials.new(full)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(*PALETTE[name])
    # The visor is a little shinier than the suit. It is not set as metal: the game has no sky
    # reflection map, and metal with nothing to reflect draws nearly black.
    bsdf.inputs["Roughness"].default_value = 0.35 if name == "Gold" else 0.65
    bsdf.inputs["Metallic"].default_value = 0
    if name == "Glow":
        bsdf.inputs["Emission Color"].default_value = srgb(*PALETTE[name])
        bsdf.inputs["Emission Strength"].default_value = 3
    mat.diffuse_color = srgb(*PALETTE[name])
    return mat


# Geometry is collected per colour, with the bone each piece follows, and turned into one
# skinned mesh per colour at the end.
parts = {}


def keep(bm, mat, bone, matrix):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bucket = parts.setdefault(mat, {"verts": [], "faces": [], "bones": []})
    start = len(bucket["verts"])
    bm.verts.ensure_lookup_table()
    bucket["verts"] += [tuple(matrix @ v.co) for v in bm.verts]
    bucket["faces"] += [[start + v.index for v in f.verts] for f in bm.faces]
    bucket["bones"] += [bone] * len(bm.verts)
    bm.free()


def axis_matrix(pos, direction):
    rot = Vector((1, 0, 0)).rotation_difference(Vector(direction).normalized())
    return Matrix.Translation(pos) @ rot.to_matrix().to_4x4()


def lathe(bone, profile, mat, pos, direction=(0, 0, 1), sides=10, squash=(1, 1)):
    """Revolve (along, radius) points around the axis. squash flattens the two side axes."""
    bm = bmesh.new()
    rings = []
    for x, r in profile:
        if r == 0:
            continue
        rings.append([bm.verts.new((x, squash[0] * r * math.cos(2 * math.pi * (i + .5) / sides),
                                    squash[1] * r * math.sin(2 * math.pi * (i + .5) / sides))) for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            bm.faces.new((a[i], b[i], b[(i + 1) % sides], a[(i + 1) % sides]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    keep(bm, mat, bone, axis_matrix(pos, direction))


def box(bone, size, pos, mat, bevel=0.03, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((*size, 1)))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1,
                        affect='EDGES', profile=0.5)
    keep(bm, mat, bone, Matrix.Translation(pos) @ Euler(rot).to_matrix().to_4x4())


def ball(bone, radius, pos, mat, sides=10, squash=(1, 1, 1)):
    """A low-poly ball: used for the bearings, so limbs can bend without opening a gap."""
    steps = 5
    profile = [(-radius * math.cos(math.pi * i / steps), radius * math.sin(math.pi * i / steps)) for i in range(1, steps)]
    profile = [(-radius * squash[2], 0)] + [(x * squash[2], r) for x, r in profile] + [(radius * squash[2], 0)]
    lathe(bone, profile, mat, pos, (0, 0, 1), sides, squash[:2])


# --- Sizes. Where each joint turns (also where the bones start). ---
LEG_X = 0.15
HIP_Z, KNEE_Z, ANKLE_Z = 0.80, 0.46, 0.15
WAIST_Z, NECK_Z = 0.92, 1.34
ARM_X, SHOULDER_Z, ELBOW_Z = 0.37, 1.24, 0.98

BONES = {
    # name: (parent, pivot)
    "Hips": (None, (0, 0, 0.86)),
    "Spine": ("Hips", (0, 0, WAIST_Z)),
    "Head": ("Spine", (0, 0, NECK_Z)),
    "ArmL": ("Spine", (ARM_X, 0, SHOULDER_Z)),
    "ForearmL": ("ArmL", (ARM_X, 0, ELBOW_Z)),
    "ArmR": ("Spine", (-ARM_X, 0, SHOULDER_Z)),
    "ForearmR": ("ArmR", (-ARM_X, 0, ELBOW_Z)),
    "ThighL": ("Hips", (LEG_X, 0, HIP_Z)),
    "ShinL": ("ThighL", (LEG_X, 0, KNEE_Z)),
    "FootL": ("ShinL", (LEG_X, 0, ANKLE_Z)),
    "ThighR": ("Hips", (-LEG_X, 0, HIP_Z)),
    "ShinR": ("ThighR", (-LEG_X, 0, KNEE_Z)),
    "FootR": ("ShinR", (-LEG_X, 0, ANKLE_Z)),
}


def build_body():
    # Pelvis and waist bearing.
    lathe("Hips", [(0.72, 0), (0.72, .20), (0.78, .25), (0.90, .25), (0.93, .22), (0.93, 0)], "White", (0, 0, 0), sides=12, squash=(1, .8))
    lathe("Spine", [(0.90, 0), (0.90, .235), (0.96, .235), (0.96, 0)], "Grey", (0, 0, 0), sides=12, squash=(1, .8))

    # Hard upper torso: wide at the shoulders, with the neck ring on top.
    lathe("Spine", [(0.95, 0), (0.95, .24), (1.05, .29), (1.25, .30), (1.32, .24), (1.34, .2), (1.34, 0)], "White", (0, 0, 0), sides=12, squash=(1, .72))
    lathe("Spine", [(1.33, 0), (1.33, .215), (1.38, .215), (1.38, 0)], "Grey", (0, 0, 0), sides=12)

    # Display and control unit on the chest: screen, two knobs, a status light.
    box("Spine", (.26, .09, .17), (0, -.235, 1.10), "Grey")
    box("Spine", (.12, .02, .08), (-.045, -.285, 1.12), "Sky", bevel=.01)
    box("Spine", (.04, .03, .04), (.075, -.285, 1.14), "Red", bevel=.01)
    box("Spine", (.04, .03, .04), (.075, -.285, 1.08), "Green", bevel=.01)
    box("Spine", (.2, .02, .025), (0, -.285, 1.035), "Dark", bevel=.008)

    # Portable life support backpack, with its radio antenna and a blue service panel.
    box("Spine", (.50, .24, .66), (0, .30, 1.14), "White", bevel=.05)
    box("Spine", (.36, .03, .30), (0, .425, 1.22), "Blue", bevel=.012)
    box("Spine", (.36, .03, .10), (0, .425, .94), "Grey", bevel=.012)
    box("Spine", (.52, .26, .05), (0, .30, 1.40), "Red", bevel=.015)
    lathe("Spine", [(0, 0), (0, .014), (.3, .014), (.3, 0)], "Dark", (.19, .36, 1.47), sides=6)
    ball("Spine", .03, (.19, .36, 1.79), "Red", sides=6)
    # Straps that hold the backpack to the torso.
    box("Spine", (.07, .34, .04), (.2, .06, 1.325), "Grey", bevel=.012)
    box("Spine", (.07, .34, .04), (-.2, .06, 1.325), "Grey", bevel=.012)

    # Helmet: a white shell, open at the front, with the gold sun visor filling the opening.
    ball("Head", .31, (0, .02, 1.63), "White", sides=12, squash=(1, 1, .95))
    ball("Head", .27, (0, -.1, 1.63), "Gold", sides=12, squash=(1, .8, .84))
    lathe("Head", [(0, 0), (0, .25), (.04, .25), (.04, 0)], "Dark", (0, -.225, 1.63), (0, -1, 0), sides=12, squash=(.88, 1.04))
    # Lights on both sides and a camera on the right.
    for side in (1, -1):
        box("Head", (.06, .11, .08), (side * .31, -.07, 1.72), "Grey", bevel=.014)
        box("Head", (.04, .02, .05), (side * .31, -.128, 1.72), "Glow", bevel=.006)
    box("Head", (.07, .13, .07), (-.22, -.07, 1.895), "Dark", bevel=.014)
    box("Head", (.04, .02, .04), (-.22, -.138, 1.895), "Sky", bevel=.006)


def build_arm(side, s):
    x = s * ARM_X
    ball("Spine", .115, (x - s * .03, 0, SHOULDER_Z), "Grey", sides=10)
    lathe("Arm" + side, [(ELBOW_Z + .02, 0), (ELBOW_Z + .02, .085), (SHOULDER_Z - .04, .1), (SHOULDER_Z - .04, 0)], "White", (x, 0, 0))
    lathe("Arm" + side, [(1.08, 0), (1.08, .098), (1.13, .1), (1.13, 0)], "Red", (x, 0, 0))
    ball("Forearm" + side, .092, (x, 0, ELBOW_Z), "Grey", sides=10)
    lathe("Forearm" + side, [(.77, 0), (.77, .075), (ELBOW_Z - .03, .085), (ELBOW_Z - .03, 0)], "White", (x, 0, 0))
    lathe("Forearm" + side, [(.74, 0), (.74, .082), (.78, .082), (.78, 0)], "Grey", (x, 0, 0))
    # Glove: a mitt and a thumb pointing forward.
    box("Forearm" + side, (.13, .15, .15), (x, -.01, .665), "Dark", bevel=.04)
    box("Forearm" + side, (.05, .07, .07), (x - s * .07, -.06, .70), "Dark", bevel=.02)


def build_leg(side, s):
    x = s * LEG_X
    ball("Thigh" + side, .13, (x, 0, HIP_Z - .02), "Grey", sides=10)
    lathe("Thigh" + side, [(KNEE_Z + .03, 0), (KNEE_Z + .03, .115), (HIP_Z - .05, .135), (HIP_Z - .05, 0)], "White", (x, 0, 0))
    lathe("Thigh" + side, [(.60, 0), (.60, .128), (.66, .132), (.66, 0)], "Red", (x, 0, 0))
    ball("Shin" + side, .122, (x, 0, KNEE_Z), "Grey", sides=10)
    lathe("Shin" + side, [(ANKLE_Z + .04, 0), (ANKLE_Z + .04, .105), (KNEE_Z - .04, .115), (KNEE_Z - .04, 0)], "White", (x, 0, 0))
    lathe("Shin" + side, [(ANKLE_Z, 0), (ANKLE_Z, .115), (ANKLE_Z + .06, .115), (ANKLE_Z + .06, 0)], "Grey", (x, 0, 0))
    # Boot: a tall insulated upper on a thick lugged sole, toe forward.
    box("Foot" + side, (.21, .34, .13), (x, -.05, .115), "White", bevel=.045)
    box("Foot" + side, (.23, .37, .06), (x, -.05, .03), "Dark", bevel=.02)


def make_meshes(coll, arm):
    meshes = []
    for mat, bucket in parts.items():
        me = bpy.data.meshes.new(NAME + "_" + mat)
        me.from_pydata(bucket["verts"], [], bucket["faces"])
        me.materials.append(material(mat))
        ob = bpy.data.objects.new(me.name, me)
        coll.objects.link(ob)
        for bone in BONES:
            ob.vertex_groups.new(name=bone)
        for i, bone in enumerate(bucket["bones"]):
            ob.vertex_groups[bone].add([i], 1, 'REPLACE')
        ob.parent = arm
        ob.modifiers.new("Armature", 'ARMATURE').object = arm
        meshes.append(ob)
    return meshes


def make_armature(coll):
    data = bpy.data.armatures.new(NAME)
    arm = bpy.data.objects.new(NAME, data)
    coll.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    # Every bone points straight up from its joint, so turning it around its X axis swings the
    # limb forward and back, Y twists it and Z tips it sideways.
    for name, (parent, pivot) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head = pivot
        bone.tail = Vector(pivot) + Vector((0, 0, .12))
        bone.roll = 0
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    return arm


# --- Animation. Angles in degrees. Forward is -Y, so a leg swinging forward is a negative X turn. ---
def pose(arm, values):
    for pb in arm.pose.bones:
        rot = values.get(pb.name, (0, 0, 0))
        pb.rotation_euler = [math.radians(a) for a in rot]
    arm.pose.bones["Hips"].location = values.get("hips_at", (0, 0, 0))


def walk(t):
    """A slow low-gravity step: small joint angles, leaning forward, a gentle rise each step."""
    a = 2 * math.pi * t
    out = {"Spine": (7, 0, 0), "Head": (-4, 0, 0)}
    for side, ph in (("L", a), ("R", a + math.pi)):
        thigh = -24 * math.sin(ph)
        knee = 34 * max(0, math.cos(ph)) ** 1.5 + 4
        out["Thigh" + side] = (thigh, 0, 0)
        out["Shin" + side] = (knee, 0, 0)
        out["Foot" + side] = (-(thigh + knee) * .7, 0, 0)
        out["Arm" + side] = (16 * math.sin(ph), 0, 0)
        out["Forearm" + side] = (-14 - 6 * math.sin(ph), 0, 0)
    # Local Y is up, local Z is back.
    out["hips_at"] = (0, -.012 + .022 * abs(math.cos(a)), 0)
    out["Hips"] = (0, 5 * math.sin(a), 2 * math.cos(a))
    out["Spine"] = (7, -6 * math.sin(a), 0)
    return out


def run(t):
    """The lunar lope: push off, then float. The body is highest in the middle of each float."""
    a = 2 * math.pi * t
    out = {}
    for side, ph in (("L", a), ("R", a + math.pi)):
        thigh = -40 * math.sin(ph) - 6
        knee = 62 * max(0, math.cos(ph - .5)) ** 1.3 + 10
        out["Thigh" + side] = (thigh, 0, 0)
        out["Shin" + side] = (knee, 0, 0)
        out["Foot" + side] = (-(thigh + knee) * .45 + 10, 0, 0)
        out["Arm" + side] = (26 * math.sin(ph) - 8, 0, 0)
        out["Forearm" + side] = (-58 - 10 * math.sin(ph), 0, 0)
    # A ball thrown up traces a parabola: sharp at the ground, round at the top.
    out["hips_at"] = (0, -.03 + .14 * abs(math.sin(a)), 0)
    out["Hips"] = (0, 7 * math.sin(a), 0)
    out["Spine"] = (15 + 3 * math.cos(2 * a), -9 * math.sin(a), 0)
    out["Head"] = (-9, 0, 0)
    return out


def idle(t):
    a = 2 * math.pi * t
    out = {"Spine": (3 + 1.2 * math.sin(a), 0, 1 * math.sin(a)), "Head": (-2, 3 * math.sin(a), 0),
           "hips_at": (0, .006 * math.sin(a), 0)}
    for side, s in (("L", 1), ("R", -1)):
        out["Arm" + side] = (2 * math.sin(a), 0, 0)
        out["Forearm" + side] = (-10 - 2 * math.sin(a), 0, 0)
        out["Thigh" + side] = (-2, 0, 0)
        out["Shin" + side] = (4, 0, 0)
        out["Foot" + side] = (-2, 0, 0)
    return out


ANIMATIONS = [("Idle", idle, 72), ("Walk", walk, 28), ("Run", run, 22)]   # name, pose, frames per loop


def animate(arm):
    arm.animation_data_create()
    for name, fn, frames in ANIMATIONS:
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        for frame in range(0, frames + 1):
            pose(arm, fn(frame / frames))
            for pb in arm.pose.bones:
                pb.keyframe_insert("rotation_euler", frame=frame)
            arm.pose.bones["Hips"].keyframe_insert("location", frame=frame)
        action.use_fake_user = True
        # One NLA track per move: the exporter writes each track as its own animation.
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        track.mute = True
        arm.animation_data.action = None
    pose(arm, {})


def build():
    old = bpy.data.collections.get(NAME)
    if old:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob)
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.armatures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    coll = bpy.data.collections.new(NAME)
    bpy.context.scene.collection.children.link(coll)

    parts.clear()
    build_body()
    for side, s in (("L", 1), ("R", -1)):
        build_arm(side, s)
        build_leg(side, s)
    # The helmet is drawn big, toon style, so shrink the whole figure to stand 1.8 m tall.
    top = max(v[2] for bucket in parts.values() for v in bucket["verts"])
    k = HEIGHT / top
    for bucket in parts.values():
        bucket["verts"] = [(x * k, y * k, z * k) for x, y, z in bucket["verts"]]
    for name, (parent, pivot) in BONES.items():
        BONES[name] = (parent, tuple(c * k for c in pivot))
    arm = make_armature(coll)
    meshes = make_meshes(coll, arm)
    animate(arm)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.context.scene.render.fps = FPS
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_normals=True, export_materials='EXPORT',
                              export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_frame_step=1)
    # Keep it out of the shared viewport, like the modules, and save the scene.
    bpy.context.view_layer.layer_collection.children[NAME].exclude = True
    bpy.ops.wm.save_mainfile()
    co = [Vector(v) for bucket in parts.values() for v in bucket["verts"]]
    return {
        "tris": sum(len(f) - 2 for bucket in parts.values() for f in bucket["faces"]),
        "meshes": [m.name for m in meshes],
        "bones": len(arm.data.bones),
        "size": [round(max(c[i] for c in co) - min(c[i] for c in co), 2) for i in range(3)],
        "min": [round(min(c[i] for c in co), 2) for i in range(3)],
        "kb": os.path.getsize(OUT) // 1024,
    }


result = build()
