# Preview only: renders the astronaut from the front and back, and mid-stride in Walk and Run.
# Run after build_astronaut.py, inside modules.blend.
import math
import os
import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(bpy.data.filepath), "previews")
scene = bpy.context.scene
arm = bpy.data.objects["Astronaut"]
ours = set(bpy.data.collections["Astronaut"].objects)

# Hide everything else from the render, and put it back afterwards.
hidden = [o for o in scene.objects if o not in ours and o.type in ('MESH', 'ARMATURE') and not o.hide_render]
for o in hidden:
    o.hide_render = True
layer = bpy.context.view_layer.layer_collection.children["Astronaut"]
layer.exclude = False

cam = bpy.data.objects.get("PreviewCam_astronaut")
if not cam:
    cam = bpy.data.objects.new("PreviewCam_astronaut", bpy.data.cameras.new("PreviewCam_astronaut"))
    bpy.data.collections["_preview"].objects.link(cam)
cam.data.lens = 50
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = 700, 900

floor = bpy.data.objects.get("PreviewFloor_astronaut")
if not floor:
    me = bpy.data.meshes.new("PreviewFloor_astronaut")
    me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("PreviewFloor_astronaut", me)
    bpy.data.collections["_preview"].objects.link(floor)
floor.hide_render = False
if not floor.data.materials:
    floor.data.materials.append(bpy.data.materials["M_Grey"])


def shot(file, pos, action=None, frame=0):
    arm.animation_data.action = bpy.data.actions[action] if action else None
    if not action:
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
    scene.frame_set(frame)
    look = Vector((0, 0, .92))
    cam.location = pos
    cam.rotation_euler = (look - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, file)
    bpy.ops.render.render(write_still=True)


shot("Astronaut_front.png", (2.6, -4.2, 1.5))
shot("Astronaut_back.png", (-2.6, 4.2, 1.6))
shot("Astronaut_side.png", (5, 0, 1.1))
shot("Astronaut_walk_a.png", (4.6, -1.6, 1.2), "Walk", 7)
shot("Astronaut_walk_b.png", (4.6, -1.6, 1.2), "Walk", 14)
shot("Astronaut_run_a.png", (4.6, -1.6, 1.2), "Run", 5)
shot("Astronaut_run_b.png", (4.6, -1.6, 1.2), "Run", 11)

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0)
    pb.location = (0, 0, 0)
scene.frame_set(0)
floor.hide_render = True
layer.exclude = True
for o in hidden:
    o.hide_render = False
result = {"rendered": 7}
