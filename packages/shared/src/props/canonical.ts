import type { StoryCompositionProps } from "../schemas/composition-props";
import { ClipProps, type TrackKind } from "../schemas/composition-props";
import type { FONT_FAMILIES } from "../schemas/story-script";
import { computeDurationInFrames } from "../timeline/validate";

// contracts/composition-props.md — the ONLY producer of canonical props.

export const REMOTION_VERSION = "4.0.540";

export type MediaType = "image" | "video" | "audio";

/** Media type from a MIME type (used for assetMedia). */
export function mediaTypeOf(mimeType: string): MediaType {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

export interface CanonicalProjectInput {
  id: string;
  width: number;
  height: number;
  fps: number;
  style?: { palette?: string[]; fontFamily?: (typeof FONT_FAMILIES)[number] };
}

export interface CanonicalTrackInput {
  id: string;
  kind: TrackKind;
  order: number;
  muted: boolean;
  clips: {
    id: string;
    assetId: string | null;
    startFrame: number;
    durationInFrames: number;
    trimStartFrame: number;
    props: unknown;
  }[];
}

/** Stable 31-bit seed from the project id, so random() is deterministic per project. */
function seedFor(projectId: string): number {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (Math.imul(31, h) + projectId.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildCanonicalProps(
  project: CanonicalProjectInput,
  tracks: CanonicalTrackInput[],
  assetMedia: Record<string, MediaType> = {},
): StoryCompositionProps {
  const sortedTracks = [...tracks]
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      id: track.id,
      kind: track.kind,
      order: track.order,
      muted: track.muted,
      clips: [...track.clips]
        .sort((a, b) => a.startFrame - b.startFrame)
        .map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          startFrame: clip.startFrame,
          durationInFrames: clip.durationInFrames,
          trimStartFrame: clip.trimStartFrame,
          props: ClipProps.parse(clip.props ?? {}),
        })),
    }));

  const referenced = new Set(sortedTracks.flatMap((t) => t.clips.map((c) => c.assetId)).filter(Boolean));
  const media = Object.fromEntries(Object.entries(assetMedia).filter(([id]) => referenced.has(id)));

  return {
    schemaVersion: 1,
    width: project.width,
    height: project.height,
    fps: project.fps as StoryCompositionProps["fps"],
    durationInFrames: computeDurationInFrames(sortedTracks),
    seed: seedFor(project.id),
    style: {
      palette: project.style?.palette ?? ["#0F172A", "#F8FAFC", "#38BDF8"],
      fontFamily: project.style?.fontFamily ?? "Inter",
    },
    tracks: sortedTracks,
    assetMedia: media,
  };
}

/** JSON with recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Referenced asset ids, sorted. */
export function referencedAssetIds(props: StoryCompositionProps): string[] {
  return [...new Set(props.tracks.flatMap((t) => t.clips.map((c) => c.assetId)).filter((x): x is string => !!x))].sort();
}
