import { describe, expect, it } from "vitest";
import { checkBreakdown, parseScript, type BreakdownDocument, type FlagCode } from "../../../packages/shared/src/breakdown";
import { ANA, ANA_DEFAULT, CUP, CUP_DEFAULT, ROOM, ROOM_DAY, doc, episode, line, pad, segment, shot } from "./helpers";

const source = parseScript("INT. SALA - DIA\nANA: Bom dia.");

function valid(): BreakdownDocument {
  return doc([
    episode(
      [segment("s1", ROOM_DAY, [shot("a", 60, [line("l1", "ANA: Bom dia.", ANA, "L2")], `@{${ANA_DEFAULT}}`), shot("b", 90)])],
      150,
    ),
  ]);
}

const codes = (d: unknown) => checkBreakdown(d, source).flags.map((f) => f.code);
const errorPaths = (d: unknown) => checkBreakdown(d, source).errors.map((e) => e.path);

describe("checkBreakdown", () => {
  it("accepts a valid document with no flags", () => {
    expect(checkBreakdown(valid(), source)).toEqual({ errors: [], flags: [] });
  });

  describe("errors", () => {
    it("schema failures, with paths", () => {
      const d = valid() as unknown as { episodes: { segments: { shots: { shotSize: string }[] }[] }[] };
      d.episodes[0]!.segments[0]!.shots[0]!.shotSize = "huge";
      expect(errorPaths(d)).toEqual(["episodes[0].segments[0].shots[0].shotSize"]);
    });

    it("duplicate ids", () => {
      const d = valid();
      d.episodes[0]!.segments[0]!.shots[1]!.id = d.episodes[0]!.segments[0]!.shots[0]!.id;
      expect(errorPaths(d)).toEqual(["episodes[0].segments[0].shots[1]"]);
    });

    it("a segment setting that is not a SETTING variant", () => {
      const d = valid();
      d.episodes[0]!.segments[0]!.settingVariantId = CUP_DEFAULT;
      expect(errorPaths(d)).toEqual(["episodes[0].segments[0].settingVariantId"]);
    });

    it("a speaker that is not a CHARACTER", () => {
      const d = valid();
      d.episodes[0]!.segments[0]!.shots[0]!.lines[0]!.speakerAssetId = CUP;
      expect(errorPaths(d)).toEqual(["episodes[0].segments[0].shots[0].lines[0].speakerAssetId"]);
    });

    it("duplicate names per type (case-insensitive) and variant names per asset", () => {
      const d = valid();
      d.assets.push({ ...d.assets[0]!, id: pad("ana2"), name: "ANA LIMA", variants: [{ id: pad("v2"), name: "x", description: "", referenceAssetIds: [] }] });
      d.assets[1]!.variants.push({ id: pad("roomnight"), name: "dia", description: "", referenceAssetIds: [] });
      expect(errorPaths(d)).toEqual(["assets[1].variants[1].name", "assets[3].name"]);
    });

    it("a segment whose shots do not add up", () => {
      const d = valid();
      d.episodes[0]!.segments[0]!.durationInFrames = 151;
      expect(errorPaths(d)).toEqual(["episodes[0].segments[0].durationInFrames"]);
    });
  });

  describe("flags", () => {
    const flagged = (mutate: (d: BreakdownDocument) => void): FlagCode[] => {
      const d = valid();
      mutate(d);
      return codes(d);
    };

    it("SEGMENT_DURATION below 4 s or above 15 s", () => {
      expect(
        flagged((d) => {
          const seg = d.episodes[0]!.segments[0]!;
          seg.shots[1]!.durationInFrames = 30;
          seg.durationInFrames = 90;
          d.episodes[0]!.targetFrames = 90;
        }),
      ).toEqual(["SEGMENT_DURATION"]);
    });

    it("SHOT_TOO_SHORT under 1 s", () => {
      expect(
        flagged((d) => {
          const seg = d.episodes[0]!.segments[0]!;
          seg.shots[0]!.durationInFrames = 20;
          seg.shots[1]!.durationInFrames = 130;
        }),
      ).toEqual(["SHOT_TOO_SHORT"]);
    });

    it("MISSING_MENTION for a dangling token, an unresolved label or a deleted setting, and it blocks the build", () => {
      expect(flagged((d) => void (d.episodes[0]!.segments[0]!.shots[1]!.action = "@{gone00000000}"))).toEqual(["MISSING_MENTION"]);
      expect(flagged((d) => void (d.episodes[0]!.segments[0]!.shots[1]!.action = "@Fantasma entra"))).toEqual(["MISSING_MENTION"]);
      expect(flagged((d) => void d.assets.splice(1, 1))).toEqual(["MISSING_MENTION"]);
      const d = valid();
      d.episodes[0]!.segments[0]!.shots[1]!.action = "@{gone00000000}";
      expect(checkBreakdown(d, source).flags[0]!.blocksBuild).toBe(true);
    });

    it("MISSING_SPEAKER when the speaker asset was deleted, and it blocks the build", () => {
      const d = valid();
      d.assets.splice(0, 1);
      d.episodes[0]!.segments[0]!.shots[0]!.action = "";
      const { flags } = checkBreakdown(d, source);
      expect(flags.map((f) => [f.code, f.path, f.blocksBuild])).toEqual([
        ["MISSING_SPEAKER", "episodes[0].segments[0].shots[0].lines[0]", true],
      ]);
    });

    it("EPISODE_LENGTH beyond 20 % of the target", () => {
      expect(flagged((d) => void (d.episodes[0]!.targetFrames = 100))).toEqual(["EPISODE_LENGTH"]);
      expect(flagged((d) => void (d.episodes[0]!.targetFrames = 180))).toEqual([]);
    });

    it("VERBATIM_DRIFT (info) when a sourced line was edited", () => {
      const d = valid();
      d.episodes[0]!.segments[0]!.shots[0]!.lines[0]!.text = "ANA: Boa tarde.";
      const { flags } = checkBreakdown(d, source);
      expect(flags.map((f) => [f.code, f.blocksBuild])).toEqual([["VERBATIM_DRIFT", false]]);
    });
  });

  it("uses the asset ids from the helpers", () => {
    expect([ANA, ROOM, CUP].every((id) => id.length === 12)).toBe(true);
  });
});
