import { z } from "zod";
import { BlenderToolName } from "../schemas/story-script";
import { BibleAssetType, ShotSize } from "./document";

// Structured outputs for the breakdown passes (contracts/llm-breakdown.md §2–§3). Zod is
// authoritative; the JSON Schemas below go to LiteLLM `response_format` with strict: true, so
// every object is closed and lists all its properties as required.
//
// 3D params are a JSON string (`paramsJson`): strict mode cannot express an open object, and the
// server validates them with Blender3dToolParams anyway (R6).

const LlmVariant = z.object({ ref: z.string(), name: z.string(), description: z.string() }).strict();

const LlmAsset = z
  .object({
    ref: z.string(),
    type: BibleAssetType,
    name: z.string(),
    aliases: z.array(z.string()),
    description: z.string(),
    variants: z.array(LlmVariant).min(1),
  })
  .strict();

const LlmSpeakerMapping = z.object({ speakerHint: z.string(), assetRef: z.string() }).strict();

export const AnalyzeOutput = z
  .object({
    synopsis: z
      .object({
        storyType: z.string().max(80),
        audience: z.string().max(120),
        setting: z.string().max(300),
        summary: z.string().max(2000),
        characterProfiles: z.array(z.object({ assetRef: z.string(), profile: z.string().max(1000) }).strict()),
      })
      .strict(),
    assets: z.array(LlmAsset),
    speakerMap: z.array(LlmSpeakerMapping),
    episodePlan: z
      .object({
        maxSensibleEpisodes: z.number().int().min(1),
        episodes: z.array(z.object({ title: z.string(), startLineId: z.string() }).strict()).min(1),
      })
      .strict(),
  })
  .strict();
export type AnalyzeOutput = z.infer<typeof AnalyzeOutput>;

export const AnalyzeChunkOutput = z
  .object({
    assets: z.array(LlmAsset),
    speakerMap: z.array(LlmSpeakerMapping),
    chunkSummary: z.string().max(1500),
  })
  .strict();
export type AnalyzeChunkOutput = z.infer<typeof AnalyzeChunkOutput>;

const LlmVisual = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("image") }).strict(),
  z.object({ kind: z.literal("3d"), tool: BlenderToolName, paramsJson: z.string() }).strict(),
]);

export const EpisodeOutput = z
  .object({
    segments: z
      .array(
        z
          .object({
            settingVariantId: z.string(),
            shots: z
              .array(
                z
                  .object({
                    shotSize: ShotSize,
                    camera: z.string(),
                    action: z.string(),
                    spokenLineIds: z.array(z.string()),
                    actionLineIds: z.array(z.string()),
                    speakerByLine: z.array(z.object({ lineId: z.string(), assetId: z.string().nullable() }).strict()),
                    sound: z.string(),
                    visual: LlmVisual,
                    suggestedSeconds: z.number().min(1).max(15),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type EpisodeOutput = z.infer<typeof EpisodeOutput>;

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;

export const AnalyzeOutputJsonSchema = jsonSchema(AnalyzeOutput);
export const AnalyzeChunkOutputJsonSchema = jsonSchema(AnalyzeChunkOutput);
export const EpisodeOutputJsonSchema = jsonSchema(EpisodeOutput);
