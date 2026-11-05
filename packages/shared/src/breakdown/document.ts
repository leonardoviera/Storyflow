import { z } from "zod";
import { BlenderToolName } from "../schemas/story-script";

// BreakdownDocument (data-model.md §2). Stored as JSONB on Breakdown.document; every write is
// validated against this schema. Durations are integer frames at 30 fps (R4).

export const FPS = 30;

export const ASPECT_RATIOS = ["PORTRAIT_9_16", "LANDSCAPE_16_9"] as const;
export const AspectRatio = z.enum(ASPECT_RATIOS);
export type AspectRatio = z.infer<typeof AspectRatio>;

export const BIBLE_ASSET_TYPES = ["CHARACTER", "SETTING", "PROP"] as const;
export const BibleAssetType = z.enum(BIBLE_ASSET_TYPES);
export type BibleAssetType = z.infer<typeof BibleAssetType>;

export const SHOT_SIZES = [
  "extreme_wide",
  "wide",
  "medium",
  "medium_close",
  "close_up",
  "extreme_close_up",
  "insert",
] as const;
export const ShotSize = z.enum(SHOT_SIZES);
export type ShotSize = z.infer<typeof ShotSize>;

const Id = z.string().min(1);
const Frames = z.number().int().min(0);

export const Synopsis = z.object({
  storyType: z.string().max(80),
  audience: z.string().max(120),
  setting: z.string().max(300),
  summary: z.string().max(2000),
  characterProfiles: z.array(z.object({ assetId: Id, profile: z.string().max(1000) })),
});
export type Synopsis = z.infer<typeof Synopsis>;

export const BibleVariant = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  description: z.string().max(1000),
  referenceAssetIds: z.array(Id).max(8),
});
export type BibleVariant = z.infer<typeof BibleVariant>;

export const BibleAsset = z.object({
  id: Id,
  type: BibleAssetType,
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).max(10),
  description: z.string().max(2000),
  libraryAssetId: Id.optional(),
  variants: z.array(BibleVariant).min(1),
});
export type BibleAsset = z.infer<typeof BibleAsset>;

export const SpokenLine = z.object({
  id: Id,
  kind: z.enum(["dialogue", "narration"]),
  speakerAssetId: Id.nullable(),
  text: z.string().max(2000),
  sourceLineId: Id.optional(),
});
export type SpokenLine = z.infer<typeof SpokenLine>;

export const ShotVisual = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("image"), fallbackReason: z.string().optional() }),
  // params are checked against Blender3dToolParams at build time (R12).
  z.object({ kind: z.literal("3d"), tool: BlenderToolName, params: z.record(z.string(), z.unknown()) }),
]);
export type ShotVisual = z.infer<typeof ShotVisual>;

export const Shot = z.object({
  id: Id,
  order: z.number().int().min(1),
  durationInFrames: Frames,
  shotSize: ShotSize,
  camera: z.string().max(120),
  action: z.string().max(1000),
  lines: z.array(SpokenLine),
  sound: z.string().max(200),
  visual: ShotVisual,
  continued: z.boolean().optional(),
});
export type Shot = z.infer<typeof Shot>;

export const Segment = z.object({
  id: Id,
  order: z.number().int().min(1),
  settingVariantId: Id,
  durationInFrames: Frames,
  shots: z.array(Shot).min(1),
});
export type Segment = z.infer<typeof Segment>;

export const EpisodeStatus = z.enum(["pending", "running", "done", "failed"]);
export type EpisodeStatus = z.infer<typeof EpisodeStatus>;

export const Episode = z.object({
  id: Id,
  order: z.number().int().min(1),
  title: z.string().max(120),
  targetFrames: Frames,
  status: EpisodeStatus,
  error: z.string().optional(),
  lengthWarning: z.boolean().optional(),
  sourceLineRange: z.object({ from: Id, to: Id }),
  segments: z.array(Segment),
});
export type Episode = z.infer<typeof Episode>;

export const BreakdownDocument = z.object({
  schemaVersion: z.literal(1),
  fps: z.literal(FPS),
  aspectRatio: AspectRatio,
  synopsis: Synopsis,
  assets: z.array(BibleAsset),
  episodes: z.array(Episode),
});
export type BreakdownDocument = z.infer<typeof BreakdownDocument>;

export const SourceLineHint = z.enum(["heading", "dialogue", "parenthetical", "action"]);
export type SourceLineHint = z.infer<typeof SourceLineHint>;

export const SourceLine = z.object({
  id: Id,
  text: z.string(),
  hint: SourceLineHint,
  speakerHint: z.string().optional(),
});
export type SourceLine = z.infer<typeof SourceLine>;

export const ScriptSettings = z.object({
  aspectRatio: AspectRatio,
  episodeSeconds: z.number().int().min(15).max(300).default(60),
  episodeCount: z.number().int().min(1).max(20).default(1),
});
export type ScriptSettings = z.infer<typeof ScriptSettings>;

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** 12 URL-safe characters; 64 symbols so each random byte maps without bias. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (const b of bytes) id += ID_ALPHABET[b & 63];
  return id;
}

export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * FPS);
}

export function dimensionsFor(aspectRatio: AspectRatio): { width: number; height: number } {
  return aspectRatio === "PORTRAIT_9_16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}
