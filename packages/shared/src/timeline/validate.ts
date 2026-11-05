import type { TrackKind } from "../schemas/composition-props";

// data-model.md → Clip rules. Pure: shared by the API, the editor UI and script apply.

export const MAX_TRACKS = 16;
export const MAX_CLIPS_PER_TRACK = 200;

const ALLOWED_ASSET_KINDS: Record<TrackKind, readonly string[] | null> = {
  VISUAL: ["IMAGE", "VIDEO"],
  OVERLAY_3D: ["RENDER_3D"],
  AUDIO: ["AUDIO"],
  TEXT: null, // TEXT clips must not reference an asset
};

export interface ValidatableClip {
  id?: string;
  assetId: string | null;
  startFrame: number;
  durationInFrames: number;
  trimStartFrame: number;
}

export interface ValidatableTrack {
  id?: string;
  kind: TrackKind;
  clips: ValidatableClip[];
}

export interface TimelineIssue {
  path: (string | number)[];
  message: string;
}

/** Returns every issue (empty array = valid). `assetKinds` maps assetId → AssetKind. */
export function validateTimeline(
  tracks: ValidatableTrack[],
  assetKinds: Record<string, string>,
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  if (tracks.length > MAX_TRACKS) {
    issues.push({ path: ["tracks"], message: `at most ${MAX_TRACKS} tracks` });
  }

  tracks.forEach((track, t) => {
    if (track.clips.length > MAX_CLIPS_PER_TRACK) {
      issues.push({ path: ["tracks", t, "clips"], message: `at most ${MAX_CLIPS_PER_TRACK} clips per track` });
    }

    track.clips.forEach((clip, c) => {
      const at = ["tracks", t, "clips", c];
      if (!Number.isInteger(clip.startFrame) || clip.startFrame < 0) {
        issues.push({ path: [...at, "startFrame"], message: "startFrame must be an integer ≥ 0" });
      }
      if (!Number.isInteger(clip.durationInFrames) || clip.durationInFrames < 1) {
        issues.push({ path: [...at, "durationInFrames"], message: "durationInFrames must be an integer ≥ 1" });
      }
      if (!Number.isInteger(clip.trimStartFrame) || clip.trimStartFrame < 0) {
        issues.push({ path: [...at, "trimStartFrame"], message: "trimStartFrame must be an integer ≥ 0" });
      }

      const allowed = ALLOWED_ASSET_KINDS[track.kind];
      if (allowed === null) {
        if (clip.assetId !== null) {
          issues.push({ path: [...at, "assetId"], message: "TEXT clips must not reference an asset" });
        }
      } else if (clip.assetId === null) {
        issues.push({ path: [...at, "assetId"], message: `${track.kind} clips require an asset` });
      } else {
        const kind = assetKinds[clip.assetId];
        if (!kind) {
          issues.push({ path: [...at, "assetId"], message: "asset not found in this project" });
        } else if (!allowed.includes(kind)) {
          issues.push({
            path: [...at, "assetId"],
            message: `${kind} asset cannot be placed on a ${track.kind} track (allowed: ${allowed.join(", ")})`,
          });
        }
      }
    });

    // [startFrame, startFrame + durationInFrames) ranges must not intersect
    const sorted = track.clips
      .map((clip, index) => ({ clip, index }))
      .sort((a, b) => a.clip.startFrame - b.clip.startFrame);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (prev.clip.startFrame + prev.clip.durationInFrames > cur.clip.startFrame) {
        issues.push({
          path: ["tracks", t, "clips", cur.index],
          message: `overlaps clip ${prev.index} on the same track`,
        });
      }
    }
  });

  return issues;
}

/** Max clip end across all tracks, minimum 1. */
export function computeDurationInFrames(tracks: ValidatableTrack[]): number {
  let end = 1;
  for (const track of tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.startFrame + clip.durationInFrames);
  }
  return end;
}
