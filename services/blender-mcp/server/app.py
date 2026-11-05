"""StoryFlow Blender MCP server — Streamable HTTP at /mcp, closed tool list (constitution IV).

No arbitrary-code, asset-search, import-from-web or hosted-generation tools exist here.
Tool params mirror packages/shared/src/schemas/blender-tools.ts and contracts/blender-mcp-tools.md.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AfterValidator, BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import runner, storage

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("blender-mcp")

PORT = int(os.environ.get("MCP_HTTP_PORT", "8000"))

mcp = FastMCP(
    "storyflow-blender",
    host="0.0.0.0",  # reachable only on the compose `internal` network; no published port
    port=PORT,
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[f"blender-mcp:{PORT}", f"localhost:{PORT}", f"127.0.0.1:{PORT}"],
    ),
)

_version_cache: str | None = None


async def _version() -> str:
    global _version_cache
    if _version_cache is None:
        _version_cache = await runner.blender_version()
    return _version_cache


@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "blender": await _version()})


# --- shared param types ------------------------------------------------------------------------


def _even(v: int) -> int:
    if v % 2:
        raise ValueError("must be even")
    return v


Dimension = Annotated[int, Field(ge=64, le=3840), AfterValidator(_even)]
Hex = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Unit = Annotated[float, Field(ge=0, le=1)]
Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]
Engine = Literal["EEVEE", "CYCLES"]
Lighting = Literal["STUDIO", "SUNSET", "NIGHT"]
FontFamily = Literal["Inter", "Merriweather", "JetBrainsMono"]
Samples = Annotated[int, Field(ge=1, le=256)]


class PrimitiveObject(BaseModel):
    shape: Literal["CUBE", "SPHERE", "CYLINDER", "CONE", "TORUS", "PLANE"]
    location: Vec3
    rotation: Vec3
    scale: Vec3
    color: Hex


class Camera(BaseModel):
    location: Vec3
    lookAt: Vec3
    lensMm: Annotated[float, Field(ge=12, le=200)]


MIME = {"STILL_PNG": ("image/png", "png"), "ANIMATION_WEBM": ("video/webm", "webm"), "GLB": ("model/gltf-binary", "glb")}


async def _run(script: str, project_id: str, output_id: str, output: str, args: dict, frames: int) -> dict:
    mime, ext = MIME[output]
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / f"{output_id}.{ext}"
        await runner.run_scene(script, {**args, "output": output, "outPath": str(out_path)})
        if not out_path.exists():
            raise runner.RenderFailed(f"Blender produced no output at {out_path.name}")
        kind = "MODEL_3D" if output == "GLB" else "RENDER_3D"
        key = f"projects/{project_id}/{kind}/{output_id}.{ext}"
        uploaded = await asyncio.to_thread(storage.upload, out_path, key, mime)
    result = {
        "outputs": [
            {
                **uploaded,
                "mimeType": mime,
                "width": args["width"],
                "height": args["height"],
                "frames": frames if output != "STILL_PNG" else 1,
            }
        ],
        "blenderVersion": await _version(),
        "renderMs": int((time.monotonic() - started) * 1000),
    }
    log.info(json.dumps({"msg": "tool done", "script": script, "key": key, "renderMs": result["renderMs"]}))
    return result


# --- tools ------------------------------------------------------------------------------------


@mcp.tool(description="Extruded 3D text logo rendered by headless Blender; uploads to MinIO.")
async def render_text_logo(
    projectId: str,
    outputId: str,
    text: Annotated[str, Field(min_length=1, max_length=40)],
    fontFamily: FontFamily = "Inter",
    extrude: Unit = 0.1,
    color: Hex = "#FFFFFF",
    metallic: Unit = 0.0,
    roughness: Unit = 0.5,
    output: Literal["STILL_PNG", "ANIMATION_WEBM", "GLB"] = "STILL_PNG",
    frames: Annotated[int, Field(ge=1, le=600)] = 1,
    width: Dimension = 1920,
    height: Dimension = 1080,
    engine: Engine = "CYCLES",
    samples: Samples = 32,
    seed: int = 0,
    transparent: bool = True,
) -> dict:
    args = dict(text=text, fontFamily=fontFamily, extrude=extrude, color=color, metallic=metallic,
                roughness=roughness, frames=frames, width=width, height=height, engine=engine,
                samples=samples, seed=seed, transparent=transparent)
    return await _run("text_logo", projectId, outputId, output, args, frames)


@mcp.tool(description="Scene of up to 12 primitive shapes with an explicit camera; uploads to MinIO.")
async def render_primitive_scene(
    projectId: str,
    outputId: str,
    objects: Annotated[list[PrimitiveObject], Field(min_length=1, max_length=12)],
    camera: Camera,
    lighting: Lighting = "STUDIO",
    output: Literal["STILL_PNG", "ANIMATION_WEBM"] = "STILL_PNG",
    frames: Annotated[int, Field(ge=1, le=600)] = 1,
    width: Dimension = 1920,
    height: Dimension = 1080,
    engine: Engine = "CYCLES",
    samples: Samples = 32,
    seed: int = 0,
    transparent: bool = True,
) -> dict:
    args = dict(objects=[o.model_dump() for o in objects], camera=camera.model_dump(), lighting=lighting,
                frames=frames, width=width, height=height, engine=engine, samples=samples, seed=seed,
                transparent=transparent)
    return await _run("primitive_scene", projectId, outputId, output, args, frames)


@mcp.tool(description="360° turntable of an uploaded GLB (MODEL_3D asset in MinIO); outputs transparent WebM.")
async def render_turntable(
    projectId: str,
    outputId: str,
    modelAssetKey: Annotated[str, Field(min_length=1, pattern=r"^projects/[^/]+/MODEL_3D/[^/]+\.glb$")],
    frames: Annotated[int, Field(ge=24, le=600)] = 120,
    lighting: Lighting = "STUDIO",
    width: Dimension = 1920,
    height: Dimension = 1080,
    engine: Engine = "CYCLES",
    samples: Samples = 32,
    seed: int = 0,
    transparent: bool = True,
) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        model_path = Path(tmp) / "model.glb"
        await asyncio.to_thread(storage.download, modelAssetKey, model_path)
        args = dict(modelPath=str(model_path), frames=frames, lighting=lighting, width=width, height=height,
                    engine=engine, samples=samples, seed=seed, transparent=transparent)
        return await _run("turntable", projectId, outputId, "ANIMATION_WEBM", args, frames)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
