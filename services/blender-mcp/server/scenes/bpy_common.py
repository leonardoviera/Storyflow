"""Shared helpers for scene scripts. Runs INSIDE Blender (imports bpy)."""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Vector


def read_args() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def hex_to_rgba(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # Principled BSDF expects linear colour.
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (lin[0], lin[1], lin[2], 1.0)


def reset_scene() -> bpy.types.Scene:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    return bpy.context.scene


def _enum_ids(rna_struct, prop: str) -> list[str]:
    return [i.identifier for i in rna_struct.bl_rna.properties[prop].enum_items]


def set_engine(scene: bpy.types.Scene, requested: str, samples: int, seed: int) -> str:
    """Maps EEVEE/CYCLES to an identifier this Blender build actually exposes (never hardcoded)."""
    available = _enum_ids(bpy.types.RenderSettings, "engine")
    allow_eevee = os.environ.get("BLENDER_ALLOW_EEVEE") == "1"
    if requested == "EEVEE" and allow_eevee:
        candidates = [e for e in available if "EEVEE" in e]
    else:
        candidates = [e for e in available if e == "CYCLES"]
    engine = candidates[0] if candidates else available[0]
    try:
        scene.render.engine = engine
    except TypeError as exc:  # message lists valid engines
        raise RuntimeError(f"cannot set engine {engine}: {exc}") from exc

    if engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        scene.cycles.seed = seed
        scene.cycles.use_animated_seed = False
        scene.cycles.use_adaptive_sampling = False
        scene.cycles.use_denoising = False  # determinism over smoothness
    else:
        eevee = scene.eevee
        if hasattr(eevee, "taa_render_samples"):
            eevee.taa_render_samples = samples
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(os.environ.get("BLENDER_THREADS", "4"))
    return engine


def set_output(scene: bpy.types.Scene, width: int, height: int, transparent: bool) -> None:
    r = scene.render
    r.resolution_x = width
    r.resolution_y = height
    r.resolution_percentage = 100
    r.film_transparent = transparent
    r.use_stamp = False
    # Strip metadata (dates, paths) so identical params give byte-identical files.
    for attr in dir(r):
        if attr.startswith("use_stamp_"):
            try:
                setattr(r, attr, False)
            except (AttributeError, TypeError):
                pass
    scene.view_settings.view_transform = "Standard"


def configure_still_png(scene: bpy.types.Scene) -> None:
    s = scene.render.image_settings
    s.file_format = "PNG"
    s.color_mode = "RGBA"
    s.color_depth = "8"
    s.compression = 90


def configure_webm(scene: bpy.types.Scene) -> None:
    """VP9 WebM with alpha (played by <OffthreadVideo transparent>)."""
    s = scene.render.image_settings
    s.file_format = "FFMPEG"
    ff = scene.render.ffmpeg
    formats = _enum_ids(type(ff), "format")
    if "WEBM" not in formats:
        raise RuntimeError(f"this Blender build has no WEBM container (has {formats})")
    ff.format = "WEBM"
    codecs = _enum_ids(type(ff), "codec")
    ff.codec = "WEBM" if "WEBM" in codecs else codecs[0]
    ff.constant_rate_factor = "HIGH"
    ff.audio_codec = "NONE"
    s.color_mode = "RGBA"


def principled_material(name: str, color: str, metallic: float = 0.0, roughness: float = 0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = hex_to_rgba(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def _area_light(name, location, energy, color=(1, 1, 1), size=4.0):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, Vector((0, 0, 0)))
    return obj


def setup_lighting(scene: bpy.types.Scene, preset: str) -> None:
    """Procedural presets only — no HDRI downloads."""
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    if preset == "SUNSET":
        bg.inputs["Color"].default_value = (0.35, 0.16, 0.08, 1)
        bg.inputs["Strength"].default_value = 0.6
        sun = bpy.data.lights.new("Sun", type="SUN")
        sun.energy = 4.0
        sun.color = (1.0, 0.62, 0.35)
        obj = bpy.data.objects.new("Sun", sun)
        obj.rotation_euler = (math.radians(80), 0, math.radians(35))
        scene.collection.objects.link(obj)
    elif preset == "NIGHT":
        bg.inputs["Color"].default_value = (0.01, 0.015, 0.04, 1)
        bg.inputs["Strength"].default_value = 0.4
        _area_light("Rim", (-4, 4, 3), 600, color=(0.55, 0.65, 1.0))
        _area_light("Fill", (4, -3, 2), 120, color=(0.4, 0.45, 0.8))
    else:  # STUDIO
        bg.inputs["Color"].default_value = (0.05, 0.05, 0.05, 1)
        bg.inputs["Strength"].default_value = 0.5
        _area_light("Key", (4, -4, 5), 900)
        _area_light("Fill", (-5, -2, 3), 300)
        _area_light("Rim", (0, 5, 4), 500)


def look_at(obj, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(scene, location, target, lens_mm: float = 50.0):
    data = bpy.data.cameras.new("Camera")
    data.lens = lens_mm
    cam = bpy.data.objects.new("Camera", data)
    cam.location = Vector(location)
    scene.collection.objects.link(cam)
    look_at(cam, Vector(target))
    scene.camera = cam
    return cam


def world_bbox(objs) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def frame_camera_on(scene, objs, lens_mm: float = 50.0, margin: float = 1.25):
    """Front camera (−Y) sized to fit the objects' bounding box."""
    lo, hi = world_bbox(objs)
    center = (lo + hi) / 2
    size = max(hi.x - lo.x, (hi.z - lo.z) * scene.render.resolution_x / scene.render.resolution_y, 0.1)
    sensor = 36.0
    distance = (size * margin / 2) / math.tan(math.atan(sensor / 2 / lens_mm))
    return add_camera(scene, (center.x, center.y - distance - (hi.y - lo.y) / 2, center.z), center, lens_mm)


def spin_z(obj, frames: int) -> None:
    """Linear 360° rotation about Z over `frames`."""
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    obj.rotation_euler = (obj.rotation_euler.x, obj.rotation_euler.y, 0)
    obj.keyframe_insert("rotation_euler", index=2, frame=1)
    obj.rotation_euler.z = math.radians(360) * frames / (frames + 1)
    obj.keyframe_insert("rotation_euler", index=2, frame=frames)
    action = obj.animation_data.action
    fcurves = getattr(action, "fcurves", None) or []
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def render(scene, output: str, out_path: str, frames: int) -> None:
    if output == "ANIMATION_WEBM":
        configure_webm(scene)
        scene.frame_start = 1
        scene.frame_end = max(frames, 1)
        scene.render.filepath = out_path
        scene.render.use_file_extension = False
        bpy.ops.render.render(animation=True)
    else:
        configure_still_png(scene)
        scene.frame_set(1)
        scene.render.filepath = out_path
        scene.render.use_file_extension = False
        bpy.ops.render.render(write_still=True)
