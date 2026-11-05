import { describe, expect, it } from "vitest";
import {
  AnalyzeChunkOutputJsonSchema,
  AnalyzeOutputJsonSchema,
  EpisodeOutput,
  EpisodeOutputJsonSchema,
} from "../../../packages/shared/src/breakdown/llm-schemas";

type Node = Record<string, unknown>;

/** Every object node (properties present) must be closed and require all its properties. */
function strictViolations(node: unknown, path = "$"): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n, i) => strictViolations(n, `${path}[${i}]`));
  const n = node as Node;
  const out: string[] = [];
  if (n.type === "object" || n.properties) {
    const props = Object.keys((n.properties as Node) ?? {});
    if (n.additionalProperties !== false) out.push(`${path}: additionalProperties is not false`);
    const required = new Set((n.required as string[]) ?? []);
    for (const p of props) if (!required.has(p)) out.push(`${path}.${p}: not in required`);
  }
  for (const [k, v] of Object.entries(n)) out.push(...strictViolations(v, `${path}.${k}`));
  return out;
}

describe("LLM JSON Schemas", () => {
  it.each([
    ["AnalyzeOutput", AnalyzeOutputJsonSchema],
    ["AnalyzeChunkOutput", AnalyzeChunkOutputJsonSchema],
    ["EpisodeOutput", EpisodeOutputJsonSchema],
  ])("%s follows the strict: true rules", (_name, schema) => {
    expect(strictViolations(schema)).toEqual([]);
  });

  it("EpisodeOutput accepts each visual kind and caps suggestedSeconds at 15", () => {
    const shot = (visual: unknown, suggestedSeconds = 4) => ({
      shotSize: "wide",
      camera: "static",
      action: "",
      spokenLineIds: [],
      actionLineIds: ["L1"],
      speakerByLine: [],
      sound: "",
      visual,
      suggestedSeconds,
    });
    const out = (s: unknown) => ({ segments: [{ settingVariantId: "x", shots: [s] }] });
    expect(EpisodeOutput.safeParse(out(shot({ kind: "none" }))).success).toBe(true);
    expect(EpisodeOutput.safeParse(out(shot({ kind: "image" }))).success).toBe(true);
    expect(EpisodeOutput.safeParse(out(shot({ kind: "3d", tool: "render_text_logo", paramsJson: "{}" }))).success).toBe(true);
    expect(EpisodeOutput.safeParse(out(shot({ kind: "none" }, 16))).success).toBe(false);
  });
});
