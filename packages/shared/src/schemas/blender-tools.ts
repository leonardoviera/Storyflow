import { z } from "zod";
import { FontFamily, HexColor } from "./story-script";

// contracts/blender-mcp-tools.md — mirrored by pydantic models in services/blender-mcp.

const even = (n: number) => n % 2 === 0;
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Lighting = z.enum(["STUDIO", "SUNSET", "NIGHT"]);

/** Params the caller (LLM or UI) chooses; projectId/outputId are injected by the server. */
const CommonParams = z.object({
  width: z.number().int().min(64).max(3840).refine(even, "must be even").default(1920),
  height: z.number().int().min(64).max(3840).refine(even, "must be even").default(1080),
  engine: z.enum(["EEVEE", "CYCLES"]).default("CYCLES"),
  samples: z.number().int().min(1).max(256).default(32),
  seed: z.number().int().default(0),
  transparent: z.boolean().default(true),
});

export const RenderTextLogoParams = CommonParams.extend({
  text: z.string().min(1).max(40),
  fontFamily: FontFamily.default("Inter"),
  extrude: z.number().min(0).max(1).default(0.1),
  color: HexColor.default("#FFFFFF"),
  metallic: z.number().min(0).max(1).default(0),
  roughness: z.number().min(0).max(1).default(0.5),
  output: z.enum(["STILL_PNG", "ANIMATION_WEBM", "GLB"]).default("STILL_PNG"),
  frames: z.number().int().min(1).max(600).default(1),
}).strict();

export const RenderPrimitiveSceneParams = CommonParams.extend({
  objects: z
    .array(
      z.object({
        shape: z.enum(["CUBE", "SPHERE", "CYLINDER", "CONE", "TORUS", "PLANE"]),
        location: Vec3,
        rotation: Vec3,
        scale: Vec3,
        color: HexColor,
      }),
    )
    .min(1)
    .max(12),
  camera: z.object({
    location: Vec3,
    lookAt: Vec3,
    lensMm: z.number().min(12).max(200),
  }),
  lighting: Lighting.default("STUDIO"),
  output: z.enum(["STILL_PNG", "ANIMATION_WEBM"]).default("STILL_PNG"),
  frames: z.number().int().min(1).max(600).default(1),
}).strict();

export const RenderTurntableParams = CommonParams.extend({
  modelAssetKey: z.string().min(1),
  frames: z.number().int().min(24).max(600).default(120),
  lighting: Lighting.default("STUDIO"),
}).strict();

export const Blender3dToolParams = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("render_text_logo"), params: RenderTextLogoParams }),
  z.object({ tool: z.literal("render_primitive_scene"), params: RenderPrimitiveSceneParams }),
  z.object({ tool: z.literal("render_turntable"), params: RenderTurntableParams }),
]);
export type Blender3dToolParams = z.infer<typeof Blender3dToolParams>;

/** Short param summaries for the LLM system prompt. */
export const BLENDER_TOOL_SUMMARIES: Record<Blender3dToolParams["tool"], string> = {
  render_text_logo:
    '{ text (1-40 chars), fontFamily ("Inter"|"Merriweather"|"JetBrainsMono"), extrude 0-1, color "#RRGGBB", metallic 0-1, roughness 0-1 }',
  render_primitive_scene:
    '{ objects: [{ shape: "CUBE"|"SPHERE"|"CYLINDER"|"CONE"|"TORUS"|"PLANE", location:[x,y,z], rotation:[x,y,z], scale:[x,y,z], color:"#RRGGBB" }] (max 12), camera: { location:[x,y,z], lookAt:[x,y,z], lensMm 12-200 }, lighting: "STUDIO"|"SUNSET"|"NIGHT" }',
  render_turntable: "{ modelAssetKey (existing uploaded .glb key), frames 24-600 } — only if the user uploaded a model",
};
