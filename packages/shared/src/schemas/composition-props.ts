import { z } from "zod";
import { FontFamily, Fps, HexColor } from "./story-script";

// contracts/composition-props.md

export const TRACK_KINDS = ["VISUAL", "OVERLAY_3D", "TEXT", "AUDIO"] as const;
export const TrackKind = z.enum(TRACK_KINDS);
export type TrackKind = z.infer<typeof TrackKind>;

const Transition = z.object({
  type: z.enum(["fade", "slide", "wipe"]),
  durationInFrames: z.number().int().min(1),
});

export const ClipProps = z
  .object({
    text: z.string().max(200).optional(),
    transform: z
      .object({ x: z.number(), y: z.number(), scale: z.number(), rotation: z.number() })
      .optional(),
    opacity: z.number().min(0).max(1).optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    transitionIn: Transition.optional(),
    transitionOut: Transition.optional(),
    volume: z.number().min(0).max(1).optional(),
    color: HexColor.optional(),
    background: HexColor.optional(),
  })
  .strict();
export type ClipProps = z.infer<typeof ClipProps>;

export const CompositionClip = z.object({
  id: z.string(),
  assetId: z.string().nullable(),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().min(1),
  trimStartFrame: z.number().int().min(0),
  props: ClipProps,
});
export type CompositionClip = z.infer<typeof CompositionClip>;

export const CompositionTrack = z.object({
  id: z.string(),
  kind: TrackKind,
  order: z.number().int(),
  muted: z.boolean(),
  clips: z.array(CompositionClip),
});
export type CompositionTrack = z.infer<typeof CompositionTrack>;

export const StoryCompositionProps = z.object({
  schemaVersion: z.literal(1),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: Fps,
  durationInFrames: z.number().int().min(1),
  seed: z.number().int(),
  style: z.object({
    palette: z.array(HexColor).max(6),
    fontFamily: FontFamily,
  }),
  tracks: z.array(CompositionTrack),
  /** Resolved form only — never stored or hashed. */
  assetUrls: z.record(z.string(), z.string()).optional(),
  /** Asset id → media type, so layers pick <Img> vs <OffthreadVideo>. Part of canonical props. */
  assetMedia: z.record(z.string(), z.enum(["image", "video", "audio"])).optional(),
});
export type StoryCompositionProps = z.infer<typeof StoryCompositionProps>;
