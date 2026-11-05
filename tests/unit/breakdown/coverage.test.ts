import { describe, expect, it } from "vitest";
import { checkCoverage, linesInRange, parseScript } from "../../../packages/shared/src/breakdown";

describe("checkCoverage", () => {
  const ids = ["L1", "L2", "L3", "L4"];

  it("passes when every line is used exactly once", () => {
    const shots = [
      { spokenLineIds: ["L2"], actionLineIds: ["L1"] },
      { spokenLineIds: ["L3", "L4"], actionLineIds: [] },
    ];
    expect(checkCoverage(ids, shots)).toEqual({ missing: [], duplicated: [] });
  });

  it("reports missing lines", () => {
    expect(checkCoverage(ids, [{ spokenLineIds: ["L1"], actionLineIds: ["L3"] }]).missing).toEqual(["L2", "L4"]);
  });

  it("reports lines used twice, including spoken and action at once", () => {
    const shots = [
      { spokenLineIds: ["L1", "L2"], actionLineIds: ["L2"] },
      { spokenLineIds: ["L3"], actionLineIds: ["L4", "L3"] },
    ];
    expect(checkCoverage(ids, shots).duplicated).toEqual(["L2", "L3"]);
  });
});

describe("linesInRange", () => {
  const lines = parseScript("a\nb\nc\nd");
  it("is inclusive", () => {
    expect(linesInRange(lines, "L2", "L3").map((l) => l.text)).toEqual(["b", "c"]);
  });
  it("is empty for unknown or reversed ids", () => {
    expect(linesInRange(lines, "L9", "L3")).toEqual([]);
    expect(linesInRange(lines, "L3", "L2")).toEqual([]);
  });
});
