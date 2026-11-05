"""render_text_logo — extruded 3D text. Runs inside Blender."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
import bpy_common as c  # noqa: E402

a = c.read_args()
scene = c.reset_scene()
c.set_engine(scene, a["engine"], a["samples"], a["seed"])
c.set_output(scene, a["width"], a["height"], a["transparent"])

curve = bpy.data.curves.new("Logo", type="FONT")
curve.body = a["text"]
curve.font = bpy.data.fonts.load(os.path.join(os.environ.get("BLENDER_FONTS_DIR", "/opt/fonts"), f"{a['fontFamily']}.woff"))
curve.align_x = "CENTER"
curve.align_y = "CENTER"
curve.extrude = a["extrude"] * 0.5
curve.bevel_depth = 0.01
curve.bevel_resolution = 2
logo = bpy.data.objects.new("Logo", curve)
logo.rotation_euler = (1.5708, 0, 0)  # stand the text up, facing −Y
scene.collection.objects.link(logo)
logo.data.materials.append(c.principled_material("LogoMat", a["color"], a["metallic"], a["roughness"]))

if a["output"] == "GLB":
    bpy.context.view_layer.objects.active = logo
    logo.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.export_scene.gltf(filepath=a["outPath"], export_format="GLB", use_selection=True)
else:
    c.setup_lighting(scene, "STUDIO")
    c.frame_camera_on(scene, [logo])
    if a["output"] == "ANIMATION_WEBM":
        c.spin_z(logo, a["frames"])
    c.render(scene, a["output"], a["outPath"], a["frames"])
