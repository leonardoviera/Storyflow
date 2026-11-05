import { BreakdownDocument, type SourceLine } from "./document";
import { MAX_SEGMENT_FRAMES, MIN_SEGMENT_FRAMES, MIN_SHOT_FRAMES } from "./durations";
import { extractMentionIds, hasUnresolvedLabel } from "./mentions";

// checkBreakdown (data-model.md §2 "Validation"): pure, shared by the review UI and the API.
// Errors reject a save (422); flags are saved and shown, and some block the timeline build.

export interface Issue {
  path: string;
  message: string;
}

export const FLAG_CODES = [
  "SEGMENT_DURATION",
  "SHOT_TOO_SHORT",
  "MISSING_MENTION",
  "MISSING_SPEAKER",
  "EPISODE_LENGTH",
  "VERBATIM_DRIFT",
] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

export interface Flag {
  code: FlagCode;
  path: string;
  message: string;
  blocksBuild: boolean;
}

const BLOCKS_BUILD: Record<FlagCode, boolean> = {
  SEGMENT_DURATION: false,
  SHOT_TOO_SHORT: false,
  MISSING_MENTION: true,
  MISSING_SPEAKER: true,
  EPISODE_LENGTH: false,
  VERBATIM_DRIFT: false,
};

const zodPath = (path: PropertyKey[]) =>
  path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");

export function checkBreakdown(input: unknown, sourceLines: SourceLine[]): { errors: Issue[]; flags: Flag[] } {
  const errors: Issue[] = [];
  const flags: Flag[] = [];
  const flag = (code: FlagCode, path: string, message: string) =>
    flags.push({ code, path, message, blocksBuild: BLOCKS_BUILD[code] });

  const parsed = BreakdownDocument.safeParse(input);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => ({ path: zodPath(i.path), message: i.message })), flags };
  }
  const doc = parsed.data;

  // Duplicate ids anywhere in the document.
  const seen = new Map<string, string>();
  const claim = (id: string, path: string) => {
    const first = seen.get(id);
    if (first) errors.push({ path, message: `Duplicate id "${id}" (also at ${first})` });
    else seen.set(id, path);
  };

  // Names unique per type (case-insensitive); variant names unique per asset.
  const assetTypeById = new Map<string, string>();
  const variantOwner = new Map<string, string>(); // variantId → asset type
  const namesByType = new Map<string, Set<string>>();
  doc.assets.forEach((asset, ai) => {
    const path = `assets[${ai}]`;
    claim(asset.id, path);
    assetTypeById.set(asset.id, asset.type);
    const names = namesByType.get(asset.type) ?? new Set<string>();
    const key = asset.name.trim().toLowerCase();
    if (names.has(key)) errors.push({ path: `${path}.name`, message: `Duplicate ${asset.type} name "${asset.name}"` });
    names.add(key);
    namesByType.set(asset.type, names);
    const variantNames = new Set<string>();
    asset.variants.forEach((variant, vi) => {
      claim(variant.id, `${path}.variants[${vi}]`);
      variantOwner.set(variant.id, asset.type);
      const vkey = variant.name.trim().toLowerCase();
      if (variantNames.has(vkey)) {
        errors.push({ path: `${path}.variants[${vi}].name`, message: `Duplicate variant name "${variant.name}"` });
      }
      variantNames.add(vkey);
    });
  });

  const sourceText = new Map(sourceLines.map((l) => [l.id, l.text]));

  doc.episodes.forEach((episode, ei) => {
    const epath = `episodes[${ei}]`;
    claim(episode.id, epath);
    let episodeFrames = 0;
    episode.segments.forEach((segment, si) => {
      const spath = `${epath}.segments[${si}]`;
      claim(segment.id, spath);
      const settingType = variantOwner.get(segment.settingVariantId);
      if (settingType === undefined) {
        flag("MISSING_MENTION", spath, "The segment's setting no longer exists");
      } else if (settingType !== "SETTING") {
        errors.push({ path: `${spath}.settingVariantId`, message: "The segment setting must be a SETTING variant" });
      }
      const shotSum = segment.shots.reduce((n, s) => n + s.durationInFrames, 0);
      if (shotSum !== segment.durationInFrames) {
        errors.push({
          path: `${spath}.durationInFrames`,
          message: `Segment is ${segment.durationInFrames} frames but its shots add up to ${shotSum}`,
        });
      }
      if (segment.durationInFrames < MIN_SEGMENT_FRAMES || segment.durationInFrames > MAX_SEGMENT_FRAMES) {
        flag("SEGMENT_DURATION", spath, `Segment is ${(segment.durationInFrames / doc.fps).toFixed(1)} s (allowed 4–15 s)`);
      }
      episodeFrames += segment.durationInFrames;

      segment.shots.forEach((shot, hi) => {
        const hpath = `${spath}.shots[${hi}]`;
        claim(shot.id, hpath);
        if (shot.durationInFrames < MIN_SHOT_FRAMES) {
          flag("SHOT_TOO_SHORT", hpath, `Shot is ${(shot.durationInFrames / doc.fps).toFixed(1)} s (minimum 1 s)`);
        }
        const missing = extractMentionIds(shot.action).filter((id) => !variantOwner.has(id));
        if (missing.length > 0 || hasUnresolvedLabel(shot.action)) {
          flag("MISSING_MENTION", hpath, "The action mentions an asset that does not exist");
        }
        shot.lines.forEach((line, li) => {
          const lpath = `${hpath}.lines[${li}]`;
          claim(line.id, lpath);
          if (line.speakerAssetId !== null) {
            const type = assetTypeById.get(line.speakerAssetId);
            if (type === undefined) flag("MISSING_SPEAKER", lpath, "The speaker of this line was deleted");
            else if (type !== "CHARACTER") {
              errors.push({ path: `${lpath}.speakerAssetId`, message: "The speaker must be a CHARACTER" });
            }
          }
          if (line.sourceLineId !== undefined) {
            const original = sourceText.get(line.sourceLineId);
            if (original !== undefined && original !== line.text) {
              flag("VERBATIM_DRIFT", lpath, "The line was edited and no longer matches the script");
            }
          }
        });
      });
    });
    if (episode.segments.length > 0 && Math.abs(episodeFrames - episode.targetFrames) > 0.2 * episode.targetFrames) {
      flag(
        "EPISODE_LENGTH",
        epath,
        `Episode is ${Math.round(episodeFrames / doc.fps)} s for a target of ${Math.round(episode.targetFrames / doc.fps)} s`,
      );
    }
  });

  return { errors, flags };
}
