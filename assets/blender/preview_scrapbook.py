# Renders one clean picture of each outdoor module for the in-game Scrapbook
# (game/public/scrapbook/model-<Name>.jpg). Run it inside modules.blend.
# Each module is shown on its own. The module collections are not part of the render layer, so
# (like preview_modules.py) the script renders stand-ins that share the modules' meshes, hides
# everything else for the render, and puts it all back after.
import math
import os
import bpy
from mathutils import Vector

OUT = bpy.path.abspath("//../../game/public/scrapbook")
MODULES = ["Solar", "Battery", "Digger", "OxygenMaker", "IceDrill", "Antenna", "CargoLander"]
KEEP = {"PreviewGround", "PreviewSun", "PreviewFill"}   # the ground and the two sun lamps stay on
VIEW = Vector((0.85, -1.0, 0.42)).normalized()          # camera sits front-right of the module, a little above
LENS = 50
SIZE = (1200, 900)

scene = bpy.context.scene
before = {
    "hide": {ob.name: ob.hide_render for ob in bpy.data.objects},
    "camera": scene.camera,
    "size": (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage),
    "path": scene.render.filepath,
    "format": scene.render.image_settings.file_format,
    "quality": scene.render.image_settings.quality,
}

stage = bpy.data.collections.new("_scrapbook")
scene.collection.children.link(stage)
cam = bpy.data.objects.new("ScrapbookCam", bpy.data.cameras.new("ScrapbookCam"))
stage.objects.link(cam)
cam.data.lens = LENS
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 86

done = []
try:
    for name in MODULES:
        parts = []
        for src in bpy.data.collections[name].all_objects:
            if src.get("col") or src.type != "MESH":
                continue
            ob = bpy.data.objects.new(src.name + "_S", src.data)
            ob.matrix_world = src.matrix_world
            stage.objects.link(ob)
            parts.append(ob)
        for ob in bpy.data.objects:
            ob.hide_render = not (ob in parts or ob.name in KEEP or ob == cam)
        bpy.context.view_layer.update()
        corners = [ob.matrix_world @ Vector(c) for ob in parts for c in ob.bound_box]
        lo = Vector([min(c[i] for c in corners) for i in range(3)])
        hi = Vector([max(c[i] for c in corners) for i in range(3)])
        mid = (lo + hi) / 2
        radius = max((c - mid).length for c in corners)
        # Far enough back that the whole module fits the shorter side of the picture.
        half_fov = math.atan(24 * SIZE[1] / SIZE[0] / 2 / LENS * 36 / 24)
        cam.location = mid + VIEW * (radius / math.sin(half_fov) * 0.84)
        cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUT, f"model-{name}.jpg")
        bpy.ops.render.render(write_still=True)
        for ob in parts:
            bpy.data.objects.remove(ob)
        done.append(name)
finally:
    for ob in bpy.data.objects:
        if ob.name in before["hide"]:
            ob.hide_render = before["hide"][ob.name]
    scene.camera = before["camera"]
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = before["size"]
    scene.render.filepath = before["path"]
    scene.render.image_settings.file_format = before["format"]
    scene.render.image_settings.quality = before["quality"]
    data = cam.data
    for ob in list(stage.objects):
        bpy.data.objects.remove(ob)
    bpy.data.cameras.remove(data)
    bpy.data.collections.remove(stage)

result = {"rendered": done, "out": OUT}
