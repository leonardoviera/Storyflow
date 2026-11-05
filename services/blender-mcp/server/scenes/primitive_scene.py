"""render_primitive_scene — up to 12 primitives + explicit camera. Runs inside Blender."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
import bpy_common as c  # noqa: E402

ADD = {
    "CUBE": lambda: bpy.ops.mesh.primitive_cube_add(size=1),
    "SPHERE": lambda: bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=48, ring_count=24),
    "CYLINDER": lambda: bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=48),
    "CONE": lambda: bpy.ops.mesh.primitive_cone_add(radius1=0.5, depth=1, vertices=48),
    "TORUS": lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.5, minor_radius=0.15),
    "PLANE": lambda: bpy.ops.mesh.primitive_plane_add(size=1),
}

a = c.read_args()
scene = c.reset_scene()
c.set_engine(scene, a["engine"], a["samples"], a["seed"])
c.set_output(scene, a["width"], a["height"], a["transparent"])

pivot = bpy.data.objects.new("Pivot", None)
scene.collection.objects.link(pivot)

for i, spec in enumerate(a["objects"]):
    ADD[spec["shape"]]()
    obj = bpy.context.active_object
    obj.name = f"Obj{i}"
    obj.location = spec["location"]
    obj.rotation_euler = [math.radians(v) for v in spec["rotation"]]
    obj.scale = spec["scale"]
    obj.data.materials.append(c.principled_material(f"Mat{i}", spec["color"]))
    obj.parent = pivot

c.setup_lighting(scene, a["lighting"])
cam = a["camera"]
c.add_camera(scene, cam["location"], cam["lookAt"], cam["lensMm"])
if a["output"] == "ANIMATION_WEBM":
    c.spin_z(pivot, a["frames"])
c.render(scene, a["output"], a["outPath"], a["frames"])
