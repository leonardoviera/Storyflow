"""render_turntable — 360° spin of a GLB already downloaded from MinIO. Runs inside Blender."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
import bpy_common as c  # noqa: E402

a = c.read_args()
scene = c.reset_scene()
c.set_engine(scene, a["engine"], a["samples"], a["seed"])
c.set_output(scene, a["width"], a["height"], a["transparent"])

bpy.ops.import_scene.gltf(filepath=a["modelPath"])
meshes = [o for o in scene.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("model contains no meshes")

pivot = bpy.data.objects.new("Pivot", None)
scene.collection.objects.link(pivot)
for o in scene.objects:
    if o is not pivot and o.parent is None:
        o.parent = pivot

# Centre on the origin and scale to a 2-unit bounding box.
lo, hi = c.world_bbox(meshes)
size = max((hi - lo).x, (hi - lo).y, (hi - lo).z, 1e-6)
pivot.scale = (2 / size,) * 3
bpy.context.view_layer.update()
lo, hi = c.world_bbox(meshes)
pivot.location = -((lo + hi) / 2)

c.setup_lighting(scene, a["lighting"])
c.frame_camera_on(scene, meshes, margin=1.6)
c.spin_z(pivot, a["frames"])
c.render(scene, "ANIMATION_WEBM", a["outPath"], a["frames"])
