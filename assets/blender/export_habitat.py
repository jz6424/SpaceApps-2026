# Exports the Habitat collection to glTF for the browser game. Run after build_habitat.py.
# Y up, 1 unit = 1 metre, door faces +X, steps run toward +Z, transforms applied.
import os
import bpy

coll = bpy.data.collections["Habitat"]
bpy.ops.object.select_all(action="DESELECT")
for ob in coll.objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = next(o for o in coll.objects if o.type == 'MESH')
path = os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/export/Habitat.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_normals=True, export_materials='EXPORT',
                          export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser("~/Projects/BaseRace-NASA/assets/blender/modules.blend"))
result = {"path": path, "size": os.path.getsize(path)}
