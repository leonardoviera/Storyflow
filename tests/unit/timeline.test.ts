import { describe, expect, it } from "vitest";
import { buildCanonicalProps } from "../../packages/shared/src/props/canonical";
import { hashCanonicalProps } from "../../packages/shared/src/props/hash";
import { computeDurationInFrames, validateTimeline } from "../../packages/shared/src/timeline/validate";

const clip = (startFrame: number, durationInFrames: number, assetId: string | null = null) => ({
  assetId,
  startFrame,
  durationInFrames,
  trimStartFrame: 0,
});

describe("validateTimeline", () => {
  it("accepts touching clips but rejects overlaps on the same track", () => {
    expect(validateTimeline([{ kind: "TEXT", clips: [clip(0, 30), clip(30, 30)] }], {})).toEqual([]);
    const issues = validateTimeline([{ kind: "TEXT", clips: [clip(0, 31), clip(30, 30)] }], {});
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/overlaps/);
  });

  it("enforces asset kind per track kind", () => {
    const kinds = { img: "IMAGE", snd: "AUDIO" };
    expect(validateTimeline([{ kind: "VISUAL", clips: [clip(0, 10, "img")] }], kinds)).toEqual([]);
    expect(validateTimeline([{ kind: "VISUAL", clips: [clip(0, 10, "snd")] }], kinds)[0]!.message).toMatch(/cannot be placed/);
    expect(validateTimeline([{ kind: "TEXT", clips: [clip(0, 10, "img")] }], kinds)[0]!.message).toMatch(/TEXT clips/);
    expect(validateTimeline([{ kind: "AUDIO", clips: [clip(0, 10)] }], kinds)[0]!.message).toMatch(/require an asset/);
  });

  it("computes duration as max clip end (min 1)", () => {
    expect(computeDurationInFrames([])).toBe(1);
    expect(computeDurationInFrames([{ kind: "TEXT", clips: [clip(10, 20), clip(40, 5)] }])).toBe(45);
  });
});

describe("canonical props hash", () => {
  const project = { id: "p1", width: 1920, height: 1080, fps: 30 };
  const tracks = [
    { id: "t", kind: "VISUAL" as const, order: 0, muted: false, clips: [{ id: "c", assetId: "a1", startFrame: 0, durationInFrames: 30, trimStartFrame: 0, props: {} }] },
  ];

  it("is stable and ignores resolved URLs", () => {
    const props = buildCanonicalProps(project, tracks, { a1: "image" });
    const h1 = hashCanonicalProps(props, { a1: "abc" }, "StoryComposition");
    const h2 = hashCanonicalProps({ ...props, assetUrls: { a1: "http://localhost:9000/x?sig=1" } }, { a1: "abc" }, "StoryComposition");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when asset content changes", () => {
    const props = buildCanonicalProps(project, tracks, { a1: "image" });
    expect(hashCanonicalProps(props, { a1: "abc" }, "StoryComposition")).not.toBe(
      hashCanonicalProps(props, { a1: "def" }, "StoryComposition"),
    );
  });
});
