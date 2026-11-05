"""Runs one headless Blender process per tool call (one at a time, hard timeout)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("blender-mcp.runner")

BLENDER_BIN = os.environ.get("BLENDER_BIN", "/usr/bin/blender")
BLENDER_THREADS = int(os.environ.get("BLENDER_THREADS", "4"))
SCENES_DIR = Path(__file__).parent / "scenes"
TIMEOUT_SECONDS = 300

_lock = asyncio.Lock()


class RenderTimeout(Exception):
    """Mapped to MCP error -32001 RENDER_TIMEOUT."""

    code = -32001


class RenderFailed(Exception):
    pass


async def blender_version() -> str:
    proc = await asyncio.create_subprocess_exec(
        BLENDER_BIN, "--version", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
    )
    out, _ = await proc.communicate()
    first = out.decode(errors="replace").strip().splitlines()[:1]
    return first[0].replace("Blender ", "") if first else "unknown"


async def run_scene(script: str, args: dict, timeout: int = TIMEOUT_SECONDS) -> None:
    """Runs scenes/<script>.py inside `blender -b --factory-startup` with JSON args."""
    script_path = SCENES_DIR / f"{script}.py"
    cmd = [
        BLENDER_BIN,
        "-b",
        "--factory-startup",
        "-noaudio",
        "-t",
        str(BLENDER_THREADS),
        "--python-exit-code",
        "3",
        "--python",
        str(script_path),
        "--",
        json.dumps(args),
    ]
    async with _lock:
        log.info(json.dumps({"msg": "blender start", "script": script}))
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise RenderTimeout(f"RENDER_TIMEOUT: Blender exceeded {timeout}s") from exc
        text = out.decode(errors="replace")
        for line in text.splitlines()[-40:]:
            log.info(line)
        if proc.returncode != 0:
            tail = "\n".join(text.splitlines()[-15:])
            raise RenderFailed(f"Blender exited with {proc.returncode}:\n{tail}")
