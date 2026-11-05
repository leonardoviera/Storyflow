import type { BreakdownDocument, Episode, Segment, Shot, SpokenLine } from "../../../packages/shared/src/breakdown";

// Small builders for breakdown tests. Ids are readable 12-character strings.

export const pad = (s: string) => s.padEnd(12, "0").slice(0, 12);

export function line(id: string, text: string, speakerAssetId: string | null = null, sourceLineId?: string): SpokenLine {
  return { id: pad(id), kind: speakerAssetId ? "dialogue" : "narration", speakerAssetId, text, ...(sourceLineId ? { sourceLineId } : {}) };
}

export function shot(id: string, durationInFrames: number, lines: SpokenLine[] = [], action = ""): Shot {
  return { id: pad(id), order: 1, durationInFrames, shotSize: "medium", camera: "static", action, lines, sound: "", visual: { kind: "none" } };
}

export function segment(id: string, settingVariantId: string, shots: Shot[]): Segment {
  return {
    id: pad(id),
    order: 1,
    settingVariantId,
    durationInFrames: shots.reduce((n, s) => n + s.durationInFrames, 0),
    shots: shots.map((s, i) => ({ ...s, order: i + 1 })),
  };
}

export function episode(segments: Segment[], targetFrames = 1800): Episode {
  return {
    id: pad("ep1"),
    order: 1,
    title: "Episode 1",
    targetFrames,
    status: "done",
    sourceLineRange: { from: "L1", to: "L10" },
    segments: segments.map((s, i) => ({ ...s, order: i + 1 })),
  };
}

export const ANA = pad("ana");
export const ANA_DEFAULT = pad("anadef");
export const ANA_COAT = pad("anacoat");
export const ROOM = pad("room");
export const ROOM_DAY = pad("roomday");
export const CUP = pad("cup");
export const CUP_DEFAULT = pad("cupdef");

export function doc(episodes: Episode[] = []): BreakdownDocument {
  return {
    schemaVersion: 1,
    fps: 30,
    aspectRatio: "PORTRAIT_9_16",
    synopsis: { storyType: "drama", audience: "adults", setting: "today", summary: "", characterProfiles: [] },
    assets: [
      {
        id: ANA,
        type: "CHARACTER",
        name: "Ana Lima",
        aliases: ["Ana"],
        description: "",
        variants: [
          { id: ANA_DEFAULT, name: "default", description: "", referenceAssetIds: [] },
          { id: ANA_COAT, name: "Jaleco", description: "", referenceAssetIds: [] },
        ],
      },
      { id: ROOM, type: "SETTING", name: "Sala", aliases: [], description: "", variants: [{ id: ROOM_DAY, name: "Dia", description: "", referenceAssetIds: [] }] },
      { id: CUP, type: "PROP", name: "Xícara", aliases: [], description: "", variants: [{ id: CUP_DEFAULT, name: "default", description: "", referenceAssetIds: [] }] },
    ],
    episodes,
  };
}

/** Deterministic PRNG (mulberry32) for property-style loops. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
