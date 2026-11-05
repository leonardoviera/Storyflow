import { describe, expect, it } from "vitest";
import { fitDurations, shotFloorFrames, type Episode } from "../../../packages/shared/src/breakdown";
import { episode, line, pad, rng, segment, shot } from "./helpers";

const ROOM = pad("room");
const STREET = pad("street");

function words(n: number) {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

function checkInvariants(ep: Episode) {
  for (const seg of ep.segments) {
    expect(seg.shots.reduce((n, s) => n + s.durationInFrames, 0)).toBe(seg.durationInFrames);
    for (const s of seg.shots) {
      expect(Number.isInteger(s.durationInFrames)).toBe(true);
      expect(s.durationInFrames).toBeGreaterThanOrEqual(shotFloorFrames(s.lines));
    }
  }
}

describe("shotFloorFrames", () => {
  it("is 1 s with no spoken words", () => {
    expect(shotFloorFrames([])).toBe(30);
  });
  it("gives 2.5 words per second plus 0.3 s", () => {
    // 10 words → 4 s + 0.3 s = 4.3 s = 129 frames
    expect(shotFloorFrames([line("a", words(10), "x")])).toBe(129);
  });
});

describe("fitDurations", () => {
  it("scales non-dialogue time toward the target with exact sums", () => {
    const ep = episode([segment("s1", ROOM, [shot("a", 90), shot("b", 90)]), segment("s2", STREET, [shot("c", 120)])], 600);
    const out = fitDurations(ep, 600);
    checkInvariants(out);
    expect(out.segments.reduce((n, s) => n + s.durationInFrames, 0)).toBe(600);
    expect(out.lengthWarning).toBe(false);
  });

  it("splits a segment over 15 s at shot boundaries", () => {
    const ep = episode([segment("s1", ROOM, [shot("a", 200), shot("b", 200), shot("c", 200)])], 600);
    const out = fitDurations(ep, 600);
    checkInvariants(out);
    expect(out.segments.length).toBeGreaterThan(1);
    for (const seg of out.segments) {
      expect(seg.durationInFrames).toBeLessThanOrEqual(450);
      expect(seg.settingVariantId).toBe(ROOM);
    }
    expect(new Set(out.segments.map((s) => s.id)).size).toBe(out.segments.length);
  });

  it("splits a single long shot into a continued shot, dividing lines by words", () => {
    const lines = [line("l1", words(20), "x"), line("l2", words(20), "x"), line("l3", words(20), "x")];
    const ep = episode([segment("s1", ROOM, [shot("a", 900, lines)])], 900);
    const out = fitDurations(ep, 900);
    checkInvariants(out);
    const shots = out.segments.flatMap((s) => s.shots);
    expect(shots.length).toBeGreaterThan(1);
    expect(shots.slice(1).every((s) => s.continued)).toBe(true);
    expect(shots.flatMap((s) => s.lines.map((l) => l.id))).toEqual(lines.map((l) => l.id));
  });

  it("merges a short segment into a neighbour with the same setting", () => {
    const ep = episode([segment("s1", ROOM, [shot("a", 150)]), segment("s2", ROOM, [shot("b", 60)])], 210);
    const out = fitDurations(ep, 210);
    checkInvariants(out);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0]!.durationInFrames).toBe(210);
  });

  it("pads a short segment with no same-setting neighbour to 4 s", () => {
    const ep = episode([segment("s1", ROOM, [shot("a", 300)]), segment("s2", STREET, [shot("b", 40)])], 340);
    const out = fitDurations(ep, 0);
    checkInvariants(out);
    expect(out.segments[1]!.durationInFrames).toBe(120);
  });

  it("sets lengthWarning when the result is more than 20 % off target", () => {
    // 75 words of dialogue need ≥ 30.3 s; a 10 s target cannot be met.
    const ep = episode([segment("s1", ROOM, [shot("a", 60, [line("l", words(75), "x")])])], 300);
    const out = fitDurations(ep, 300);
    checkInvariants(out);
    expect(out.lengthWarning).toBe(true);
  });

  it("is deterministic and does not mutate its input", () => {
    const ep = episode([segment("s1", ROOM, [shot("a", 500), shot("b", 70)]), segment("s2", STREET, [shot("c", 33)])], 900);
    const copy = structuredClone(ep);
    expect(fitDurations(ep, 900)).toEqual(fitDurations(ep, 900));
    expect(ep).toEqual(copy);
  });

  it("property: exact sums, 4–15 s segments, ≥ 1 s shots and dialogue floors (seeded)", () => {
    const random = rng(20261105);
    const settings = [pad("set1"), pad("set2"), pad("set3")];
    for (let run = 0; run < 300; run++) {
      const segs = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, si) =>
        segment(
          `s${run}x${si}`,
          settings[Math.floor(random() * settings.length)]!,
          Array.from({ length: 1 + Math.floor(random() * 5) }, (_, hi) => {
            const lineCount = Math.floor(random() * 3);
            const lines = Array.from({ length: lineCount }, (_, li) =>
              line(`l${run}x${si}x${hi}x${li}`, words(Math.floor(random() * 25)), "x"),
            );
            return shot(`h${run}x${si}x${hi}`, Math.floor(random() * 300), lines);
          }),
        ),
      );
      const target = 450 + Math.floor(random() * 3000);
      const out = fitDurations(episode(segs, target), target);
      checkInvariants(out);
      for (const seg of out.segments) {
        expect(seg.durationInFrames).toBeGreaterThanOrEqual(120);
        // A single shot whose dialogue alone needs > 15 s cannot be split further.
        if (seg.shots.length > 1 || shotFloorFrames(seg.shots[0]!.lines) <= 450) {
          expect(seg.durationInFrames).toBeLessThanOrEqual(450);
        }
      }
      const total = out.segments.reduce((n, s) => n + s.durationInFrames, 0);
      expect(out.lengthWarning).toBe(Math.abs(total - target) > 0.2 * target);
    }
  });
});

describe("fitDurations long dialogue shots", () => {
  it("splits a dialogue shot sitting exactly at its floor above 15 s", () => {
    // Four 12-word lines: floor ≈ 4 × 12 / 2.5 + 0.3 s = 19.5 s, more than one segment can hold.
    const lines = [1, 2, 3, 4].map((n) => line(`f${n}`, words(12), "x"));
    const floor = shotFloorFrames(lines);
    const ep = episode([segment("s1", ROOM, [shot("a", floor, lines)])], floor);
    const out = fitDurations(ep, floor);
    for (const seg of out.segments) expect(seg.durationInFrames).toBeLessThanOrEqual(450);
    expect(out.segments.flatMap((s) => s.shots.flatMap((h) => h.lines.map((l) => l.id)))).toEqual(lines.map((l) => l.id));
  });
});
