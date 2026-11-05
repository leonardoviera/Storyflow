# Contract: Blender MCP Server Tools

- **Server**: `services/blender-mcp`. It speaks MCP over Streamable HTTP at
  `http://blender-mcp:8000/mcp` and is registered in LiteLLM as `blender_mcp`.
- **Health check**: `GET /healthz` returns `200 {"status":"ok","blender":"4.5.x"}`.

## Invariants (constitution IV)

- The tool list below is **closed**. The server does not expose arbitrary Python or `bpy`
  execution, asset search or import, or remote generation.
- Every tool call runs a fresh headless process: `blender -b --factory-startup -t 4 (Debian-packaged Blender 4.3.2)`. Scenes are
  built only from the given parameters. Seeds are explicit, so the same parameters produce the
  same output.
- Outputs are uploaded to `s3://storyflow-assets/projects/{projectId}/RENDER_3D/{outputId}.{ext}`
  and returned as object keys plus metadata. The server never returns file paths.
- Limits: one Blender process at a time (calls queue inside the server), 4 threads, and a
  300 s timeout per call, after which the call returns MCP error `-32001 RENDER_TIMEOUT`.

## Common input fields (all tools)

| Field | Type | Rules |
|---|---|---|
| projectId | string | required |
| outputId | string | required; the caller pre-allocates it (the Asset ID) |
| width, height | int | 64–3840, even; default 1920×1080 |
| engine | enum `EEVEE` \| `CYCLES` | default `CYCLES` (CPU). Headless containers have no GL context for Eevee, so `EEVEE` is honoured only when `BLENDER_ALLOW_EEVEE=1`. The server maps the value to the identifier the running Blender build supports (enum values are read at run time, never hardcoded) |
| samples | int | 1–256, default 32 |
| seed | int | default 0 |
| transparent | bool | default true (for overlay compositing) |

## Tools

### `render_text_logo`
Extruded 3D text with a material and lighting.

| Param | Type | Rules |
|---|---|---|
| text | string | 1–40 chars |
| fontFamily | enum | self-hosted fonts only: `Inter`, `Merriweather`, `JetBrainsMono` |
| extrude | number | 0–1, default 0.1 |
| color | hex | `#RRGGBB` |
| metallic, roughness | number | 0–1 |
| output | enum `STILL_PNG` \| `ANIMATION_WEBM` \| `GLB` | default `STILL_PNG` |
| frames | int | 1–600, only for `ANIMATION_WEBM` (rotation animation) |

### `render_primitive_scene`
A composed scene of up to 12 primitive shapes.

| Param | Type | Rules |
|---|---|---|
| objects | array ≤ 12 of `{ shape: CUBE\|SPHERE\|CYLINDER\|CONE\|TORUS\|PLANE, location: [x,y,z], rotation: [x,y,z], scale: [x,y,z], color: hex }` | |
| camera | `{ location: [x,y,z], lookAt: [x,y,z], lensMm: 12–200 }` | |
| lighting | enum `STUDIO` \| `SUNSET` \| `NIGHT` | built-in procedural setups (no HDRI downloads) |
| output | enum `STILL_PNG` \| `ANIMATION_WEBM` | |
| frames | int | 1–600 |

### `render_turntable`
A 360° turntable of a 3D model that is already in MinIO (an uploaded `.glb`). Output is always `ANIMATION_WEBM`.

| Param | Type | Rules |
|---|---|---|
| modelAssetKey | string | the object key of a `MODEL_3D` asset in `storyflow-assets` |
| frames | int | 24–600 |
| lighting | enum | as above |

## Result (all tools)

```json
{
  "outputs": [
    { "objectKey": "projects/p1/RENDER_3D/a1.png", "mimeType": "image/png",
      "sha256": "…", "sizeBytes": 123456, "width": 1920, "height": 1080, "frames": 1 }
  ],
  "blenderVersion": "4.5.x",
  "renderMs": 18234
}
```

The pipeline worker reads `outputs[0]` and sets the matching `Asset` row to `READY`.

## Output formats

- `STILL_PNG`: RGBA PNG (`image/png`), stored as a `RENDER_3D` asset.
- `ANIMATION_WEBM`: VP9 WebM with an alpha channel (`video/webm`), stored as `RENDER_3D` and played
  with `<OffthreadVideo transparent>`. This replaced the earlier `SEQUENCE_PNG_ZIP`, because
  Remotion can't play a ZIP of frames.
- `GLB`: `model/gltf-binary`, stored as `MODEL_3D` (usable by `render_turntable`, not on tracks).
