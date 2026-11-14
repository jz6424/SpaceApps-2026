# Preview only: lines up the outdoor modules beside a 1.8 m stand-in and renders them.
import math
import os
import bpy
from mathutils import Vector

OUT = os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/previews")
scene = bpy.context.scene
# Two rows, each module turned so its front (+X) angles toward the camera.
LAYOUT = {"CargoLander": (-20, 10), "Solar": (-3, 10), "IceDrill": (8, 10), "Antenna": (19, 10),
          "Battery": (-14, -6), "Digger": (-4, -6), "OxygenMaker": (8, -6)}
YAW = math.radians(-55)

old = bpy.data.collections.get("_lineup")
if old:
    for ob in list(old.objects):
        bpy.data.objects.remove(ob)
    bpy.data.collections.remove(old)
line = bpy.data.collections.new("_lineup")
scene.collection.children.link(line)

guy = bpy.data.objects.get("PreviewGuy1")
for name, (x, y) in LAYOUT.items():
    for src in bpy.data.collections[name].objects:
        if src.get("col"):
            continue
        ob = bpy.data.objects.new(src.name + "_L", src.data)
        ob.location = (x, y, 0)
        ob.rotation_euler = (0, 0, YAW)
        line.objects.link(ob)
g = bpy.data.objects.new("Guy", guy.data)
g.scale = (.45, .45, 1.8)
g.location = (0, -9, .9)
line.objects.link(g)

habitat = bpy.data.collections["Habitat"]
hidden = [o for o in habitat.objects if not o.hide_render]
for o in hidden:
    o.hide_render = True
for n in ("PreviewGuy1", "PreviewGuy2", "PreviewGuy3"):
    if bpy.data.objects.get(n):
        bpy.data.objects[n].hide_render = True

def shot(file, pos, look, lens):
    cam = bpy.data.objects.get("PreviewCam_modules")
    if not cam:
        cam = bpy.data.objects.new("PreviewCam_modules", bpy.data.cameras.new("PreviewCam_modules"))
        line.objects.link(cam) if cam.name not in line.objects else None
    elif cam.name not in line.objects:
        line.objects.link(cam)
    cam.data.lens = lens
    cam.location = pos
    cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, file)
    bpy.ops.render.render(write_still=True)


scene.render.resolution_x, scene.render.resolution_y = 1500, 900
shot("Modules_lineup.png", (2, -46, 22), (1, 1, 2.5), 38)
scene.render.resolution_x, scene.render.resolution_y = 900, 650
for name, (x, y) in LAYOUT.items():
    size = {"CargoLander": 19, "Solar": 15, "IceDrill": 11, "Antenna": 11}.get(name, 7)
    shot("Module_%s.png" % name, (x + size * .15, y - size, size * .55), (x, y, size * .26), 40)

for o in hidden:
    o.hide_render = False
result = {"rendered": list(LAYOUT)}
