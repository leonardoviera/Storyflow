import { z } from "zod";

// Mirrors specs/001-local-video-platform/contracts/story-script.schema.json (Zod is authoritative).

export const FONT_FAMILIES = ["Inter", "Merriweather", "JetBrainsMono"] as const;
export const FontFamily = z.enum(FONT_FAMILIES);
export const Fps = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]);
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const BLENDER_TOOLS = ["render_text_logo", "render_primitive_scene", "render_turntable"] as const;
export const BlenderToolName = z.enum(BLENDER_TOOLS);

export const Asset3dSpec = z
  .object({
    tool: BlenderToolName,
    params: z.record(z.string(), z.unknown()),
  })
  .strict();

export const StoryScene = z
  .object({
    title: z.string().min(1).max(120),
    narration: z.string().max(2000),
    onScreenText: z.string().max(200).optional(),
    visualPrompt: z.string().max(1000),
    durationSeconds: z.number().min(1).max(60),
    transition: z.enum(["cut", "fade", "slide", "wipe"]).default("cut"),
    asset3d: Asset3dSpec.optional(),
  })
  .strict();

export const StoryScript = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(120),
    logline: z.string().max(300),
    fps: Fps,
    style: z
      .object({
        palette: z.array(HexColor).max(6).optional(),
        fontFamily: FontFamily.optional(),
        mood: z.string().max(60).optional(),
      })
      .strict()
      .optional(),
    scenes: z.array(StoryScene).min(1).max(40),
  })
  .strict();

export type StoryScript = z.infer<typeof StoryScript>;
export type StoryScene = z.infer<typeof StoryScene>;
export type Asset3dSpec = z.infer<typeof Asset3dSpec>;

/** JSON Schema for LiteLLM `response_format` (structured output). */
export const StoryScriptJsonSchema = z.toJSONSchema(StoryScript, { target: "draft-2020-12" });
