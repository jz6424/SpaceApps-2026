# Preview only: warm moon-dust ground, soft sun, cameras outside and inside. Lives in the
# "_preview" collection and is not part of any exported module.
import math
import os
import bpy
from mathutils import Vector

OUT = os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/previews")
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
S = 1.8 / 5.5  # views below are in design units, the model is in metres

old = bpy.data.collections.get("_preview")
if old:
    for ob in list(old.objects):
        bpy.data.objects.remove(ob)
    bpy.data.collections.remove(old)
coll = bpy.data.collections.new("_preview")
scene.collection.children.link(coll)

ground = bpy.data.meshes.new("PreviewGround")
s = 100
ground.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
mat = bpy.data.materials.get("M_PreviewGround") or bpy.data.materials.new("M_PreviewGround")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.25, 0.20, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
ground.materials.append(mat)
coll.objects.link(bpy.data.objects.new("PreviewGround", ground))

# A stand-in crew member, 1.8 m tall, to judge the scale.
guy_mat = bpy.data.materials.get("M_PreviewGuy") or bpy.data.materials.new("M_PreviewGuy")
guy_mat.diffuse_color = (0.9, 0.35, 0.05, 1)
guy_mat.use_nodes = True
guy_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.9, 0.35, 0.05, 1)
for name, loc in (("Guy1", (21.5, 0, 7.5)), ("Guy2", (-3.5, -6.2, 7.5)), ("Guy3", (5, 0, 7.5))):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0] * S, loc[1] * S, (loc[2] + 2.75) * S))
    ob = bpy.context.active_object
    ob.name = "Preview" + name
    ob.scale = (1.2 * S, 2.2 * S, 5.5 * S)
    ob.data.materials.append(guy_mat)
    for c in ob.users_collection:
        c.objects.unlink(ob)
    coll.objects.link(ob)

sun = bpy.data.lights.new("PreviewSun", "SUN")
sun.energy = 3.5
sun.angle = math.radians(12)
sun_ob = bpy.data.objects.new("PreviewSun", sun)
sun_ob.rotation_euler = (math.radians(52), math.radians(-18), math.radians(35))
coll.objects.link(sun_ob)
fill = bpy.data.lights.new("PreviewFill", "SUN")
fill.energy = 1.6
fill.angle = math.radians(30)
fill.use_shadow = False
fill_ob = bpy.data.objects.new("PreviewFill", fill)
fill_ob.rotation_euler = (math.radians(60), math.radians(18), math.radians(215))
coll.objects.link(fill_ob)

for x in (-14, -4, 6, 16):
    lamp = bpy.data.lights.new("PreviewLamp", "POINT")
    lamp.energy = 700 * S * S
    lamp.shadow_soft_size = 2 * S
    lo = bpy.data.objects.new("PreviewLamp", lamp)
    lo.location = (x * S, 0, (18 if x < 12 else 15) * S)
    coll.objects.link(lo)

world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.10, 0.13, 0.22, 1)
bg.inputs["Strength"].default_value = 1.6

scene.render.resolution_x, scene.render.resolution_y = 1280, 900
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"

VIEWS = (
    ("front", (58, -58, 34), (0, 0, 12), 50),
    ("back", (-58, 58, 34), (0, 0, 12), 50),
    ("door", (34, -13, 13), (19, 0, 12), 40),
    ("inside_aft", (10.2, -3, 13.3), (-20, 1, 12), 18),
    ("inside_fwd", (-19, 0, 14), (14, 0, 11.5), 18),
)
paths = []
for name, pos, look, lens in VIEWS:
    cam = bpy.data.cameras.new("PreviewCam_" + name)
    cam.lens = lens
    cam.clip_start = 0.05
    ob = bpy.data.objects.new("PreviewCam_" + name, cam)
    ob.location = Vector(pos) * S
    ob.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(ob)
    scene.camera = ob
    scene.render.filepath = os.path.join(OUT, "Habitat_%s.png" % name)
    bpy.ops.render.render(write_still=True)
    paths.append(scene.render.filepath)

bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/modules.blend"))
result = {"renders": paths}
