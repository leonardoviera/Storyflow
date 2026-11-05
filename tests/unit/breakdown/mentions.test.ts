import { describe, expect, it } from "vitest";
import {
  extractMentionIds,
  hasUnresolvedLabel,
  labelFor,
  labelsToTokens,
  tokensToLabels,
  usageOf,
} from "../../../packages/shared/src/breakdown";
import { ANA, ANA_COAT, ANA_DEFAULT, CUP_DEFAULT, ROOM, ROOM_DAY, doc, episode, line, segment, shot } from "./helpers";

describe("mentions", () => {
  const d = doc();

  it("labels the default variant by asset name only", () => {
    expect(labelFor(d, ANA_DEFAULT)).toBe("@Ana Lima");
    expect(labelFor(d, ANA_COAT)).toBe("@Ana Lima·Jaleco");
    expect(labelFor(d, "nope00000000")).toBeNull();
  });

  it("round-trips tokens ↔ labels", () => {
    const text = `@{${ANA_COAT}} pega a @{${CUP_DEFAULT}} na @{${ROOM_DAY}}.`;
    const labels = tokensToLabels(text, d);
    expect(labels).toBe("@Ana Lima·Jaleco pega a @Xícara na @Sala·Dia.");
    expect(labelsToTokens(labels, d)).toBe(text);
  });

  it("prefers the longest matching label", () => {
    expect(labelsToTokens("@Ana Lima·Jaleco e @Ana Lima", d)).toBe(`@{${ANA_COAT}} e @{${ANA_DEFAULT}}`);
  });

  it("shows the new name after a rename, because tokens hold ids", () => {
    const text = `@{${ANA_DEFAULT}} entra.`;
    const renamed = structuredClone(d);
    renamed.assets[0]!.name = "Dra. Lima";
    expect(tokensToLabels(text, renamed)).toBe("@Dra. Lima entra.");
  });

  it("leaves unknown labels untouched and reports them", () => {
    const out = labelsToTokens("@Fantasma entra.", d);
    expect(out).toBe("@Fantasma entra.");
    expect(hasUnresolvedLabel(out)).toBe(true);
    expect(hasUnresolvedLabel(`@{${ANA_DEFAULT}} e email a@b.com`)).toBe(false);
  });

  it("extracts token ids", () => {
    expect(extractMentionIds(`@{${ANA_DEFAULT}} @{${ROOM_DAY}} @{short}`)).toEqual([ANA_DEFAULT, ROOM_DAY]);
  });

  it("counts usage by token, speaker and setting", () => {
    const ep = episode([
      segment("s1", ROOM_DAY, [shot("a", 60, [line("l1", "Oi", ANA)]), shot("b", 60, [], `@{${CUP_DEFAULT}}`)]),
    ]);
    const withEp = doc([ep]);
    expect(usageOf(withEp, ANA).shotIds).toEqual([ep.segments[0]!.shots[0]!.id]);
    expect(usageOf(withEp, CUP_DEFAULT).shotCount).toBe(1);
    expect(usageOf(withEp, ROOM).shotCount).toBe(2);
    expect(usageOf(withEp, ANA_COAT).shotCount).toBe(0);
  });
});
